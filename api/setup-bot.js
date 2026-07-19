// api/setup-bot.js
// Kunjungi URL ini sekali setelah deploy untuk mendaftarkan menu perintah Telegram Bot.
// Contoh: https://djandes15.vercel.app/api/setup-bot

module.exports = async function handler(req, res) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(500).send('Missing TELEGRAM_BOT_TOKEN');

    const commands = [
        { command: 'start', description: '🏠 Panduan & daftar perintah bot DJANDES' },
        { command: 'jadwal', description: '📅 Jadwal pesanan hari ini & mendatang' },
        { command: 'laporan', description: '📊 Laporan pendapatan (hari/minggu/bulan/custom)' },
        { command: 'status', description: '📋 Cek detail pesanan  /status DJD-XXXXXX' },
        { command: 'struk', description: '🧾 Cetak struk gambar  /struk DJD-XXXXXX' },
        { command: 'dp', description: '💰 Catat DP  /dp DJD-XXXXXX [nominal]' },
        { command: 'bayar', description: '✅ Tandai LUNAS  /bayar DJD-XXXXXX' },
    ];

    try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands })
        });
        const json = await r.json();

        const html = json.ok
            ? `<h2 style="color:green">✅ Menu Bot Berhasil Dikonfigurasi!</h2>
               <p>Buka Telegram dan ketik <code>/start</code> ke bot Anda untuk melihat menu.</p>
               <pre>${JSON.stringify(commands, null, 2)}</pre>`
            : `<h2 style="color:red">❌ Gagal</h2><pre>${JSON.stringify(json, null, 2)}</pre>`;

        res.setHeader('Content-Type', 'text/html');
        res.status(json.ok ? 200 : 500).send(html);
    } catch (e) {
        res.status(500).send(`Error: ${e.message}`);
    }
};
