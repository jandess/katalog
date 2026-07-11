export default async function handler(req, res) {
  const { slug } = req.query;
  
  // Fetch data produk dari data.json
  let products = [];
  try {
    // Coba fetch dari CDN (jsdelivr) untuk data terbaru
    const response = await fetch('https://cdn.jsdelivr.net/gh/jandess/katalog@main/data.json');
    if (response.ok) {
      const data = await response.json();
      products = data.products || [];
    } else {
      // Fallback ke data.json lokal (hanya untuk development)
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'data.json');
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileData);
        products = data.products || [];
      }
    }
  } catch (error) {
    console.error('Error fetching products:', error);
  }
  
  // Slugify function
  function slugify(text) {
    return text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }
  
  const product = products.find(p => slugify(p.name) === slug);
  
  if (!product) {
    // Jika produk tidak ditemukan, redirect ke home
    return res.redirect(302, '/');
  }
  
  // Buat HTML dengan OG meta tag yang sudah diisi
  const title = `DJANDES - ${product.name}`;
  const description = product.desc || 'Kudapan premium dari Djandes Sweet & Savoury';
  const image = product.images && product.images.length > 0 ? product.images[0] : (product.img || 'https://djandes15.vercel.app/img/djandes.png');
  const url = `https://djandes15.vercel.app/product/${slug}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        
        <!-- Open Graph Meta Tags -->
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="DJANDES - Sweet & Savoury">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${image}">
        <meta property="og:url" content="${url}">
        
        <!-- Twitter Card Meta Tags -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${title}">
        <meta name="twitter:description" content="${description}">
        <meta name="twitter:image" content="${image}">
        
        <!-- Redirect ke halaman utama setelah crawler selesai -->
        <meta http-equiv="refresh" content="0; url=${url}">
        
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; background: #fffae5; }
          .container { max-width: 600px; margin: 0 auto; }
          img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          h1 { color: #735c00; }
          p { color: #4E453D; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${product.name}</h1>
          <p>${description}</p>
          <img src="${image}" alt="${product.name}">
          <p><a href="${url}">Lihat Produk di Djandes</a></p>
          <p style="font-size: 12px; color: #999;">Redirecting...</p>
        </div>
      </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 hari
  res.send(html);
}
