// api/product-receipt.js
// Menggunakan Satori Object Notation (tanpa JSX) agar kompatibel dengan Node.js serverless Vercel biasa (tanpa Next.js/Babel)
const { ImageResponse } = require('@vercel/og');

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

        // Ambil data invoice dari Google Sheets
        const sheetRes = await fetch(`${gasUrl}?action=getInvoice&invoiceId=${invoiceId}`);
        const sheetJson = await sheetRes.json();

        if (sheetJson.status !== 'success' || !sheetJson.data) {
            return res.status(404).send(`Invoice ${invoiceId} tidak ditemukan di Google Sheet`);
        }

        const order = sheetJson.data;
        const itemsList = order.items ? order.items.split(',').map(x => x.trim()).filter(Boolean) : [];
        const isPaid = order.status && order.status.toLowerCase() === 'lunas';

        // Helper: membuat element tanpa JSX
        const el = (type, props, ...children) => ({
            type,
            props: {
                ...props,
                children: children.length === 1 ? children[0] : children.length > 1 ? children : props.children
            }
        });

        // Row item inline
        const itemRows = itemsList.map(item =>
            el('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px dashed #f3f4f6',
                }
            },
                el('span', { style: { fontSize: '13px', color: '#111827', fontWeight: '600' } }, item)
            )
        );

        if (order.packaging) {
            itemRows.push(
                el('div', {
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px dashed #f3f4f6',
                    }
                },
                    el('span', { style: { fontSize: '12px', color: '#4b5563', fontStyle: 'italic' } }, `Kemasan: ${order.packaging}`)
                )
            );
        }

        // Catatan
        const notesSection = order.notes
            ? el('div', {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: '16px',
                    backgroundColor: '#fffbeb',
                    border: '1px dashed #fde68a',
                    padding: '10px 14px',
                    borderRadius: '8px',
                }
            },
                el('span', { style: { fontSize: '10px', fontWeight: 'bold', color: '#b45309' } }, 'Catatan Tambahan:'),
                el('span', { style: { fontSize: '12px', fontStyle: 'italic', color: '#78350f', marginTop: '2px' } }, `"${order.notes}"`)
            )
            : el('span', { style: { display: 'none' } }, '');

        const imageResponse = new ImageResponse(
            el('div', {
                style: {
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    padding: '36px 40px',
                    fontFamily: 'sans-serif',
                }
            },
                // ── HEADER ──
                el('div', {
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '2px solid #e5e7eb',
                        paddingBottom: '18px',
                    }
                },
                    el('div', { style: { display: 'flex', flexDirection: 'column' } },
                        el('span', { style: { fontSize: '30px', fontWeight: 'bold', color: '#735c00' } }, 'Djandes'),
                        el('span', { style: { fontSize: '9px', fontWeight: 'bold', color: '#9ca3af', letterSpacing: '2px', marginTop: '2px' } }, 'SWEET & SAVOURY')
                    ),
                    el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
                        el('span', { style: { fontSize: '9px', color: '#9ca3af', fontWeight: 'bold' } }, 'NO. INVOICE'),
                        el('span', { style: { fontSize: '18px', fontWeight: 'bold', color: '#111827' } }, `#${order.invoiceId}`),
                    )
                ),

                // ── INFO PEMESAN & JADWAL ──
                el('div', { style: { display: 'flex', marginTop: '18px', gap: '14px' } },
                    el('div', {
                        style: {
                            display: 'flex', flexDirection: 'column', flex: 1,
                            backgroundColor: '#f9fafb', padding: '12px 14px', borderRadius: '10px',
                        }
                    },
                        el('span', { style: { fontSize: '9px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase' } }, 'Nama Pelanggan'),
                        el('span', { style: { fontSize: '15px', fontWeight: 'bold', color: '#111827', marginTop: '4px' } }, order.name || '-')
                    ),
                    el('div', {
                        style: {
                            display: 'flex', flexDirection: 'column', flex: 1,
                            backgroundColor: '#f9fafb', padding: '12px 14px', borderRadius: '10px',
                        }
                    },
                        el('span', { style: { fontSize: '9px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase' } }, 'Jadwal Ambil'),
                        el('span', { style: { fontSize: '13px', fontWeight: 'bold', color: '#111827', marginTop: '4px' } }, `${order.datePickup || '-'} @ ${order.timePickup || '-'}`)
                    )
                ),

                // ── RINCIAN PESANAN ──
                el('div', { style: { display: 'flex', flexDirection: 'column', marginTop: '22px', flex: 1 } },
                    el('span', {
                        style: {
                            fontSize: '10px', fontWeight: 'bold', color: '#6b7280',
                            borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', letterSpacing: '1px',
                        }
                    }, 'RINCIAN PESANAN'),
                    el('div', { style: { display: 'flex', flexDirection: 'column', marginTop: '6px' } }, ...itemRows)
                ),

                // ── FOOTER: STATUS BAYAR + TOTAL ──
                el('div', {
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '20px',
                        borderTop: '2px solid #e5e7eb',
                        paddingTop: '18px',
                    }
                },
                    el('div', {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px 22px',
                            borderRadius: '9999px',
                            fontWeight: 'bold',
                            fontSize: '15px',
                            backgroundColor: isPaid ? '#d1fae5' : '#fee2e2',
                            color: isPaid ? '#065f46' : '#991b1b',
                            border: `2px solid ${isPaid ? '#34d399' : '#f87171'}`,
                        }
                    }, isPaid ? 'LUNAS' : 'BELUM BAYAR'),

                    el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
                        el('span', { style: { fontSize: '10px', fontWeight: 'bold', color: '#9ca3af' } }, 'TOTAL AKHIR'),
                        el('span', { style: { fontSize: '26px', fontWeight: 'bold', color: '#735c00', marginTop: '2px' } },
                            `Rp ${Number(order.total || 0).toLocaleString('id-ID')}`
                        )
                    )
                ),

                // ── CATATAN TAMBAHAN ──
                notesSection
            ),
            { width: 600, height: 620 }
        );

        // Kembalikan sebagai response gambar PNG
        const arrayBuffer = await imageResponse.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).end(Buffer.from(arrayBuffer));

    } catch (e) {
        console.error('Receipt Error:', e);
        res.status(500).send(`Gagal membuat gambar struk: ${e.message}`);
    }
};
