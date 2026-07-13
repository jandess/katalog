let bluetoothDevice = null;
let bluetoothCharacteristic = null;

async function handleUnifiedPrint() {
    const btn = document.getElementById('main-print-btn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Mencetak...`;
    
    // Cek apakah browser mendukung Bluetooth
    if ("bluetooth" in navigator) {
        try {
            await printToThermal();
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            return;
        } catch (err) {
            console.warn("Bluetooth Print failed, falling back to System Print", err);
            // Jika gagal, fallback ke print sistem
        }
    }
    
    // Fallback ke print sistem
    showToast("Membuka Print Sistem...");
    // Tunggu sebentar agar toast muncul
    setTimeout(() => {
        window.print();
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }, 500);
}

async function printToThermal() {
    showToast("Menghubungkan Printer...");
    
    try {
        // Request device jika belum terhubung
        if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
            bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
                    { namePrefix: 'InnerPrinter' },
                    { namePrefix: 'RPP' },
                    { namePrefix: 'MPT' },
                    { namePrefix: 'Bluetooth' },
                    { namePrefix: '58mm' },
                    { namePrefix: 'POS' }
                ],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            });
            
            const server = await bluetoothDevice.gatt.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            const characteristics = await service.getCharacteristics();
            
            // Cari karakteristik yang support write
            bluetoothCharacteristic = characteristics.find(c =>
                c.properties.write || c.properties.writeWithoutResponse
            );
            
            if (!bluetoothCharacteristic) {
                throw new Error("Karakteristik write tidak ditemukan");
            }
        }
        
        showToast("Mencetak Pesanan...");
        
        // ESC/POS Command Setup
        const encoder = new TextEncoder();
        const commands = [];
        
        // Reset printer
        commands.push(new Uint8Array([0x1B, 0x40]));
        
        // --- Header DJANDES ---
        // Align Center
        commands.push(new Uint8Array([0x1B, 0x61, 0x01]));
        // Bold + Double height
        commands.push(new Uint8Array([0x1B, 0x21, 0x20 | 0x08]));
        commands.push(encoder.encode("DJANDES\n"));
        // Normal Text
        commands.push(new Uint8Array([0x1B, 0x21, 0x00]));
        commands.push(encoder.encode("Sweet & Savoury\n"));
        commands.push(encoder.encode("--------------------------------\n"));
        
        // --- Invoice Info ---
        // Align Left
        commands.push(new Uint8Array([0x1B, 0x61, 0x00]));
        commands.push(encoder.encode(`No. Invoice : #${checkoutData.invoiceId}\n`));
        commands.push(encoder.encode(`Tgl Transaksi: ${checkoutData.dateCreated}\n`));
        commands.push(encoder.encode("--------------------------------\n"));
        
        // --- Customer Info ---
        const waNumber = profileData.whatsapp || '6281234567890';
        commands.push(encoder.encode(`Pelanggan   : ${checkoutData.name}\n`));
        commands.push(encoder.encode(`WhatsApp    : ${waNumber}\n`));
        commands.push(encoder.encode(`Tgl Ambil   : ${checkoutData.date_pickup}\n`));
        commands.push(encoder.encode(`Jam Ambil   : ${checkoutData.time_pickup}\n`));
        commands.push(encoder.encode("--------------------------------\n"));
        
        // --- Order Details (Optimized for 32 chars) ---
        cart.forEach(item => {
            const itemTotal = item.price * item.qty;
            // Nama produk max 32 karakter
            const name = item.name.length > 32 ? item.name.substring(0, 30) + '..' : item.name;
            commands.push(encoder.encode(name + "\n"));
            const subItemLine = (item.qty + " x " + item.price.toLocaleString('id-ID')).padEnd(16) + itemTotal.toLocaleString('id-ID').padStart(16);
            commands.push(encoder.encode(subItemLine + "\n"));
        });
        
        // Package Info
        const pkgName = checkoutData.box;
        const pkgLine = "Kemasan: " + pkgName + " - " + checkoutData.variant;
        commands.push(encoder.encode(pkgLine.substring(0, 32) + "\n"));
        const boxPriceLine = ("Total Kemasan").padEnd(16) + checkoutData.boxTotal.toLocaleString('id-ID').padStart(16);
        commands.push(encoder.encode(boxPriceLine + "\n"));
        
        commands.push(encoder.encode("--------------------------------\n"));
        
        // --- Total Section ---
        // Align Right
        commands.push(new Uint8Array([0x1B, 0x61, 0x02]));
        const subtotalVal = cart.reduce((a, b) => a + (b.price * b.qty), 0);
        commands.push(encoder.encode(`Subtotal: Rp ${subtotalVal.toLocaleString('id-ID')}\n`));
        // Bold Total
        commands.push(new Uint8Array([0x1B, 0x21, 0x08]));
        commands.push(encoder.encode(`TOTAL: Rp ${checkoutData.total.toLocaleString('id-ID')}\n`));
        commands.push(new Uint8Array([0x1B, 0x21, 0x00]));
        
        // --- Footer ---
        // Align Center
        commands.push(new Uint8Array([0x1B, 0x61, 0x01]));
        commands.push(encoder.encode("\nTERIMA KASIH\n"));
        commands.push(encoder.encode("www.djandes.com\n\n\n"));
        
        // Feed 3 lines
        commands.push(new Uint8Array([0x1B, 0x64, 0x03]));
        // Cut paper (optional, some printers need this)
        commands.push(new Uint8Array([0x1D, 0x56, 0x00]));
        
        // Send all chunks with delay between commands
        for (const cmd of commands) {
            await sendToPrinter(cmd);
        }
        
        showToast("Cetak Selesai!");
    } catch (err) {
        console.error("Bluetooth print error:", err);
        throw new Error("Gagal mencetak via Bluetooth: " + err.message);
    }
}

async function sendToPrinter(data) {
    if (!bluetoothCharacteristic) {
        throw new Error("Printer belum terhubung");
    }
    
    try {
        if (bluetoothCharacteristic.properties.writeWithoutResponse) {
            await bluetoothCharacteristic.writeValueWithoutResponse(data);
        } else {
            await bluetoothCharacteristic.writeValue(data);
        }
        // Beri jeda 50ms antar command untuk memastikan printer memproses
        await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
        console.error("Send error:", err);
        throw err;
    }
}
