// api/product/[slug].js

module.exports = async function handler(req, res) {
  const { slug } = req.query;

  // Fetch data.json dynamically from the same host to avoid packaging/bundling issues in Vercel
  let data;
  try {
    const host = req.headers.host || 'djandes15.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const dataUrl = `${protocol}://${host}/data.json`;
    const response = await fetch(dataUrl);
    data = await response.json();
  } catch (error) {
    console.error('Error fetching data.json:', error);
    return res.status(500).send('Error loading product data');
  }

  // Cari produk berdasarkan slug
  const product = data.products && data.products.find(p => slugify(p.name) === slug);

  if (!product) {
    return res.status(404).send('Product not found');
  }

  // Ambil gambar pertama
  const mainImage = product.images && product.images.length > 0
    ? product.images[0]
    : (product.img || 'https://djandes15.vercel.app/img/djandes.png');

  // Meta tags lengkap
  const title = `DJANDES - ${product.name}`;
  const description = product.desc || 'Kudapan premium dari Djandes Sweet & Savoury';
  const url = `https://djandes15.vercel.app/product/${slug}`;
  const image = mainImage.startsWith('http') ? mainImage : `https://djandes15.vercel.app${mainImage}`;

  // Kirim HTML dengan meta tags
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
      <!-- Open Graph / Facebook / WhatsApp -->
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="DJANDES - Sweet & Savoury">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${image}">
      <meta property="og:url" content="${url}">
      
      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${description}">
      <meta name="twitter:image" content="${image}">
      
      <title>${title}</title>
      
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        img { max-width: 300px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <h1>${product.name}</h1>
      <p>${description}</p>
      <img src="${image}" alt="${product.name}" width="300" height="300" style="object-fit:cover">
      <p><a href="/#/product/${slug}">Lihat detail produk →</a></p>
      
      <!-- Redirect otomatis ke halaman utama dengan hash -->
      <script>
        setTimeout(() => {
          window.location.href = '/#/product/${slug}';
        }, 100);
      </script>
    </body>
    </html>
  `);
}

// Fungsi slugify
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}
