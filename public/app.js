// Global variables
let products = [];
let categories = [];
let packagingTypes = [];
let packagingVariants = [];
let profileData = {};
let cart = JSON.parse(localStorage.getItem('djandes_cart')) || [];
let favorites = JSON.parse(localStorage.getItem('djandes_favs')) || [];
let history = JSON.parse(localStorage.getItem('djandes_history')) || [];
let currentCategory = 'All';
let detailQty = 1;
let checkoutData = JSON.parse(localStorage.getItem('djandes_checkout')) || {};
let currentDetailSlug = null;
let selectedBox = 'Standard';
let selectedVariant = '';
let boxVariants = {};
let navigationStack = [];
let isFromHistory = false;

let dataLoaded = false;

// Load data from JSON
async function loadData() {
  try {
    const response = await fetch('/data.json');
    const data = await response.json();
    products = data.products || [];
    categories = data.categories || [];
    packagingTypes = data.packagingTypes || [];
    packagingVariants = data.packagingVariants || [];
    profileData = data.profile || {};
    buildBoxVariants();
    preloadAllImages();

    dataLoaded = true;
    initApp();
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Gagal memuat data. Pastikan data.json tersedia.');
  }
}

function preloadAllImages() {
  // Preload product images (main and slideshow)
  products.forEach(p => {
    if (p.img) {
      const img = new Image();
      img.src = p.img;
    }
    if (p.images && Array.isArray(p.images)) {
      p.images.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  });

  // Preload packaging images (main and slideshow)
  packagingVariants.forEach(v => {
    if (v.img) {
      const img = new Image();
      img.src = v.img;
    }
    if (v.images && Array.isArray(v.images)) {
      v.images.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  });
}

function buildBoxVariants() {
  boxVariants = {};
  packagingTypes.forEach(type => {
    const variants = packagingVariants
      .filter(v => v.id_tipe === type.id_tipe)
      .map(v => ({
        name: v.name,
        img: v.img,
        desc: v.desc,
        features: v.features || [],
        id_varian: v.id_varian,
        images: v.images || [v.img]
      }));
    boxVariants[type.id_tipe] = variants;
  });

  if (packagingTypes.length > 0) {
    const savedBox = localStorage.getItem('djandes_selected_box');
    const savedVariant = localStorage.getItem('djandes_selected_variant');

    if (savedBox && boxVariants[savedBox]) {
      selectedBox = savedBox;
    } else {
      selectedBox = packagingTypes[0].id_tipe;
    }

    const variants = boxVariants[selectedBox] || [];
    if (variants.length > 0) {
      if (savedVariant && variants.some(v => v.name === savedVariant)) {
        selectedVariant = savedVariant;
      } else {
        selectedVariant = variants[0].name;
      }
    }
  }
}

function initApp() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('collection-date');
  if (dateInput) dateInput.setAttribute('min', today);
  renderCategories();
  updateCartUI();
  filterProducts();
  renderPackagingTypes();
  renderProfile();
  handleRouting();
  renderFavorites();
  if (checkoutData && checkoutData.invoiceId) {
    if (window.location.hash === '#invoice') {
      renderInvoice();
    }
  }
}

// --- HELPERS ---
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}
function saveCart() {
  localStorage.setItem('djandes_cart', JSON.stringify(cart));
}
function saveFavorites() {
  localStorage.setItem('djandes_favs', JSON.stringify(favorites));
}
function saveHistory() {
  localStorage.setItem('djandes_history', JSON.stringify(history));
}
function saveCheckout() {
  localStorage.setItem('djandes_checkout', JSON.stringify(checkoutData));
}
function isInCart(id) {
  return cart.some(item => item.id === id);
}

// --- TOAST NOTIFICATION ---
function showToast(msg) {
  const toast = document.getElementById('toast');
  const messageEl = document.getElementById('toast-message');
  messageEl.textContent = msg;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// --- NAVIGATION ---
function navigateTo(pageId, pushHistory = true) {
  if (pushHistory && pageId !== 'home') {
    navigationStack.push(pageId);
  }
  window.location.hash = pageId;
}
function goBack() {
  // Prioritas 1: Tutup image viewer jika sedang aktif
  const viewer = document.getElementById('image-viewer');
  if (viewer && viewer.classList.contains('active')) {
    closeImageViewer();
    return;
  }
  if (navigationStack.length > 0) {
    const previous = navigationStack.pop();
    window.location.hash = previous;
  } else {
    window.location.hash = 'home';
  }
}
function handleRouting() {
  if (!dataLoaded) {
    setTimeout(handleRouting, 100);
    return;
  }
  const hash = window.location.hash || '#home';
  if (hash === '#box-detail') {
    updateView('box-detail');
    return;
  }
  if (hash.startsWith('#/product/')) {
    const slug = hash.replace('#/product/', '');
    const product = products.find(p => slugify(p.name) === slug);
    if (product) {
      renderDetailByProduct(product);
      updateView('detail');
    } else {
      navigateTo('home', false);
    }
  } else {
    resetMetaTags();
    if (hash === '#home' || hash === '#') {
      navigationStack = [];
      updateView('home');
    } else {
      const pageId = hash.replace('#', '');
      updateView(pageId);
    }
  }
}
window.addEventListener('hashchange', handleRouting);

function updateView(pageId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`page-${pageId}`);
  if (target) {
    target.classList.add('active');
    document.body.style.overflow = 'auto';
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('bg-secondary-container', 'text-on-secondary-container');
    item.classList.add('text-on-surface-variant');
  });
  const activeNavId = (['checkout', 'invoice', 'box-detail'].includes(pageId)) ? 'nav-cart' : (pageId === 'detail' ? 'nav-home' : `nav-${pageId}`);
  const activeNav = document.getElementById(activeNavId);
  if (activeNav) {
    activeNav.classList.add('bg-secondary-container', 'text-on-secondary-container');
    activeNav.classList.remove('text-on-surface-variant');
  }
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('text-secondary', 'font-bold');
    link.classList.add('text-on-surface-variant', 'font-medium');
    if (link.innerText.toLowerCase().includes(pageId) || (pageId === 'home' && link.innerText.toLowerCase().includes('beranda'))) {
      link.classList.add('text-secondary', 'font-bold');
      link.classList.remove('text-on-surface-variant', 'font-medium');
    }
  });
  const headerTitle = document.getElementById('header-title');
  const backBtn = document.getElementById('header-back-btn');
  const fab = document.getElementById('home-fab');
  fab.classList.add('hidden');
  backBtn.classList.add('hidden');
  if (pageId === 'home') {
    headerTitle.innerText = '';
    fab.classList.remove('hidden');
  } else if (pageId === 'detail') {
    headerTitle.innerText = 'Detail Produk';
    backBtn.classList.remove('hidden');
  } else if (pageId === 'cart') {
    headerTitle.innerText = 'Pesanan';
    backBtn.classList.add('hidden');
    renderCart();
    renderHistory();
  } else if (pageId === 'box-detail') {
    headerTitle.innerText = 'Detail Kemasan';
    backBtn.classList.remove('hidden');
    showBoxDetail(true);
  } else if (pageId === 'checkout') {
    headerTitle.innerText = 'Checkout Form';
    backBtn.classList.remove('hidden');
  } else if (pageId === 'profile') {
    headerTitle.innerText = 'Profile Info';
    renderProfile();
  } else if (pageId === 'favs') {
    headerTitle.innerText = 'Favorit';
    renderFavorites();
  } else if (pageId === 'invoice') {
    headerTitle.innerText = 'Ringkasan Invoice';
    backBtn.classList.remove('hidden');
  }
}

