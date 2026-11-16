// Locket Pro - Main Client Application Logic
// Developed with locket.js SDK by hmkk69

let currentUser = null;
let activeLocketAccount = null;
let allAccounts = [];
let allPresets = {};
let allCategories = [];
let selectedPresetKey = 'standard';
let activeCategory = 'all';
let currentFeedFilter = 'recent';
let selectedFile = null;
let webcamStream = null;
let activePeerUid = null;
let activePeerDetails = null;
let socket = null;

// ================= 1. AUTHENTICATION & INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  const isDev = urlParams.get('dev') === 'true';

  if (tokenFromUrl) {
    localStorage.setItem('locket_jwt_token', tokenFromUrl);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  let token = localStorage.getItem('locket_jwt_token');

  // Nếu chưa có token mà chọn dev mode thì auto login
  if (!token && isDev) {
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@tuananh.dev', displayName: 'Peter Tuan Anh' })
      });
      const data = await res.json();
      if (data.success && data.data.token) {
        token = data.data.token;
        localStorage.setItem('locket_jwt_token', token);
      }
    } catch (err) {
      console.error('Lỗi khi đăng nhập Dev:', err);
    }
  }

  if (!token) {
    window.location.href = '/';
    return;
  }

  // Khởi tạo Socket.io
  try {
    socket = io();
    socket.on('new_chat_message', (msg) => {
      if (activePeerUid && (msg.sender_uid === activePeerUid || msg.receiver_uid === activePeerUid)) {
        appendMessageBubble(msg);
      }
    });
  } catch (se) {
    console.warn('Socket.io không khả dụng:', se);
  }

  // Tải thông tin người dùng & tài khoản
  await checkAuthAndLoadUser();
  await loadPresets();
  await loadFeed();
  lucide.createIcons();
});

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('locket_jwt_token');
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  options.headers = headers;
  const response = await fetch(endpoint, options);
  if (response.status === 401) {
    localStorage.removeItem('locket_jwt_token');
    window.location.href = '/';
    return null;
  }
  return response.json();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-amber-600';
  toast.className = `${bg} text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-full');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function logout() {
  localStorage.removeItem('locket_jwt_token');
  window.location.href = '/';
}

async function checkAuthAndLoadUser() {
  const res = await apiFetch('/api/auth/me');
  if (res && res.success) {
    currentUser = res.data;
    await loadAccounts();
    await loadActiveAccount();
  }
}

// ================= 2. QUẢN LÝ ĐA TÀI KHOẢN (ACCOUNT SWITCHER) =================
async function loadAccounts() {
  const res = await apiFetch('/api/locket/accounts');
  if (res && res.success) {
    allAccounts = res.data;
    renderAccountsModalList();
  }
}

async function loadActiveAccount() {
  const res = await apiFetch('/api/locket/accounts/active');
  if (res && res.success && res.data.account) {
    activeLocketAccount = res.data.account;
    const profile = res.data.locketProfile || {};

    // Cập nhật Header
    document.getElementById('header-account-name').textContent = 
      (activeLocketAccount.first_name ? `${activeLocketAccount.first_name} ${activeLocketAccount.last_name || ''}` : activeLocketAccount.label) || 'Locket Account';
    document.getElementById('header-account-username').textContent = 
      activeLocketAccount.username ? `@${activeLocketAccount.username}` : activeLocketAccount.email;
    
    if (activeLocketAccount.avatar_url) {
      document.getElementById('header-account-avatar').src = activeLocketAccount.avatar_url;
      document.getElementById('profile-avatar').src = activeLocketAccount.avatar_url;
    }

    // Cập nhật Preview & Profile Tab
    document.getElementById('preview-user-name').textContent = document.getElementById('header-account-name').textContent;
    document.getElementById('preview-user-handle').textContent = document.getElementById('header-account-username').textContent;
    document.getElementById('profile-display-name').textContent = document.getElementById('header-account-name').textContent;
    document.getElementById('profile-username').textContent = document.getElementById('header-account-username').textContent;
    document.getElementById('profile-email').textContent = activeLocketAccount.email;
    document.getElementById('profile-uid').textContent = `UID: ${activeLocketAccount.id}`;
    
    document.getElementById('profile-input-firstname').value = activeLocketAccount.first_name || '';
    document.getElementById('profile-input-lastname').value = activeLocketAccount.last_name || '';
    
    if (profile.birthdate) {
      document.getElementById('profile-input-birthdate').value = profile.birthdate;
    }
  } else {
    // Nếu chưa có tài khoản nào
    document.getElementById('header-account-name').textContent = 'Chưa liên kết Locket';
    document.getElementById('header-account-username').textContent = 'Nhấn để thêm tài khoản';
  }
}

function renderAccountsModalList() {
  const container = document.getElementById('modal-accounts-list');
  if (!allAccounts.length) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-500 text-xs">
        <p>Bạn chưa liên kết tài khoản Locket nào.</p>
        <p class="mt-1">Hãy nhấn nút bên dưới để thêm tài khoản!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allAccounts.map(acc => `
    <div class="p-3.5 rounded-2xl ${acc.is_active ? 'bg-amber-500/10 border-amber-500/40' : 'bg-obsidian-850 border-white/[0.06]'} border flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <img src="${acc.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}" class="w-10 h-10 rounded-full object-cover border border-white/10">
        <div>
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-bold text-white">${acc.label}</h4>
            ${acc.is_active ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">Đang chọn</span>' : ''}
          </div>
          <p class="text-[11px] text-amber-400 font-mono">${acc.username ? '@' + acc.username : acc.email}</p>
          <p class="text-[10px] text-gray-500">${acc.device_model} (iOS ${acc.ios_version})</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        ${!acc.is_active ? `
          <button onclick="switchAccount('${acc.id}')" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition">
            Chọn
          </button>
        ` : ''}
        <button onclick="deleteAccount('${acc.id}')" title="Xóa tài khoản" class="p-1.5 rounded-xl text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

async function switchAccount(accountId) {
  const res = await apiFetch(`/api/locket/accounts/${accountId}/switch`, { method: 'POST' });
  if (res && res.success) {
    showToast(res.msg, 'success');
    closeAccountModal();
    await loadAccounts();
    await loadActiveAccount();
    await loadFeed();
  } else {
    showToast(res ? res.msg : 'Không thể chuyển tài khoản', 'error');
  }
}

async function submitAddAccount() {
  const label = document.getElementById('add-acc-label').value;
  const email = document.getElementById('add-acc-email').value;
  const password = document.getElementById('add-acc-password').value;
  const deviceModel = document.getElementById('add-acc-device').value;

  if (!email || !password) {
    showToast('Vui lòng nhập đầy đủ email và mật khẩu Locket', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-add-acc');
  btn.disabled = true;
  btn.innerHTML = `<div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div><span>Đang đăng nhập...</span>`;

  try {
    const res = await apiFetch('/api/locket/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, email, password, deviceModel })
    });

    if (res && res.success) {
      showToast(res.msg, 'success');
      closeAddAccountModal();
      await loadAccounts();
      await loadActiveAccount();
      await loadFeed();
    } else {
      showToast(res ? res.msg : 'Đăng nhập Locket thất bại', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Đăng nhập & Liên kết</span>`;
  }
}

async function deleteAccount(accountId) {
  if (!confirm('Bạn có chắc chắn muốn xóa liên kết tài khoản Locket này?')) return;
  const res = await apiFetch(`/api/locket/accounts/${accountId}`, { method: 'DELETE' });
  if (res && res.success) {
    showToast(res.msg, 'success');
    await loadAccounts();
    await loadActiveAccount();
    await loadFeed();
  }
}

function openAccountModal() {
  renderAccountsModalList();
  document.getElementById('modal-accounts').classList.remove('hidden');
  document.getElementById('modal-accounts').classList.add('flex');
  lucide.createIcons();
}
function closeAccountModal() {
  document.getElementById('modal-accounts').classList.add('hidden');
  document.getElementById('modal-accounts').classList.remove('flex');
}

function openAddAccountModal() {
  document.getElementById('modal-add-account').classList.remove('hidden');
  document.getElementById('modal-add-account').classList.add('flex');
}
function closeAddAccountModal() {
  document.getElementById('modal-add-account').classList.add('hidden');
  document.getElementById('modal-add-account').classList.remove('flex');
}

// ================= 3. TAB NAVIGATION =================
function switchTab(tabId) {
  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('bg-amber-500', 'text-black', 'shadow-lg', 'shadow-amber-500/20');
    btn.classList.add('text-gray-300');
  });

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-amber-500', 'text-black', 'shadow-lg', 'shadow-amber-500/20');
    activeBtn.classList.remove('text-gray-300');
  }

  const activeSec = document.getElementById(`section-${tabId}`);
  if (activeSec) {
    activeSec.classList.remove('hidden');
  }

  // Khởi tạo tác vụ riêng cho tab
  if (tabId === 'friends') loadFriends();
  if (tabId === 'chat') loadConversations();
  if (tabId === 'feed') loadFeed();

  // Dừng webcam nếu rời khỏi tab post
  if (tabId !== 'post' && webcamStream) {
    stopWebcam();
  }

  lucide.createIcons();
}

// ================= 4. TAB 1: BẢNG TIN (FEED) =================
function changeFeedFilter(filter) {
  currentFeedFilter = filter;
  ['recent', 'my', 'rollcall'].forEach(f => {
    const btn = document.getElementById(`feed-sub-${f}`);
    if (f === filter) {
      btn.className = "px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-black shadow-md transition flex items-center gap-1.5";
    } else {
      btn.className = "px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/[0.05] transition flex items-center gap-1.5";
    }
  });
  loadFeed();
}

async function loadFeed() {
  const container = document.getElementById('feed-container');
  container.innerHTML = `
    <div class="col-span-full py-16 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
      <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-sm">Đang tải bảng tin khoảnh khắc...</p>
    </div>
  `;

  let endpoint = '/api/locket/moments/feed';
  if (currentFeedFilter === 'my') endpoint = '/api/locket/moments/my';
  if (currentFeedFilter === 'rollcall') endpoint = '/api/locket/moments/rollcall';

  const res = await apiFetch(endpoint);
  if (!res || !res.success || !res.data || !res.data.length) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center text-gray-500 space-y-2">
        <i data-lucide="image-off" class="w-12 h-12 mx-auto text-gray-600"></i>
        <p class="text-sm font-semibold">Chưa có khoảnh khắc nào</p>
        <p class="text-xs text-gray-600">Hãy là người đầu tiên đăng khoảnh khắc cho bạn bè xem nhé!</p>
        <button onclick="switchTab('post')" class="mt-4 px-4 py-2 rounded-xl btn-locket text-xs font-bold">Đăng khoảnh khắc ngay</button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = res.data.map(moment => renderMomentCard(moment)).join('');
  lucide.createIcons();
}

function renderMomentCard(moment) {
  const authorName = moment.first_name ? `${moment.first_name} ${moment.last_name || ''}` : (moment.username || 'Bạn bè Locket');
  const authorAvatar = moment.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80';
  const timeStr = moment.date ? new Date(moment.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong';
  const isVideo = Boolean(moment.video_url);

  // Caption Pill
  let pillHtml = '';
  if (moment.caption || moment.overlay_info) {
    const text = moment.caption || '';
    const icon = moment.icon || '';
    pillHtml = `
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white shadow-xl flex items-center gap-1.5 whitespace-nowrap bg-black/80 backdrop-blur-md border border-white/10">
        ${icon ? `<span>${icon}</span>` : ''}
        <span>${text}</span>
      </div>
    `;
  }

  return `
    <div class="glass-panel rounded-3xl overflow-hidden border border-white/[0.08] hover:border-amber-500/30 transition flex flex-col">
      <!-- Card Header -->
      <div class="p-3.5 flex items-center justify-between border-b border-white/[0.06]">
        <div class="flex items-center gap-2.5">
          <img src="${authorAvatar}" class="w-8 h-8 rounded-full object-cover border border-amber-500/30">
          <div>
            <h4 class="text-xs font-bold text-white leading-tight">${authorName}</h4>
            <p class="text-[10px] text-gray-400 font-mono leading-tight">${timeStr}</p>
          </div>
        </div>
        <button class="text-gray-400 hover:text-white">
          <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>

      <!-- Media Viewport 1:1 -->
      <div class="relative aspect-square w-full bg-black overflow-hidden flex items-center justify-center">
        ${isVideo ? `
          <video src="${moment.video_url}" poster="${moment.thumbnail_url || ''}" controls playsinline class="w-full h-full object-cover"></video>
        ` : `
          <img src="${moment.thumbnail_url || moment.image_url}" alt="Moment" class="w-full h-full object-cover">
        `}
        ${pillHtml}
      </div>

      <!-- Card Actions -->
      <div class="p-3 flex items-center justify-between text-xs text-gray-400 border-b border-white/[0.04]">
        <button onclick="viewMomentViews('${moment.id || moment.uid}')" class="hover:text-amber-300 flex items-center gap-1.5">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>Lượt xem</span>
        </button>
        <button onclick="openChatWithAuthor('${moment.user || moment.user_uid}', '${authorName}', '${authorAvatar}')" class="hover:text-amber-300 flex items-center gap-1.5">
          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
          <span>Nhắn tin</span>
        </button>
      </div>

      <!-- Reaction Emojis Bar -->
      <div class="p-2.5 bg-obsidian-850/80 flex items-center justify-around text-base">
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '❤️')" class="hover:scale-125 transition">❤️</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '🔥')" class="hover:scale-125 transition">🔥</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '😍')" class="hover:scale-125 transition">😍</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '🥰')" class="hover:scale-125 transition">🥰</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '😂')" class="hover:scale-125 transition">😂</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '💛')" class="hover:scale-125 transition">💛</button>
        <button onclick="sendMomentReaction('${moment.id || moment.uid}', '🫶')" class="hover:scale-125 transition">🫶</button>
      </div>
    </div>
  `;
}

async function sendMomentReaction(momentUid, emoji) {
  const res = await apiFetch(`/api/locket/moments/${momentUid}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaction: emoji })
  });
  if (res && res.success) {
    showToast(`Đã thả ${emoji} vào khoảnh khắc!`, 'success');
  } else {
    showToast(res ? res.msg : 'Không thể thả cảm xúc', 'error');
  }
}

