// Gunakan require (CommonJS) karena Vercel membutuhkan ini secara default
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  
  // 1. Baca file data.json
  let products = [];
  try {
    const filePath = path.join(process.cwd(), 'data.json');
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileData);
      products = data.products || [];
    }
  } catch (error) {
    console.error('Error membaca data.json:', error);
  }

  // Fungsi Slugify
  function slugify(text) {
    return text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }
  
  // Cari produk berdasarkan slug
  const product = products.find(p => slugify(p.name) === slug);
  
  if (!product) {
    // Jika produk tidak ditemukan, redirect ke home
    return res.redirect(302, '/');
  }
  
  // OG Meta Tags (Social Media Preview)
  const title = `DJANDES - ${product.name}`;
  const description = product.desc || 'Kudapan premium dari Djandes Sweet & Savoury';
  const image = product.images && product.images.length > 0 ? product.images[0] : (product.img || 'https://djandes15.vercel.app/img/djandes.png');
  const url = `https://djandes15.vercel.app/product/${slug}`;

  // HTML untuk Crawler (WhatsApp/Facebook)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:url" content="${url}" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta http-equiv="refresh" content="0; url=${url}" />
      </head>
      <body>
        <p>Redirecting to <a href="${url}">${url}</a></p>
      </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
};