// --- PROFILE ---
function renderProfile() {
  const p = profileData || {};
  const desc = document.getElementById('profile-description');
  if (desc) desc.textContent = p.description || 'Tentang Djandes...';

  const address = document.getElementById('profile-address');
  if (address) {
    if (p.address) {
      address.textContent = p.address;
      address.closest('.flex')?.classList.remove('hidden');
    } else {
      address.closest('.flex')?.classList.add('hidden');
    }
  }

  const wa = document.getElementById('profile-whatsapp');
  if (wa) {
    const waNum = p.whatsapp || '';
    if (waNum) {
      wa.textContent = waNum.startsWith('62') ? `+${waNum}` : `+62 ${waNum}`;
      wa.closest('.flex')?.classList.remove('hidden');
    } else {
      wa.closest('.flex')?.classList.add('hidden');
    }
  }

  const ig = document.getElementById('profile-instagram');
  if (ig) {
    const igUsername = p.instagram || '';
    if (igUsername) {
      ig.textContent = igUsername;
      ig.href = `https://instagram.com/${igUsername.replace('@', '')}`;
      ig.closest('.flex')?.classList.remove('hidden');
    } else {
      ig.closest('.flex')?.classList.add('hidden');
    }
  }

  const tt = document.getElementById('profile-tiktok');
  if (tt) {
    const ttUsername = p.tiktok || '';
    if (ttUsername) {
      tt.textContent = ttUsername.startsWith('@') ? ttUsername : `@${ttUsername}`;
      tt.href = `https://tiktok.com/@${ttUsername.replace('@', '')}`;
      tt.closest('.flex')?.classList.remove('hidden');
    } else {
      tt.closest('.flex')?.classList.add('hidden');
    }
  }

  const fb = document.getElementById('profile-facebook');
  if (fb) {
    const fbUsername = p.facebook || '';
    if (fbUsername) {
      fb.textContent = fbUsername;
      fb.href = `https://facebook.com/${fbUsername}`;
      fb.closest('.flex')?.classList.remove('hidden');
    } else {
      fb.closest('.flex')?.classList.add('hidden');
    }
  }

  const maps = document.getElementById('profile-maps');
  if (maps) {
    if (p.maps_embed) {
      maps.src = p.maps_embed;
      maps.closest('.glass-card')?.classList.remove('hidden');
    } else {
      maps.closest('.glass-card')?.classList.add('hidden');
    }
  }

  const waButtons = document.querySelectorAll('#profile-wa-btn, #home-fab');
  waButtons.forEach(btn => {
    let waNum = p.whatsapp || '6281234567890';
    if (!waNum.startsWith('62')) waNum = '62' + waNum;
    btn.href = `https://wa.me/${waNum}`;
  });

  const logoImg = document.getElementById('header-logo');
  if (logoImg && p.logo) {
    logoImg.src = p.logo;
    logoImg.classList.remove('hidden');
  }
}

// --- CATEGORIES ---
function renderCategories() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'category-chip flex-none px-6 py-2 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md shadow-sm whitespace-nowrap';
  allBtn.onclick = () => setCategory('All', allBtn);
  allBtn.innerText = 'Semua';
  container.appendChild(allBtn);
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-chip flex-none px-6 py-2 rounded-full bg-white border border-cream-subtle text-on-surface-variant font-label-md text-label-md whitespace-nowrap';
    btn.onclick = () => setCategory(cat.name, btn);
    btn.innerText = cat.name;
    container.appendChild(btn);
  });
}
function setCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.category-chip').forEach(c => {
    c.classList.remove('bg-secondary-container', 'text-on-secondary-container', 'shadow-sm');
    c.classList.add('bg-white', 'border', 'border-cream-subtle', 'text-on-surface-variant');
  });
  btn.classList.add('bg-secondary-container', 'text-on-secondary-container', 'shadow-sm');
  btn.classList.remove('bg-white', 'border', 'border-cream-subtle', 'text-on-surface-variant');
  filterProducts();
}