async function viewMomentViews(momentUid) {
  const modal = document.getElementById('modal-viewers');
  const content = document.getElementById('modal-viewers-content');
  content.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">Đang tải...</div>`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const res = await apiFetch(`/api/locket/moments/${momentUid}/views`);
  if (!res || !res.success || !res.data) {
    content.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">Chưa có người xem hoặc không có dữ liệu.</div>`;
    return;
  }

  const viewers = res.data.moment_views || [];
  const reactions = res.data.reactions || [];

  content.innerHTML = `
    <div class="py-2 text-xs">
      <p class="font-bold text-amber-400 mb-2">Tổng lượt xem: ${res.data.count || viewers.length}</p>
      ${viewers.map(v => `
        <div class="py-1.5 flex items-center justify-between text-gray-300">
          <span>UID: ${v.user_uid}</span>
          <span class="text-gray-500 text-[10px]">${new Date(v.viewed_at).toLocaleTimeString()}</span>
        </div>
      `).join('')}
    </div>
    <div class="py-2 text-xs">
      <p class="font-bold text-amber-400 mb-2">Cảm xúc (${reactions.length}):</p>
      <div class="flex flex-wrap gap-2">
        ${reactions.map(r => `
          <span class="px-2 py-1 rounded-lg bg-obsidian-800 border border-white/10 flex items-center gap-1">
            <span>${r.emoji}</span>
            <span class="text-[10px] text-gray-400">${r.sender}</span>
          </span>
        `).join('')}
      </div>
    </div>
  `;
}
function closeViewersModal() {
  document.getElementById('modal-viewers').classList.add('hidden');
  document.getElementById('modal-viewers').classList.remove('flex');
}

