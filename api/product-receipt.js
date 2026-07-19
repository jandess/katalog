// api/product-receipt.js
import { ImageResponse } from '@vercel/og';

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const invoiceId = searchParams.get('invoiceId');
        if (!invoiceId) {
            return new Response('invoiceId required', { status: 400 });
        }

        // URL Google Apps Script Web App (diambil dari Environment Variable)
        const gasUrl = process.env.GOOGLE_SCRIPT_URL;
        if (!gasUrl) {
            return new Response('GOOGLE_SCRIPT_URL env var not configured', { status: 500 });
        }

        // Ambil data invoice dari Google Sheets lewat Web App Google Apps Script
        const sheetRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
        const sheetJson = await sheetRes.json();

        if (sheetJson.status !== 'success' || !sheetJson.data) {
            return new Response('Invoice tidak ditemukan di Google Sheet', { status: 404 });
        }

        const order = sheetJson.data;

        // Pisahkan daftar kue yang tadinya digabung pakai koma
        const itemsList = order.items ? order.items.split(',').map(x => x.trim()) : [];
        const isPaid = order.status && order.status.toLowerCase() === 'lunas';

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: '#ffffff',
                        padding: '40px',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eaeaea', paddingBottom: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#735c00' }}>Djandes</span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#6b7280', letterSpacing: '2px', marginTop: '2px' }}>SWEET & SAVOURY</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 'bold' }}>NO. INVOICE</span>
                            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>#{order.invoiceId}</span>
                        </div>
                    </div>

                    {/* Info Pemesan */}
                    <div style={{ display: 'flex', marginTop: '20px', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#f9fafb', padding: '15px', borderRadius: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase' }}>Nama Pelanggan</span>
                            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', marginTop: '4px' }}>{order.name}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#f9fafb', padding: '15px', borderRadius: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase' }}>Pengambilan</span>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827', marginTop: '4px' }}>{order.datePickup} @ {order.timePickup || '-'}</span>
                        </div>
                    </div>

                    {/* Tabel Detail Pesanan */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: '25px', flex: 1 }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280', borderBottom: '1px solid #eaeaea', paddingBottom: '8px', letterSpacing: '1px' }}>RINCIAN PESANAN</span>
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
                            {itemsList.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed #f3f4f6' }}>
                                    <span style={{ fontSize: '14px', color: '#111827', fontWeight: '600' }}>{item}</span>
                                </div>
                            ))}
                            {order.packaging && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed #f3f4f6' }}>
                                    <span style={{ fontSize: '13px', color: '#4b5563', fontStyle: 'italic' }}>Kemasan: {order.packaging}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer & Total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '2px solid #eaeaea', paddingTop: '20px' }}>
                        {/* Status Bayar Badge */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '10px 24px',
                                borderRadius: '9999px',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                backgroundColor: isPaid ? '#d1fae5' : '#fee2e2',
                                color: isPaid ? '#065f46' : '#991b1b',
                                border: `2px solid ${isPaid ? '#34d399' : '#f87171'}`,
                            }}
                        >
                            {isPaid ? 'LUNAS' : 'BELUM BAYAR'}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af' }}>TOTAL AKHIR</span>
                            <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#735c00', marginTop: '2px' }}>
                                Rp {Number(order.total).toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>

                    {/* Catatan Tambahan */}
                    {order.notes && (
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '20px', backgroundColor: '#fffbeb', border: '1px dashed #fef3c7', padding: '12px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#b45309' }}>Catatan Tambahan:</span>
                            <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#78350f', marginTop: '2px' }}>"{order.notes}"</span>
                        </div>
                    )}
                </div>
            ),
            {
                width: 600,
                height: 600,
            }
        );
    } catch (e) {
        console.error(e);
        return new Response('Internal Server Error', { status: 500 });
    }
}