// --- PRODUCTS ---
function filterProducts() {
  const query = (document.getElementById('product-search')?.value || '').toLowerCase();
  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(query);
    const matchesCat = currentCategory === 'All' || p.cat === currentCategory;
    return matchesSearch && matchesCat;
  });
  renderProducts(filtered);
}
function getProductBadge(product) {
  // 🔥 Tambahan: Jika stok habis, badge berubah
  if (product.isOutOfStock) {
    return { text: 'Habis', class: 'bg-gray-600 text-white' };
  } else if (product.bestseller) {
    return { text: 'Best Seller', class: 'bg-secondary-container text-on-secondary-container' };
  } else if (product.isNew) {
    return { text: 'New', class: 'bg-error text-on-error' };
  } else if (product.isPromo) {
    return { text: 'Promo', class: 'bg-primary text-on-primary' };
  } else {
    return { text: product.cat || 'Premium', class: 'bg-surface-variant text-on-surface-variant' };
  }
}
function renderProducts(filteredList) {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '';
  filteredList.forEach(p => {
    const isFav = favorites.includes(p.id);
    const inCart = isInCart(p.id);
    const badge = getProductBadge(p);
    const card = document.createElement('div');
    card.className = "group bg-white rounded-2xl overflow-hidden product-card-shadow flex flex-col transition-all hover:shadow-xl md:hover:-translate-y-1";
    card.innerHTML = `
      <div class="relative aspect-[3/4] overflow-hidden">
        <img src="${p.img}" alt="${p.name}" onclick="showDetail('${slugify(p.name)}')" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 cursor-pointer">
        <div class="absolute top-2 left-2 flex flex-col gap-1">
          <span class="${badge.class} px-2 py-1 rounded-md font-label-xs text-label-xs uppercase tracking-wider">${badge.text}</span>
        </div>
        <button onclick="toggleFavorite(${p.id}, event)" class="absolute top-2 right-2 w-10 h-10 flex items-center justify-center bg-white/90 backdrop-blur-md rounded-full text-error transition-all active:scale-125 md:opacity-100 md:group-hover:opacity-100">
          <i class="fa-solid fa-heart ${isFav ? 'text-red-500' : 'text-gray-400'} text-xl"></i>
        </button>
      </div>
      <div class="p-4 md:p-5 flex flex-col flex-1">
        <div onclick="showDetail('${slugify(p.name)}')" class="cursor-pointer mb-2">
          <h3 class="font-label-md text-primary mb-1 line-clamp-1 group-hover:text-secondary transition-colors">${p.name}</h3>
          <p class="font-label-md text-secondary font-bold">Rp ${p.price.toLocaleString('id-ID')}</p>
        </div>
        ${p.isOutOfStock ? `
          <button disabled class="mt-auto w-full bg-gray-400 text-white py-2.5 rounded-full font-label-md flex items-center justify-center gap-2 cursor-not-allowed opacity-70">
            <i class="fa-solid fa-ban text-sm"></i>
            Stok Habis
          </button>
        ` : (inCart ? `
          <button onclick="removeFromCartById(${p.id})" class="mt-auto w-full bg-surface-variant text-on-surface-variant py-2.5 rounded-full font-label-md flex items-center justify-center gap-2 active:scale-95 transition-transform border border-outline-variant/30">
            <i class="fa-solid fa-trash-can text-sm"></i>
            Hapus
          </button>
        ` : `
          <button onclick="addToCart(${p.id}, 1, true)" class="mt-auto w-full bg-secondary text-white py-2.5 rounded-full font-label-md flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md hover:shadow-lg hover:bg-primary/90">
            <i class="fa-solid fa-cart-plus text-sm"></i>
            Tambah
          </button>
        `)}
      </div>
    `;
    grid.appendChild(card);
  });
}
function toggleFavorite(id, e) {
  if (e) e.stopPropagation();
  if (favorites.includes(id)) {
    favorites = favorites.filter(f => f !== id);
    showToast('Dihapus dari Favorit');
  } else {
    favorites.push(id);
    showToast('Ditambahkan ke Favorit');
  }
  saveFavorites();
  filterProducts();
  if (window.location.hash === '#favs') renderFavorites();
}
function renderFavorites() {
  const grid = document.getElementById('favs-grid');
  const empty = document.getElementById('favs-empty-msg');
  grid.innerHTML = '';
  const favItems = products.filter(p => favorites.includes(p.id));
  if (favItems.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  favItems.forEach(p => {
    const badge = getProductBadge(p);
    const card = document.createElement('div');
    card.className = "group bg-white rounded-2xl overflow-hidden product-card-shadow transition-all hover:shadow-lg";
    card.innerHTML = `
      <div class="relative aspect-square overflow-hidden">
        <img src="${p.img}" class="w-full h-full object-cover transition-transform group-hover:scale-110">
        <div class="absolute top-2 left-2 flex flex-col gap-1">
          <span class="${badge.class} px-2 py-1 rounded-md font-label-xs text-label-xs uppercase tracking-wider">${badge.text}</span>
        </div>
        <button onclick="toggleFavorite(${p.id}, event)" class="absolute top-2 right-2 w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-md rounded-full text-error">
          <i class="fa-solid fa-heart text-red-500 text-xl"></i>
        </button>
      </div>
      <div class="p-4">
        <h3 class="font-label-md text-primary line-clamp-1">${p.name}</h3>
        <button onclick="showDetail('${slugify(p.name)}')" class="mt-2 w-full text-xs font-bold text-secondary text-left flex items-center gap-1 hover:gap-2 transition-all">
          LIHAT DETAIL <i class="fa-solid fa-chevron-right text-sm"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}
function showDetail(slug) {
  window.location.hash = `/product/${slug}`;
}
function renderDetailByProduct(p, initialQty = 1) {
  currentDetailSlug = slugify(p.name);
  const inCart = isInCart(p.id);
  detailQty = initialQty;
  const badge = getProductBadge(p);
  const images = p.images || [p.img];
  window._productImages = images;
  window._currentSlide = 0;
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pb-28 md:pb-12 max-w-5xl mx-auto items-start">
      <div class="relative rounded-3xl overflow-hidden shadow-2xl md:sticky md:top-24">
        <div class="relative aspect-[4/5] md:aspect-square bg-white" id="image-slider">
          <img src="${images[0]}" 
               class="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity touch-pan-y" 
               id="main-product-image" 
               alt="${p.name}" 
               onclick="openImageViewer(window._currentSlide)"
               ontouchstart="handleTouchStart(event)"
               ontouchmove="handleTouchMove(event)"
               ontouchend="handleTouchEnd(event)">
          ${images.length > 1 ? `
          <!-- Counter badge kanan atas -->
          <div id="product-img-counter" class="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none z-10">1 / ${images.length}</div>
          <!-- Tombol Prev/Next Desktop -->
          <button onclick="changeImage(-1, true)" class="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <button onclick="changeImage(1, true)" class="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <!-- Dot indicators bawah -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full z-10">
            ${images.map((_, i) =>
    `<button class="w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-[#eab308]' : 'bg-white/60'} transition-colors hover:bg-white/90" onclick="changeImage(${i})"></button>`
  ).join('')}
          </div>
          ` : ''}
        </div>
        <div class="absolute top-4 left-4 ${badge.class} px-3 py-1 rounded-full font-label-xs text-label-xs uppercase tracking-widest shadow-sm">${badge.text}</div>
      </div>
      <div class="px-margin-mobile md:px-0 py-0 flex flex-col gap-6 md:gap-8">
        <section>
          <div class="flex justify-between items-start">
            <h2 class="font-headline-lg-mobile md:text-display-lg text-primary mb-2 md:mb-4 flex-1">${p.name}</h2>
          </div>
          <p class="text-2xl md:text-3xl font-bold text-secondary">Rp ${p.price.toLocaleString('id-ID')}</p>
        </section>
        <hr class="border-outline-variant opacity-30"/>
        <section>
          <h3 class="font-label-md text-on-surface-variant mb-3 uppercase tracking-wider">Deskripsi</h3>
          <p class="font-body-md md:text-body-lg text-on-surface leading-relaxed">${p.desc}</p>
        </section>
        <div class="hidden md:flex items-center gap-3 pt-4">
          ${p.isOutOfStock ? `
          <button disabled class="flex-grow bg-gray-400 text-white h-16 rounded-full font-bold shadow-sm cursor-not-allowed opacity-70 flex items-center justify-center gap-3">
            <i class="fa-solid fa-ban"></i>
            Stok Habis
          </button>
          ` : (inCart ? `
          <button onclick="removeFromCartById(${p.id})" class="flex-grow bg-surface-variant text-on-surface-variant h-16 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3 border border-outline-variant/30">
            <i class="fa-solid fa-trash-can"></i>
            Hapus dari Keranjang
          </button>
          ` : `
          <button onclick="addToCart(${p.id}, 1, true)" class="flex-grow bg-secondary text-white h-16 rounded-full font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-primary transition-colors">
            <i class="fa-solid fa-cart-plus"></i>
            Tambah ke Keranjang
          </button>
          `)}
          <button onclick="copyProductLink()" class="flex-none bg-surface-container-high text-primary w-16 h-16 rounded-full shadow-sm active:scale-95 transition-all flex items-center justify-center border border-outline-variant/30" title="Salin Link">
            <i class="fa-solid fa-copy text-xl"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="fixed md:hidden bottom-0 left-0 w-full z-[70] bg-surface/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(51,33,13,0.1)] p-4 pb-safe flex items-center gap-3 border-t border-outline-variant/10">
      ${p.isOutOfStock ? `
      <button disabled class="flex-grow bg-gray-400 text-white h-14 rounded-full font-bold shadow-sm cursor-not-allowed opacity-70 flex items-center justify-center gap-2">
        <i class="fa-solid fa-ban"></i>
        Stok Habis
      </button>
      ` : (inCart ? `
      <button onclick="removeFromCartById(${p.id})" class="flex-grow bg-surface-variant text-on-surface-variant h-14 rounded-full font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 border border-outline-variant/30">
        <i class="fa-solid fa-trash-can"></i>
        Hapus
      </button>
      ` : `
      <button onclick="addToCart(${p.id}, 1, true)" class="flex-grow bg-secondary text-white h-14 rounded-full font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
        <i class="fa-solid fa-cart-plus"></i>
        Tambah
      </button>
      `)}
      <button onclick="copyProductLink()" class="flex-none bg-white text-primary w-14 h-14 rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center border border-outline-variant/20">
        <i class="fa-solid fa-copy text-xl"></i>
      </button>
      <button onclick="shareProduct('${p.name}')" class="flex-none bg-white text-primary w-14 h-14 rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center border border-outline-variant/20">
        <i class="fa-solid fa-share-nodes text-xl"></i>
      </button>
    </div>
  `;
  updateMetaTags(p);
}

// --- SOCIAL SHARING META TAGS ---
function updateMetaTags(product) {
  const title = `DJANDES - ${product.name}`;
  const description = product.desc || 'Kudapan premium dari Djandes Sweet & Savoury';
  const image = product.images && product.images.length > 0 ? product.images[0] : product.img;
  const url = window.location.href;
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.content = title;
  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (!ogDesc) {
    ogDesc = document.createElement('meta');
    ogDesc.setAttribute('property', 'og:description');
    document.head.appendChild(ogDesc);
  }
  ogDesc.content = description;
  let ogImage = document.querySelector('meta[property="og:image"]');
  if (!ogImage) {
    ogImage = document.createElement('meta');
    ogImage.setAttribute('property', 'og:image');
    document.head.appendChild(ogImage);
  }
  ogImage.content = image;
  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.content = url;
  let twTitle = document.querySelector('meta[name="twitter:title"]');
  if (!twTitle) {
    twTitle = document.createElement('meta');
    twTitle.setAttribute('name', 'twitter:title');
    document.head.appendChild(twTitle);
  }
  twTitle.content = title;
  let twDesc = document.querySelector('meta[name="twitter:description"]');
  if (!twDesc) {
    twDesc = document.createElement('meta');
    twDesc.setAttribute('name', 'twitter:description');
    document.head.appendChild(twDesc);
  }
  twDesc.content = description;
  let twImage = document.querySelector('meta[name="twitter:image"]');
  if (!twImage) {
    twImage = document.createElement('meta');
    twImage.setAttribute('name', 'twitter:image');
    document.head.appendChild(twImage);
  }
  twImage.content = image;
  document.title = title;
}
function resetMetaTags() {
  if (window.location.hash.startsWith('#/product/')) return;
  const defaultTitle = 'DJANDES - Sweet & Savoury';
  const defaultDesc = 'Berbagai macam kue tradisional dan modern dengan cita rasa autentik dan kualitas terbaik.';
  const defaultImage = 'https://djandes15.vercel.app/img/djandes.png';
  const defaultUrl = 'https://djandes15.vercel.app';
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = defaultTitle;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = defaultDesc;
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) ogImage.content = defaultImage;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = defaultUrl;
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.content = defaultTitle;
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.content = defaultDesc;
  const twImage = document.querySelector('meta[name="twitter:image"]');
  if (twImage) twImage.content = defaultImage;
  document.title = defaultTitle;
}

// --- IMAGE NAVIGATION ---
let touchStartXDetail = 0;
let touchEndXDetail = 0;
let isSwiping = false;
function handleTouchStart(e) {
  const touch = e.touches[0];
  touchStartXDetail = touch.clientX;
  isSwiping = true;
}
function handleTouchMove(e) {
  if (!isSwiping) return;
  touchEndXDetail = e.touches[0].clientX;
}
function handleTouchEnd(e) {
  if (!isSwiping) return;
  isSwiping = false;
  const diff = touchStartXDetail - touchEndXDetail;
  if (Math.abs(diff) > 50) {
    if (diff > 0) {
      changeImage(1, true);
    } else {
      changeImage(-1, true);
    }
  }
}
// 🔥 PERBAIKAN: Dukung klik langsung pada dot (bukan hanya next/prev)
function changeImage(direction, isRelative = false) {
  const images = window._productImages || [];
  if (images.length <= 1) return;
  let newIndex;
  if (isRelative) {
    newIndex = window._currentSlide + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
  } else {
    newIndex = parseInt(direction, 10);
  }
  window._currentSlide = newIndex;
  const img = document.getElementById('main-product-image');
  if (img) img.src = images[newIndex];
  // Update counter badge
  const counter = document.getElementById('product-img-counter');
  if (counter) counter.textContent = `${newIndex + 1} / ${images.length}`;
  // Update dot indicators
  const dots = document.querySelectorAll('#image-slider .w-2\\.5.h-2\\.5');
  dots.forEach((dot, i) => {
    dot.className = `w-2.5 h-2.5 rounded-full ${i === newIndex ? 'bg-[#eab308]' : 'bg-white/60'} transition-colors hover:bg-white/90`;
  });
}

// --- IMAGE VIEWER ---
function openImageViewer(index) {
  const images = window._productImages || [];
  if (!images.length) return;
  imageViewerImages = images;
  currentImageIndex = index;
  isViewerFromBox = false;
  openViewer(index);
}
function openBoxImageViewer(index) {
  const images = window._boxProductImages || [];
  if (!images.length) return;
  imageViewerImages = images;
  currentImageIndex = index;
  isViewerFromBox = true;
  openViewer(index);
}
function openViewer(index) {
  const viewer = document.getElementById('image-viewer');
  const img = document.getElementById('viewer-image');
  img.src = imageViewerImages[index];
  viewer.classList.add('active');
  viewer.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.body.classList.add('no-scroll');
  img.style.transform = 'scale(1)';
  img.style.transformOrigin = '50% 50%';
  img.classList.remove('zoomed');
  isZoomed = false;
  currentZoom = 1;
  panX = 0; panY = 0;
  isPanning = false;
  touchStartX = 0;
  touchEndX = 0;
  isPinching = false;
  renderViewerDots(index);
  updateViewerCounter(index);
  updateViewerNavButtons();
}
function updateViewerCounter(activeIndex) {
  const counter = document.getElementById('viewer-counter');
  if (!counter) return;
  if (imageViewerImages.length > 1) {
    counter.textContent = `${activeIndex + 1} / ${imageViewerImages.length}`;
    counter.classList.remove('hidden');
  } else {
    counter.classList.add('hidden');
  }
}
function updateViewerNavButtons() {
  const prevBtn = document.getElementById('viewer-prev-btn');
  const nextBtn = document.getElementById('viewer-next-btn');
  const show = imageViewerImages.length > 1;
  if (prevBtn) prevBtn.style.display = show ? '' : 'none';
  if (nextBtn) nextBtn.style.display = show ? '' : 'none';
}
function renderViewerDots(activeIndex) {
  const container = document.getElementById('viewer-indicator');
  container.innerHTML = '';
  imageViewerImages.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = `dot ${i === activeIndex ? 'active' : ''}`;
    dot.onclick = () => changeViewerImage(i);
    container.appendChild(dot);
  });
}
function closeImageViewer() {
  const viewer = document.getElementById('image-viewer');
  viewer.classList.remove('active');
  viewer.style.display = 'none';
  document.body.style.overflow = 'auto';
  document.body.classList.remove('no-scroll');
}
// State tambahan untuk zoom-at-point dan pan
let pinchOriginX = 0;  // transform-origin X dalam persen
let pinchOriginY = 0;  // transform-origin Y dalam persen
let panX = 0;          // geseran horizontal saat zoom
let panY = 0;          // geseran vertikal saat zoom
let panStartX = 0;     // titik awal sentuhan saat pan
let panStartY = 0;
let isPanning = false;

