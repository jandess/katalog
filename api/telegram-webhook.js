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

            // Bersihkan nilai Total ke angka integer murni (misal: "120.000" -> 120000)
            let totalVal = 0;
            if (totalMatch) {
                totalVal = parseInt(totalMatch[1].replace(/[\.,]/g, ''), 10) || 0;
            }

            // Parsing Rincian Daftar Kue dan Varian Kemasan
            const lines = text.split('\n');
            const itemsCollected = [];
            let packagingFetched = '';

            for (const line of lines) {
                if (line.trim().startsWith('- ')) {
                    const cleanedLine = line.replace('- ', '').split(':')[0].trim();
                    if (cleanedLine.toLowerCase().startsWith('kemasan ')) {
                        packagingFetched = cleanedLine.replace(/kemasan\s+/i, '');
                    } else {
                        itemsCollected.push(cleanedLine);
                    }
                }
            }
            const itemsStr = itemsCollected.join(', ');

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
                    notes: notesStr,
                    datePickup: datePickup,
                    timePickup: timePickup,
                    status: 'Belum Bayar'
                })
            });
            const sheetJson = await sheetRes.json();

            if (sheetJson.status === 'success') {
                const replyText = `✅ *Invoice ${invoiceId} Berhasil Dicatat!*\n\n` +
                    `👤 *Nama:* ${customerName}\n` +
                    `🥞 *Pesanan:* ${itemsStr}\n` +
                    `📦 *Kemasan:* ${packagingFetched || 'Standard'}\n` +
                    `💵 *Total:* Rp ${totalVal.toLocaleString('id-ID')}\n` +
                    `📅 *Jadwal Ambil:* ${datePickup} @ ${timePickup}\n` +
                    `📝 *Catatan:* ${notesStr || '-'}\n` +
                    `💳 *Status:* 🔴 *BELUM BAYAR*\n\n` +
                    `Gunakan tombol klik berikut:\n` +
                    `👉 /bayar_${invoiceId} - Ubah status ke LUNAS\n` +
                    `👉 /struk_${invoiceId} - Lihat & ambil gambar Struk`;
                await sendTelegramMessage(botToken, chatId, replyText);
            } else {
                await sendTelegramMessage(botToken, chatId, `❌ Gagal menyimpan ke Google Sheets: ${sheetJson.message}`);
            }
            return res.status(200).send('OK');
        }

        // 2. PENANGANAN TELEGRAM COMMANDS
        if (text.startsWith('/')) {
            const commandParts = text.split(' ')[0].split('_');
            const command = commandParts[0].toLowerCase();
            let param = commandParts[1] || text.split(' ')[1]; // mendukung format space '/struk DJD-123' atau underscore '/struk_DJD-123'
            if (param) param = param.trim().toUpperCase();

            // COMMAND: /start
            if (command === '/start') {
                const welcomeText = `👋 *Halo Admin DJANDES!*\n\n` +
                    `Kirimkan (copas) teks pesanan format WhatsApp Anda ke sini, saya akan langsung mencatatnya ke Google Sheets.\n\n` +
                    `*Daftar Perintah:* \n` +
                    `👉 \`/status <invoice_id>\` - Cek detail pembayaran\n` +
                    `👉 \`/bayar <invoice_id>\` - Tandai sebagai Lunas\n` +
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
                const host = req.headers.host || 'djandes15.vercel.app';
                const protocol = req.headers['x-forwarded-proto'] || 'https';
                const receiptHtmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${param}`;
                // Gunakan microlink.io untuk screenshot HTML receipt → kirim sebagai gambar ke Telegram
                const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(receiptHtmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=560&viewport.height=800&waitFor=800`;

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
                    // Fallback: kirim link HTML langsung jika screenshot gagal
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

                // Jalankan POST update ke Google Sheet
                const payRes = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'setStatus',
                        invoiceId: param,
                        status: 'Lunas'
                    })
                });
                const payJson = await payRes.json();

                if (payJson.status === 'success') {
                    await sendTelegramMessage(botToken, chatId, `🎉 *Sukses!* Invoice #${param} telah ditandai sebagai *LUNAS* di Google Sheets.\n\n⏳ *Menyiapkan Struk Lunas...*`);

                    // Kirim struk LUNAS via microlink screenshot
                    const host = req.headers.host || 'djandes15.vercel.app';
                    const protocol = req.headers['x-forwarded-proto'] || 'https';
                    const receiptHtmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${param}`;
                    const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(receiptHtmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=560&viewport.height=800&waitFor=800`;

                    const payPhotoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            photo: screenshotUrl,
                            caption: `🟢 Nota DJANDES #${param} - *LUNAS*`
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
                    const icon = detail.status.toLowerCase() === 'lunas' ? '🟢' : '🔴';
                    const detailsText = `📋 *Status Pesanan #${param}*\n\n` +
                        `👤 *Nama:* ${detail.name}\n` +
                        `🥞 *Item:* ${detail.items}\n` +
                        `💵 *Total:* Rp ${Number(detail.total).toLocaleString('id-ID')}\n` +
                        `📅 *Jadwal:* ${detail.datePickup} @ ${detail.timePickup || '-'}\n` +
                        `💬 *Status Pembayaran:* ${icon} *${detail.status.toUpperCase()}*`;
                    await sendTelegramMessage(botToken, chatId, detailsText);
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ Invoice #${param} tidak ditemukan.`);
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
