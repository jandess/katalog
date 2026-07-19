// api/telegram-webhook.js

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const gasUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!botToken || !gasUrl) return res.status(500).send('Configuration Error');

    try {
        const update = req.body;
        if (!update || !update.message) return res.status(200).send('No message');

        const chatId = update.message.chat.id;
        const text = update.message.text || '';
        const host = req.headers.host || 'djandes15.vercel.app';
        const protocol = req.headers['x-forwarded-proto'] || 'https';

        let normalizedText = text.trim();
        if (normalizedText === '📅 Jadwal') {
            normalizedText = '/jadwal';
        } else if (normalizedText === '📊 Laporan Hari') {
            normalizedText = '/laporan hari';
        } else if (normalizedText === '📊 Laporan Minggu') {
            normalizedText = '/laporan minggu';
        } else if (normalizedText === '📊 Laporan Bulan') {
            normalizedText = '/laporan bulan';
        }

        // ── HELPERS ─────────────────────────────────────────────────────
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        async function sendMsg(txt, replyMarkup = null) {
            const adminKeyboard = {
                keyboard: [
                    [{ text: '📅 Jadwal' }, { text: '📊 Laporan Hari' }],
                    [{ text: '📊 Laporan Minggu' }, { text: '📊 Laporan Bulan' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
                is_persistent: true
            };
            const markup = replyMarkup !== null ? replyMarkup : adminKeyboard;

            const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: txt,
                    parse_mode: 'HTML',
                    reply_markup: markup
                })
            });
            const sendJson = await sendRes.json();
            if (!sendJson.ok) {
                console.error('sendMessage error:', JSON.stringify(sendJson));
            }
        }

        async function sendReceipt(invoiceId, caption) {
            // Tambah timestamp ke URL sumber agar microlink.io TIDAK pakai cache lama
            const ts = Date.now();
            const htmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${invoiceId}&t=${ts}`;
            const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(htmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=520&viewport.height=4000&waitFor=1500&element=.card&force=true`;
            const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, photo: screenshotUrl, caption })
            });
            const json = await resp.json();
            if (!json.ok) await sendMsg(`⚠️ Gagal buat gambar struk. Buka manual:\n${htmlUrl}`);
        }

        // Ekstrak HH:mm dari string waktu format apapun
        function extractTime(str) {
            if (!str || str === '-') return '-';
            const m = String(str).match(/(\d{2}:\d{2})/);
            return m ? m[1] : '-';
        }

        // Parse berbagai format tanggal ke objek Date
        function parseDate(dateStr) {
            if (!dateStr || dateStr === '-') return null;
            const s = String(dateStr).trim();

            // ISO datetime (dari Google Sheets / GAS): "2026-07-19T00:00:00.000Z" atau "2026-07-19"
            const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoM) {
                const d = new Date(`${isoM[1]}-${isoM[2]}-${isoM[3]}T00:00:00+07:00`);
                return isNaN(d.getTime()) ? null : d;
            }

            // DD/MM/YYYY
            const dmyM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmyM) {
                let d = new Date(`${dmyM[3]}-${dmyM[2].padStart(2, '0')}-${dmyM[1].padStart(2, '0')}T00:00:00+07:00`);
                if (isNaN(d.getTime())) {
                    d = new Date(`${dmyM[3]}-${dmyM[1].padStart(2, '0')}-${dmyM[2].padStart(2, '0')}T00:00:00+07:00`);
                }
                return isNaN(d.getTime()) ? null : d;
            }

            // Format Indonesia: "Minggu, 19 Juli 2026" atau "19 Juli 2026"
            const idMonths = { 'januari': '01', 'februari': '02', 'maret': '03', 'april': '04', 'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'desember': '12' };
            const idM = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
            if (idM) {
                const mon = idMonths[idM[2].toLowerCase()];
                if (mon) {
                    const d = new Date(`${idM[3]}-${mon}-${idM[1].padStart(2, '0')}T00:00:00+07:00`);
                    return isNaN(d.getTime()) ? null : d;
                }
            }
            return null;
        }

        function toDateStr(d) {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
        }

        function getPaidAmount(status, total, o) {
            if (o && o.paidAmount !== undefined && Number(o.paidAmount) > 0) {
                return Number(o.paidAmount);
            }
            const s = (status || '').toLowerCase();
            if (s.startsWith('lunas')) return Number(total) || 0;
            if (s.startsWith('dp')) {
                const m = String(status).match(/DP Rp\s*([\d\.,]+)/i);
                if (m) return parseInt(m[1].replace(/[\.,]/g, ''), 10) || 0;
            }
            return 0;
        }

        function statusIcon(status) {
            const s = (status || '').toLowerCase();
            if (s.startsWith('lunas')) return '🟢';
            if (s.startsWith('dp') || s.startsWith('kurang')) return '🟡';
            return '🔴';
        }

        // ── 0. PRIORITAS: /start dan perintah slash langsung ─────────────
        if (normalizedText === '/start' || normalizedText.startsWith('/start')) {
            await sendMsg(
                `👋 <b>Halo Admin DJANDES!</b>\n\n` +
                `Copas teks pesanan WhatsApp ke sini untuk mencatat otomatis.\n\n` +
                `<b>📋 Daftar Perintah:</b>\n` +
                `📅 <b>Jadwal</b> — Lihat semua pesanan mendatang\n` +
                `📊 <b>Laporan Hari/Minggu/Bulan</b> — Gunakan tombol di bawah\n\n` +
                `<i>Atau ketik perintah berikut:</i>\n` +
                `📋 /status_<b>[invoice]</b> — Cek detail pesanan\n` +
                `🧾 /struk_<b>[invoice]</b> — Print struk gambar\n` +
                `💰 /dp_<b>[invoice]</b>_<b>[nominal]</b> — Catat DP\n` +
                `✅ /bayar_<b>[invoice]</b> — Tandai Lunas\n` +
                `📊 /laporan hari | minggu | bulan\n\n` +
                `<i>Keyboard cepat sudah aktif di bawah input!</i> 👇`
            );
            return res.status(200).send('OK');
        }

        // ── 1. AUTO-PARSING WHATSAPP → SHEETS ────────────────────────────
        if (normalizedText.includes('*No. Invoice:*')) {
            const invoiceMatch = normalizedText.match(/\*No\. Invoice:\*\s*(DJD-?[A-Z0-9]+)/i);
            const nameMatch = normalizedText.match(/\*Nama:\*\s*(.*)/i);
            const dateMatch = normalizedText.match(/\*Tanggal Pengambilan:\*\s*(.*)/i);
            const timeMatch = normalizedText.match(/\*Jam Pengambilan:\*\s*(.*)/i);
            const totalMatch = normalizedText.match(/\*Total:\s*Rp\s*([\d\.,]+)\*/i);
            const notesMatch = normalizedText.match(/\*Catatan:\*\s*(.*)/i);

            if (!invoiceMatch) {
                await sendMsg('❌ Gagal merekam: Nomor Invoice tidak terbaca.');
                return res.status(200).send('OK');
            }

            const invoiceId = invoiceMatch[1].trim();
            const customerName = nameMatch ? nameMatch[1].trim() : 'Tanpa Nama';
            const datePickup = dateMatch ? dateMatch[1].trim() : '-';
            const timePickup = timeMatch ? timeMatch[1].trim() : '-';
            const notesStr = notesMatch ? notesMatch[1].trim() : '';
            const totalVal = totalMatch ? parseInt(totalMatch[1].replace(/[\.,]/g, ''), 10) || 0 : 0;

            const lines = normalizedText.split('\n');
            const itemsCollected = [];
            let packagingFetched = '';
            let boxTotalVal = 0;

            for (const line of lines) {
                if (!line.trim().startsWith('- ')) continue;
                const withoutDash = line.replace(/^-\s+/, '');
                const colonIdx = withoutDash.lastIndexOf(':');
                const itemName = colonIdx > -1 ? withoutDash.substring(0, colonIdx).trim() : withoutDash.trim();
                const priceRaw = colonIdx > -1 ? withoutDash.substring(colonIdx + 1).trim() : '';
                const priceVal = parseInt(priceRaw.replace(/[Rp\s\.,']/g, ''), 10) || 0;

                if (itemName.toLowerCase().startsWith('kemasan ')) {
                    const cleanPkg = itemName.replace(/kemasan\s+/i, '');
                    const pkgM = cleanPkg.match(/^(.*?)\s+\((.*?)\)$/);
                    const type = pkgM ? pkgM[1] : cleanPkg;
                    const variant = pkgM ? pkgM[2] : '-';
                    packagingFetched = `${type}|${variant}|${priceVal}`;
                    boxTotalVal = priceVal;
                } else {
                    const itemM = itemName.match(/^(.*?)\s+\((.*?)\)$/);
                    const name = itemM ? itemM[1] : itemName;
                    const qty = itemM ? itemM[2] : '1x';
                    itemsCollected.push(`${name}|${qty}|${priceVal}`);
                }
            }

            const subtotalVal = totalVal - boxTotalVal;
            const itemsStr = itemsCollected.join(',');

            const sheetRes = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upsert', invoiceId,
                    name: customerName, items: itemsStr,
                    packaging: packagingFetched, total: totalVal,
                    subtotal: subtotalVal, boxTotal: boxTotalVal,
                    notes: notesStr, datePickup, timePickup, status: 'Pending'
                })
            });
            const sheetJson = await sheetRes.json();

            if (sheetJson.status === 'success') {
                const itemLines = itemsCollected.map(item => {
                    const [n, q, p] = item.split('|');
                    return `  • <b>${escapeHtml(n)}</b> (${escapeHtml(q)}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                }).join('\n');

                const [pType, pVar, pPrice] = packagingFetched.split('|');
                const pkgTxt = pType
                    ? `${escapeHtml(pType)} (${escapeHtml(pVar)}) — Rp ${parseInt(pPrice, 10).toLocaleString('id-ID')}`
                    : 'Standard';

                // Buat versi invoiceId clean tanpa dash, pakai _ sebagai pemisah command
                // DJD-XXXX → DJDXXXX, DJDXXXX → DJDXXXX (sudah bersih)
                const cleanInvoiceId = invoiceId.replace(/-/g, '');

                await sendMsg(
                    `✅ <b>Invoice ${escapeHtml(invoiceId)} Berhasil Dicatat!</b>\n\n` +
                    `👤 <b>Nama:</b> ${escapeHtml(customerName)}\n` +
                    `🥞 <b>Rincian Pesanan:</b>\n${itemLines}\n` +
                    `📦 <b>Kemasan:</b> ${pkgTxt}\n` +
                    `💵 <b>Total:</b> Rp ${totalVal.toLocaleString('id-ID')}\n` +
                    `📅 <b>Tanggal Ambil:</b> ${escapeHtml(datePickup)}\n` +
                    `🕐 <b>Jam Ambil:</b> ${escapeHtml(timePickup)}\n` +
                    `📝 <b>Catatan:</b> ${escapeHtml(notesStr) || '-'}\n` +
                    `💳 <b>Status:</b> 🔴 <b>PENDING</b>\n\n` +
                    `<b>Tindakan cepat:</b>\n` +
                    `🧾 /struk_${cleanInvoiceId}\n` +
                    `💰 /dp_${cleanInvoiceId}_500000 <i>(ganti nominal DP)</i>\n` +
                    `✅ /bayar_${cleanInvoiceId}`
                );
            } else {
                await sendMsg(`❌ Gagal menyimpan ke Sheets: ${escapeHtml(sheetJson.message)}`);
            }
            return res.status(200).send('OK');
        }

        // ── 2. TELEGRAM COMMANDS ─────────────────────────────────────────
        if (normalizedText.startsWith('/')) {
            const parts = normalizedText.trim().split(/\s+/);
            const rawCmd = parts[0].toLowerCase();
            const spaceParts = parts.slice(1);

            // Pisahkan base command dari underscore params
            const uParts = rawCmd.split('_');
            const baseCmd = uParts[0];
            let invoiceId = '';
            let extraParam = '';

            if (uParts.length >= 2) {
                // Mendukung format baru tanpa dash: /status_djdzpbmj9 -> ["/status", "djdzpbmj9"]
                // Serta format lama: /status_djd_zpbmj9 -> ["/status", "djd", "zpbmj9"]
                // Serta DP: /dp_djdzpbmj9_500000 -> ["/dp", "djdzpbmj9", "500000"]
                if (uParts[1].startsWith('djd') && uParts[1].length > 4) {
                    invoiceId = uParts[1].toUpperCase();
                    extraParam = uParts[2] || '';
                } else if (uParts[2]) {
                    invoiceId = `${uParts[1]}-${uParts[2]}`.toUpperCase();
                    extraParam = uParts[3] || '';
                } else {
                    invoiceId = uParts[1].toUpperCase();
                }
            }

            // Override dengan format baru (spasi) jika ada / dipaket
            if (spaceParts[0]) invoiceId = spaceParts[0].toUpperCase();
            if (spaceParts[1]) extraParam = spaceParts[1];

            // ── /start ──
            if (baseCmd === '/start') {
                await sendMsg(
                    `👋 <b>Halo Admin DJANDES!</b>\n\n` +
                    `Copas teks pesanan WhatsApp ke sini untuk mencatat otomatis.\n\n` +
                    `<b>📋 Daftar Perintah:</b>\n` +
                    `📅 <b>Jadwal</b> — Lihat semua pesanan mendatang (tombol bawah)\n` +
                    `📊 <b>Laporan</b> Hari/Minggu/Bulan — tombol bawah\n\n` +
                    `📋 /status_[invoice] — Cek detail pesanan\n` +
                    `🧾 /struk_[invoice] — Print struk gambar terbaru\n` +
                    `💰 /bayar_[invoice]_[nominal] — Catat pembayaran (DP/Lunas/Kembalian)\n` +
                    `✅ /bayar_[invoice] — Tandai Lunas penuh\n` +
                    `📊 /laporan hari | minggu | bulan\n\n` +
                    `<i>Keyboard cepat aktif di bawah input 👇</i>`
                );
                return res.status(200).send('OK');
            }

            // ── /struk ──
            if (baseCmd === '/struk') {
                if (!invoiceId) { await sendMsg('⚠️ Format: `/struk_[invoice]`'); return res.status(200).send('OK'); }
                await sendMsg(`⏳ *Menyiapkan Struk #${invoiceId}...*`);
                try {
                    await sendReceipt(invoiceId, `🧾 Nota Pembayaran #${invoiceId} - DJANDES`);
                } catch (err) {
                    await sendMsg(`❌ Gagal mengambil gambar struk: ${err.message}`);
                }
                return res.status(200).send('OK');
            }

            // ── /bayar (bayar dengan nominal ATAU tandai lunas penuh) ──
            // Format: /bayar_[invoice]_[nominal] atau /bayar_[invoice]
            if (baseCmd === '/bayar' || baseCmd === '/dp') {
                if (!invoiceId) {
                    await sendMsg('⚠️ Format:\n/bayar_[invoice]_[nominal] — bayar dengan nominal\n/bayar_[invoice] — tandai lunas penuh');
                    return res.status(200).send('OK');
                }

                await sendMsg(`⏳ <b>Memproses pembayaran #${invoiceId}...</b>`);
                try {
                    const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
                    const getText = await getRes.text();
                    let getJson;
                    try { getJson = JSON.parse(getText); } catch (e) {
                        throw new Error(`Respon GAS bukan JSON. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status !== 'success' || !getJson.data) {
                        await sendMsg(`❌ Invoice #${invoiceId} tidak ditemukan.`);
                        return res.status(200).send('OK');
                    }

                    const grandTotal = parseInt(getJson.data.total, 10) || 0;
                    const prevStatus = getJson.data.status || '';
                    const prevStatusLow = prevStatus.toLowerCase();
                    const currentPaid = Number(getJson.data.paidAmount) || 0;

                    // Hitung sisa yang harus dibayar berdasarkan status sebelumnya (dengan fallback ke data lama)
                    let dpSebelumnya = currentPaid;
                    if (dpSebelumnya === 0 && prevStatusLow.startsWith('dp ')) {
                        const dpM = prevStatus.match(/DP Rp\s*([\d\.,]+)/i);
                        if (dpM) dpSebelumnya = parseInt(dpM[1].replace(/[\.,]/g, ''), 10) || 0;
                    }

                    if (prevStatusLow.startsWith('lunas')) {
                        await sendMsg(`ℹ️ Invoice #${invoiceId} sudah berstatus <b>LUNAS</b>.`);
                        return res.status(200).send('OK');
                    }

                    let sisaSebelumnya = grandTotal - dpSebelumnya;
                    if (sisaSebelumnya < 0) sisaSebelumnya = 0;

                    let statusString, receiptCaption, konfirmasiMsg;
                    let nextPaid, nextChange;

                    if (!extraParam) {
                        // Tidak ada nominal → Tandai Lunas Penuh
                        statusString = 'Lunas';
                        nextPaid = grandTotal;
                        nextChange = 0;
                        receiptCaption = `🟢 Nota LUNAS #${invoiceId} - DJANDES`;
                        konfirmasiMsg =
                            `🎉 <b>LUNAS!</b> Invoice #${invoiceId}\n` +
                            `💵 Total: Rp ${grandTotal.toLocaleString('id-ID')}\n` +
                            (dpSebelumnya > 0 ? `🪙 DP Sebelumnya: Rp ${dpSebelumnya.toLocaleString('id-ID')}\n` : '') +
                            `\n⏳ Menyiapkan struk...`;
                    } else {
                        // Ada nominal → proses bayar cerdas
                        const bayarAmount = parseInt(extraParam.replace(/[\.,]/g, ''), 10);
                        if (!bayarAmount || bayarAmount <= 0) {
                            await sendMsg('⚠️ Nominal bayar tidak valid.');
                            return res.status(200).send('OK');
                        }

                        const kembalian = bayarAmount - sisaSebelumnya; // positif = ada kembalian
                        const kurang = sisaSebelumnya - bayarAmount;    // positif = masih kurang

                        if (bayarAmount >= sisaSebelumnya) {
                            // Bayar cukup atau lebih → LUNAS
                            statusString = 'Lunas';
                            nextPaid = dpSebelumnya + bayarAmount;
                            nextChange = kembalian > 0 ? kembalian : 0;
                            receiptCaption = `🟢 Nota LUNAS #${invoiceId} - DJANDES`;
                            konfirmasiMsg =
                                `🎉 <b>LUNAS!</b> Invoice #${invoiceId}\n` +
                                `💵 Total: Rp ${grandTotal.toLocaleString('id-ID')}\n` +
                                (dpSebelumnya > 0 ? `🪙 DP/Bayar Sebelumnya: Rp ${dpSebelumnya.toLocaleString('id-ID')}\n` : '') +
                                `💳 Bayar Kali Ini: Rp ${bayarAmount.toLocaleString('id-ID')}\n` +
                                (kembalian > 0 ? `💰 <b>Kembalian: Rp ${kembalian.toLocaleString('id-ID')}</b>\n` : '') +
                                `\n⏳ Menyiapkan struk...`;
                        } else {
                            // Masih kurang → DP (akumulasi)
                            const totalDPBaru = dpSebelumnya + bayarAmount;
                            statusString = 'Kurang Bayar';
                            nextPaid = totalDPBaru;
                            nextChange = 0;
                            receiptCaption = `🟡 Nota DP #${invoiceId} - KURANG BAYAR`;
                            konfirmasiMsg =
                                `🪙 <b>DP/Bayar Tercatat!</b> Invoice #${invoiceId}\n` +
                                `💵 Total: Rp ${grandTotal.toLocaleString('id-ID')}\n` +
                                (dpSebelumnya > 0 ? `💳 DP Sebelum: Rp ${dpSebelumnya.toLocaleString('id-ID')}\n` : '') +
                                `💳 Bayar Kali Ini: Rp ${bayarAmount.toLocaleString('id-ID')}\n` +
                                `✅ Total Terbayar: Rp ${totalDPBaru.toLocaleString('id-ID')}\n` +
                                `⚠️ <b>Kurang: Rp ${kurang.toLocaleString('id-ID')}</b>\n` +
                                `\n⏳ Menyiapkan struk...`;
                        }
                    }

                    const payRes = await fetch(gasUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'setStatus',
                            invoiceId,
                            status: statusString,
                            paidAmount: nextPaid,
                            changeAmount: nextChange
                        })
                    });
                    const payJson = await payRes.json();

                    if (payJson.status === 'success') {
                        await sendMsg(konfirmasiMsg);
                        await sendReceipt(invoiceId, receiptCaption);
                    } else {
                        await sendMsg(`❌ Gagal menyimpan ke Sheets: ${payJson.message}`);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal memproses pembayaran.\nError: ${err.message}`);
                }
                return res.status(200).send('OK');
            }

            // ── /status ──
            if (baseCmd === '/status') {
                if (!invoiceId) { await sendMsg('⚠️ Format: `/status_[invoice]`'); return res.status(200).send('OK'); }

                try {
                    const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
                    const getText = await getRes.text();
                    let getJson;
                    try { getJson = JSON.parse(getText); } catch (e) {
                        throw new Error(`Respon GAS Web App bukan JSON. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status === 'success' && getJson.data) {
                        const d = getJson.data;
                        const cleanTime = extractTime(d.timePickup);
                        const icon = statusIcon(d.status);

                        const itemsText = d.items
                            ? d.items.split(',').map(it => {
                                const [n, q, p] = it.split('|');
                                return `\n  • ${escapeHtml(n || '-')} (${escapeHtml(q || '1x')}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                            }).join('') : '-';

                        const [pType, , pPrice] = (d.packaging || '').split('|');
                        const pkgText = pType ? `${escapeHtml(pType)} — Rp ${parseInt(pPrice || 0, 10).toLocaleString('id-ID')}` : '-';

                        const cleanInvoiceId = invoiceId.replace(/-/g, '');

                        await sendMsg(
                            `📋 <b>Detail Pesanan #${escapeHtml(invoiceId)}</b>\n\n` +
                            `👤 <b>Nama:</b> ${escapeHtml(d.name)}\n` +
                            `🥞 <b>Item:</b> ${itemsText}\n` +
                            `📦 <b>Kemasan:</b> ${pkgText}\n` +
                            `💵 <b>Total:</b> Rp ${Number(d.total).toLocaleString('id-ID')}\n` +
                            `📅 <b>Tanggal Ambil:</b> ${escapeHtml(d.datePickup)}\n` +
                            `🕐 <b>Jam Ambil:</b> ${escapeHtml(cleanTime)}\n` +
                            `📝 <b>Catatan:</b> ${escapeHtml(d.notes || '-')}\n` +
                            `💳 <b>Status:</b> ${icon} <b>${escapeHtml((d.status || '').toUpperCase())}</b>\n\n` +
                            `<b>Tindakan:</b>\n` +
                            `🧾 /struk_${cleanInvoiceId}\n` +
                            `💰 /dp_${cleanInvoiceId}_500000\n` +
                            `✅ /bayar_${cleanInvoiceId}`
                        );
                    } else {
                        await sendMsg(`❌ Invoice #${escapeHtml(invoiceId)} tidak ditemukan.`);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal mengambil detail info.\nError: ${escapeHtml(err.message)}`);
                }
                return res.status(200).send('OK');
            }

            // ── /jadwal ──
            if (baseCmd === '/jadwal') {
                // Cari parameter tanggal dari command /jadwal_YYYY_MM_DD atau /jadwal_YYYY-MM-DD
                let dateParam = '';
                if (uParts.length === 2) {
                    dateParam = uParts[1]; // misal YYYY-MM-DD
                } else if (uParts.length >= 4) {
                    dateParam = `${uParts[1]}-${uParts[2]}-${uParts[3]}`; // YYYY_MM_DD -> YYYY-MM-DD
                }

                const isDetailRequest = dateParam && dateParam.match(/^\d{4}-\d{2}-\d{2}$/);

                if (isDetailRequest) {
                    await sendMsg(`⏳ <b>Mengambil detail pesanan ${escapeHtml(dateParam)}...</b>`);
                    try {
                        const getRes = await fetch(`${gasUrl}?action=getAll`);
                        const getText = await getRes.text();
                        let getJson;
                        try {
                            getJson = JSON.parse(getText);
                        } catch (e) {
                            throw new Error(`Respon GAS bukan JSON. Status: ${getRes.status}. Data: ${getText.substring(0, 150)}`);
                        }

                        if (getJson.status !== 'success' || !Array.isArray(getJson.data)) {
                            await sendMsg(`❌ Gagal: ${escapeHtml(getJson.message || 'Malfungsi')}`);
                            return res.status(200).send('OK');
                        }

                        const listOnDate = getJson.data.filter(o => {
                            const d = parseDate(o.datePickup);
                            return d && toDateStr(d) === dateParam;
                        }).sort((a, b) => {
                            return extractTime(a.timePickup).localeCompare(extractTime(b.timePickup));
                        });

                        if (listOnDate.length === 0) {
                            await sendMsg(`📭 <b>Tidak ada pesanan pada tanggal ${escapeHtml(dateParam)}.</b>`);
                        } else {
                            const firstD = parseDate(listOnDate[0].datePickup);
                            const dayName = firstD
                                ? firstD.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
                                : dateParam;

                            let msg = `📅 <b>Pesanan Hari ${escapeHtml(dayName)}:</b>\n\n`;
                            listOnDate.forEach((o, i) => {
                                const icon = statusIcon(o.status);
                                const timeStr = extractTime(o.timePickup);
                                const cleanInvoiceId = o.invoiceId.replace(/-/g, '');

                                // Label status detail friendly
                                let displayStatus = (o.status || 'Pending').toUpperCase();
                                if (displayStatus.startsWith('KURANG')) {
                                    const paidVal = Number(o.paidAmount) || 0;
                                    const totalVal = Number(o.total) || 0;
                                    displayStatus = `DP RP ${paidVal.toLocaleString('id-ID')} (KURANG RP ${(totalVal - paidVal).toLocaleString('id-ID')})`;
                                }

                                msg += `<b>${i + 1}. ${escapeHtml(o.name)}</b> ${icon}\n`;
                                msg += `   🕐 Jam Ambil: <b>${timeStr}</b>\n`;
                                msg += `   💵 Total: Rp ${Number(o.total).toLocaleString('id-ID')} | Status: <i>${displayStatus}</i>\n`;
                                msg += `   🔍 /status_${cleanInvoiceId}\n\n`;
                            });
                            msg += `Total pada tanggal ini: <b>${listOnDate.length}</b> pesanan.`;
                            await sendMsg(msg);
                        }
                    } catch (err) {
                        await sendMsg(`❌ Gagal mengambil detail jadwal.\nError: ${escapeHtml(err.message)}`);
                    }
                    return res.status(200).send('OK');
                }

                // General list of grouped dates
                await sendMsg('⏳ <b>Mengambil daftar jadwal pengiriman...</b>');
                try {
                    const getRes = await fetch(`${gasUrl}?action=getAll`);
                    const getText = await getRes.text();
                    let getJson;
                    try {
                        getJson = JSON.parse(getText);
                    } catch (e) {
                        throw new Error(`Respon GAS Web App bukan JSON. Status: ${getRes.status}. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status !== 'success' || !Array.isArray(getJson.data)) {
                        await sendMsg(`❌ Gagal mendapatkan list data dari Sheets: ${escapeHtml(getJson.message || 'Data kosong')}`);
                        return res.status(200).send('OK');
                    }

                    const todayStr = toDateStr(new Date());

                    // Group by date
                    const groups = {};
                    getJson.data.forEach(o => {
                        const d = parseDate(o.datePickup);
                        if (d) {
                            const ds = toDateStr(d);
                            if (ds >= todayStr) {
                                if (!groups[ds]) {
                                    groups[ds] = {
                                        dateObj: d,
                                        count: 0
                                    };
                                }
                                groups[ds].count++;
                            }
                        }
                    });

                    const sortedDates = Object.keys(groups).sort();

                    if (sortedDates.length === 0) {
                        await sendMsg(`📭 <b>Tidak ada pesanan mendatang mulai tanggal ${todayStr}.</b>`);
                    } else {
                        let msg = `📅 <b>Ringkasan Jadwal Mendatang (Mulai ${todayStr}):</b>\n\n`;
                        sortedDates.forEach((ds, i) => {
                            const g = groups[ds];
                            const dateFmt = g.dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

                            // 2026-07-23 -> 2026_07_23
                            const cleanDateCmd = ds.replace(/-/g, '_');

                            msg += `<b>${i + 1}. 📅 ${escapeHtml(dateFmt)}</b>\n`;
                            msg += `   � Jumlah: <b>${g.count} pesanan</b>\n`;
                            msg += `   � /jadwal_${cleanDateCmd}\n\n`;
                        });

                        const grandTotalOrders = sortedDates.reduce((sum, ds) => sum + groups[ds].count, 0);
                        msg += `Total: <b>${grandTotalOrders}</b> pesanan di <b>${sortedDates.length}</b> tanggal pengiriman.`;
                        await sendMsg(msg);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal memuat ringkasan jadwal.\nError: ${escapeHtml(err.message)}`);
                }
                return res.status(200).send('OK');
            }

            // ── /laporan ──
            if (baseCmd === '/laporan') {
                await sendMsg('⏳ <b>Menyusun laporan pendapatan...</b>');
                try {
                    const getRes = await fetch(`${gasUrl}?action=getAll`);
                    const getText = await getRes.text();
                    let getJson;
                    try {
                        getJson = JSON.parse(getText);
                    } catch (e) {
                        throw new Error(`Respon GAS Web App bukan JSON. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status !== 'success' || !Array.isArray(getJson.data)) {
                        await sendMsg(`❌ Gagal mengambil data laporan: ${escapeHtml(getJson.message || 'Format salah')}`);
                        return res.status(200).send('OK');
                    }

                    const now = new Date();
                    const todayStr2 = toDateStr(now);
                    const param0 = (spaceParts[0] || 'hari').toLowerCase();
                    let startDate = null, endDate = null, rangeLabel = '';

                    if (param0 === 'hari') {
                        startDate = new Date(todayStr2 + 'T00:00:00+07:00');
                        endDate = new Date(todayStr2 + 'T23:59:59+07:00');
                        rangeLabel = `Hari Ini (${todayStr2})`;
                    } else if (param0 === 'minggu') {
                        const day = now.getDay();
                        const diffMon = day === 0 ? -6 : 1 - day;
                        const mon = new Date(now); mon.setDate(now.getDate() + diffMon);
                        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                        startDate = mon; endDate = sun;
                        rangeLabel = `Minggu Ini (${toDateStr(mon)} s/d ${toDateStr(sun)})`;
                    } else if (param0 === 'bulan') {
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        const mn = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                        rangeLabel = `${mn[now.getMonth()]} ${now.getFullYear()}`;
                    } else {
                        // Custom range: "/laporan 01/07/2026 31/07/2026"
                        startDate = parseDate(spaceParts[0]);
                        endDate = parseDate(spaceParts[1] || spaceParts[0]);
                        rangeLabel = `${spaceParts[0] || '?'}${spaceParts[1] ? ' s/d ' + spaceParts[1] : ''}`;
                        if (!startDate) {
                            await sendMsg(
                                '⚠️ Format tidak dikenali.\n\nContoh:\n' +
                                '📅 <b>Jadwal</b> -> Tekan tombol di bawah\n' +
                                '/laporan hari\n/laporan minggu\n/laporan bulan\n' +
                                '/laporan 01/07/2026 31/07/2026\n/laporan 2026-07-01 2026-07-31'
                            );
                            return res.status(200).send('OK');
                        }
                    }

                    const startStr = toDateStr(startDate);
                    const endStr = toDateStr(endDate);

                    const filtered = getJson.data.filter(o => {
                        const d = parseDate(o.datePickup);
                        if (!d) return false;
                        const ds = toDateStr(d);
                        return ds >= startStr && ds <= endStr;
                    });

                    let totalTagihan = 0, totalMasuk = 0;
                    let countLunas = 0, lunasMasuk = 0;
                    let countDP = 0, dpMasuk = 0;
                    let countPending = 0;

                    filtered.forEach(o => {
                        const total = parseInt(o.total, 10) || 0;
                        totalTagihan += total;
                        const paid = getPaidAmount(o.status, total, o);
                        totalMasuk += paid;
                        const s = (o.status || '').toLowerCase();
                        if (s.startsWith('lunas')) { countLunas++; lunasMasuk += total; }
                        else if (s.startsWith('dp') || s.startsWith('kurang')) { countDP++; dpMasuk += paid; }
                        else { countPending++; }
                    });

                    const piutang = totalTagihan - totalMasuk;

                    await sendMsg(
                        `📊 <b>Laporan Pendapatan DJANDES</b>\n` +
                        `📆 <b>Periode:</b> ${escapeHtml(rangeLabel)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🧾 <b>Total Pesanan:</b> ${filtered.length}\n` +
                        `🟢 Lunas: ${countLunas} — Rp ${lunasMasuk.toLocaleString('id-ID')}\n` +
                        `🟡 DP/Cicilan: ${countDP} — Rp ${dpMasuk.toLocaleString('id-ID')} masuk\n` +
                        `🔴 Pending: ${countPending} pesanan\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💰 <b>Total Uang Masuk:</b> Rp ${totalMasuk.toLocaleString('id-ID')}\n` +
                        `📋 <b>Total Tagihan:</b> Rp ${totalTagihan.toLocaleString('id-ID')}\n` +
                        `⚠️ <b>Piutang Belum Masuk:</b> Rp ${piutang.toLocaleString('id-ID')}\n\n` +
                        `<i>Gunakan /jadwal untuk detail pesanan</i>`
                    );
                } catch (err) {
                    await sendMsg(`❌ Gagal menyusun laporan.\nError: ${escapeHtml(err.message)}`);
                }
                return res.status(200).send('OK');
            }
        } else {
            // Jika tidak cocok dengan format Whatsapp maupun Telegram command
            await sendMsg(
                `👋 <b>Halo Admin DJANDES!</b>\n\n` +
                `Silakan gunakan tombol menu cepat di bawah ini untuk melihat jadwal atau menyusun laporan harian/mingguan/bulanan.\n\n` +
                `Untuk perintah lainnya, ketik:\n` +
                `📅 /jadwal — Cek jadwal pesanan\n` +
                `📊 /laporan — Susun laporan pendapatan\n` +
                `📋 /status_<b>[invoice]</b> — Cek status pesanan\n` +
                `🧾 /struk_<b>[invoice]</b> — Lihat struk pesanan\n` +
                `💰 /dp_<b>[invoice]</b>_<b>[nominal]</b> — Catat pembayaran/DP\n` +
                `✅ /bayar_<b>[invoice]</b> — Catat lunas`
            );
        }

    } catch (error) {
        console.error('Webhook Error:', error);
    }

    return res.status(200).send('OK');
};