// ================= 5. TAB 2: ĐĂNG KHOẢNH KHẮC & 158 PRESETS =================
async function loadPresets() {
  const res = await apiFetch('/api/locket/moments/presets');
  if (res && res.success && res.data.presets) {
    allPresets = res.data.presets;
    allCategories = res.data.categories || [];
    renderCategories();
    renderPresets();
  }
}

function renderCategories() {
  const container = document.getElementById('presets-categories');
  let html = `<button onclick="selectCategory('all')" id="cat-all" class="cat-btn px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-black whitespace-nowrap">Tất cả (158)</button>`;
  
  allCategories.forEach(cat => {
    html += `
      <button onclick="selectCategory('${cat}')" id="cat-${cat.replace(/\s+/g, '_')}" class="cat-btn px-3 py-1 rounded-full text-[11px] font-semibold text-gray-400 hover:text-white bg-obsidian-850 border border-white/[0.08] whitespace-nowrap">
        ${cat}
      </button>
    `;
  });
  container.innerHTML = html;
}

function selectCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.className = "cat-btn px-3 py-1 rounded-full text-[11px] font-semibold text-gray-400 hover:text-white bg-obsidian-850 border border-white/[0.08] whitespace-nowrap";
  });
  const activeBtn = cat === 'all' ? document.getElementById('cat-all') : document.getElementById(`cat-${cat.replace(/\s+/g, '_')}`);
  if (activeBtn) {
    activeBtn.className = "cat-btn px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-black whitespace-nowrap";
  }
  renderPresets();
}

