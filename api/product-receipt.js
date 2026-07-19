// api/product-receipt.js
// Endpoint HTML murni — tidak butuh library apapun.
// Body tanpa margin/padding agar microlink `element=.card` hanya meng-capture area kartu.

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

        // Parse items: format "Nama Item (Nx)|harga,Nama Item2 (Nx)|harga"
        const itemsList = order.items
            ? order.items.split(',').map(x => {
                const [name, price] = x.trim().split('|');
                return { name: (name || '').trim(), price: parseInt(price, 10) || 0 };
            }).filter(i => i.name)
            : [];

        const subtotal = Number(order.subtotal) || itemsList.reduce((s, i) => s + i.price, 0);
        const boxTotal = Number(order.boxTotal) || 0;
        const total = Number(order.total) || subtotal + boxTotal;

        const statusColor = isPaid ? '#065f46' : '#991b1b';
        const statusBg = isPaid ? '#d1fae5' : '#fee2e2';
        const statusBorder = isPaid ? '#34d399' : '#f87171';
        const statusText = isPaid ? 'LUNAS' : 'BELUM BAYAR';

        // Render baris item + harga
        const itemsHtml = itemsList.map(item => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed #ede9de;">
        <span style="font-size:13px;color:#1a1a1a;font-weight:600;">${item.name}</span>
        <span style="font-size:13px;color:#735c00;font-weight:700;white-space:nowrap;margin-left:12px;">Rp ${item.price.toLocaleString('id-ID')}</span>
      </div>
    `).join('');

        const packagingHtml = order.packaging ? `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px dashed #ede9de;">
        <span style="font-size:12px;color:#6b5c3e;font-style:italic;">Kemasan ${order.packaging}</span>
        <span style="font-size:12px;color:#6b5c3e;font-weight:600;white-space:nowrap;margin-left:12px;">Rp ${boxTotal.toLocaleString('id-ID')}</span>
      </div>
    ` : '';

        const notesHtml = order.notes ? `
      <div style="margin-top:16px;background:#fffff5;border:1px dashed #c9b96a;padding:10px 14px;border-radius:8px;">
        <div style="font-size:9px;font-weight:700;color:#8b6914;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Catatan Tambahan</div>
        <div style="font-size:12px;font-style:italic;color:#5c4a1e;">"${order.notes}"</div>
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      /* Tidak ada background/padding agar microlink element=.card hanya tangkap kartu */
      background: transparent;
    }
    .card {
      background: #ffffff;
      width: 520px;
      padding: 32px 36px 28px;
      border-radius: 0;  /* tanpa rounded, karena ini seluruh snapshot */
    }
    /* ── Header ── */
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #ede9de; padding-bottom: 18px; margin-bottom: 18px;
    }
    .brand-name { font-size: 30px; font-weight: 800; color: #735c00; line-height: 1; }
    .brand-sub  { font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 3px; text-transform: uppercase; margin-top: 3px; }
    .inv-lbl    { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; text-align: right; margin-bottom: 3px; }
    .inv-num    { font-size: 17px; font-weight: 800; color: #1a1a1a; text-align: right; }
    .inv-date   { font-size: 9px; color: #9ca3af; font-weight: 500; text-align: right; margin-top: 2px; }
    /* ── Info boxes ── */
    .info-row   { display: flex; gap: 12px; margin-bottom: 20px; }
    .info-box   { flex: 1; background: #faf8f2; border-radius: 10px; padding: 12px 14px; }
    .info-lbl   { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .info-val   { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .info-val.sm { font-size: 12px; }
    /* ── Items ── */
    .sec-lbl    { font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid #ede9de; padding-bottom: 6px; margin-bottom: 4px; }
    /* ── Totals ── */
    .totals     { margin-top: 14px; border-top: 1.5px solid #ede9de; padding-top: 12px; }
    .tot-row    { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .tot-final  { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; }
    .tot-label  { font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; }
    .tot-value  { font-size: 24px; font-weight: 800; color: #735c00; }
    /* ── Footer ── */
    .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1.5px solid #ede9de; }
    .badge      { padding: 7px 18px; border-radius: 100px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; }
    .thank-you  { text-align: center; margin-top: 20px; font-size: 10px; font-weight: 700; color: #d1d5db; letter-spacing: 3px; text-transform: uppercase; }
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

    <!-- Info -->
    <div class="info-row">
      <div class="info-box">
        <div class="info-lbl">Informasi Pemesan</div>
        <div class="info-val">${order.name || '-'}</div>
      </div>
      <div class="info-box" style="flex:0.9;">
        <div class="info-lbl">Tanggal Ambil</div>
        <div class="info-val sm">${order.datePickup || '-'}</div>
      </div>
      <div class="info-box" style="flex:0.5;">
        <div class="info-lbl">Jam Ambil</div>
        <div class="info-val sm">${order.timePickup || '-'}</div>
      </div>
    </div>

    <!-- Rincian Pesanan -->
    <div class="sec-lbl">Rincian Pesanan</div>
    ${itemsHtml}
    ${packagingHtml}

    <!-- Totals -->
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
    </div>

    <!-- Status Badge -->
    <div class="footer-row">
      <div class="badge" style="background:${statusBg};color:${statusColor};border:2px solid ${statusBorder};">
        ${statusText}
      </div>
    </div>

    <!-- Catatan -->
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
