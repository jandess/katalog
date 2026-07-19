// api/product-receipt.js
// Endpoint HTML murni — tidak butuh library apapun.
// Mengembalikan halaman HTML invoice yang di-screenshot oleh microlink.io lalu dikirim ke Telegram.

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
            return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#991b1b;">
          <h2>Invoice ${invoiceId} tidak ditemukan</h2>
          <p>Pastikan nomor invoice benar dan sudah tercatat di Google Sheets.</p>
        </body></html>
      `);
        }

        const order = sheetJson.data;
        const isPaid = order.status && order.status.toLowerCase() === 'lunas';
        const itemsList = order.items
            ? order.items.split(',').map(x => x.trim()).filter(Boolean)
            : [];

        const statusColor = isPaid ? '#065f46' : '#991b1b';
        const statusBg = isPaid ? '#d1fae5' : '#fee2e2';
        const statusBorder = isPaid ? '#34d399' : '#f87171';
        const statusText = isPaid ? 'LUNAS' : 'BELUM BAYAR';

        const itemsHtml = itemsList.map(item => `
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dashed #f0f0f0;">
        <span style="font-size:13px;color:#111827;font-weight:600;">${item}</span>
      </div>
    `).join('');

        const packagingHtml = order.packaging ? `
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px dashed #f0f0f0;">
        <span style="font-size:12px;color:#4b5563;font-style:italic;">Kemasan: ${order.packaging}</span>
      </div>
    ` : '';

        const notesHtml = order.notes ? `
      <div style="margin-top:18px;background:#fffbeb;border:1px dashed #fde68a;padding:10px 14px;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#b45309;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Catatan Tambahan</div>
        <div style="font-size:12px;font-style:italic;color:#78350f;">"${order.notes}"</div>
      </div>
    ` : '';

        const totalFormatted = Number(order.total || 0).toLocaleString('id-ID');

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
      background: #f8f5f0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      min-height: 100vh;
      padding: 32px 16px;
    }
    .card {
      background: #ffffff;
      width: 520px;
      border-radius: 20px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.10);
      overflow: hidden;
    }
    .header {
      padding: 28px 32px 22px;
      border-bottom: 2px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-name  { font-size: 28px; font-weight: 800; color: #735c00; line-height: 1; }
    .brand-sub   { font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 3px; }
    .invoice-id  { font-size: 16px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
    .invoice-lbl { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; text-align: right; margin-bottom: 2px; }
    .info-row    { display: flex; gap: 12px; padding: 18px 32px 0; }
    .info-box {
      flex: 1;
      background: #f9fafb;
      border-radius: 10px;
      padding: 12px 14px;
    }
    .info-label  { font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .info-value  { font-size: 14px; font-weight: 700; color: #111827; }
    .info-value.sm { font-size: 12px; }
    .items-section { padding: 18px 32px 0; }
    .items-label {
      font-size: 9px; font-weight: 700; color: #6b7280;
      letter-spacing: 1.5px; text-transform: uppercase;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 4px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 32px;
      border-top: 1.5px solid #f3f4f6;
      margin-top: 18px;
    }
    .status-badge {
      padding: 8px 20px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .total-label { font-size: 9px; font-weight: 700; color: #9ca3af; text-align: right; text-transform: uppercase; letter-spacing: 1px; }
    .total-value { font-size: 26px; font-weight: 800; color: #735c00; text-align: right; }
    .notes-wrap  { padding: 0 32px 24px; }
    .thank-you   { text-align: center; padding: 14px 32px 24px; font-size: 10px; font-weight: 700; color: #d1d5db; letter-spacing: 3px; text-transform: uppercase; }
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
        <div class="invoice-lbl">No. Invoice</div>
        <div class="invoice-id">#${order.invoiceId}</div>
      </div>
    </div>

    <!-- Info Baris -->
    <div class="info-row">
      <div class="info-box">
        <div class="info-label">Nama Pelanggan</div>
        <div class="info-value">${order.name || '-'}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Jadwal Ambil</div>
        <div class="info-value sm">${order.datePickup || '-'}<br>${order.timePickup || '-'}</div>
      </div>
    </div>

    <!-- Rincian Pesanan -->
    <div class="items-section">
      <div class="items-label">Rincian Pesanan</div>
      ${itemsHtml}
      ${packagingHtml}
    </div>

    <!-- Footer: Status + Total -->
    <div class="footer">
      <div class="status-badge" style="background:${statusBg};color:${statusColor};border:2px solid ${statusBorder};">
        ${statusText}
      </div>
      <div>
        <div class="total-label">Total Akhir</div>
        <div class="total-value">Rp ${totalFormatted}</div>
      </div>
    </div>

    <!-- Catatan -->
    <div class="notes-wrap">${notesHtml}</div>

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
