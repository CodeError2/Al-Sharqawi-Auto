/* ═══════════════════════════════════════════
   THE ONE MOTORS (ELSHARQAWY) — app.js
   Supabase + Admin Auth + Image Compression + Multi-Images + Viewer.js
═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// CONFIG & SUPABASE INIT
// ─────────────────────────────────────────
const ADMIN_PASSWORD = 'THEONE2025'; 
const PHONE          = '971527220717';

const SUPABASE_URL = 'https://ecypcamzkpclawenifhd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Yg2KGbzrctSyJyZYqjpmHw_0Z6_0A7H';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let cars            = []; 
let currentFilter   = 'all';
let specsData       = []; 
let selectedFiles   = [];  
let existingImgUrls = [];  

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const fmtPrice = n => Number(n).toLocaleString('en-US');

function setFbStatus(state) {
  const dot = document.getElementById('fb-status');
  if (!dot) return;
  dot.className = '';
  if (state === 'ok')    dot.classList.add('connected');
  if (state === 'error') dot.classList.add('error');
  dot.title = state === 'ok' ? 'قاعدة البيانات متصلة ✓' : state === 'error' ? 'خطأ في الاتصال ✗' : 'جاري الاتصال...';
}

function showSaveMsg(text, type) {
  const el = document.getElementById('save-msg');
  if(!el) return;
  el.textContent = text;
  el.className = 'admin-msg ' + type;
  if (type === 'success') setTimeout(() => { el.className = 'admin-msg'; }, 4000);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getCarImages(imgData) {
  if (!imgData) return [];
  try {
    const parsed = JSON.parse(imgData);
    return Array.isArray(parsed) ? parsed : [imgData];
  } catch (e) {
    return [imgData];
  }
}

// ─────────────────────────────────────────
// SUPABASE — Fetch & Listen
// ─────────────────────────────────────────
async function fetchCars() {
  const { data, error } = await _supabase.from('cars').select('*').order('id', { ascending: false });
  if (error) { console.error('Database error:', error); setFbStatus('error'); return; }
  
  setFbStatus('ok');
  cars = data || [];
  renderCars();
  buildFilters();
  if (document.getElementById('admin-panel').classList.contains('show')) {
    renderAdminList();
  }
}

async function startDatabaseListener() {
  await fetchCars();
  _supabase.channel('public:cars').on('postgres_changes', { event: '*', schema: 'public', table: 'cars' }, payload => {
      fetchCars(); 
  }).subscribe();
}

// ─────────────────────────────────────────
// SUPABASE — CRUD
// ─────────────────────────────────────────
async function addCarToDatabase(data) {
  const { error } = await _supabase.from('cars').insert([data]);
  if (error) throw error;
}
async function updateCarInDatabase(id, data) {
  const { error } = await _supabase.from('cars').update(data).eq('id', id);
  if (error) throw error;
}
async function deleteCarFromDatabase(id) {
  const { error } = await _supabase.from('cars').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// IMAGE COMPRESSION & MULTI-UPLOAD
// ─────────────────────────────────────────
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width *= maxHeight / height)); height = maxHeight; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('فشل ضغط الصورة'));
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
}

async function uploadMultipleImages(files) {
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');
  
  progressWrap.style.display = 'flex';
  let uploadedUrls = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progressText.textContent = `جاري ضغط ورفع الصورة ${i + 1} من ${files.length}... ⏳`;
    progressFill.style.width = `${((i) / files.length) * 100}%`;
    
    if (file.size > 10 * 1024 * 1024) throw new Error('حجم إحدى الصور كبير جداً');
    
    const compressedFile = await compressImage(file);
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    
    const { error } = await _supabase.storage.from('cars_images').upload(fileName, compressedFile, { cacheControl: '3600', upsert: false });
    if (error) { progressWrap.style.display = 'none'; throw error; }

    const { data: publicUrlData } = _supabase.storage.from('cars_images').getPublicUrl(fileName);
    uploadedUrls.push(publicUrlData.publicUrl);
    
    progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
  }

  progressText.textContent = '✅ اكتمل رفع جميع الصور!';
  setTimeout(() => { progressWrap.style.display = 'none'; progressFill.style.width = '0%'; }, 1500);
  return uploadedUrls;
}

// ─────────────────────────────────────────
// IMAGE PICKER UI (Multi Support)
// ─────────────────────────────────────────
function initImagePicker() {
  const fileInput   = document.getElementById('f-img-file');
  const uploadArea  = document.getElementById('upload-area');

  if(!fileInput) return;

  uploadArea.addEventListener('click', e => {
    if (e.target.closest('.change-img-btn') || e.target.closest('.remove-img-btn')) return;
    fileInput.click();
  });

  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) handleFilesSelected(files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFilesSelected(Array.from(fileInput.files));
  });

  function handleFilesSelected(files) {
    selectedFiles = [...selectedFiles, ...files];
    renderPreviews();
  }
}

function renderPreviews() {
  const preview     = document.getElementById('upload-preview');
  const placeholder = document.getElementById('upload-placeholder');
  
  let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-bottom:15px;">';
  existingImgUrls.forEach(url => {
    html += `<div style="position:relative;">
               <img src="${escHtml(url)}" style="height:80px; width:80px; object-fit:cover; border-radius:8px; border:2px solid var(--border);">
             </div>`;
  });
  
  selectedFiles.forEach((file, index) => {
    html += `<div style="position:relative;">
               <img src="${URL.createObjectURL(file)}" style="height:80px; width:80px; object-fit:cover; border-radius:8px; border:2px solid var(--gold);">
               <div style="position:absolute; top:-6px; right:-6px; background:var(--gold); color:#fff; width:22px; height:22px; border-radius:50%; font-size:11px; display:flex; align-items:center; justify-content:center; font-weight:bold;">${index+1}</div>
             </div>`;
  });
  
  html += '</div><div class="upload-preview-actions"><button type="button" class="change-img-btn" id="dyn-change-btn">➕ إضافة صور أخرى</button><button type="button" class="remove-img-btn" id="dyn-remove-btn">🗑 حذف الكل</button></div>';
  
  preview.innerHTML = html;
  placeholder.style.display = 'none';
  preview.style.display = 'flex';
  
  document.getElementById('dyn-change-btn').addEventListener('click', e => { e.stopPropagation(); document.getElementById('f-img-file').click(); });
  document.getElementById('dyn-remove-btn').addEventListener('click', e => { e.stopPropagation(); clearImagePicker(); });
}

function clearImagePicker() {
  selectedFiles = [];
  existingImgUrls = [];
  if(document.getElementById('f-img-file')) document.getElementById('f-img-file').value = '';
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('upload-preview').style.display     = 'none';
  document.getElementById('upload-preview').innerHTML         = '';
  document.getElementById('upload-progress-wrap').style.display = 'none';
}

function setImagePreview(urls) {
  if (!urls || urls.length === 0) { clearImagePicker(); return; }
  existingImgUrls = urls;
  selectedFiles   = [];
  renderPreviews();
}

// ─────────────────────────────────────────
// RENDER CARS
// ─────────────────────────────────────────
function renderCars() {
  const grid = document.getElementById('cars-grid');
  if (!grid) return;

  document.getElementById('stat-cars').textContent = cars.length;
  const filtered = currentFilter === 'all' ? cars : cars.filter(c => c.type === currentFilter);

  if (!filtered.length) {
    grid.innerHTML = `<div class="loading-state" style="color:var(--text-light);">لا توجد سيارات في هذه الفئة</div>`;
    return;
  }

  grid.innerHTML = filtered.map(car => {
    const specs = Array.isArray(car.specs) ? car.specs : [];
    const previewSpecs = specs.slice(0, 3).map(s => `<div class="spec"><span class="spec-icon">▸</span>${escHtml(s.label)}: ${escHtml(s.value)}</div>`).join('');
    
    const images = getCarImages(car.img);
    const coverImg = images.length > 0 ? images[0] : ''; 

    const imgHTML = coverImg
      ? `<img src="${escHtml(coverImg)}" alt="${escHtml(car.name)}" class="car-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=car-img-placeholder>🚗</div>'">`
      : `<div class="car-img-placeholder">🚗<small style="font-size:.75rem;margin-top:.5rem;color:var(--text-light);">${escHtml(car.name||'').split(' ')[0]}</small></div>`;

    return `
      <div class="car-card" onclick="openModal('${car.id}')">
        <div class="car-img-wrap">
          ${imgHTML}
          ${images.length > 1 ? `<div class="car-badge" style="background:var(--text); left:1rem; right:auto;">${images.length} صور 📸</div>` : ''}
          <div class="car-badge">NEW</div>
          ${specs[0] ? `<div class="car-km-badge">${escHtml(specs[0].value)}</div>` : ''}
        </div>
        <div class="car-info">
          <div class="car-year">${escHtml(String(car.year||''))}${car.type ? ' · ' + escHtml(car.type) : ''}</div>
          <div class="car-name">${escHtml(car.name||'')}</div>
          <div class="car-specs">${previewSpecs}</div>
          <div class="car-footer">
            <div>
              <div class="car-price">EGP ${fmtPrice(car.price||0)}</div>
              <div class="car-price-sub">السعر شامل الضريبة</div>
            </div>
            <button class="car-cta">تفاصيل</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
// FILTER TABS
// ─────────────────────────────────────────
function buildFilters() {
  const container = document.getElementById('filters');
  if (!container) return;
  const types = ['all', ...new Set(cars.map(c => c.type).filter(Boolean))];
  container.innerHTML = types.map(t => `
    <button class="filter-btn ${t === currentFilter ? 'active' : ''}" data-filter="${t}">
      ${t === 'all' ? 'الكل' : escHtml(t)}
    </button>`).join('');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCars();
    });
  });
}

// ─────────────────────────────────────────
// MODAL (عرض تفاصيل السيارة) + Viewer.js
// ─────────────────────────────────────────
function openModal(id) {
  const car = cars.find(c => c.id == id);
  if (!car) return;

  document.getElementById('modal-year').textContent  = `${car.year || ''}${car.type ? ' · ' + car.type : ''}`;
  document.getElementById('modal-title').textContent = car.name || '';
  document.getElementById('modal-price').textContent = 'EGP ' + fmtPrice(car.price || 0);

  const images = getCarImages(car.img);
  const mainImgSrc = images.length > 0 ? images[0] : '';

  const mainImgHTML = mainImgSrc
    ? `<img id="modal-main-image" src="${escHtml(mainImgSrc)}" alt="${escHtml(car.name)}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;">`
    : `<div class="car-img-placeholder" style="height:260px;">🚗</div>`;

  let thumbsHTML = '';
  if (images.length > 1) {
    thumbsHTML = images.map(url => `
      <div class="modal-thumb" style="cursor:pointer; flex-shrink:0;" onclick="updateMainImage('${escHtml(url)}')">
        <img src="${escHtml(url)}" style="width:100%;height:100%;object-fit:cover; border:1px solid var(--border);">
      </div>
    `).join('');
  } else {
    thumbsHTML = `<div class="modal-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:2rem;background:var(--off-white);">★</div>`;
  }

  document.getElementById('modal-imgs').innerHTML = `
    <div class="modal-main-img">${mainImgHTML}</div>
    <div class="modal-thumb-col" style="overflow-y:auto; max-height:380px;">
      ${thumbsHTML}
    </div>`;

  const specs = Array.isArray(car.specs) ? car.specs : [];
  document.getElementById('modal-specs').innerHTML = specs.length
    ? specs.map(s => `<div class="modal-spec-item"><div class="modal-spec-label">${escHtml(s.label)}</div><div class="modal-spec-val">${escHtml(s.value)}</div></div>`).join('')
    : '<div class="modal-spec-item" style="grid-column:1/-1;color:var(--text-light);">لا توجد مواصفات مضافة</div>';

  const msg = encodeURIComponent(`السلام عليكم، أنا مهتم بسيارة ${car.year || ''} ${car.name || ''} بسعر ${fmtPrice(car.price || 0)} EGP. هل ما زالت متاحة؟`);
  document.getElementById('modal-wa-btn').href = `https://wa.me/${PHONE}?text=${msg}`;

  document.getElementById('car-modal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // 🔴 تشغيل مكتبة Viewer.js للزوم
  if (window.carViewer) { window.carViewer.destroy(); }
  const mainImgEl = document.getElementById('modal-main-image');
  if (mainImgEl) {
    window.carViewer = new Viewer(mainImgEl, {
      navbar: false, toolbar: true, title: false, button: true,
      movable: true, zoomable: true, rotatable: false, scalable: false, transition: true
    });
  }
}

// تحديث الصورة الرئيسية من المصغرات
window.updateMainImage = function(url) {
  const mainImg = document.getElementById('modal-main-image');
  if(mainImg) {
    mainImg.src = url;
    if (window.carViewer) { window.carViewer.update(); }
  }
};

// 🔴 دالة الإغلاق المظبوطة (لإغلاق المودال وتنظيف الزوم)
function closeModal() {
  document.getElementById('car-modal').classList.remove('open');
  document.body.style.overflow = '';
  
  // تدمير الزوم في الخلفية عشان ميعملش بلوك للزراير
  if (window.carViewer) {
    window.carViewer.destroy();
    window.carViewer = null;
  }
}

// 🔴 ربط زرار الـ X بدالة الإغلاق
const modalCloseBtn = document.getElementById('modal-close-btn');
if(modalCloseBtn) modalCloseBtn.onclick = closeModal;

// 🔴 ربط الخلفية السوداء بدالة الإغلاق
const carModal = document.getElementById('car-modal');
if (carModal) {
  carModal.onclick = e => { 
    if (e.target === carModal) closeModal(); 
  };
}

window.openModal = openModal;

// ─────────────────────────────────────────
// ADMIN LOGIN (ميزة تذكر الأدمن + الدخول السري بـ 7 ضغطات)
// ─────────────────────────────────────────
let secretClicks = 0, secretTimer;
const adminTrigger = document.getElementById('admin-trigger-link');

if (adminTrigger) {
    adminTrigger.addEventListener('click', () => {
      secretClicks++;
      clearTimeout(secretTimer);
      if (secretClicks >= 7) { secretClicks = 0; openAdmin(); }
      secretTimer = setTimeout(() => { secretClicks = 0; }, 2000);
    });
}

window.addEventListener('hashchange', () => { if (window.location.hash === '#admin-2025') openAdmin(); });
if (window.location.hash === '#admin-2025') openAdmin();

function openAdmin() {
  document.getElementById('admin-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  if (localStorage.getItem('theOneAdminAuth') === 'true') {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').classList.add('show');
    renderAdminList();
    resetAdminForm();
  } else {
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-panel').classList.remove('show');
    document.getElementById('admin-pass').value = '';
    const msg = document.getElementById('pass-msg');
    if(msg) msg.className = 'admin-msg';
    setTimeout(() => document.getElementById('admin-pass').focus(), 300);
  }
}

function closeAdmin() {
  document.getElementById('admin-overlay').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', window.location.pathname);
}

const adminCancelBtn = document.getElementById('admin-cancel-btn');
if(adminCancelBtn) adminCancelBtn.addEventListener('click', closeAdmin);
const adminCloseBtn = document.getElementById('admin-close-btn');
if(adminCloseBtn) adminCloseBtn.addEventListener('click', closeAdmin);
const adminPassInput = document.getElementById('admin-pass');
if(adminPassInput) adminPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPass(); });
const adminLoginBtn = document.getElementById('admin-login-btn');
if(adminLoginBtn) adminLoginBtn.addEventListener('click', checkPass);

function checkPass() {
  const val = document.getElementById('admin-pass').value;
  const msg = document.getElementById('pass-msg');
  if (val === ADMIN_PASSWORD) {
    localStorage.setItem('theOneAdminAuth', 'true');
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').classList.add('show');
    renderAdminList();
    resetAdminForm();
    if(msg) msg.className = 'admin-msg';
  } else {
    if(msg) { msg.textContent = '❌ كلمة المرور غير صحيحة'; msg.className = 'admin-msg error'; }
  }
}

window.logoutAdmin = function() {
  localStorage.removeItem('theOneAdminAuth');
  document.getElementById('admin-panel').classList.remove('show');
  document.getElementById('admin-login').style.display = 'block';
  document.getElementById('admin-pass').value = '';
};

// ─────────────────────────────────────────
// ADMIN — Car List
// ─────────────────────────────────────────
function renderAdminList() {
  const list = document.getElementById('admin-cars-list');
  if (!cars.length) {
    list.innerHTML = '<div style="color:var(--text-light);font-size:.9rem;padding:.5rem;">لا توجد سيارات — أضف أول سيارة أدناه</div>';
    return;
  }
  list.innerHTML = cars.map(car => {
    const images = getCarImages(car.img);
    const coverThumb = images.length > 0 ? images[0] : '';
    return `
    <div class="admin-car-item">
      <div>
        ${coverThumb ? `<img src="${escHtml(coverThumb)}" style="width:60px;height:45px;object-fit:cover;border:1px solid var(--border);margin-bottom:.3rem;">` : ''}
        <div class="admin-car-name">${escHtml(String(car.year||''))} ${escHtml(car.name||'')}</div>
        <div class="admin-car-price">EGP ${fmtPrice(car.price||0)}${car.type ? ' · ' + escHtml(car.type) : ''} · ${images.length} صور</div>
      </div>
      <div class="admin-car-actions">
        <button class="admin-btn-edit" onclick="editCar('${car.id}')">✏ تعديل</button>
        <button class="admin-btn-del"  onclick="deleteCar('${car.id}')">🗑 حذف</button>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────
// ADMIN — Specs & Save
// ─────────────────────────────────────────
function renderSpecsUI() {
  const container = document.getElementById('specs-container');
  container.innerHTML = specsData.map((sp, i) => `
    <div class="spec-row" id="spec-row-${i}">
      <div>
        <div class="spec-row-label">اسم المواصفة</div>
        <input class="admin-input spec-label-input" data-index="${i}" data-field="label" value="${escHtml(sp.label)}" placeholder="مثال: المحرك...">
      </div>
      <div>
        <div class="spec-row-label">القيمة</div>
        <input class="admin-input spec-value-input" data-index="${i}" data-field="value" value="${escHtml(sp.value)}" placeholder="مثال: V8...">
      </div>
      <button class="remove-spec-btn" onclick="removeSpec(${i})">✕</button>
    </div>`).join('');

  container.querySelectorAll('.spec-label-input, .spec-value-input').forEach(inp => {
    inp.addEventListener('input', () => { specsData[parseInt(inp.dataset.index)][inp.dataset.field] = inp.value; });
  });
}

window.removeSpec = function(idx) { specsData.splice(idx, 1); renderSpecsUI(); };
const addSpecBtn = document.getElementById('add-spec-btn');
if(addSpecBtn) addSpecBtn.addEventListener('click', () => { specsData.push({ label: '', value: '' }); renderSpecsUI(); });

const saveCarBtn = document.getElementById('save-car-btn');
if(saveCarBtn) saveCarBtn.addEventListener('click', saveCarAdmin);

async function saveCarAdmin() {
  const year   = parseInt(document.getElementById('f-year').value)  || 0;
  const name   = document.getElementById('f-name').value.trim();
  const price  = parseInt(document.getElementById('f-price').value) || 0;
  const type   = document.getElementById('f-type').value.trim();
  const editId = document.getElementById('edit-id').value;

  if (!year || !name || !price) {
    showSaveMsg('⚠ يرجى ملء السنة والاسم والسعر على الأقل', 'error');
    return;
  }

  const saveBtn = document.getElementById('save-car-btn');
  saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...';

  try {
    let finalUrls = [...existingImgUrls];
    if (selectedFiles.length > 0) {
      showSaveMsg('📤 جاري رفع الصور...', 'success');
      const newUrls = await uploadMultipleImages(selectedFiles);
      finalUrls = [...finalUrls, ...newUrls]; 
    }

    const cleanSpecs = specsData.filter(s => s.label.trim() || s.value.trim());
    const payload = { year, name, price, type, img: JSON.stringify(finalUrls), specs: cleanSpecs };

    if (editId) {
      await updateCarInDatabase(editId, payload);
      showSaveMsg('✅ تم تعديل السيارة بنجاح', 'success');
      cancelEdit();
    } else {
      await addCarToDatabase(payload);
      showSaveMsg('✅ تم إضافة السيارة بنجاح', 'success');
      resetAdminForm();
    }
  } catch (err) {
    console.error(err); showSaveMsg('❌ خطأ: ' + (err.message || 'تعذّر الحفظ'), 'error');
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ السيارة';
  }
}

window.deleteCar = async function(id) {
  if (!confirm('هل أنت متأكد من حذف هذه السيارة؟ لا يمكن التراجع.')) return;
  try { await deleteCarFromDatabase(id); } catch (err) { alert('خطأ في الحذف: ' + err.message); }
};

window.editCar = function(id) {
  const car = cars.find(c => c.id == id);
  if (!car) return;

  document.getElementById('edit-id').value = car.id;
  document.getElementById('f-year').value  = car.year  || '';
  document.getElementById('f-name').value  = car.name  || '';
  document.getElementById('f-price').value = car.price || '';
  document.getElementById('f-type').value  = car.type  || '';

  setImagePreview(getCarImages(car.img));
  specsData = Array.isArray(car.specs) ? car.specs.map(s => ({ ...s })) : [];
  renderSpecsUI();

  document.getElementById('form-section-title').textContent    = '✏ تعديل سيارة';
  document.getElementById('cancel-edit-btn').style.display     = 'inline-block';
  document.getElementById('f-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const cancelEditBtn = document.getElementById('cancel-edit-btn');
if(cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);

function cancelEdit() {
  document.getElementById('edit-id').value                  = '';
  document.getElementById('form-section-title').textContent = 'إضافة سيارة جديدة';
  document.getElementById('cancel-edit-btn').style.display  = 'none';
  resetAdminForm();
}

function resetAdminForm() {
  ['f-year', 'f-name', 'f-price', 'f-type'].forEach(id => { document.getElementById(id).value = ''; });
  clearImagePicker();
  specsData = [
    { label: 'الكيلومترات',   value: '' }, { label: 'ناقل الحركة',   value: '' },
    { label: 'اللون الخارجي', value: '' }, { label: 'اللون الداخلي', value: '' }
  ];
  renderSpecsUI();
}

// ─────────────────────────────────────────
// CONTACT FORM & NAVBAR
// ─────────────────────────────────────────
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); const orig = btn.textContent;
      btn.textContent = '✅ تم الإرسال'; btn.style.background = '#27ae60';
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; e.target.reset(); }, 3000);
    });
}
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if(nav) nav.classList.toggle('scrolled', window.scrollY > 50);
});

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
window.addEventListener('load', () => {
  initImagePicker();
  setTimeout(() => {
    const loader = document.getElementById('loader');
    if(loader) loader.classList.add('hide');
    startDatabaseListener();
  }, 1200);
});