function filterPresets() {
  renderPresets();
}

function renderPresets() {
  const container = document.getElementById('presets-grid');
  const search = document.getElementById('preset-search-input').value.toLowerCase().trim();

  const filteredKeys = Object.keys(allPresets).filter(key => {
    const p = allPresets[key];
    const matchCategory = activeCategory === 'all' || p.section === activeCategory;
    const matchSearch = !search || key.toLowerCase().includes(search) || (p.text && p.text.toLowerCase().includes(search));
    return matchCategory && matchSearch;
  });

  container.innerHTML = filteredKeys.map(key => {
    const p = allPresets[key];
    const isSelected = selectedPresetKey === key;
    const bg = p.colors && p.colors.length >= 2 
      ? `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` 
      : (p.colors && p.colors.length === 1 ? p.colors[0] : '#1A1E26');
    const color = p.text_color || '#FFFFFF';

    return `
      <button onclick="selectPreset('${key}')" 
              class="p-2.5 rounded-xl border ${isSelected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-white/[0.08] hover:border-white/20'} flex flex-col justify-between text-left transition h-16 relative overflow-hidden"
              style="background: ${bg}; color: ${color};">
        <span class="text-[9px] uppercase font-bold tracking-wider opacity-60">${key}</span>
        <div class="flex items-center gap-1 text-xs font-bold truncate">
          ${p.icon ? `<span>${p.icon}</span>` : ''}
          <span class="truncate">${p.text || key}</span>
        </div>
        ${isSelected ? '<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"></span>' : ''}
      </button>
    `;
  }).join('');
}

