/* ═══════════════════════════════════════════
   THE ONE MOTORS (ELSHARQAWY) — app.js
   Firebase Firestore + Storage + Admin Panel
═══════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const ADMIN_PASSWORD = 'THEONE2025'; // 🔑 غيّر كلمة المرور هنا لو حابب
const PHONE          = '971527220717'; // رقم الواتساب
const COLLECTION     = 'cars';

// ─────────────────────────────────────────
// FIREBASE INIT
// ─────────────────────────────────────────
// تم تحديث البيانات لمشروع elsharqawy-fe3fc
const firebaseConfig = {
  apiKey: "AIzaSyAZj00eNc4uqeze6XX8GiFKJRCrycAY6TA",
  authDomain: "elsharqawy-fe3fc.firebaseapp.com",
  projectId: "elsharqawy-fe3fc",
  storageBucket: "elsharqawy-fe3fc.firebasestorage.app",
  messagingSenderId: "1023496242550",
  appId: "1:1023496242550:web:9008bbf168b34b91dda657",
  measurementId: "G-L21QJNK2B0"
};

// تهيئة التطبيق (باستخدام النظام المتوافق مع الكود القديم)
const fbApp     = firebase.initializeApp(firebaseConfig);
const db        = firebase.firestore();
const storage   = firebase.storage();

// تفعيل التحليلات إذا كانت مدعومة في المتصفح
if (firebase.analytics) {
  firebase.analytics();
}

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let cars          = [];         // local cache
let currentFilter = 'all';
let specsData     = [];         // [{label, value}]
let selectedFile  = null;       // File object from picker
let existingImgUrl = '';        // URL of already-uploaded image (on edit)

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const fmtPrice = n => Number(n).toLocaleString('en-US');

function setFbStatus(state) {
  const dot = document.getElementById('fb-status');
  if (!dot) return; // حماية في حالة عدم وجود العنصر
  dot.className = '';
  if (state === 'ok')    dot.classList.add('connected');
  if (state === 'error') dot.classList.add('error');
  dot.title = state === 'ok' ? 'Firebase متصل ✓' : state === 'error' ? 'Firebase خطأ ✗' : 'Firebase...';
}

function showSaveMsg(text, type) {
  const el = document.getElementById('save-msg');
  el.textContent = text;
  el.className = 'admin-msg ' + type;
  if (type === 'success') setTimeout(() => { el.className = 'admin-msg'; }, 4000);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────
// FIRESTORE — real-time listener
// ─────────────────────────────────────────
function startFirestoreListener() {
  db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snapshot => {
        setFbStatus('ok');
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCars();
        buildFilters();
        if (document.getElementById('admin-panel').classList.contains('show')) {
          renderAdminList();
        }
      },
      err => {
        console.error('Firestore error:', err);
        setFbStatus('error');
      }
    );
}

// ─────────────────────────────────────────
// FIRESTORE — CRUD
// ─────────────────────────────────────────
async function addCarToFirestore(data) {
  return db.collection(COLLECTION).add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function updateCarInFirestore(id, data) {
  return db.collection(COLLECTION).doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteCarFromFirestore(id) {
  return db.collection(COLLECTION).doc(id).delete();
}

// ─────────────────────────────────────────
// STORAGE — Upload image from device
// ─────────────────────────────────────────
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    // Validate size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('حجم الصورة يتجاوز 5 ميجابايت'));
      return;
    }

    const ext       = file.name.split('.').pop().toLowerCase();
    // تم تغيير المجلد ليكون elsharqawy_cars للتنظيم
    const fileName  = `elsharqawy_cars/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storageRef = storage.ref(fileName);
    const uploadTask = storageRef.put(file);

    // Show progress bar
    const progressWrap = document.getElementById('upload-progress-wrap');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressText = document.getElementById('upload-progress-text');
    progressWrap.style.display = 'flex';

    uploadTask.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `جاري الرفع على Firebase... ${pct}%`;
      },
      err => {
        progressWrap.style.display = 'none';
        reject(err);
      },
      async () => {
        progressText.textContent = '✅ اكتمل الرفع!';
        setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);
        const url = await uploadTask.snapshot.ref.getDownloadURL();
        resolve(url);
      }
    );
  });
}

// ─────────────────────────────────────────
// IMAGE PICKER UI
// ─────────────────────────────────────────
function initImagePicker() {
  const fileInput   = document.getElementById('f-img-file');
  const uploadArea  = document.getElementById('upload-area');
  const placeholder = document.getElementById('upload-placeholder');
  const preview     = document.getElementById('upload-preview');
  const previewImg  = document.getElementById('preview-img');
  const changeBtn   = document.getElementById('change-img-btn');
  const removeBtn   = document.getElementById('remove-img-btn');

  if(!fileInput) return; // حماية من الأخطاء لو العنصر مش موجود

  // Click on area → open file picker
  uploadArea.addEventListener('click', e => {
    if (e.target === changeBtn || e.target === removeBtn) return;
    fileInput.click();
  });

  // Drag & drop
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFileSelected(f);
  });

  // File selected via input
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
  });

  // Change image button
  changeBtn.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  // Remove image button
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    clearImagePicker();
  });

  function handleFileSelected(file) {
    selectedFile = file;
    existingImgUrl = '';
    document.getElementById('f-img-url').value = '';

    const reader = new FileReader();
    reader.onload = ev => {
      previewImg.src = ev.target.result;
      placeholder.style.display = 'none';
      preview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
}

function clearImagePicker() {
  selectedFile   = null;
  existingImgUrl = '';
  document.getElementById('f-img-url').value = '';
  document.getElementById('f-img-file').value = '';
  document.getElementById('preview-img').src  = '';
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('upload-preview').style.display     = 'none';
  document.getElementById('upload-progress-wrap').style.display = 'none';
  document.getElementById('upload-progress-fill').style.width   = '0%';
}

function setImagePreview(url) {
  if (!url) { clearImagePicker(); return; }
  existingImgUrl = url;
  selectedFile   = null;
  document.getElementById('f-img-url').value   = url;
  document.getElementById('preview-img').src   = url;
  document.getElementById('upload-placeholder').style.display = 'none';
  document.getElementById('upload-preview').style.display     = 'flex';
}

// ─────────────────────────────────────────
// RENDER CARS
// ─────────────────────────────────────────
function renderCars() {
  const grid = document.getElementById('cars-grid');
  if (!grid) return;

  document.getElementById('stat-cars').textContent = cars.length;

  const filtered = currentFilter === 'all'
    ? cars
    : cars.filter(c => c.type === currentFilter);

  if (!filtered.length) {
    grid.innerHTML = `<div class="loading-state" style="color:var(--text-light);">لا توجد سيارات في هذه الفئة</div>`;
    return;
  }

  grid.innerHTML = filtered.map(car => {
    const specs = Array.isArray(car.specs) ? car.specs : [];
    // عرض أول 3 مواصفات
    const previewSpecs = specs.slice(0, 3).map(s =>
      `<div class="spec"><span class="spec-icon">▸</span>${escHtml(s.label)}: ${escHtml(s.value)}</div>`
    ).join('');

    const imgHTML = car.img
      ? `<img src="${escHtml(car.img)}" alt="${escHtml(car.name)}" class="car-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=car-img-placeholder>🚗</div>'">`
      : `<div class="car-img-placeholder">🚗<small style="font-size:.75rem;margin-top:.5rem;color:var(--text-light);">${escHtml(car.name||'').split(' ')[0]}</small></div>`;

    return `
      <div class="car-card" onclick="openModal('${car.id}')">
        <div class="car-img-wrap">
          ${imgHTML}
          <div class="car-badge">NEW</div>
          ${specs[0] ? `<div class="car-km-badge">${escHtml(specs[0].value)}</div>` : ''}
        </div>
        <div class="car-info">
          <div class="car-year">${escHtml(String(car.year||''))}${car.type ? ' · ' + escHtml(car.type) : ''}</div>
          <div class="car-name">${escHtml(car.name||'')}</div>
          <div class="car-specs">${previewSpecs}</div>
          <div class="car-footer">
            <div>
              <div class="car-price">AED ${fmtPrice(car.price||0)}</div>
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
// MODAL
// ─────────────────────────────────────────
function openModal(id) {
  const car = cars.find(c => c.id === id);
  if (!car) return;

  document.getElementById('modal-year').textContent  = `${car.year || ''}${car.type ? ' · ' + car.type : ''}`;
  document.getElementById('modal-title').textContent = car.name || '';
  document.getElementById('modal-price').textContent = 'AED ' + fmtPrice(car.price || 0);

  const imgHTML = car.img
    ? `<img src="${escHtml(car.img)}" alt="${escHtml(car.name)}" style="width:100%;height:100%;object-fit:cover;">`
    : `<div class="car-img-placeholder" style="height:260px;">🚗</div>`;

  document.getElementById('modal-imgs').innerHTML = `
    <div class="modal-main-img">${imgHTML}</div>
    <div class="modal-thumb-col">
      <div class="modal-thumb" style="overflow:hidden;">${imgHTML}</div>
      <div class="modal-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:2rem;background:var(--off-white);">★</div>
    </div>`;

  const specs = Array.isArray(car.specs) ? car.specs : [];
  document.getElementById('modal-specs').innerHTML = specs.length
    ? specs.map(s => `
        <div class="modal-spec-item">
          <div class="modal-spec-label">${escHtml(s.label)}</div>
          <div class="modal-spec-val">${escHtml(s.value)}</div>
        </div>`).join('')
    : '<div class="modal-spec-item" style="grid-column:1/-1;color:var(--text-light);">لا توجد مواصفات مضافة</div>';

  const msg = encodeURIComponent(
    `السلام عليكم، أنا مهتم بسيارة ${car.year || ''} ${car.name || ''} بسعر ${fmtPrice(car.price || 0)} AED. هل ما زالت متاحة؟`
  );
  document.getElementById('modal-wa-btn').href = `https://wa.me/${PHONE}?text=${msg}`;

  document.getElementById('car-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('car-modal').classList.remove('open');
  document.body.style.overflow = '';
}

// Event Listeners for Modal
const carModal = document.getElementById('car-modal');
if (carModal) {
    carModal.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
}
const modalCloseBtn = document.getElementById('modal-close-btn');
if(modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

// ─────────────────────────────────────────
// ADMIN — Hidden Access
// 5 clicks on logo  OR  #admin-2025 in URL
// ─────────────────────────────────────────
let logoClicks = 0, logoTimer;
const logoTrigger = document.getElementById('logo-trigger');
if (logoTrigger) {
    logoTrigger.addEventListener('click', e => {
      e.preventDefault();
      logoClicks++;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoClicks = 0; }, 900);
      if (logoClicks >= 5) { logoClicks = 0; openAdmin(); }
    });
}

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#admin-2025') openAdmin();
});
if (window.location.hash === '#admin-2025') openAdmin();

function openAdmin() {
  document.getElementById('admin-overlay').classList.add('open');
  document.getElementById('admin-login').style.display = 'block';
  document.getElementById('admin-panel').classList.remove('show');
  document.getElementById('admin-pass').value = '';
  document.getElementById('pass-msg').className = 'admin-msg';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('admin-pass').focus(), 300);
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
if(adminPassInput) {
    adminPassInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') checkPass();
    });
}
const adminLoginBtn = document.getElementById('admin-login-btn');
if(adminLoginBtn) adminLoginBtn.addEventListener('click', checkPass);

function checkPass() {
  const val = document.getElementById('admin-pass').value;
  const msg = document.getElementById('pass-msg');
  if (val === ADMIN_PASSWORD) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').classList.add('show');
    renderAdminList();
    resetAdminForm();
    msg.className = 'admin-msg';
  } else {
    msg.textContent = '❌ كلمة المرور غير صحيحة';
    msg.className = 'admin-msg error';
  }
}

// ─────────────────────────────────────────
// ADMIN — Car List
// ─────────────────────────────────────────
function renderAdminList() {
  const list = document.getElementById('admin-cars-list');
  if (!cars.length) {
    list.innerHTML = '<div style="color:var(--text-light);font-size:.9rem;padding:.5rem;">لا توجد سيارات — أضف أول سيارة أدناه</div>';
    return;
  }
  list.innerHTML = cars.map(car => `
    <div class="admin-car-item">
      <div>
        ${car.img ? `<img src="${escHtml(car.img)}" style="width:60px;height:45px;object-fit:cover;border:1px solid var(--border);margin-bottom:.3rem;">` : ''}
        <div class="admin-car-name">${escHtml(String(car.year||''))} ${escHtml(car.name||'')}</div>
        <div class="admin-car-price">AED ${fmtPrice(car.price||0)}${car.type ? ' · ' + escHtml(car.type) : ''} · ${Array.isArray(car.specs)?car.specs.length:0} مواصفة</div>
      </div>
      <div class="admin-car-actions">
        <button class="admin-btn-edit" onclick="editCar('${car.id}')">✏ تعديل</button>
        <button class="admin-btn-del"  onclick="deleteCar('${car.id}')">🗑 حذف</button>
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────
// ADMIN — Dynamic Specs
// ─────────────────────────────────────────
function renderSpecsUI() {
  const container = document.getElementById('specs-container');
  container.innerHTML = specsData.map((sp, i) => `
    <div class="spec-row" id="spec-row-${i}">
      <div>
        <div class="spec-row-label">اسم المواصفة</div>
        <input class="admin-input spec-label-input"
               data-index="${i}" data-field="label"
               value="${escHtml(sp.label)}"
               placeholder="مثال: المحرك، اللون الداخلي، الوقود...">
      </div>
      <div>
        <div class="spec-row-label">القيمة</div>
        <input class="admin-input spec-value-input"
               data-index="${i}" data-field="value"
               value="${escHtml(sp.value)}"
               placeholder="مثال: V8 5.0L، بيج، بنزين...">
      </div>
      <button class="remove-spec-btn" onclick="removeSpec(${i})">✕</button>
    </div>`).join('');

  // Live sync
  container.querySelectorAll('.spec-label-input, .spec-value-input').forEach(inp => {
    inp.addEventListener('input', () => {
      specsData[parseInt(inp.dataset.index)][inp.dataset.field] = inp.value;
    });
  });
}

window.removeSpec = function(idx) {
  specsData.splice(idx, 1);
  renderSpecsUI();
};

const addSpecBtn = document.getElementById('add-spec-btn');
if(addSpecBtn) {
    addSpecBtn.addEventListener('click', () => {
      specsData.push({ label: '', value: '' });
      renderSpecsUI();
      const inputs = document.querySelectorAll('.spec-label-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
}

// ─────────────────────────────────────────
// ADMIN — Save Car (Add or Edit)
// ─────────────────────────────────────────
const saveCarBtn = document.getElementById('save-car-btn');
if(saveCarBtn) saveCarBtn.addEventListener('click', saveCarAdmin);

async function saveCarAdmin() {
  const year   = parseInt(document.getElementById('f-year').value)  || 0;
  const name   = document.getElementById('f-name').value.trim();
  const price  = parseInt(document.getElementById('f-price').value) || 0;
  const type   = document.getElementById('f-type').value.trim();
  const editId = document.getElementById('edit-id').value;

  if (!year || !name || !price) {
    showSaveMsg('⚠ يرجى ملء السنة والاسم والسعر على الأقل', 'error');
    return;
  }

  const saveBtn = document.getElementById('save-car-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ جاري الحفظ...';

  try {
    // Upload image if new file selected
    let imgUrl = existingImgUrl || document.getElementById('f-img-url').value || '';
    if (selectedFile) {
      showSaveMsg('📤 جاري رفع الصورة...', 'success');
      imgUrl = await uploadImage(selectedFile);
    }

    const cleanSpecs = specsData.filter(s => s.label.trim() || s.value.trim());
    const payload = { year, name, price, type, img: imgUrl, specs: cleanSpecs };

    if (editId) {
      await updateCarInFirestore(editId, payload);
      showSaveMsg('✅ تم تعديل السيارة بنجاح على Firebase', 'success');
      cancelEdit();
    } else {
      await addCarToFirestore(payload);
      showSaveMsg('✅ تم إضافة السيارة بنجاح على Firebase', 'success');
      resetAdminForm();
    }
  } catch (err) {
    console.error(err);
    showSaveMsg('❌ خطأ: ' + (err.message || 'تعذّر الحفظ'), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 حفظ السيارة على Firebase';
  }
}

// ─────────────────────────────────────────
// ADMIN — Delete
// ─────────────────────────────────────────
window.deleteCar = async function(id) {
  if (!confirm('هل أنت متأكد من حذف هذه السيارة؟ لا يمكن التراجع.')) return;
  try {
    await deleteCarFromFirestore(id);
  } catch (err) {
    alert('خطأ في الحذف: ' + err.message);
  }
};

// ─────────────────────────────────────────
// ADMIN — Edit
// ─────────────────────────────────────────
window.editCar = function(id) {
  const car = cars.find(c => c.id === id);
  if (!car) return;

  document.getElementById('edit-id').value = car.id;
  document.getElementById('f-year').value  = car.year  || '';
  document.getElementById('f-name').value  = car.name  || '';
  document.getElementById('f-price').value = car.price || '';
  document.getElementById('f-type').value  = car.type  || '';

  // Image
  setImagePreview(car.img || '');

  // Specs
  specsData = Array.isArray(car.specs) ? car.specs.map(s => ({ ...s })) : [];
  renderSpecsUI();

  document.getElementById('form-section-title').textContent    = '✏ تعديل سيارة';
  document.getElementById('cancel-edit-btn').style.display     = 'inline-block';
  document.getElementById('f-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const cancelEditBtn = document.getElementById('cancel-edit-btn');
if(cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);

function cancelEdit() {
  document.getElementById('edit-id').value                  = '';
  document.getElementById('form-section-title').textContent = 'إضافة سيارة جديدة';
  document.getElementById('cancel-edit-btn').style.display  = 'none';
  resetAdminForm();
}

function resetAdminForm() {
  ['f-year', 'f-name', 'f-price', 'f-type'].forEach(id => {
    document.getElementById(id).value = '';
  });
  clearImagePicker();
  specsData = [
    { label: 'الكيلومترات',   value: '' },
    { label: 'ناقل الحركة',   value: '' },
    { label: 'اللون الخارجي', value: '' },
    { label: 'اللون الداخلي', value: '' }
  ];
  renderSpecsUI();
}

// ─────────────────────────────────────────
// CONTACT FORM
// ─────────────────────────────────────────
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault();
      const btn  = e.target.querySelector('button[type="submit"]');
      const orig = btn.textContent;
      btn.textContent       = '✅ تم الإرسال';
      btn.style.background  = '#27ae60';
      setTimeout(() => {
        btn.textContent      = orig;
        btn.style.background = '';
        e.target.reset();
      }, 3000);
    });
}

// ─────────────────────────────────────────
// NAVBAR SCROLL
// ─────────────────────────────────────────
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
    startFirestoreListener();   // loads cars from Firebase in real-time
  }, 1200);
});

// Make openModal accessible from HTML
window.openModal = openModal;