function handlePinchStart(e) {
  if (e.touches.length === 2) {
    isPinching = true;
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    pinchStartDist = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    // Hitung titik tengah antara dua jari
    const midX = (touch1.clientX + touch2.clientX) / 2;
    const midY = (touch1.clientY + touch2.clientY) / 2;
    // Konversi ke persentase relatif terhadap elemen gambar
    const img = document.getElementById('viewer-image');
    const rect = img.getBoundingClientRect();
    pinchOriginX = ((midX - rect.left) / rect.width) * 100;
    pinchOriginY = ((midY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${pinchOriginX}% ${pinchOriginY}%`;
  }
}
function handlePinchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const currentDist = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    const scale = currentDist / pinchStartDist;
    const img = document.getElementById('viewer-image');
    currentZoom = Math.min(Math.max(currentZoom * scale, 1), 5);
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
    if (currentZoom > 1) {
      img.classList.add('zoomed');
      isZoomed = true;
    } else {
      // Reset pan jika kembali ke skala normal
      panX = 0; panY = 0;
      img.classList.remove('zoomed');
      isZoomed = false;
      img.style.transformOrigin = '50% 50%';
    }
    pinchStartDist = currentDist;
  }
}
function changeViewerImage(direction, isRelative = false) {
  const images = imageViewerImages;
  if (!images.length) return;
  let newIndex;
  if (isRelative) {
    newIndex = currentImageIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
  } else {
    newIndex = parseInt(direction, 10);
  }
  currentImageIndex = newIndex;
  const img = document.getElementById('viewer-image');
  img.src = images[newIndex];
  img.classList.remove('zoomed');
  img.style.transform = 'scale(1)';
  img.style.transformOrigin = '50% 50%';
  isZoomed = false;
  currentZoom = 1;
  panX = 0; panY = 0;
  isPanning = false;
  renderViewerDots(newIndex);
  updateViewerCounter(newIndex);
}
document.addEventListener('touchstart', (e) => {
  const viewer = document.getElementById('image-viewer');
  if (!viewer.classList.contains('active')) return;
  if (e.touches.length === 2) {
    isPanning = false;
    handlePinchStart(e);
  } else if (e.touches.length === 1) {
    isPinching = false;
    if (isZoomed) {
      // Mode pan: simpan posisi awal jari
      isPanning = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
    } else {
      isPanning = false;
      touchStartX = e.changedTouches[0].screenX;
    }
  }
});
document.addEventListener('touchmove', (e) => {
  const viewer = document.getElementById('image-viewer');
  if (!viewer.classList.contains('active')) return;
  if (e.touches.length === 2) {
    handlePinchMove(e);
  } else if (isPanning && isZoomed) {
    // Geser gambar saat sedang di-zoom
    e.preventDefault();
    const dx = e.touches[0].clientX - panStartX;
    const dy = e.touches[0].clientY - panStartY;
    panX += dx;
    panY += dy;
    panStartX = e.touches[0].clientX;
    panStartY = e.touches[0].clientY;
    const img = document.getElementById('viewer-image');
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  } else {
    if (Math.abs(e.changedTouches[0].screenX - touchStartX) > 10) {
      e.preventDefault();
    }
  }
}, { passive: false });
document.addEventListener('touchend', (e) => {
  const viewer = document.getElementById('image-viewer');
  if (!viewer.classList.contains('active')) return;
  if (isPanning) {
    isPanning = false;
    return;
  }
  if (e.changedTouches.length === 1 && !isPinching && !isZoomed) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }
  isPinching = false;
});
function handleSwipe() {
  const swipeDistance = touchStartX - touchEndX;
  if (Math.abs(swipeDistance) > 50) {
    if (swipeDistance > 0) {
      changeViewerImage(1, true);
    } else {
      changeViewerImage(-1, true);
    }
  }
}
document.addEventListener('keydown', (e) => {
  const viewer = document.getElementById('image-viewer');
  if (!viewer.classList.contains('active')) return;
  if (e.key === 'ArrowLeft') changeViewerImage(-1, true);
  if (e.key === 'ArrowRight') changeViewerImage(1, true);
  if (e.key === 'Escape') closeImageViewer();
});
document.getElementById('image-viewer').addEventListener('click', function (e) {
  if (e.target === this) {
    closeImageViewer();
  }
});
function copyProductLink() {
  const url = window.location.href;
  if (url.includes('#/product/')) {
    const cleanUrl = url.replace('/#/product/', '/product/');
    navigator.clipboard.writeText(cleanUrl).then(() => {
      showToast("Link produk berhasil disalin! (Tanpa #)");
    }).catch(err => {
      console.error("Gagal menyalin link:", err);
    });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Link berhasil disalin!");
    }).catch(err => {
      console.error("Gagal menyalin link:", err);
    });
  }
}
async function shareProduct(productName) {
  let currentUrl = window.location.href;
  let cleanUrl = currentUrl;
  if (currentUrl.includes('#/product/')) {
    cleanUrl = currentUrl.replace('/#/product/', '/product/');
  }
  if (navigator.share) {
    try {
      await navigator.share({
        title: productName,
        text: `Cek kudapan premium Djandes: ${productName}`,
        url: cleanUrl
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Gagal share:", err);
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(cleanUrl);
      showToast("Link produk berhasil disalin ke clipboard!");
    } catch (err) {
      showToast("Fitur Share tidak tersedia di browser Anda");
    }
  }
}

// --- CART ---
function addToCart(id, qty = 1, fromInteraction = false) {
  const p = products.find(prod => prod.id === id);
  if (!p) return;
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ ...p, qty: qty });
  }
  saveCart();
  updateCartUI();
  filterProducts();
  if (currentDetailSlug === slugify(p.name)) renderDetailByProduct(p, detailQty);
  if (fromInteraction) showToast(`${qty} ${p.name} ditambahkan`);
}
function removeFromCartById(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  updateCartUI();
  filterProducts();
  const product = products.find(p => p.id === id);
  if (product && currentDetailSlug === slugify(product.name)) renderDetailByProduct(product, detailQty);
  renderCart();
  showToast("Produk dihapus dari keranjang");
}
function updateCartUI() {
  const badge = document.getElementById('cart-badge');
  const count = cart.reduce((acc, item) => acc + item.qty, 0);
  if (count > 0) {
    badge.innerText = count;
    badge.classList.remove('hidden');
    badge.style.fontFamily = 'Arial, sans-serif';
    badge.style.fontWeight = 'bold';
    badge.style.fontSize = '11px';
  } else {
    badge.classList.add('hidden');
  }
}
function renderCart() {
  const list = document.getElementById('cart-items-list');
  const emptyMsg = document.getElementById('cart-empty-msg');
  const summary = document.getElementById('cart-summary');
  const boxSel = document.getElementById('box-selection');
  if (!list) return;
  list.innerHTML = '';
  if (cart.length === 0) {
    emptyMsg.classList.remove('hidden');
    summary.classList.add('hidden');
    boxSel.classList.add('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');
  summary.classList.remove('hidden');
  boxSel.classList.remove('hidden');
  let subtotal = 0;
  let totalQty = 0;
  cart.forEach((item, index) => {
    const itemSub = item.price * item.qty;
    subtotal += itemSub;
    totalQty += item.qty;
    const row = document.createElement('div');
    row.className = "flex gap-4 p-4 md:p-6 bg-white rounded-2xl product-card-shadow transition-all border border-transparent hover:border-outline-variant/30";
    row.innerHTML = `
      <div class="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden flex-shrink-0">
        <img src="${item.img}" class="w-full h-full object-cover">
      </div>
      <div class="flex flex-col justify-between flex-grow">
        <div class="flex justify-between items-start">
          <h3 class="font-title-md text-primary text-sm md:text-base">${item.name}</h3>
          <button onclick="removeFromCartById(${item.id})" class="text-on-surface-variant hover:text-error transition-colors">
            <i class="fa-solid fa-trash-can text-[20px] md:text-[24px]"></i>
          </button>
        </div>
        <div class="flex justify-between items-center mt-2">
          <span class="font-bold text-secondary text-sm md:text-base">Rp ${itemSub.toLocaleString('id-ID')}</span>
          <div class="flex items-center bg-surface-container-low rounded-full px-2 border border-outline-variant/20">
            <button onclick="updateCartQty(${index}, -1)" class="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-primary"><i class="fa-solid fa-minus text-[18px]"></i></button>
            <span class="px-2 font-semibold text-sm md:text-base w-6 md:w-8 text-center">${item.qty}</span>
            <button onclick="updateCartQty(${index}, 1)" class="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-primary"><i class="fa-solid fa-plus text-[18px]"></i></button>
          </div>
        </div>
      </div>
    `;
    list.appendChild(row);
  });
  let boxPrice = 0;
  const selectedType = packagingTypes.find(t => t.id_tipe === selectedBox);
  if (selectedType) {
    boxPrice = selectedType.harga_tambahan || 0;
  }
  const boxTotal = boxPrice * totalQty;
  const finalTotal = subtotal + boxTotal;
  const breakdown = document.getElementById('summary-breakdown');
  breakdown.innerHTML = `
    <div class="flex justify-between text-on-surface-variant text-sm">
      <span>Subtotal Produk</span>
      <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
    </div>
    <div class="flex justify-between text-on-surface-variant text-sm">
      <div class="flex flex-col">
        <span>Kemasan (${selectedBox})</span>
        <span class="text-[10px] text-secondary font-bold uppercase tracking-tight">${selectedVariant}</span>
      </div>
      <span>Rp ${boxTotal.toLocaleString('id-ID')}</span>
    </div>
    <div class="pt-3 border-t border-outline-variant/40 flex justify-between items-center mt-2">
      <span class="font-title-md text-primary">Total Pembayaran</span>
      <span class="text-xl md:text-2xl font-bold text-secondary">Rp ${finalTotal.toLocaleString('id-ID')}</span>
    </div>
  `;
}
function updateCartQty(index, delta) {
  cart[index].qty = Math.max(1, cart[index].qty + delta);
  saveCart();
  renderCart();
  updateCartUI();
}

// --- HISTORY ---
function renderHistory() {
  const list = document.getElementById('history-list');
  const emptyMsg = document.getElementById('history-empty-msg');
  if (!list) return;
  list.innerHTML = '';
  if (history.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');
  const sorted = [...history].reverse();
  sorted.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = "history-item";
    div.onclick = () => viewHistoryInvoice(index);
    div.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <p class="font-bold text-primary text-sm">${item.invoiceId}</p>
          <p class="text-xs text-on-surface-variant">${item.date} ${item.time || ''}</p>
          <p class="text-xs text-on-surface-variant">${item.customerName}</p>
        </div>
        <div class="text-right">
          <p class="font-bold text-secondary text-sm">Rp ${item.total.toLocaleString('id-ID')}</p>
          <p class="text-[10px] text-on-surface-variant">${item.items.length} item</p>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}
function viewHistoryInvoice(index) {
  const data = history[index];
  if (!data) return;
  isFromHistory = true;
  checkoutData = data;
  saveCheckout();
  renderInvoice();
  navigateTo('invoice', false);
}

// --- PACKAGING ---
function renderPackagingTypes() {
  const container = document.getElementById('packaging-type-scroll');
  container.innerHTML = '';
  packagingTypes.forEach(type => {
    const btn = document.createElement('button');
    const isSelected = type.id_tipe === selectedBox;
    const priceText = type.harga_tambahan === 0 ? 'Tanpa biaya tambahan' : `+Rp ${type.harga_tambahan.toLocaleString('id-ID')}/item`;
    // SELECTED: kuning-amber border + bg kuning muda, font bold
    // UNSELECTED: border coklat/outline terlihat (bukan transparan), font bold sama
    btn.className = `packaging-type-btn flex-none px-4 py-2.5 rounded-lg border-2 transition-all snap-start whitespace-nowrap text-xs font-bold ${isSelected
      ? 'border-secondary bg-secondary-container text-on-secondary-container shadow-sm'
      : 'border-outline bg-white text-on-surface-variant'
      }`;
    btn.onclick = () => setBox(type.id_tipe);
    btn.dataset.type = type.id_tipe;
    btn.innerHTML = `<span class="block">${type.id_tipe}</span><span class="block text-[10px] font-semibold mt-0.5 opacity-70">${priceText}</span>`;
    container.appendChild(btn);
  });
  renderVariantGrid(selectedBox);
  updateVariantPreview();
}
function setBox(type) {
  selectedBox = type;
  const currentVariants = boxVariants[type] || [];
  const variantExists = currentVariants.some(v => v.name === selectedVariant);
  if (!variantExists && currentVariants.length > 0) selectedVariant = currentVariants[0].name;

  localStorage.setItem('djandes_selected_box', selectedBox);
  localStorage.setItem('djandes_selected_variant', selectedVariant);

  document.querySelectorAll('.packaging-type-btn').forEach(btn => {
    if (btn.dataset.type === type) {
      btn.classList.add('border-secondary', 'bg-secondary-container', 'text-on-secondary-container', 'shadow-sm');
      btn.classList.remove('border-outline', 'bg-white', 'text-on-surface-variant');
    } else {
      btn.classList.add('border-outline', 'bg-white', 'text-on-surface-variant');
      btn.classList.remove('border-secondary', 'bg-secondary-container', 'text-on-secondary-container', 'shadow-sm');
    }
  });
  renderVariantGrid(type);
  updateVariantPreview();
  renderCart();
}
function renderVariantGrid(type) {
  const grid = document.getElementById('variant-options-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const variants = boxVariants[type] || [];
  variants.forEach(variant => {
    const isSelected = variant.name === selectedVariant;
    const btn = document.createElement('button');
    btn.className = `flex-none px-4 py-2.5 rounded-lg border-2 transition-all snap-start whitespace-nowrap text-xs font-bold ${isSelected
      ? 'border-secondary bg-secondary-container text-on-secondary-container shadow-sm'
      : 'border-outline bg-white text-on-surface-variant'
      }`;
    btn.onclick = () => selectVariant(variant.name);
    btn.innerText = variant.name;
    grid.appendChild(btn);
  });
}
function selectVariant(variantName) {
  selectedVariant = variantName;
  localStorage.setItem('djandes_selected_variant', selectedVariant);
  renderVariantGrid(selectedBox);
  updateVariantPreview();
  renderCart();
}
function updateVariantPreview() {
  const currentVariants = boxVariants[selectedBox] || [];
  const variantObj = currentVariants.find(v => v.name === selectedVariant);
  const previewImg = document.getElementById('variant-preview-img');
  const previewName = document.getElementById('variant-preview-name');
  if (variantObj) {
    previewImg.style.transition = 'transform 0.2s ease';
    previewImg.style.transform = 'scale(0.95)';
    requestAnimationFrame(() => {
      previewImg.src = variantObj.img;
      setTimeout(() => {
        previewImg.style.transform = 'scale(1)';
      }, 50);
    });
    previewName.innerText = variantObj.name;
  }
}
function showBoxDetail(skipNavigate = false) {
  const currentVariants = boxVariants[selectedBox] || [];
  const variant = currentVariants.find(v => v.name === selectedVariant);
  if (!variant) return;
  const container = document.getElementById('box-detail-content');
  const selectedType = packagingTypes.find(t => t.id_tipe === selectedBox);
  let priceText = 'Tanpa biaya tambahan';
  if (selectedType) {
    priceText = selectedType.harga_tambahan === 0 ? 'Tanpa biaya tambahan' : `+Rp ${selectedType.harga_tambahan.toLocaleString('id-ID')} / item`;
  }
  const features = variant.features || [
    "Material kualitas ekspor, kokoh dan tahan lama.",
    "Ramah lingkungan dan dapat digunakan kembali.",
    "Desain elegan dan premium."
  ];
  let featuresHtml = features.map(f => `
    <li class="flex items-start gap-3">
      <i class="fa-solid fa-circle-check text-secondary text-lg"></i>
      <span class="text-sm text-on-surface">${f}</span>
    </li>
  `).join('');
  const variantImages = variant.images || [variant.img];
  window._boxProductImages = variantImages;
  window._boxCurrentSlide = 0;
  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
      <div class="relative rounded-3xl overflow-hidden shadow-2xl md:sticky md:top-24">
        <div class="relative aspect-[4/5] md:aspect-square bg-white" id="box-image-slider">
          <img src="${variantImages[0]}" 
               class="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity touch-pan-y" 
               id="box-main-image" 
               alt="${variant.name}" 
               onclick="openBoxImageViewer(window._boxCurrentSlide)"
               ontouchstart="handleBoxTouchStart(event)"
               ontouchmove="handleBoxTouchMove(event)"
               ontouchend="handleBoxTouchEnd(event)">
          ${variantImages.length > 1 ? `
          <!-- Counter badge kanan atas -->
          <div id="box-img-counter" class="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none z-10">1 / ${variantImages.length}</div>
          <!-- Tombol Prev/Next Desktop -->
          <button onclick="changeBoxImage(-1, true)" class="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <button onclick="changeBoxImage(1, true)" class="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-sm">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <!-- Dot indicators bawah -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full z-10">
            ${variantImages.map((_, i) =>
    `<button class="w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-[#eab308]' : 'bg-white/60'} transition-colors hover:bg-white/90" onclick="changeBoxImage(${i})"></button>`
  ).join('')}
          </div>
          ` : ''}
        </div>
        <div class="absolute top-4 left-4 bg-primary/90 backdrop-blur-md text-white px-3 py-1 rounded-full font-label-xs text-label-xs uppercase tracking-widest shadow-sm">
          ${selectedBox} Package
        </div>
      </div>
      <div class="py-4 md:py-8 flex flex-col gap-6">
        <section>
          <div class="flex justify-between items-start mb-2">
            <h2 class="font-headline-lg md:text-4xl text-primary">${variant.name}</h2>
          </div>
          <p class="text-xl font-bold text-secondary">${priceText}</p>
        </section>
        <hr class="border-outline-variant opacity-30"/>
        <section>
          <h3 class="font-label-md text-on-surface-variant mb-3 uppercase tracking-wider">Tentang Kemasan</h3>
          <div class="bg-surface-container-high p-6 rounded-2xl border border-outline-variant/20 shadow-sm">
            <p class="font-body-md text-on-surface leading-relaxed italic">"${variant.desc}"</p>
          </div>
        </section>
        <section class="mb-12">
          <h3 class="font-label-md text-on-surface-variant mb-4 uppercase tracking-wider">Kelebihan</h3>
          <ul class="space-y-4">
            ${featuresHtml}
          </ul>
        </section>
        <button onclick="goBack()" class="w-full bg-primary text-white h-14 rounded-full font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 md:mt-auto">
          <i class="fa-solid fa-arrow-left"></i>
          Kembali ke Pesanan
        </button>
      </div>
    </div>
  `;
  if (!skipNavigate) {
    // Pastikan 'cart' ada di navigationStack agar back mengarah ke keranjang bukan beranda
    if (navigationStack[navigationStack.length - 1] !== 'cart') {
      navigationStack.push('cart');
    }
    navigateTo('box-detail', false);
  }
}

// --- BOX IMAGE NAVIGATION ---
let boxTouchStartX = 0;
let boxTouchEndX = 0;
let boxIsSwiping = false;
function handleBoxTouchStart(e) {
  const touch = e.touches[0];
  boxTouchStartX = touch.clientX;
  boxIsSwiping = true;
}
function handleBoxTouchMove(e) {
  if (!boxIsSwiping) return;
  boxTouchEndX = e.touches[0].clientX;
}
function handleBoxTouchEnd(e) {
  if (!boxIsSwiping) return;
  boxIsSwiping = false;
  const diff = boxTouchStartX - boxTouchEndX;
  if (Math.abs(diff) > 50) {
    if (diff > 0) {
      changeBoxImage(1, true);
    } else {
      changeBoxImage(-1, true);
    }
  }
}
function changeBoxImage(direction, isRelative = false) {
  const images = window._boxProductImages || [];
  if (images.length <= 1) return;
  let newIndex;
  if (isRelative) {
    newIndex = window._boxCurrentSlide + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
  } else {
    newIndex = parseInt(direction, 10);
  }
  window._boxCurrentSlide = newIndex;
  const img = document.getElementById('box-main-image');
  if (img) img.src = images[newIndex];
  // Update counter badge
  const counter = document.getElementById('box-img-counter');
  if (counter) counter.textContent = `${newIndex + 1} / ${images.length}`;
  // Update dot indicators
  const dots = document.querySelectorAll('#box-image-slider .w-2\\.5.h-2\\.5');
  dots.forEach((dot, i) => {
    dot.className = `w-2.5 h-2.5 rounded-full ${i === newIndex ? 'bg-[#eab308]' : 'bg-white/60'} transition-colors hover:bg-white/90`;
  });
}

// --- CHECKOUT & INVOICE ---
function handleShowInvoice(e) {
  e.preventDefault();
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
  let boxPrice = 0;
  const selectedType = packagingTypes.find(t => t.id_tipe === selectedBox);
  if (selectedType) {
    boxPrice = selectedType.harga_tambahan || 0;
  }
  const boxTotal = boxPrice * totalQty;
  const finalTotal = subtotal + boxTotal;
  const rawTime = document.getElementById('collection-time').value;
  checkoutData = {
    name: document.getElementById('full-name').value,
    date_pickup: document.getElementById('collection-date').value,
    time_pickup: rawTime,
    notes: document.getElementById('special-notes').value,
    invoiceId: 'DJD-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    dateCreated: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    box: selectedBox,
    variant: selectedVariant,
    boxTotal: boxTotal,
    total: finalTotal,
    items: cart.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
    customerName: document.getElementById('full-name').value,
    date: document.getElementById('collection-date').value,
    time: rawTime
  };
  saveCheckout();
  isFromHistory = false;
  renderInvoice();
  navigateTo('invoice', false);
}
function renderInvoice() {
  const container = document.getElementById('invoice-content');
  const waBtn = document.getElementById('wa-confirm-btn');
  const editBtn = document.getElementById('edit-data-btn');
  let subtotal = 0;
  let itemsHtml = '';
  const items = checkoutData.items || cart;
  items.forEach(item => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;
    itemsHtml += `
      <div class="flex justify-between py-2.5 border-b border-dashed border-outline-variant/40">
        <div class="flex-1 pr-2">
          <p class="font-bold text-xs text-primary">${item.name}</p>
          <p class="text-[10px] text-on-surface-variant">${item.qty} x Rp ${item.price.toLocaleString('id-ID')}</p>
        </div>
        <p class="font-bold text-xs text-primary">Rp ${itemTotal.toLocaleString('id-ID')}</p>
      </div>
    `;
  });
  container.innerHTML = `
    <div class="flex justify-between items-start mb-6 pb-6 border-b border-outline-variant/20">
      <div class="flex flex-col gap-2">
        <h2 class="font-serif text-3xl text-secondary leading-none">Djandes</h2>
        <p class="text-[10px] uppercase font-bold tracking-[0.2em] text-on-surface-variant">Sweet & Savoury</p>
      </div>
      <div class="text-right">
        <p class="text-[9px] text-on-surface-variant uppercase font-bold mb-0.5">No. Invoice</p>
        <p class="text-sm font-mono font-bold text-primary">#${checkoutData.invoiceId}</p>
        <p class="text-[9px] mt-0.5 text-on-surface-variant font-medium">${checkoutData.dateCreated}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 mb-6">
      <div class="bg-surface-container-low p-3 rounded-2xl">
        <p class="text-[9px] font-bold text-secondary uppercase mb-1.5 tracking-wider">Informasi Pemesan</p>
        <p class="text-sm font-bold text-primary mb-0.5">${checkoutData.name || checkoutData.customerName}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-container-low p-3 rounded-2xl">
          <p class="text-[9px] font-bold text-secondary uppercase mb-0.5 tracking-wider">Tanggal Ambil</p>
          <p class="text-xs text-primary font-bold">${checkoutData.date_pickup || checkoutData.date}</p>
        </div>
        <div class="bg-surface-container-low p-3 rounded-2xl">
          <p class="text-[9px] font-bold text-secondary uppercase mb-0.5 tracking-wider">Jam Ambil</p>
          <p class="text-xs text-primary font-bold">${checkoutData.time_pickup || checkoutData.time}</p>
        </div>
      </div>
    </div>
    <div class="mb-6">
      <p class="text-[9px] font-bold text-secondary uppercase mb-2 tracking-widest">Rincian Pesanan</p>
      <div class="space-y-0.5">
        ${itemsHtml}
        <div class="flex justify-between py-3 italic border-b border-dashed border-outline-variant/40 bg-surface-container-highest/5 px-1">
          <div class="flex-1">
            <p class="font-bold text-[11px] text-primary">Kemasan ${checkoutData.box}</p>
            <p class="text-[8px] uppercase font-bold text-secondary mt-0.5 tracking-tighter">${checkoutData.variant}</p>
          </div>
          <p class="font-bold text-[11px] text-primary">Rp ${checkoutData.boxTotal.toLocaleString('id-ID')}</p>
        </div>
      </div>
    </div>
    <div class="space-y-2 mt-6 pt-4 border-t-2 border-primary/10">
      <div class="flex justify-between text-xs text-on-surface-variant font-medium">
        <span>Subtotal Produk</span>
        <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
      </div>
      <div class="flex justify-between items-end pt-2">
        <span class="font-bold text-base text-primary uppercase tracking-tighter">Total Akhir</span>
        <span class="font-bold text-xl text-secondary">Rp ${checkoutData.total.toLocaleString('id-ID')}</span>
      </div>
    </div>
    ${checkoutData.notes ? `
    <div class="mt-8 pt-4 border-t border-dashed border-outline-variant/50" id="invoice-notes-section">
      <p class="text-[9px] font-bold text-secondary uppercase mb-1.5 tracking-widest">Catatan Tambahan</p>
      <div class="bg-surface-container p-2.5 rounded-xl">
        <p class="text-[11px] italic text-on-surface-variant leading-relaxed">"${checkoutData.notes}"</p>
      </div>
    </div>
    ` : ''}
    <div class="mt-8 text-center">
      <p class="text-[9px] font-bold text-outline-variant uppercase tracking-[0.3em]">Terima Kasih</p>
    </div>
  `;
  if (isFromHistory) {
    waBtn.classList.add('hidden');
    editBtn.classList.add('hidden');
  } else {
    waBtn.classList.remove('hidden');
    editBtn.classList.remove('hidden');
  }
}
async function saveAsImage() {
  const invoice = document.getElementById('invoice-content');
  try {
    showToast("Menyiapkan Gambar...");
    const canvas = await html2canvas(invoice, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true });
    const link = document.createElement('a');
    link.download = `Invoice-${checkoutData.invoiceId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast("Berhasil disimpan!");
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan gambar");
  }
}
async function shareInvoiceImage() {
  const invoice = document.getElementById('invoice-content');
  try {
    showToast("Menyiapkan Share...");
    const canvas = await html2canvas(invoice, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `Invoice-${checkoutData.invoiceId}.png`, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Invoice Djandes',
        text: `Pesanan Djandes #${checkoutData.invoiceId}`
      });
    } else {
      showToast("Browser tidak mendukung fitur Share file");
    }
  } catch (err) {
    console.error(err);
    showToast("Gagal membagikan gambar");
  }
}
function finalWhatsAppRedirect() {
  const phoneNumber = profileData.whatsapp || '6281234567890';
  const dateObj = new Date(checkoutData.date_pickup + 'T00:00:00');
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dayName = dayNames[dateObj.getDay()];
  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  const formattedDate = `${dayName}, ${day} ${month} ${year}`;
  const timeParts = checkoutData.time_pickup ? checkoutData.time_pickup.split(':') : ['00', '00'];
  const formattedTime = `${timeParts[0]}:${timeParts[1]}`;
  let message = `*Halo, saya ingin memesan kue dari DJANDES*\n\n`;
  message += `*No. Invoice:* ${checkoutData.invoiceId}\n\n`;
  message += `*Data Pemesan:*\n`;
  message += `*Nama:* ${checkoutData.name}\n`;
  message += `*Tanggal Pengambilan:* ${formattedDate}\n`;
  message += `*Jam Pengambilan:* ${formattedTime}\n\n`;
  message += `*Detail Pesanan:*\n`;
  cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    message += `- ${item.name} (${item.qty}x): Rp ${itemTotal.toLocaleString('id-ID')}\n`;
  });
  const boxPrice = checkoutData.boxTotal || 0;
  message += `- Kemasan ${checkoutData.box} (${checkoutData.variant}): Rp ${boxPrice.toLocaleString('id-ID')}\n`;
  if (checkoutData.notes && checkoutData.notes.trim() !== '') {
    message += `\n*Catatan:* ${checkoutData.notes}`;
  }
  message += `\n\n*Total: Rp ${checkoutData.total.toLocaleString('id-ID')}*\n\n`;
  message += `*Silakan konfirmasi ketersediaan dan total pembayaran. Terima kasih!*`;
  window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
  const historyItem = {
    ...checkoutData,
    items: cart.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
    customerName: checkoutData.name,
    date: checkoutData.date_pickup,
    time: checkoutData.time_pickup
  };
  history.push(historyItem);
  saveHistory();
  cart = [];
  saveCart();
  updateCartUI();
  filterProducts();
  navigateTo('home', false);
  showToast("Pesanan terkirim! Keranjang dikosongkan.");
}
function switchCartTab(tab) {
  document.querySelectorAll('.cart-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cart-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.cart-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
  if (tab === 'riwayat') {
    renderHistory();
  }
}
document.addEventListener('DOMContentLoaded', loadData);