function selectPreset(key) {
  selectedPresetKey = key;
  renderPresets();
  updateLivePreview();
}

function toggleCustomGradient(isCustom) {
  const box = document.getElementById('custom-gradient-box');
  if (isCustom) {
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
  updateLivePreview();
}

function updateLivePreview() {
  const isCustom = document.getElementById('custom-gradient-toggle').checked;
  const customCaption = document.getElementById('post-caption-input').value.trim();
  
  const pill = document.getElementById('live-preview-pill');
  const pillIcon = document.getElementById('preview-pill-icon');
  const pillText = document.getElementById('preview-pill-text');

  if (isCustom) {
    const c1 = document.getElementById('custom-color-1').value;
    const c2 = document.getElementById('custom-color-2').value;
    const textColor = document.getElementById('custom-text-color').value;
    const emoji = document.getElementById('custom-emoji').value;

    pill.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    pill.style.color = textColor;
    pillIcon.textContent = emoji;
    pillText.textContent = customCaption || 'Custom Gradient';
  } else {
    const p = allPresets[selectedPresetKey] || {};
    if (p.colors && p.colors.length >= 2) {
      pill.style.background = `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`;
    } else {
      pill.style.background = '#1A1E26';
    }
    pill.style.color = p.text_color || '#FFFFFF';
    pillIcon.textContent = p.icon || '';
    pillText.textContent = customCaption || p.text || selectedPresetKey;
  }
}

// Media Upload & Webcam Handling
function setUploadMode(mode) {
  const fileZone = document.getElementById('file-upload-zone');
  const webcamZone = document.getElementById('webcam-zone');
  const btnFile = document.getElementById('upload-mode-file');
  const btnWebcam = document.getElementById('upload-mode-webcam');

  if (mode === 'file') {
    fileZone.classList.remove('hidden');
    webcamZone.classList.add('hidden');
    btnFile.className = "px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-black transition";
    btnWebcam.className = "px-3 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition";
    stopWebcam();
  } else {
    fileZone.classList.add('hidden');
    webcamZone.classList.remove('hidden');
    btnWebcam.className = "px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-black transition";
    btnFile.className = "px-3 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition";
    startWebcam();
  }
}

function handleFileSelected(files) {
  if (!files || !files.length) return;
  selectedFile = files[0];
  const label = document.getElementById('selected-file-label');
  label.textContent = `✓ Đã chọn: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`;
  label.classList.remove('hidden');

  const liveImg = document.getElementById('live-preview-img');
  const liveVideo = document.getElementById('live-preview-video');

  const fileUrl = URL.createObjectURL(selectedFile);
  if (selectedFile.type.startsWith('video/')) {
    liveImg.classList.add('hidden');
    liveVideo.classList.remove('hidden');
    liveVideo.src = fileUrl;
  } else {
    liveVideo.classList.add('hidden');
    liveImg.classList.remove('hidden');
    liveImg.src = fileUrl;
  }
}

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1080 }, height: { ideal: 1080 }, facingMode: 'user' }
    });
    const video = document.getElementById('webcam-video');
    video.srcObject = webcamStream;
  } catch (err) {
    showToast('Không thể mở camera webcam: ' + err.message, 'error');
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
}

function captureWebcam() {
  const video = document.getElementById('webcam-video');
  const canvas = document.getElementById('webcam-canvas');
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/jpeg', 0.9);
  
  // Hiển thị lên Live Preview
  const liveImg = document.getElementById('live-preview-img');
  const liveVideo = document.getElementById('live-preview-video');
  liveVideo.classList.add('hidden');
  liveImg.classList.remove('hidden');
  liveImg.src = base64;

  window.capturedWebcamBase64 = base64;
  selectedFile = null;
  showToast('Đã chụp ảnh webcam thành công!', 'success');
}

