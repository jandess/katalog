// api/product-receipt.js
// Endpoint HTML murni — tidak butuh library tambahan.
// Body tanpa margin/padding agar microlink `element=.card` hanya menangkap area kartu.

module.exports = async function handler(req, res) {
    try {
        const urlObj = new URL(req.url, `https://${req.headers.host}`);
        const invoiceId = urlObj.searchParams.get('invoiceId');

        if (!invoiceId) {
            return res.status(400).send('invoiceId diperlukan');
        }

        const gasUrl = process.env.GOOGLE_SCRIPT_URL;
        if (!gasUrl) {
            return res.status(500).send('GOOGLE_SCRIPT_URL belum dikonfigurasi');
        }

        // Ambil data invoice dari Google Sheets via Apps Script
        const sheetRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
        const sheetJson = await sheetRes.json();

        if (sheetJson.status !== 'success' || !sheetJson.data) {
            return res.status(404).send(`Invoice ${invoiceId} tidak ditemukan`);
        }

        const order = sheetJson.data;
        const isPaid = order.status && order.status.toLowerCase() === 'lunas';

        // 1. Parsing Items: format "Nama|Qty|HargaTotal"
        const itemsList = order.items
            ? order.items.split(',').map(x => {
                const parts = x.trim().split('|');
                const name = parts[0] || '';
                const qty = parts[1] || '1x';
                const price = parseInt(parts[2], 10) || 0;

                // Hitung harga satuan
                const qtyNumber = parseInt(qty.replace(/[^0-9]/g, ''), 10) || 1;
                const unitPrice = Math.round(price / qtyNumber);

                return { name, qty, price, unitPrice };
            }).filter(i => i.name)
            : [];

        // 2. Parsing Packaging: format "Tipe|Varian|Harga"
        let boxType = '';
        let boxVariant = '';
        let boxPrice = 0;
        if (order.packaging && order.packaging.includes('|')) {
            const parts = order.packaging.split('|');
            boxType = parts[0] || '';
            boxVariant = parts[1] || '';
            boxPrice = parseInt(parts[2], 10) || 0;
        } else if (order.packaging) {
            boxType = order.packaging;
        }

        // 3. Setup Nilai Keuangan dan Status Bayar
        const subtotal = Number(order.subtotal) || itemsList.reduce((s, i) => s + i.price, 0);
        const boxTotal = boxPrice || Number(order.boxTotal) || 0;
        const total = Number(order.total) || subtotal + boxTotal;

        const statusStr = (order.status || '').toLowerCase();
        let statusText = 'PENDING';
        let statusColor = '#991b1b'; // Red
        let statusBg = '#fee2e2';
        let statusBorder = '#f87171';

        if (statusStr.startsWith('lunas')) {
            statusText = order.status.toUpperCase();
            statusColor = '#065f46'; // Green
            statusBg = '#d1fae5';
            statusBorder = '#34d399';
        } else if (statusStr.startsWith('dp')) {
            statusText = 'KURANG BAYAR';
            statusColor = '#c2410c'; // Orange
            statusBg = '#ffedd5';
            statusBorder = '#fb923c';
        }

        // Tampilkan detail DP jika status cicilan / pelunasan DP
        let dpHistoryHtml = '';
        if (statusStr.startsWith('dp')) {
            const dpMatch = order.status.match(/DP Rp\s*([\d\.,\s]+)/i);
            const shortMatch = order.status.match(/Kurang Rp\s*([\d\.,\s]+)/i);
            if (dpMatch && shortMatch) {
                dpHistoryHtml = `
                  <div style="margin-top:8px; border-top:1px dashed #ede9de; padding-top:8px; font-family:'Inter',sans-serif; display:flex; flex-direction:column; gap:4px; font-size:12px;">
                    <div style="display:flex; justify-content:space-between; color:#4b5563;">
                      <span>Uang Muka (DP)</span>
                      <span style="font-weight:700; color:#16a34a;">- Rp ${dpMatch[1].trim()}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:#b91c1c; font-weight:700;">
                      <span>Sisa Kurang Bayar</span>
                      <span>Rp ${shortMatch[1].trim()}</span>
                    </div>
                  </div>
                `;
            }
        } else if (statusStr.startsWith('lunas') && statusStr.includes('dp')) {
            const dpMatch = order.status.match(/DP Rp\s*([\d\.,\s]+)/i);
            const payMatch = order.status.match(/Lunas Rp\s*([\d\.,\s]+)/i);
            if (dpMatch && payMatch) {
                dpHistoryHtml = `
                  <div style="margin-top:8px; border-top:1px dashed #ede9de; padding-top:8px; font-family:'Inter',sans-serif; display:flex; flex-direction:column; gap:4px; font-size:12px;">
                    <div style="display:flex; justify-content:space-between; color:#4b5563;">
                      <span>Uang Muka (DP)</span>
                      <span style="font-weight:600;">Rp ${dpMatch[1].trim()}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; color:#4b5563;">
                      <span>Pelunasan</span>
                      <span style="font-weight:600;">Rp ${payMatch[1].trim()}</span>
                    </div>
                  </div>
                `;
            }
        }

        // 4. Perbaikan tampilan Jam secara universal (entah format ISO, string panjang, Epoch dsb)
        let cleanTime = order.timePickup || '-';
        const timeRegexMatch = cleanTime.match(/(\d{2}:\d{2})/);
        if (timeRegexMatch) {
            cleanTime = timeRegexMatch[1];
        }

        // 5. Render Daftar Items (Identik Web Struk, fix double 'x')
        const itemsHtml = itemsList.map(item => {
            const cleanQty = item.qty.replace(/x/gi, '').trim();
            return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 10px;border-bottom:1px dashed #ede9de;">
        <div style="display:flex;flex-direction:column;">
          <span style="font-size:14px;color:#1a1a1a;font-weight:700;font-family:'Inter',sans-serif;">${item.name}</span>
          <span style="font-size:11px;color:#9ca3af;font-weight:500;margin-top:2px;font-family:'Inter',sans-serif;">${cleanQty} x Rp ${item.unitPrice.toLocaleString('id-ID')}</span>
        </div>
        <span style="font-size:13px;color:#735c00;font-weight:700;font-family:'Inter',sans-serif;white-space:nowrap;margin-left:12px;">Rp ${item.price.toLocaleString('id-ID')}</span>
      </div>
    `;
        }).join('');

        // Render Box Kemasan (Identik Web Struk)
        const packagingHtml = boxType ? `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px dashed #ede9de;">
        <div style="display:flex;flex-direction:column;">
          <span style="font-size:13px;color:#1a1a1a;font-family:'Inter',sans-serif;font-style:italic;">Kemasan: ${boxType}</span>
          ${boxVariant ? `<span style="font-size:9px;color:#735c00;font-weight:800;text-transform:uppercase;margin-top:2px;letter-spacing:0.5px;font-family:'Inter',sans-serif;">${boxVariant}</span>` : ''}
        </div>
        <span style="font-size:12px;color:#735c00;font-weight:700;font-family:'Inter',sans-serif;white-space:nowrap;margin-left:12px;">Rp ${boxTotal.toLocaleString('id-ID')}</span>
      </div>
    ` : '';

        const notesHtml = order.notes ? `
      <div style="margin-top:18px;background:#faeae1;border:1px dashed #dfbaa8;padding:10px 14px;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#995431;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Catatan Tambahan</div>
        <div style="font-size:12px;font-style:italic;color:#703f28;">"${order.notes}"</div>
      </div>
    ` : '';

        const totalFormatted = total.toLocaleString('id-ID');
        const subtotalFormatted = subtotal.toLocaleString('id-ID');
        const boxFormatted = boxTotal.toLocaleString('id-ID');

        const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${order.invoiceId} - Djandes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: transparent;
    }
    .card {
      background: #ffffff;
      width: 520px;
      padding: 32px 36px 28px;
    }
    /* ── Header ── */
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #ede9de; padding-bottom: 18px; margin-bottom: 18px;
    }
    .brand-name { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 700; color: #735c00; line-height: 1; }
    .brand-sub  { font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; margin-top: 3px; }
    .inv-lbl    { font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; text-align: right; margin-bottom: 3px; }
    .inv-num    { font-family: 'Inter', sans-serif; font-size: 17px; font-weight: 800; color: #1a1a1a; text-align: right; }
    
    /* ── Info Box Layout: Customer Full Width, Pickup di bawah 50/50 ── */
    .info-container { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .info-box-full  { background: #faf8f2; border-radius: 12px; padding: 12px 14px; width: 100%; }
    .info-row       { display: flex; gap: 10px; width: 100%; }
    .info-box-half  { background: #faf8f2; border-radius: 12px; padding: 12px 14px; flex: 1; }
    .info-lbl       { font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .info-val       { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .info-val.sm    { font-size: 13px; }
    
    /* ── Rincian Pesanan ── */
    .sec-lbl    { font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid #ede9de; padding-bottom: 6px; margin-bottom: 4px; }
    
    /* ── Total Rincian ── */
    .totals     { margin-top: 14px; border-top: 1.5px solid #ede9de; padding-top: 12px; }
    .tot-row    { font-family: 'Inter', sans-serif; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .tot-final  { font-family: 'Inter', sans-serif; display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; }
    .tot-label  { font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; }
    .tot-value  { font-size: 24px; font-weight: 800; color: #735c00; }
    
    /* ── Footer Status ── */
    .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1.5px solid #ede9de; }
    .badge      { font-family: 'Inter', sans-serif; padding: 7px 18px; border-radius: 100px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }
    .thank-you  { font-family: 'Inter', sans-serif; text-align: center; margin-top: 20px; font-size: 10px; font-weight: 700; color: #d1d5db; letter-spacing: 3px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-name">Djandes</div>
        <div class="brand-sub">Sweet &amp; Savoury</div>
      </div>
      <div>
        <div class="inv-lbl">No. Invoice</div>
        <div class="inv-num">#${order.invoiceId}</div>
      </div>
    </div>

    <!-- Info Pemesan & Jadwal Pengambilan -->
    <div class="info-container">
      <div class="info-box-full">
        <div class="info-lbl">Informasi Pemesan</div>
        <div class="info-val">${order.name || '-'}</div>
      </div>
      <div class="info-row">
        <div class="info-box-half">
          <div class="info-lbl">Tanggal Ambil</div>
          <div class="info-val sm">${order.datePickup || '-'}</div>
        </div>
        <div class="info-box-half">
          <div class="info-lbl">Jam Ambil</div>
          <div class="info-val sm">${cleanTime}</div>
        </div>
      </div>
    </div>

    <!-- Rincian Pesanan -->
    <div class="sec-lbl">Rincian Pesanan</div>
    ${itemsHtml}
    ${packagingHtml}

    <!-- Rincian Ringkasan Total -->
    <div class="totals">
      <div class="tot-row">
        <span>Subtotal Produk</span>
        <span>Rp ${subtotalFormatted}</span>
      </div>
      ${boxTotal > 0 ? `<div class="tot-row"><span>Biaya Kemasan</span><span>Rp ${boxFormatted}</span></div>` : ''}
      <div class="tot-final">
        <span class="tot-label">Total Akhir</span>
        <span class="tot-value">Rp ${totalFormatted}</span>
      </div>
      ${dpHistoryHtml}
    </div>

    <!-- Status Pembayaran di Kiri Bawah -->
    <div class="footer-row">
      <div class="badge" style="background:${statusBg};color:${statusColor};border:2px solid ${statusBorder};">
        ${statusText}
      </div>
    </div>

    <!-- Catatan Tambahan -->
    ${notesHtml}

    <div class="thank-you">— Terima Kasih —</div>
  </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(html);

    } catch (e) {
        console.error('Receipt HTML Error:', e);
        res.status(500).send(`Error: ${e.message}`);
    }
};
