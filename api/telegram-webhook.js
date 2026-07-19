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
        async function sendMsg(txt, replyMarkup = null) {
            const adminKeyboard = {
                keyboard: [
                    [{ text: '📅 Jadwal' }, { text: '📊 Laporan Hari' }],
                    [{ text: '📊 Laporan Minggu' }, { text: '📊 Laporan Bulan' }]
                ],
                resize_keyboard: true,
                persistent: true
            };
            const markup = replyMarkup || adminKeyboard;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: txt,
                    parse_mode: 'Markdown',
                    reply_markup: markup
                })
            });
        }

        async function sendReceipt(invoiceId, caption) {
            const htmlUrl = `${protocol}://${host}/api/product-receipt?invoiceId=${invoiceId}`;
            const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(htmlUrl)}&screenshot=true&embed=screenshot.url&viewport.width=520&viewport.height=4000&waitFor=1000&element=.card`;
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

            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                const d = new Date(s + 'T00:00:00+07:00');
                return isNaN(d.getTime()) ? null : d;
            }

            const parsed = Date.parse(s);
            if (!isNaN(parsed)) {
                return new Date(parsed);
            }

            const dmyM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmyM) {
                let d = new Date(`${dmyM[3]}-${dmyM[2].padStart(2, '0')}-${dmyM[1].padStart(2, '0')}T00:00:00+07:00`);
                if (isNaN(d.getTime())) {
                    d = new Date(`${dmyM[3]}-${dmyM[1].padStart(2, '0')}-${dmyM[2].padStart(2, '0')}T00:00:00+07:00`);
                }
                return isNaN(d.getTime()) ? null : d;
            }

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

        function getPaidAmount(status, total) {
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
            if (s.startsWith('dp')) return '🟡';
            return '🔴';
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
                    return `  • *${n}* (${q}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                }).join('\n');

                const [pType, pVar, pPrice] = packagingFetched.split('|');
                const pkgTxt = pType
                    ? `${pType} (${pVar}) — Rp ${parseInt(pPrice, 10).toLocaleString('id-ID')}`
                    : 'Standard';

                // Buat versi invoiceId yang aman untuk Telegram command (no dashes)
                const telInvoiceId = invoiceId.replace('-', '_');

                await sendMsg(
                    `✅ *Invoice ${invoiceId} Berhasil Dicatat!*\n\n` +
                    `👤 *Nama:* ${customerName}\n` +
                    `🥞 *Rincian Pesanan:*\n${itemLines}\n` +
                    `📦 *Kemasan:* ${pkgTxt}\n` +
                    `💵 *Total:* Rp ${totalVal.toLocaleString('id-ID')}\n` +
                    `📅 *Tanggal Ambil:* ${datePickup}\n` +
                    `🕐 *Jam Ambil:* ${timePickup}\n` +
                    `📝 *Catatan:* ${notesStr || '-'}\n` +
                    `💳 *Status:* 🔴 *PENDING*\n\n` +
                    `*Tindakan cepat:*\n` +
                    `🧾 /struk_${telInvoiceId}\n` +
                    `💰 /dp_${telInvoiceId}_500000 (Ganti nominal DP jika beda)\n` +
                    `✅ /bayar_${telInvoiceId}`
                );
            } else {
                await sendMsg(`❌ Gagal menyimpan ke Sheets: ${sheetJson.message}`);
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
                    `👋 *Halo Admin DJANDES!*\n\n` +
                    `Copas teks pesanan WhatsApp ke sini untuk mencatat otomatis.\n\n` +
                    `*📋 Daftar Perintah:*\n` +
                    `📅 /jadwal - Cek jadwal pengiriman\n` +
                    `📊 /laporan - Laporan pendapatan (hari/minggu/bulan)\n` +
                    `📊 /laporan_[tgl_mulai]_[tgl_akhir]\n` +
                    `📋 /status_[invoice] - Cek status pesanan\n` +
                    `🧾 /struk_[invoice] - Print struk gambar\n` +
                    `💰 /dp_[invoice]_[nominal] - Catat pembayaran DP\n` +
                    `✅ /bayar_[invoice] - Bayar Lunas`
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

            // ── /dp ──
            if (baseCmd === '/dp') {
                if (!invoiceId || !extraParam) { await sendMsg('⚠️ Format: `/dp_[invoice]_[nominal]`'); return res.status(200).send('OK'); }
                const dpAmount = parseInt(extraParam.replace(/[\.,]/g, ''), 10);
                if (!dpAmount || dpAmount <= 0) { await sendMsg('⚠️ Nominal DP tidak valid.'); return res.status(200).send('OK'); }

                await sendMsg(`⏳ *Mencatat DP Rp ${dpAmount.toLocaleString('id-ID')} untuk #${invoiceId}...*`);
                try {
                    const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
                    const getText = await getRes.text();
                    let getJson;
                    try { getJson = JSON.parse(getText); } catch (e) {
                        throw new Error(`Respon GAS Aplikasi Web bukan JSON. Status: ${getRes.status}. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status !== 'success' || !getJson.data) {
                        await sendMsg(`❌ Invoice #${invoiceId} tidak ditemukan.`);
                        return res.status(200).send('OK');
                    }

                    const grandTotal = parseInt(getJson.data.total, 10) || 0;
                    const shortAmount = grandTotal - dpAmount;
                    const statusString = shortAmount <= 0
                        ? 'Lunas'
                        : `DP Rp ${dpAmount.toLocaleString('id-ID')} (Kurang Rp ${shortAmount.toLocaleString('id-ID')})`;

                    const payRes = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setStatus', invoiceId, status: statusString }) });
                    const payJson = await payRes.json();

                    if (payJson.status === 'success') {
                        await sendMsg(`🎉 *DP Tercatat!*\nStatus #${invoiceId}: *${statusString}*\n\n⏳ *Menyiapkan Struk...*`);
                        await sendReceipt(invoiceId, `🪙 Nota DP #${invoiceId} - KURANG BAYAR`);
                    } else {
                        await sendMsg(`❌ Gagal menyimpan DP ke Sheets: ${payJson.message}`);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal mencatat DP.\nError: ${err.message}`);
                }
                return res.status(200).send('OK');
            }

            // ── /bayar ──
            if (baseCmd === '/bayar') {
                if (!invoiceId) { await sendMsg('⚠️ Format: `/bayar_[invoice]`'); return res.status(200).send('OK'); }

                await sendMsg(`⏳ *Mencatat pelunasan #${invoiceId}...*`);
                try {
                    const getRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
                    const getText = await getRes.text();
                    let getJson;
                    try { getJson = JSON.parse(getText); } catch (e) {
                        throw new Error(`Respon GAS Web App bukan JSON. Data: ${getText.substring(0, 150)}`);
                    }

                    if (getJson.status !== 'success' || !getJson.data) {
                        await sendMsg(`❌ Invoice #${invoiceId} tidak ditemukan.`);
                        return res.status(200).send('OK');
                    }

                    let newStatus = 'Lunas';
                    const prev = getJson.data.status || '';
                    if (prev.toLowerCase().startsWith('dp ')) {
                        const dpM = prev.match(/DP Rp\s*([\d\.,\s]+)/i);
                        const shortM = prev.match(/Kurang Rp\s*([\d\.,\s]+)/i);
                        if (dpM && shortM) newStatus = `Lunas (DP Rp ${dpM[1].trim()} + Lunas Rp ${shortM[1].trim()})`;
                    }

                    const payRes = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setStatus', invoiceId, status: newStatus }) });
                    const payJson = await payRes.json();

                    if (payJson.status === 'success') {
                        await sendMsg(`🎉 *Sukses!* Invoice #${invoiceId} ditandai *LUNAS*.\n\n⏳ *Menyiapkan Struk...*`);
                        await sendReceipt(invoiceId, `🟢 Nota DJANDES #${invoiceId} - ${newStatus}`);
                    } else {
                        await sendMsg(`❌ Gagal update status di Sheets: ${payJson.message}`);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal memperbarui status ke Sheets.\nError: ${err.message}`);
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
                                return `\n  • ${n || '-'} (${q || '1x'}) — Rp ${parseInt(p, 10).toLocaleString('id-ID')}`;
                            }).join('') : '-';

                        const [pType, , pPrice] = (d.packaging || '').split('|');
                        const pkgText = pType ? `${pType} — Rp ${parseInt(pPrice || 0, 10).toLocaleString('id-ID')}` : '-';

                        const telInvoiceId = invoiceId.replace('-', '_');

                        await sendMsg(
                            `📋 *Detail Pesanan #${invoiceId}*\n\n` +
                            `👤 *Nama:* ${d.name}\n` +
                            `🥞 *Item:* ${itemsText}\n` +
                            `📦 *Kemasan:* ${pkgText}\n` +
                            `💵 *Total:* Rp ${Number(d.total).toLocaleString('id-ID')}\n` +
                            `📅 *Tanggal Ambil:* ${d.datePickup}\n` +
                            `🕐 *Jam Ambil:* ${cleanTime}\n` +
                            `📝 *Catatan:* ${d.notes || '-'}\n` +
                            `💳 *Status:* ${icon} *${(d.status || '').toUpperCase()}*\n\n` +
                            `*Tindakan:*\n` +
                            `🧾 /struk_${telInvoiceId}\n` +
                            `💰 /dp_${telInvoiceId}_500000\n` +
                            `✅ /bayar_${telInvoiceId}`
                        );
                    } else {
                        await sendMsg(`❌ Invoice #${invoiceId} tidak ditemukan.`);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal mengambil detail info.\nError: ${err.message}`);
                }
                return res.status(200).send('OK');
            }

            // ── /jadwal ──
            if (baseCmd === '/jadwal') {
                await sendMsg('⏳ *Mengambil jadwal pesanan...*');
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
                        await sendMsg(`❌ Gagal mendapatkan list data dari Sheets: ${getJson.message || 'Data kosong'}`);
                        return res.status(200).send('OK');
                    }

                    const todayStr = toDateStr(new Date());
                    const upcoming = getJson.data
                        .filter(o => { const d = parseDate(o.datePickup); return d && toDateStr(d) >= todayStr; })
                        .sort((a, b) => {
                            const da = parseDate(a.datePickup), db = parseDate(b.datePickup);
                            if (da && db && da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
                            return extractTime(a.timePickup).localeCompare(extractTime(b.timePickup));
                        });

                    if (upcoming.length === 0) {
                        await sendMsg(`📭 *Tidak ada pesanan mendatang mulai tanggal ${todayStr}.*`);
                    } else {
                        let msg = `📅 *Jadwal Pesanan Mendatang (${todayStr}):*\n\n`;
                        upcoming.forEach((o, i) => {
                            const icon = statusIcon(o.status);
                            const timeStr = extractTime(o.timePickup);
                            const d = parseDate(o.datePickup);
                            const dateFmt = d
                                ? d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
                                : o.datePickup;
                            const telInvoiceId = o.invoiceId.replace('-', '_');
                            msg += `*${i + 1}. ${o.name}* ${icon}\n`;
                            msg += `   📅 ${dateFmt}\n`;
                            msg += `   🕐 ${timeStr} | 💵 Rp ${Number(o.total).toLocaleString('id-ID')}\n`;
                            msg += `   🔍 /status_${telInvoiceId}\n\n`;
                        });
                        msg += `Total: *${upcoming.length}* pesanan.`;
                        await sendMsg(msg);
                    }
                } catch (err) {
                    await sendMsg(`❌ Gagal memuat jadwal.\nError: ${err.message}`);
                }
                return res.status(200).send('OK');
            }

            // ── /laporan ──
            if (baseCmd === '/laporan') {
                await sendMsg('⏳ *Menyusun laporan pendapatan...*');
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
                        await sendMsg(`❌ Gagal mengambil data laporan: ${getJson.message || 'Format salah'}`);
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
                                '`📅 Jadwal` -> Tekan tombol di bawah\n' +
                                '`/laporan hari`\n`/laporan minggu`\n`/laporan bulan`\n' +
                                '`/laporan 01/07/2026 31/07/2026`\n`/laporan 2026-07-01 2026-07-31`'
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
                        const paid = getPaidAmount(o.status, total);
                        totalMasuk += paid;
                        const s = (o.status || '').toLowerCase();
                        if (s.startsWith('lunas')) { countLunas++; lunasMasuk += total; }
                        else if (s.startsWith('dp')) { countDP++; dpMasuk += paid; }
                        else { countPending++; }
                    });

                    const piutang = totalTagihan - totalMasuk;

                    await sendMsg(
                        `📊 *Laporan Pendapatan DJANDES*\n` +
                        `📆 *Periode:* ${rangeLabel}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🧾 *Total Pesanan:* ${filtered.length}\n` +
                        `🟢 Lunas: ${countLunas} — Rp ${lunasMasuk.toLocaleString('id-ID')}\n` +
                        `🟡 DP/Cicilan: ${countDP} — Rp ${dpMasuk.toLocaleString('id-ID')} masuk\n` +
                        `🔴 Pending: ${countPending} pesanan\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💰 *Total Uang Masuk:* Rp ${totalMasuk.toLocaleString('id-ID')}\n` +
                        `📋 *Total Tagihan:* Rp ${totalTagihan.toLocaleString('id-ID')}\n` +
                        `⚠️ *Piutang Belum Masuk:* Rp ${piutang.toLocaleString('id-ID')}\n\n` +
                        `_Gunakan /jadwal untuk detail pesanan_`
                    );
                } catch (err) {
                    await sendMsg(`❌ Gagal menyusun laporan.\nError: ${err.message}`);
                }
                return res.status(200).send('OK');
            }
        }

    } catch (error) {
        console.error('Webhook Error:', error);
    }

    return res.status(200).send('OK');
};