async function submitMomentPost() {
  const isCustom = document.getElementById('custom-gradient-toggle').checked;
  const caption = document.getElementById('post-caption-input').value.trim();
  const audience = document.querySelector('input[name="audience"]:checked').value;

  if (!selectedFile && !window.capturedWebcamBase64) {
    showToast('Vui lòng chọn file ảnh/video hoặc chụp ảnh từ webcam', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-post');
  btn.disabled = true;
  btn.innerHTML = `<div class="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div><span>ĐANG XỬ LÝ & ĐĂNG MEDIA LÊN LOCKET...</span>`;

  try {
    const formData = new FormData();
    if (selectedFile) {
      formData.append('file', selectedFile);
    } else if (window.capturedWebcamBase64) {
      formData.append('webcamImage', window.capturedWebcamBase64);
    }

    formData.append('caption', caption);
    formData.append('isPrivate', audience === 'self');

    if (isCustom) {
      formData.append('noteType', 'standard');
      formData.append('colors', JSON.stringify([
        document.getElementById('custom-color-1').value,
        document.getElementById('custom-color-2').value
      ]));
      formData.append('textColor', document.getElementById('custom-text-color').value);
      formData.append('icon', document.getElementById('custom-emoji').value);
    } else {
      const p = allPresets[selectedPresetKey] || {};
      formData.append('noteType', selectedPresetKey);
      if (p.colors) formData.append('colors', JSON.stringify(p.colors));
      if (p.text_color) formData.append('textColor', p.text_color);
      if (p.icon) formData.append('icon', p.icon);
    }

    const token = localStorage.getItem('locket_jwt_token');
    const response = await fetch('/api/locket/moments/post', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const res = await response.json();
    if (res && res.success) {
      showToast('Đã đăng khoảnh khắc lên Locket thành công! 🎉', 'success');
      selectedFile = null;
      window.capturedWebcamBase64 = null;
      document.getElementById('selected-file-label').classList.add('hidden');
      document.getElementById('post-caption-input').value = '';
      switchTab('feed');
    } else {
      showToast(res ? res.msg : 'Đăng khoảnh khắc thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi khi đăng moment: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="rocket" class="w-5 h-5"></i><span>ĐĂNG KHOẢNH KHẮC LÊN LOCKET NGAY</span>`;
    lucide.createIcons();
  }
}

// ================= 6. TAB 3: BẠN BÈ & KẾT NỐI =================
async function loadFriends() {
  const container = document.getElementById('friends-grid-container');
  container.innerHTML = `<div class="col-span-full py-12 text-center text-gray-500 text-xs">Đang tải danh sách bạn bè...</div>`;

  const res = await apiFetch('/api/locket/friends');
  if (!res || !res.success || !res.data) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-gray-500 text-xs">Không thể tải danh sách bạn bè.</div>`;
    return;
  }

  const friends = res.data;
  document.getElementById('friends-count').textContent = friends.length;

  if (!friends.length) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-gray-500 text-xs">Chưa có bạn bè nào. Hãy gửi lời mời kết bạn ở ô phía trên!</div>`;
    return;
  }

  container.innerHTML = friends.map(f => `
    <div class="glass-panel p-4 rounded-3xl border border-white/[0.08] hover:border-amber-500/30 transition flex flex-col justify-between">
      <div class="flex items-center gap-3 mb-3">
        <img src="${f.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}" class="w-12 h-12 rounded-full object-cover border border-amber-500/30">
        <div class="truncate">
          <h4 class="text-xs font-bold text-white truncate">${f.first_name ? `${f.first_name} ${f.last_name || ''}` : f.username}</h4>
          <p class="text-[11px] text-amber-400 font-mono truncate">@${f.username || 'user'}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
        <button onclick="viewFriendMoments('${f.uid || f.id}')" class="px-2 py-1.5 rounded-xl bg-obsidian-850 border border-white/10 hover:border-amber-400 text-[11px] font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1 transition">
          <i data-lucide="image" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>Moments</span>
        </button>
        <button onclick="openChatWithAuthor('${f.uid || f.id}', '${f.first_name || f.username}', '${f.profile_picture_url || ''}', '${f.username || ''}')" class="px-2 py-1.5 rounded-xl bg-obsidian-850 border border-white/10 hover:border-amber-400 text-[11px] font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1 transition">
          <i data-lucide="message-circle" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>Chat</span>
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

async function sendFriendRequest() {
  const input = document.getElementById('add-friend-input');
  const val = input.value.trim();
  if (!val) {
    showToast('Vui lòng nhập Username hoặc dán link locket.cam/...', 'error');
    return;
  }

  const res = await apiFetch('/api/locket/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: val })
  });

  if (res && res.success) {
    showToast(res.msg, 'success');
    input.value = '';
  } else {
    showToast(res ? res.msg : 'Gửi lời mời thất bại', 'error');
  }
}

function switchFriendSubtab(tab) {
  const listGrid = document.getElementById('friends-grid-container');
  const reqGrid = document.getElementById('requests-grid-container');
  const tabList = document.getElementById('friends-subtab-list');
  const tabReq = document.getElementById('friends-subtab-requests');

  if (tab === 'list') {
    listGrid.classList.remove('hidden');
    reqGrid.classList.add('hidden');
    tabList.className = "text-amber-400 border-b-2 border-amber-400 pb-2 flex items-center gap-1.5";
    tabReq.className = "hover:text-white pb-2 flex items-center gap-1.5";
    loadFriends();
  } else {
    listGrid.classList.add('hidden');
    reqGrid.classList.remove('hidden');
    tabReq.className = "text-amber-400 border-b-2 border-amber-400 pb-2 flex items-center gap-1.5";
    tabList.className = "hover:text-white pb-2 flex items-center gap-1.5";
    loadFriendRequests();
  }
}

async function loadFriendRequests() {
  const container = document.getElementById('requests-grid-container');
  container.innerHTML = `<div class="py-12 text-center text-gray-500 text-xs">Đang tải danh sách lời mời kết bạn...</div>`;

  const res = await apiFetch('/api/locket/friends/requests');
  if (!res || !res.success || !res.data) {
    container.innerHTML = `<div class="py-12 text-center text-gray-500 text-xs">Không có lời mời kết bạn nào.</div>`;
    return;
  }

  const incoming = res.data.incoming || [];
  const outgoing = res.data.outgoing || [];
  document.getElementById('requests-count').textContent = incoming.length;

  container.innerHTML = `
    <div class="space-y-4">
      <h4 class="text-xs font-bold text-amber-400">Lời mời kết bạn gửi đến (${incoming.length})</h4>
      ${incoming.length ? incoming.map(req => `
        <div class="glass-panel p-3.5 rounded-2xl flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${req.user_profile_pic || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}" class="w-10 h-10 rounded-full object-cover">
            <div>
              <p class="text-xs font-bold text-white">${req.user_name || req.user_uid}</p>
              <p class="text-[10px] text-gray-400 font-mono">@${req.username || 'user'}</p>
            </div>
          </div>
          <button onclick="acceptFriendRequest('${req.user_uid}')" class="btn-locket px-4 py-1.5 rounded-xl text-xs font-bold">Đồng ý</button>
        </div>
      `).join('') : '<p class="text-xs text-gray-500">Không có lời mời kết bạn mới</p>'}
    </div>
  `;
}

async function acceptFriendRequest(userUid) {
  const res = await apiFetch('/api/locket/friends/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userUid })
  });
  if (res && res.success) {
    showToast(res.msg, 'success');
    loadFriendRequests();
  }
}

// ================= 7. TAB 4: TRÒ CHUYỆN LOCKET =================
async function loadConversations() {
  const container = document.getElementById('conversations-list');
  container.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Đang tải hội thoại...</div>`;

  const res = await apiFetch('/api/locket/chat/conversations');
  if (!res || !res.success || !res.data || !res.data.length) {
    container.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Chưa có cuộc trò chuyện nào.</div>`;
    return;
  }

  container.innerHTML = res.data.map(c => `
    <div onclick="selectConversation('${c.peer_uid || c.id}', '${c.peer_name || 'Bạn bè'}', '${c.peer_avatar || ''}', '${c.peer_username || ''}')" 
         class="p-3 hover:bg-white/[0.04] cursor-pointer flex items-center justify-between gap-3 transition">
      <div class="flex items-center gap-2.5 truncate">
        <img src="${c.peer_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}" class="w-10 h-10 rounded-full object-cover border border-amber-500/20">
        <div class="truncate">
          <h4 class="text-xs font-bold text-white truncate">${c.peer_name || c.peer_username || 'Bạn bè'}</h4>
          <p class="text-[11px] text-gray-400 truncate">${c.last_message || 'Bắt đầu trò chuyện'}</p>
        </div>
      </div>
      ${c.unread_count ? `<span class="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">${c.unread_count}</span>` : ''}
    </div>
  `).join('');
}

function openChatWithAuthor(peerUid, peerName, peerAvatar, peerUsername) {
  switchTab('chat');
  selectConversation(peerUid, peerName, peerAvatar, peerUsername);
}

async function selectConversation(peerUid, peerName, peerAvatar, peerUsername) {
  activePeerUid = peerUid;
  activePeerDetails = { peerUid, peerName, peerAvatar, peerUsername };

  document.getElementById('chat-peer-name').textContent = peerName;
  document.getElementById('chat-peer-username').textContent = peerUsername ? `@${peerUsername}` : '';
  if (peerAvatar) document.getElementById('chat-peer-avatar').src = peerAvatar;

  const container = document.getElementById('chat-messages-container');
  container.innerHTML = `<div class="m-auto text-center text-gray-500 text-xs">Đang tải tin nhắn...</div>`;

  const res = await apiFetch(`/api/locket/chat/messages/${peerUid}`);
  if (!res || !res.success || !res.data) {
    container.innerHTML = `<div class="m-auto text-center text-gray-500 text-xs">Chưa có tin nhắn nào trong cuộc trò chuyện này.</div>`;
    return;
  }

  const messages = res.data;
  container.innerHTML = messages.map(m => renderChatMessage(m)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderChatMessage(msg) {
  const isMe = msg.is_me || msg.sender_uid === (activeLocketAccount ? activeLocketAccount.id : '');
  const text = msg.msg || msg.text || '';
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return `
    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full">
      <div class="max-w-[75%] px-4 py-2.5 rounded-2xl text-xs ${isMe ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold rounded-br-none shadow-md' : 'bg-obsidian-800 text-gray-100 rounded-bl-none border border-white/10'}">
        <p>${text}</p>
        <span class="text-[9px] ${isMe ? 'text-black/60' : 'text-gray-500'} block text-right mt-1">${time}</span>
      </div>
    </div>
  `;
}

function appendMessageBubble(msg) {
  const container = document.getElementById('chat-messages-container');
  container.insertAdjacentHTML('beforeend', renderChatMessage(msg));
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !activePeerUid) return;

  input.value = '';
  // Hiển thị trước tin nhắn của mình
  appendMessageBubble({ is_me: true, text, timestamp: new Date().toISOString() });

  const res = await apiFetch('/api/locket/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverUid: activePeerUid, text })
  });

  if (!res || !res.success) {
    showToast(res ? res.msg : 'Không thể gửi tin nhắn', 'error');
  }
}

function refreshCurrentChat() {
  if (activePeerUid && activePeerDetails) {
    selectConversation(activePeerUid, activePeerDetails.peerName, activePeerDetails.peerAvatar, activePeerDetails.peerUsername);
  }
}

// ================= 8. TAB 5: HỒ SƠ & THIẾT BỊ =================
async function updateProfileName() {
  const firstName = document.getElementById('profile-input-firstname').value.trim();
  const lastName = document.getElementById('profile-input-lastname').value.trim();

  const res = await apiFetch('/api/locket/user/name', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName })
  });

  if (res && res.success) {
    showToast(res.msg, 'success');
    await loadActiveAccount();
  } else {
    showToast(res ? res.msg : 'Cập nhật tên thất bại', 'error');
  }
}

async function updateProfileBirthdate() {
  const birthdate = document.getElementById('profile-input-birthdate').value;
  if (!birthdate) return;

  const res = await apiFetch('/api/locket/user/birthdate', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birthdate })
  });

  if (res && res.success) {
    showToast(res.msg, 'success');
  } else {
    showToast(res ? res.msg : 'Cập nhật ngày sinh thất bại', 'error');
  }
}

async function uploadNewAvatar(files) {
  if (!files || !files.length) return;
  const file = files[0];
  const formData = new FormData();
  formData.append('avatar', file);

  showToast('Đang tải lên avatar mới...', 'info');
  const token = localStorage.getItem('locket_jwt_token');
  const response = await fetch('/api/locket/user/avatar', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  const res = await response.json();
  if (res && res.success) {
    showToast('Đã đổi avatar Locket thành công!', 'success');
    await loadActiveAccount();
  } else {
    showToast(res ? res.msg : 'Đổi avatar thất bại', 'error');
  }
}

async function saveDeviceConfig() {
  const model = document.getElementById('device-select-model').value;
  const osVersion = document.getElementById('device-input-ios').value.trim();

  const res = await apiFetch('/api/locket/user/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, osVersion })
  });

  if (res && res.success) {
    showToast(res.msg, 'success');
    await loadActiveAccount();
  } else {
    showToast(res ? res.msg : 'Cập nhật thiết bị thất bại', 'error');
  }
}

async function syncClientData() {
  showToast('Đang đồng bộ Client Data & Push Notification Token...', 'info');
  const res = await apiFetch('/api/locket/user/sync', { method: 'POST' });
  if (res && res.success) {
    showToast(res.msg, 'success');
  } else {
    showToast(res ? res.msg : 'Đồng bộ thất bại', 'error');
  }
}
