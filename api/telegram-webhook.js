// api/telegram-webhook.js

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const gasUrl = process.env.GOOGLE_SCRIPT_URL;

    if (!botToken || !gasUrl) {
        console.error('Konfigurasi TELEGRAM_BOT_TOKEN atau GOOGLE_SCRIPT_URL belum diatur.');
        return res.status(500).send('Configuration Error');
    }

    try {
        const update = req.body;
        if (!update || !update.message) {
            return res.status(200).send('No message received');
        }

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text || '';

        // 1. PENANGANAN FORMAT WHATSAPP (AUTO-PARSING & RECORD TO GOOGLE SHEETS)
        if (text.includes('*No. Invoice:*') && text.includes('DJD-')) {
            const invoiceMatch = text.match(/\*No\. Invoice:\*\s*(DJD-[A-Z0-9]+)/i);
            const nameMatch = text.match(/\*Nama:\*\s*(.*)/i);
            const dateMatch = text.match(/\*Tanggal Pengambilan:\*\s*(.*)/i);
            const timeMatch = text.match(/\*Jam Pengambilan:\*\s*(.*)/i);
            const totalMatch = text.match(/\*Total:\s*Rp\s*([\d\.,]+)\*/i);
            const notesMatch = text.match(/\*Catatan:\*\s*(.*)/i);

            if (!invoiceMatch) {
                await sendTelegramMessage(botToken, chatId, '❌ Gagal merekam pesanan. Nomor Invoice tidak terbaca dalam teks.');
                return res.status(200).send('OK');
            }

            const invoiceId = invoiceMatch[1].trim();
            const customerName = nameMatch ? nameMatch[1].trim() : 'Tanpa Nama';
            const datePickup = dateMatch ? dateMatch[1].trim() : '-';
            const timePickup = timeMatch ? timeMatch[1].trim() : '-';
            const notesStr = notesMatch ? notesMatch[1].trim() : '';

            // Bersihkan nilai Total ke angka murni
            let totalVal = 0;
            if (totalMatch) {
                totalVal = parseInt(totalMatch[1].replace(/[\.,]/g, ''), 10) || 0;
            }

            // Parsing Rincian Daftar Kue + Harga Per Item & Kemasan
            const lines = text.split('\n');
            const itemsCollected = [];  // format: "Nama Item|Qty|HargaTotal"
            let packagingFetched = '';  // format: "Tipe Kemasan|Varian|Harga"
            let boxTotalVal = 0;

            for (const line of lines) {
                if (line.trim().startsWith('- ')) {
                    const withoutDash = line.replace(/^-\s+/, '');
                    const colonIdx = withoutDash.lastIndexOf(':');
                    const itemName = colonIdx > -1 ? withoutDash.substring(0, colonIdx).trim() : withoutDash.trim();
                    const priceRaw = colonIdx > -1 ? withoutDash.substring(colonIdx + 1).trim() : '';
                    const priceVal = parseInt(priceRaw.replace(/[Rp\s\.,']/g, ''), 10) || 0;

                    if (itemName.toLowerCase().startsWith('kemasan ')) {
                        // Teks: "Kemasan Standard (Pink)" -> Tipe: "Standard", Varian: "Pink"
                        const cleanPkg = itemName.replace(/kemasan\s+/i, '');
                        const pkgMatch = cleanPkg.match(/^(.*?)\s+\((.*?)\)$/);
                        const type = pkgMatch ? pkgMatch[1] : cleanPkg;
                        const variant = pkgMatch ? pkgMatch[2] : '-';
                        packagingFetched = `${type}|${variant}|${priceVal}`;
                        boxTotalVal = priceVal;
                    } else {
                        // Teks: "Lemper Kipas (1x)" -> Name: "Lemper Kipas", Qty: "1x"
                        const itemMatch = itemName.match(/^(.*?)\s+\((.*?)\)$/);
                        const name = itemMatch ? itemMatch[1] : itemName;
                        const qty = itemMatch ? itemMatch[2] : '1x';
                        itemsCollected.push(`${name}|${qty}|${priceVal}`);
                    }
                }
            }

            const subtotalVal = totalVal - boxTotalVal;
            const itemsStr = itemsCollected.join(',');

            // Kirim Data Upsert ke Google Sheet lewat Apps Script
            const sheetRes = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upsert',
                    invoiceId: invoiceId,
                    name: customerName,
                    items: itemsStr,
                    packaging: packagingFetched,
                    total: totalVal,
                    subtotal: subtotalVal,
                    boxTotal: boxTotalVal,
                    notes: notesStr,
                    datePickup: datePickup,
                    timePickup: timePickup,
                    status: 'Belum Bayar'
                })
            });
            const sheetJson = await sheetRes.json();

            if (sheetJson.status === 'success') {
                // Format ulang items untuk Tampilan Telegram Chat
                const telegramItemsList = itemsCollected.map(item => {
                    const [n, q, p] = item.split('|');
                    return `  • *${n}* (${q}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                }).join('\n');

                const [pType, pVar, pPrice] = packagingFetched.split('|');
                const packagingTxt = pType ? `${pType} (${pVar}) — Rp ${parseInt(pPrice, 10).toLocaleString('id-ID')}` : 'Standard';

                // Ganti tanda minus pada command telegram agar link dapat diklik penuh
                // misal DJD-05YTQ8 -> DJD_05YTQ8
                const telegramInvoiceId = invoiceId.replace('-', '_');

                const replyText = `✅ *Invoice ${invoiceId} Berhasil Dicatat!*\n\n` +
                    `👤 *Nama:* ${customerName}\n` +
                    `🥞 *Rincian Pesanan:*\n${telegramItemsList}\n` +
                    `📦 *Kemasan:* ${packagingTxt}\n` +
                    `💵 *Total Keseluruhan:* Rp ${totalVal.toLocaleString('id-ID')}\n` +
                    `📅 *Tanggal Ambil:* ${datePickup}\n` +
                    `🕐 *Jam Ambil:* ${timePickup}\n` +
                    `📝 *Catatan:* ${notesStr || '-'}\n` +
                    `💳 *Status:* 🔴 *PENDING*\n\n` +
                    `Gunakan tombol klik berikut:\n` +
                    `👉 /bayar_${telegramInvoiceId} - Ubah status ke LUNAS\n` +
                    `👉 /struk_${telegramInvoiceId} - Lihat & ambil gambar Struk`;
                await sendTelegramMessage(botToken, chatId, replyText);
            } else {
                await sendTelegramMessage(botToken, chatId, `❌ Gagal menyimpan ke Google Sheets: ${sheetJson.message}`);
            }
            return res.status(200).send('OK');
        }

        // 2. PENANGANAN TELEGRAM COMMANDS
        if (text.startsWith('/')) {
            const commandText = text.trim();
            const host = req.headers.host || 'djandes15.vercel.app';
            const protocol = req.headers['x-forwarded-proto'] || 'https';

            // Ambil pencocokan command DP (Space dan Underscore)
            // Mendukung: /dp DJD-05YTQ8 500000, /dp_DJD_05YTQ8_500000, /bayar DJD-05YTQ8 dp 500000, /bayar_DJD_05YTQ8_dp_500000
            let matchDp = commandText.match(/^\/dp\s+([A-Z0-9\-]+)\s+(\d+)/i) ||
                commandText.match(/^\/bayar\s+([A-Z0-9\-]+)\s+dp\s+(\d+)/i);

            if (!matchDp) {
                const matchUnderscore = commandText.match(/^\/dp_([A-Z0-9]+)_([A-Z0-9]+)_(\d+)/i) ||
                    commandText.match(/^\/bayar_([A-Z0-9]+)_([A-Z0-9]+)_dp_(\d+)/i);
                if (matchUnderscore) {
                    matchDp = [
                        null,
                        `${matchUnderscore[1]}-${matchUnderscore[2]}`,
                        matchUnderscore[3]
                    ];
                }
            }

            if (matchDp) {
                const invoiceId = matchDp[1].toUpperCase();
                const dpAmount = parseInt(matchDp[2], 10);

                await sendTelegramMessage(botToken, chatId, `⏳ *Mencatat DP Rp ${dpAmount.toLocaleString('id-ID')} untuk #${invoiceId}...*`);

                // Ambil data invoice untuk menghitung sisa
                const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
                const getJson = await getRes.json();

                if (getJson.status === 'success' && getJson.data) {
                    const detail = getJson.data;
                    const grandTotal = parseInt(detail.total, 10) || 0;
                    const shortAmount = grandTotal - dpAmount;

                    let statusString = "";
                    if (shortAmount <= 0) {
                        statusString = "Lunas";
                    } else {
                        statusString = `DP Rp ${dpAmount.toLocaleString('id-ID')} (Kurang Rp ${shortAmount.toLocaleString('id-ID')})`;
                    }

                    // Update status di Google Sheet
                    const payRes = await fetch(gasUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'setStatus',
                            invoiceId: invoiceId,
                            status: statusString
                        })
                    });
                    const payJson = await payRes.json();

                    if (payJson.status === 'success') {
                        const receiptHtmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${invoiceId}`;
                        const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(receiptHtmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=520&viewport.height=900&waitFor=800&element=.card`;

                        await sendTelegramMessage(botToken, chatId, `🎉 *Sukses DP!* Invoice #${invoiceId} telah ditandai dengan status:\n*${statusString}*\n\n⏳ *Menyiapkan Struk...*`);

                        const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                photo: screenshotUrl,
                                caption: `🪙 Nota DP #${invoiceId} - KURANG BAYAR`
                            })
                        });
                        const photoJson = await photoRes.json();
                        if (!photoJson.ok) {
                            await sendTelegramMessage(botToken, chatId, `⚠️ Gagal membuat gambar struk otomatis. Silakan buka manual: ${receiptHtmlUrl}`);
                        }
                    } else {
                        await sendTelegramMessage(botToken, chatId, `❌ Gagal menyimpan status DP ke Google Sheets: ${payJson.message}`);
                    }
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ Invoice #${invoiceId} tidak ditemukan.`);
                }
                return res.status(200).send('OK');
            }

            const commandParts = text.split(' ')[0].split('_');
            const command = commandParts[0].toLowerCase();
            let param = "";
            if (commandParts.length > 2) {
                // e.g. ["/bayar", "DJD", "05YTQ8"] => slice(1) adalah ["DJD", "05YTQ8"] => join('-') -> "DJD-05YTQ8"
                param = commandParts.slice(1).join('-');
            } else {
                param = commandParts[1] || text.split(' ')[1];
            }
            if (param) param = param.trim().toUpperCase();

            // COMMAND: /start
            if (command === '/start') {
                const welcomeText = `👋 *Halo Admin DJANDES!*\n\n` +
                    `Kirimkan (copas) teks pesanan format WhatsApp Anda ke sini, saya akan langsung mencatatnya ke Google Sheets.\n\n` +
                    `*Daftar Perintah:* \n` +
                    `👉 \`/status <invoice_id>\` - Cek detail pembayaran\n` +
                    `👉 \`/bayar <invoice_id>\` - Tandai sebagai Lunas\n` +
                    `👉 \`/dp <invoice_id> <nominal>\` - Catat pembayaran DP\n` +
                    `👉 \`/jadwal\` - Lihat semua daftar jadwal pesanan mendatang\n` +
                    `👉 \`/struk <invoice_id>\` - Kirim gambar Struk premium`;
                await sendTelegramMessage(botToken, chatId, welcomeText);
                return res.status(200).send('OK');
            }

            // COMMAND: /struk <invoiceId>
            if (command === '/struk') {
                if (!param) {
                    await sendTelegramMessage(botToken, chatId, '⚠️ Format salah. Contoh: `/struk DJD-FG5T4W`');
                    return res.status(200).send('OK');
                }

                await sendTelegramMessage(botToken, chatId, `⏳ *Menyiapkan Struk Invoice #${param}...*`);
                const receiptHtmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${param}`;
                // Gunakan microlink.io untuk screenshot HTML receipt
                const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(receiptHtmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=520&viewport.height=900&waitFor=800&element=.card`;

                const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        photo: screenshotUrl,
                        caption: `🧾 Nota Pembayaran #${param} - DJANDES`
                    })
                });
                const photoJson = await photoRes.json();

                if (!photoJson.ok) {
                    await sendTelegramMessage(botToken, chatId,
                        `⚠️ Gagal membuat gambar otomatis. Buka struk manual di sini:\n${receiptHtmlUrl}`);
                }
                return res.status(200).send('OK');
            }

            // COMMAND: /bayar <invoiceId>
            if (command === '/bayar') {
                if (!param) {
                    await sendTelegramMessage(botToken, chatId, '⚠️ Format salah. Contoh: `/bayar DJD-FG5T4W`');
                    return res.status(200).send('OK');
                }

                // Dapatkan detail invoice dulu untuk mengecek history DP
                const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${param}`);
                const getJson = await getRes.json();

                let newStatus = "Lunas";
                if (getJson.status === 'success' && getJson.data) {
                    const prevStatus = getJson.data.status || "";
                    if (prevStatus.toLowerCase().startsWith("dp ")) {
                        const dpMatch = prevStatus.match(/DP Rp\s*([\d\.,\s]+)/i);
                        const shortMatch = prevStatus.match(/Kurang Rp\s*([\d\.,\s]+)/i);
                        if (dpMatch && shortMatch) {
                            const prevDpText = dpMatch[1].trim();
                            const prevShortText = shortMatch[1].trim();
                            newStatus = `Lunas (DP Rp ${prevDpText} + Lunas Rp ${prevShortText})`;
                        }
                    }
                }

                // Jalankan POST update ke Google Sheet
                const payRes = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'setStatus',
                        invoiceId: param,
                        status: newStatus
                    })
                });
                const payJson = await payRes.json();

                if (payJson.status === 'success') {
                    await sendTelegramMessage(botToken, chatId, `🎉 *Sukses!* Invoice #${param} telah ditandai sebagai *LUNAS* di Google Sheets.\n\n⏳ *Menyiapkan Struk Lunas...*`);

                    // Kirim struk LUNAS via microlink screenshot
                    const receiptHtmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${param}`;
                    const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(receiptHtmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=520&viewport.height=900&waitFor=800&element=.card`;

                    const payPhotoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            photo: screenshotUrl,
                            caption: `🟢 Nota DJANDES #${param} - ${newStatus}`
                        })
                    });
                    const payPhotoJson = await payPhotoRes.json();
                    if (!payPhotoJson.ok) {
                        await sendTelegramMessage(botToken, chatId,
                            `⚠️ Gagal membuat gambar otomatis. Buka struk manual di sini:\n${receiptHtmlUrl}`);
                    }
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ Gagal memperbarui status ke Lunas: ${payJson.message}`);
                }
                return res.status(200).send('OK');
            }

            // COMMAND: /status <invoiceId>
            if (command === '/status') {
                if (!param) {
                    await sendTelegramMessage(botToken, chatId, '⚠️ Format salah. Contoh: `/status DJD-FG5T4W`');
                    return res.status(200).send('OK');
                }

                const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${param}`);
                const getJson = await getRes.json();

                if (getJson.status === 'success' && getJson.data) {
                    const detail = getJson.data;
                    const statusStrLower = (detail.status || '').toLowerCase();
                    let icon = '🔴';
                    if (statusStrLower.startsWith('lunas')) {
                        icon = '🟢';
                    } else if (statusStrLower.startsWith('dp')) {
                        icon = '🟡';
                    }

                    const statusItemsText = detail.items
                        ? detail.items.split(',').map(item => {
                            const [n, q, p] = item.split('|');
                            return `\n  • ${n} (${q}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                        }).join('')
                        : '-';

                    let cleanTime = detail.timePickup || '-';
                    if (cleanTime.includes('T')) {
                        const tMatch = cleanTime.match(/T(\d{2}:\d{2})/);
                        if (tMatch) cleanTime = tMatch[1];
                    }

                    const detailsText = `📋 *Status Pesanan #${param}*\n\n` +
                        `👤 *Nama:* ${detail.name}\n` +
                        `🥞 *Item:* ${statusItemsText}\n` +
                        `💵 *Total:* Rp ${Number(detail.total).toLocaleString('id-ID')}\n` +
                        `📅 *Jadwal Tanggal:* ${detail.datePickup}\n` +
                        `🕐 *Jam Ambil:* ${cleanTime}\n` +
                        `💬 *Status Pembayaran:* ${icon} *${detail.status.toUpperCase()}*`;
                    await sendTelegramMessage(botToken, chatId, detailsText);
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ Invoice #${param} tidak ditemukan.`);
                }
                return res.status(200).send('OK');
            }

            // COMMAND: /jadwal
            if (command === '/jadwal') {
                await sendTelegramMessage(botToken, chatId, `⏳ *Mengambil antrean jadwal pesanan...*`);
                const getRes = await fetch(`${gasUrl}?action=getAll`);
                const getJson = await getRes.json();

                if (getJson.status === 'success' && Array.isArray(getJson.data)) {
                    // Dapatkan tanggal hari ini (di Jakarta timezone)
                    const now = new Date();
                    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now); // yyyy-mm-dd

                    // Filter pesanan yang tanggalnya >= hari ini
                    const upcoming = getJson.data.filter(order => {
                        return order.datePickup && order.datePickup >= todayStr;
                    });

                    if (upcoming.length === 0) {
                        await sendTelegramMessage(botToken, chatId, `📭 *Tidak ada pesanan mendatang mulai hari ini (${todayStr}).*`);
                    } else {
                        // Urutkan berdasarkan tanggal & jam ambil
                        upcoming.sort((a, b) => {
                            if (a.datePickup !== b.datePickup) {
                                return a.datePickup.localeCompare(b.datePickup);
                            }
                            return a.timePickup.localeCompare(b.timePickup);
                        });

                        let listMsg = `📅 *Daftar Jadwal Pesanan (Mulai Hari Ini):*\n\n`;
                        upcoming.forEach((o, index) => {
                            let cleanTime = o.timePickup || '-';
                            if (cleanTime.includes('T')) {
                                const tMatch = cleanTime.match(/T(\d{2}:\d{2})/);
                                if (tMatch) cleanTime = tMatch[1];
                            }
                            const telInvoiceId = o.invoiceId.replace('-', '_');
                            // Tampilkan Nama, Tanggal, Jam, Link status
                            listMsg += `${index + 1}. *${o.name}* — ${o.datePickup} @ ${cleanTime}\n`;
                            listMsg += `   💵 Total: Rp ${Number(o.total).toLocaleString('id-ID')} | Status: *${o.status}*\n`;
                            listMsg += `   🔍 Detail: /status_${telInvoiceId}\n\n`;
                        });
                        listMsg += `Total: *${upcoming.length}* Pesanan terdaftar.`;
                        await sendTelegramMessage(botToken, chatId, listMsg);
                    }
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ Gagal mengambil data jadwal dari Google Sheets.`);
                }
                return res.status(200).send('OK');
            }
        }
    } catch (error) {
        console.error('Webhook Error:', error);
    }

    return res.status(200).send('OK');
}

// Fungsi bantu mengirimkan Text Message ke Telegram
async function sendTelegramMessage(botToken, chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error('Gagal mengirim pesan Telegram:', err);
    }
}

