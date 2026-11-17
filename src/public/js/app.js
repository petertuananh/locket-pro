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
let allConversations = [];
let chatPollInterval = null;
let isSilentRefreshing = false;
let activeTab = 'feed';
let socket = null;
let currentFacingMode = 'user';
let webcamMode = 'photo'; // 'photo' | 'video'
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
const MAX_RECORDING_SECONDS = 30;
let recordedVideoBlob = null;
let currentMyInviteLink = '';
let cachedAudienceFriends = [];
let selectedSpotifyTrack = null;

// const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='1.5'%3E%3Cpath d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'%3E%3C/path%3E%3Ccircle cx='12' cy='7' r='4'%3E%3C/circle%3E%3C/svg%3E";
const DEFAULT_AVATAR = "/images/locket.webp";

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

function updateLocketTabsVisibility(hasAccount) {
  const locketTabIds = ['feed', 'post', 'friends', 'chat'];

  locketTabIds.forEach(tabId => {
    const desktopBtn = document.getElementById(`tab-btn-${tabId}`);
    if (desktopBtn) {
      if (hasAccount) desktopBtn.classList.remove('hidden');
      else desktopBtn.classList.add('hidden');
    }

    const mobileBtn = document.querySelector(`.mobile-nav-tab[data-tab="${tabId}"]`);
    if (mobileBtn) {
      if (hasAccount) mobileBtn.classList.remove('hidden');
      else mobileBtn.classList.add('hidden');
    }
  });

  const banner = document.getElementById('no-account-banner');
  if (banner) {
    if (hasAccount) banner.classList.add('hidden');
    else banner.classList.remove('hidden');
  }

  if (!hasAccount) {
    switchTab('profile');
  }
}

// ================= 1. AUTHENTICATION & INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');

  if (tokenFromUrl) {
    localStorage.setItem('locket_jwt_token', tokenFromUrl);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const token = localStorage.getItem('locket_jwt_token');

  if (!token) {
    // Nếu chưa có token, chuyển hướng về Landing page
    if (window.location.pathname !== '/' && window.location.pathname !== '') {
      window.location.href = '/';
    }
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
  if (activeLocketAccount) {
    await loadFeed();
  }
  lucide.createIcons();
});

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('locket_jwt_token');
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  options.headers = headers;

  try {
    const response = await fetch(endpoint, options);
    if (response.status === 401) {
      localStorage.removeItem('locket_jwt_token');
      window.location.href = '/';
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    } else {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (_) {
        if (!response.ok) {
          return { success: false, msg: `Lỗi máy chủ (${response.status}: ${response.statusText || 'Không xác định'})` };
        }
        return { success: false, msg: text || 'Phản hồi không hợp lệ' };
      }
    }
  } catch (netErr) {
    console.error('Lỗi mạng apiFetch:', netErr);
    return { success: false, msg: netErr.message || 'Lỗi kết nối máy chủ' };
  }
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

    const fullName = (activeLocketAccount.first_name ? `${activeLocketAccount.first_name} ${activeLocketAccount.last_name || ''}`.trim() : activeLocketAccount.label) || 'Locket Account';
    const usernameDisplay = activeLocketAccount.username ? `@${activeLocketAccount.username}` : activeLocketAccount.email;
    const avatar = activeLocketAccount.avatar_url || DEFAULT_AVATAR;

    // Cập nhật Header
    document.getElementById('header-account-name').textContent = fullName;
    document.getElementById('header-account-username').textContent = usernameDisplay;
    document.getElementById('header-account-avatar').src = avatar;

    // Cập nhật Preview & Profile Tab
    document.getElementById('preview-user-name').textContent = fullName;
    document.getElementById('preview-user-handle').textContent = usernameDisplay;
    const prevAvatar = document.getElementById('preview-user-avatar');
    if (prevAvatar) prevAvatar.src = avatar;

    document.getElementById('profile-display-name').textContent = fullName;
    document.getElementById('profile-username').textContent = usernameDisplay;
    document.getElementById('profile-email').textContent = activeLocketAccount.email;
    document.getElementById('profile-uid').textContent = `UID: ${activeLocketAccount.locket_uid || activeLocketAccount.id}`;
    document.getElementById('profile-avatar').src = avatar;

    document.getElementById('profile-input-firstname').value = activeLocketAccount.first_name || '';
    document.getElementById('profile-input-lastname').value = activeLocketAccount.last_name || '';
    
    if (profile.birthdate) {
      document.getElementById('profile-input-birthdate').value = profile.birthdate;
    }

    updateLocketTabsVisibility(true);
  } else {
    // Nếu chưa có tài khoản nào
    activeLocketAccount = null;
    document.getElementById('header-account-name').textContent = 'Chưa liên kết Locket';
    document.getElementById('header-account-username').textContent = 'Nhấn để thêm nick';
    document.getElementById('header-account-avatar').src = DEFAULT_AVATAR;

    document.getElementById('preview-user-name').textContent = 'Chưa có tài khoản';
    document.getElementById('preview-user-handle').textContent = '@chuacolocket';
    const prevAvatar = document.getElementById('preview-user-avatar');
    if (prevAvatar) prevAvatar.src = DEFAULT_AVATAR;

    document.getElementById('profile-display-name').textContent = 'Chưa liên kết Locket';
    document.getElementById('profile-username').textContent = 'Chưa có tài khoản';
    document.getElementById('profile-email').textContent = 'Vui lòng thêm tài khoản Locket';
    document.getElementById('profile-uid').textContent = 'UID: ---';
    document.getElementById('profile-avatar').src = DEFAULT_AVATAR;

    document.getElementById('profile-input-firstname').value = '';
    document.getElementById('profile-input-lastname').value = '';
    document.getElementById('profile-input-birthdate').value = '';

    updateLocketTabsVisibility(false);
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
        <img src="${acc.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full object-cover border border-white/10">
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
    if (activeLocketAccount) {
    await loadFeed();
  }
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
      if (activeLocketAccount) {
    await loadFeed();
  }
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
    if (activeLocketAccount) {
    await loadFeed();
  }
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
  if (!activeLocketAccount && tabId !== 'profile') {
    tabId = 'profile';
  }
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

  // Update mobile bottom nav tabs
  document.querySelectorAll('.mobile-nav-tab').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('text-amber-400');
      btn.classList.remove('text-gray-400');
    } else {
      btn.classList.remove('text-amber-400');
      btn.classList.add('text-gray-400');
    }
  });

  const activeSec = document.getElementById(`section-${tabId}`);
  if (activeSec) {
    activeSec.classList.remove('hidden');
  }

  activeTab = tabId;

  // Khởi tạo tác vụ riêng cho tab
  if (tabId === 'friends') loadFriends();
  if (tabId === 'chat') {
    loadConversations();
    startChatPolling();
  } else {
    stopChatPolling();
  }
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

function formatMomentTime(dateStr) {
  if (!dateStr) return 'Vừa xong';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24 && d.getDate() === now.getDate()) {
    return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hôm nay`;
  }
  if (diffHours < 48) {
    return `Hôm qua ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `${d.getDate()}/${d.getMonth()+1} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderMomentCard(moment) {
  const myLocketUid = (activeLocketAccount && (activeLocketAccount.locket_uid || activeLocketAccount.id)) || '';
  const isMe = moment.is_me === true || (myLocketUid && (moment.user === myLocketUid || moment.user_uid === myLocketUid));
  const authorName = isMe ? 'Tôi (Chính bạn)' : (moment.author_name || (moment.first_name ? `${moment.first_name} ${moment.last_name || ''}`.trim() : (moment.username ? `@${moment.username}` : 'Bạn bè Locket')));
  const authorAvatar = (isMe && activeLocketAccount && activeLocketAccount.avatar_url) ? activeLocketAccount.avatar_url : (moment.profile_picture_url || DEFAULT_AVATAR);
  const timeStr = formatMomentTime(moment.date);
  const isVideo = Boolean(moment.video_url);

  // Caption Pill / Gradient Pill
  let pillHtml = '';
  const pill = moment.pill_info;
  const overlayFirst = (moment.overlays && moment.overlays.length > 0) ? moment.overlays[0] : null;
  const overlayData = overlayFirst?.data || {};

  const text = pill?.text || overlayData?.text || overlayFirst?.alt_text || moment.caption || '';
  
  // Icon can be string or object { data: '🎵', type: 'emoji' }
  const rawIcon = pill?.icon || overlayData?.icon || overlayFirst?.icon || '';
  const icon = (typeof rawIcon === 'object' && rawIcon !== null) ? (rawIcon.data || '') : (typeof rawIcon === 'string' ? rawIcon : '');

  // Colors can be in pill.colors or overlayData.background.colors
  const colors = (pill?.colors && Array.isArray(pill.colors) && pill.colors.length)
    ? pill.colors
    : (overlayData?.background?.colors && Array.isArray(overlayData.background.colors) && overlayData.background.colors.length)
      ? overlayData.background.colors
      : null;

  const textColor = pill?.text_color || overlayData?.text_color || '#FFFFFF';

  if (text) {
    let bgStyle = 'background: rgba(0,0,0,0.85);';
    if (colors && colors.length >= 2) {
      bgStyle = `background: linear-gradient(135deg, ${colors.join(', ')});`;
    } else if (colors && colors.length === 1) {
      bgStyle = `background: ${colors[0]};`;
    }
    const colorStyle = `color: ${textColor};`;

    pillHtml = `
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md border border-white/20 max-w-[88%] truncate pointer-events-none"
           style="${bgStyle} ${colorStyle}">
        ${icon ? `<span class="flex-shrink-0">${escapeHtml(icon)}</span>` : ''}
        <span class="truncate">${escapeHtml(text)}</span>
      </div>
    `;
  }

  const momentId = moment.id || moment.canonical_uid || moment.moment_uid || moment.uid;

  return `
    <div id="moment-card-${momentId}" data-moment-id="${momentId}" class="glass-panel rounded-3xl overflow-hidden border border-white/[0.08] hover:border-amber-500/30 transition-all duration-300 flex flex-col shadow-lg">
      <!-- Card Header -->
      <div class="p-3.5 flex items-center justify-between border-b border-white/[0.06]">
        <div onclick="openUserProfile('${moment.user || moment.user_uid || moment.author_uid || moment.username || ''}')" class="flex items-center gap-2.5 min-w-0 cursor-pointer group/author" title="Nhấn để xem hồ sơ Discord">
          <img src="${authorAvatar}" class="w-8 h-8 rounded-full object-cover border border-amber-500/40 group-hover/author:border-amber-400 group-hover/author:scale-105 transition flex-shrink-0" onerror="this.src=DEFAULT_AVATAR">
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-white group-hover/author:text-amber-400 transition leading-tight truncate">${escapeHtml(authorName)}</h4>
            <p class="text-[10px] text-gray-400 font-mono leading-tight">${timeStr}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          ${isMe ? `
            <span class="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">Của bạn</span>
            <button onclick="deleteMyMoment('${momentId}')" title="Xóa khoảnh khắc này" class="p-1 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Media Viewport 1:1 -->
      <div class="relative aspect-square w-full bg-black overflow-hidden flex items-center justify-center group">
        ${isVideo ? `
          <video src="${moment.video_url}" poster="${moment.thumbnail_url || moment.image_url || ''}" controls playsinline class="w-full h-full object-cover"></video>
        ` : `
          <img src="${moment.thumbnail_url || moment.image_url}" alt="Moment" class="w-full h-full object-cover">
        `}
        ${pillHtml}
      </div>

      <!-- Card Actions -->
      <div class="p-3 flex items-center justify-between text-xs text-gray-400 border-b border-white/[0.04]">
        <button onclick="viewMomentViews('${momentId}')" class="hover:text-amber-300 flex items-center gap-1.5 transition">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>Lượt xem</span>
        </button>
        ${isMe ? `
          <button onclick="deleteMyMoment('${momentId}')" class="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition font-semibold border border-rose-500/20">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Xóa locket</span>
          </button>
        ` : `
          <button onclick="openChatWithAuthor('${moment.user || moment.user_uid}', '${escapeHtml(authorName)}', '${authorAvatar}')" class="hover:text-amber-300 flex items-center gap-1.5 transition">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
            <span>Nhắn tin</span>
          </button>
        `}
      </div>

      <!-- Reaction Emojis Bar -->
      <div class="p-2.5 bg-obsidian-850/80 flex items-center justify-around text-base">
        <button onclick="sendMomentReaction('${momentId}', '❤️')" class="hover:scale-125 transition">❤️</button>
        <button onclick="sendMomentReaction('${momentId}', '🔥')" class="hover:scale-125 transition">🔥</button>
        <button onclick="sendMomentReaction('${momentId}', '😍')" class="hover:scale-125 transition">😍</button>
        <button onclick="sendMomentReaction('${momentId}', '🥰')" class="hover:scale-125 transition">🥰</button>
        <button onclick="sendMomentReaction('${momentId}', '😂')" class="hover:scale-125 transition">😂</button>
        <button onclick="sendMomentReaction('${momentId}', '💛')" class="hover:scale-125 transition">💛</button>
        <button onclick="sendMomentReaction('${momentId}', '🫶')" class="hover:scale-125 transition">🫶</button>
      </div>
    </div>
  `;
}

async function deleteMyMoment(momentUid) {
  if (!momentUid) return;
  const confirmed = confirm('Bạn có chắc chắn muốn xóa khoảnh khắc Locket này không?\nThao tác này sẽ xóa vĩnh viễn bài đăng này trên Locket.');
  if (!confirmed) return;

  showToast('Đang tiến hành xóa khoảnh khắc...', 'info');

  try {
    const res = await apiFetch(`/api/locket/moments/${momentUid}`, {
      method: 'DELETE'
    });

    if (res && res.success) {
      showToast('Đã xóa khoảnh khắc Locket thành công!', 'success');
      const card = document.getElementById(`moment-card-${momentUid}`) || document.querySelector(`[data-moment-id="${momentUid}"]`);
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
          card.remove();
          const container = document.getElementById('feed-container');
          if (container && !container.children.length) {
            loadFeed();
          }
        }, 300);
      } else {
        loadFeed();
      }
    } else {
      showToast(res ? res.msg : 'Xóa khoảnh khắc thất bại', 'error');
    }
  } catch (err) {
    console.error('Lỗi khi xóa khoảnh khắc:', err);
    showToast('Lỗi khi xóa khoảnh khắc: ' + err.message, 'error');
  }
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
        <div onclick="openUserProfile('${v.user_uid}')" class="py-1.5 px-2 rounded-xl flex items-center justify-between text-gray-300 hover:text-white hover:bg-white/5 cursor-pointer transition group" title="Nhấn để xem hồ sơ">
          <span class="font-mono group-hover:text-amber-400">UID: ${v.user_uid}</span>
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
  const total = Object.keys(allPresets).length;
  let html = `<button onclick="selectCategory('all')" id="cat-all" class="cat-btn px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-black whitespace-nowrap">Tất cả (${total})</button>`;
  
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
      ? `linear-gradient(135deg, ${p.colors.join(', ')})` 
      : (p.colors && p.colors.length === 1 ? p.colors[0] : 'rgba(30, 36, 48, 0.9)');
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

function getFormattedBrowserTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function refreshBrowserTime() {
  const timeStr = getFormattedBrowserTime();
  const captionInput = document.getElementById('post-caption-input');
  if (captionInput) {
    captionInput.value = timeStr;
  }
  if (allPresets['browser_time']) {
    allPresets['browser_time'].text = timeStr;
  }
  updateLivePreview();
  showToast(`Đã lấy giờ hiện tại: ${timeStr} ⏰`, 'info');
}

function setQuickLocation(cityName) {
  const captionInput = document.getElementById('post-caption-input');
  if (captionInput) {
    captionInput.value = cityName;
  }
  updateLivePreview();
  showToast(`Đã chọn vị trí: ${cityName} 📍`, 'info');
}

async function getBrowserGPSLocation() {
  const statusText = document.getElementById('gps-status-text');
  if (!navigator.geolocation) {
    showToast('Trình duyệt của bạn không hỗ trợ Geolocation GPS.', 'error');
    return;
  }

  if (statusText) statusText.textContent = 'Đang tìm GPS...';
  showToast('Đang lấy vị trí GPS từ trình duyệt...', 'info');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`, {
          headers: { 'Accept-Language': 'vi,en' }
        });
        if (resp.ok) {
          const data = await resp.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.county || addr.suburb || addr.state_district || addr.state || 'Vị trí hiện tại';
          const captionInput = document.getElementById('post-caption-input');
          if (captionInput) {
            captionInput.value = city;
          }
          if (allPresets['browser_location_gps']) {
            allPresets['browser_location_gps'].text = city;
          }
          updateLivePreview();
          showToast(`Đã xác định vị trí GPS: ${city} 📍`, 'success');
        } else {
          fallbackLocation(lat, lon);
        }
      } catch (e) {
        fallbackLocation(lat, lon);
      } finally {
        if (statusText) statusText.textContent = 'Lấy vị trí GPS';
      }
    },
    (err) => {
      console.warn('Geolocation error:', err);
      if (statusText) statusText.textContent = 'Lấy vị trí GPS';
      showToast('Không lấy được GPS (chưa cấp quyền). Bạn có thể bấm chọn nhanh các tỉnh thành bên dưới!', 'info');
    },
    { timeout: 8000, enableHighAccuracy: true }
  );
}

function fallbackLocation(lat, lon) {
  const coordStr = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  const captionInput = document.getElementById('post-caption-input');
  if (captionInput) {
    captionInput.value = coordStr;
  }
  updateLivePreview();
  showToast(`Tọa độ GPS: ${coordStr}`, 'info');
}

function selectPreset(key) {
  selectedPresetKey = key;
  renderPresets();
  const p = allPresets[key] || {};
  const captionInput = document.getElementById('post-caption-input');

  // Dynamic Time presets
  if (key === 'browser_time' || key === 'browser_time_sunset' || key === 'browser_time_night') {
    const timeStr = getFormattedBrowserTime();
    if (captionInput) captionInput.value = timeStr;
    p.text = timeStr;
  } else if (key === 'browser_location_gps') {
    getBrowserGPSLocation();
  } else if (key.startsWith('location_')) {
    if (captionInput && p.text) {
      captionInput.value = p.text;
    }
  } else if (key === 'spotify_music' || key === 'spotify_vibes' || key === 'spotify_chill' || key === 'spotify_acoustic') {
    if (!selectedSpotifyTrack) {
      openSpotifyModal();
    }
  } else {
    if (captionInput && !captionInput.value) {
      captionInput.placeholder = p.text ? `Mẫu: "${p.text}" (Nhập nếu muốn đổi)...` : 'Nhập caption tùy thích...';
    }
  }

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
    pillIcon.textContent = emoji || '✨';
    pillText.textContent = customCaption || 'Custom Gradient';
  } else {
    const p = allPresets[selectedPresetKey] || {};
    if (p.colors && p.colors.length >= 2) {
      pill.style.background = `linear-gradient(135deg, ${p.colors.join(', ')})`;
    } else if (p.colors && p.colors.length === 1) {
      pill.style.background = p.colors[0];
    } else {
      pill.style.background = 'rgba(26, 30, 38, 0.95)';
    }
    pill.style.color = p.text_color || '#FFFFFF';
    pillIcon.textContent = p.icon || '';
    pillText.textContent = customCaption || p.text || 'Locket';
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
  window.capturedWebcamBase64 = null;
  const label = document.getElementById('selected-file-label');
  label.textContent = `✓ Đã chọn: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`;
  label.classList.remove('hidden');

  const liveImg = document.getElementById('live-preview-img');
  const liveVideo = document.getElementById('live-preview-video');
  const defaultOverlay = document.getElementById('live-preview-default-overlay');
  if (defaultOverlay) defaultOverlay.classList.add('hidden');

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

function setWebcamMode(mode) {
  if (webcamMode === mode) return;
  webcamMode = mode;

  const btnPhoto = document.getElementById('webcam-mode-photo');
  const btnVideo = document.getElementById('webcam-mode-video');
  const snapBtn = document.getElementById('btn-webcam-photo-snap');
  const recordBtn = document.getElementById('btn-webcam-video-record');
  const hint = document.getElementById('webcam-mode-hint');

  // Dừng quay nếu đang dở dang
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopWebcamRecording(false);
  }
  retakeWebcamRecording();

  if (mode === 'photo') {
    if (btnPhoto) btnPhoto.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-black flex items-center gap-1.5 transition";
    if (btnVideo) btnVideo.className = "px-4 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1.5 transition";
    if (snapBtn) snapBtn.classList.remove('hidden');
    if (recordBtn) recordBtn.classList.add('hidden');
    if (hint) hint.textContent = 'Nhấn Chụp Ngay để chụp ảnh tức thì từ Webcam';
  } else {
    if (btnVideo) btnVideo.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-black flex items-center gap-1.5 transition";
    if (btnPhoto) btnPhoto.className = "px-4 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1.5 transition";
    if (snapBtn) snapBtn.classList.add('hidden');
    if (recordBtn) recordBtn.classList.remove('hidden');
    if (hint) hint.textContent = 'Nhấn Bắt đầu quay để quay clip ngắn (tối đa 30s) kèm âm thanh';
    
    // Yêu cầu nạp micro nếu luồng hiện tại chưa có track audio
    if (webcamStream && webcamStream.getAudioTracks().length === 0) {
      startWebcam();
    }
  }
  lucide.createIcons();
}

async function startWebcam() {
  stopWebcam();
  const video = document.getElementById('webcam-video');
  const needAudio = (webcamMode === 'video');

  const videoConstraints = {
    width: { ideal: 1080 },
    height: { ideal: 1080 },
    facingMode: currentFacingMode
  };

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: needAudio
    });
    if (video) {
      video.srcObject = webcamStream;
      video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    }
  } catch (err) {
    console.warn('getUserMedia with facingMode & audio failed, trying fallbacks:', err.message);
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      if (video) {
        video.srcObject = webcamStream;
        video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
      }
    } catch (e2) {
      try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video) {
          video.srcObject = webcamStream;
          video.style.transform = 'none';
        }
      } catch (e3) {
        showToast('Không thể mở camera webcam: ' + e3.message, 'error');
      }
    }
  }
}

async function flipWebcam() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  showToast(`Đang chuyển camera sang ${currentFacingMode === 'user' ? 'Trước (Selfie)' : 'Sau'}...`, 'info');
  await startWebcam();
}

function stopWebcam() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try { mediaRecorder.stop(); } catch (_) {}
  }
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
}

function captureWebcamSnapshot() {
  const video = document.getElementById('webcam-video');
  if (!video || !video.videoWidth) {
    showToast('Camera chưa sẵn sàng, vui lòng đợi giây lát...', 'error');
    return;
  }
  const canvas = document.getElementById('webcam-canvas') || document.createElement('canvas');
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');

  if (currentFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/jpeg', 0.9);
  
  // Hiển thị lên Live Preview
  const liveImg = document.getElementById('live-preview-img');
  const liveVideo = document.getElementById('live-preview-video');
  const defaultOverlay = document.getElementById('live-preview-default-overlay');
  if (defaultOverlay) defaultOverlay.classList.add('hidden');
  if (liveVideo) liveVideo.classList.add('hidden');
  if (liveImg) {
    liveImg.classList.remove('hidden');
    liveImg.src = base64;
    liveImg.classList.remove('opacity-60');
  }

  window.capturedWebcamBase64 = base64;
  selectedFile = null;
  const label = document.getElementById('selected-file-label');
  if (label) {
    label.textContent = `✓ Đã chụp từ Webcam (${currentFacingMode === 'user' ? 'Camera Trước' : 'Camera Sau'})`;
    label.classList.remove('hidden');
  }
  showToast('Đã chụp ảnh webcam thành công!', 'success');
}
const captureWebcam = captureWebcamSnapshot;

// Video Recording Methods
function toggleWebcamRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopWebcamRecording(true);
  } else {
    startWebcamRecording();
  }
}

function startWebcamRecording() {
  if (!webcamStream) {
    showToast('Camera chưa sẵn sàng!', 'error');
    return;
  }

  let mimeType = 'video/webm;codecs=vp8,opus';
  if (window.MediaRecorder) {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
    }
  }

  try {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(webcamStream, { mimeType });
  } catch (err) {
    try {
      mediaRecorder = new MediaRecorder(webcamStream);
    } catch (e2) {
      showToast('Trình duyệt không hỗ trợ quay video từ webcam: ' + e2.message, 'error');
      return;
    }
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    handleRecordingFinished();
  };

  mediaRecorder.start(100);
  recordingSeconds = 0;

  // Update UI to recording state
  const statusBadge = document.getElementById('webcam-record-status');
  const timerText = document.getElementById('webcam-record-timer');
  const progressBar = document.getElementById('webcam-record-progress');
  const recordBtnText = document.getElementById('btn-webcam-record-text');
  const recordIcon = document.getElementById('webcam-record-icon');

  if (statusBadge) statusBadge.classList.remove('hidden');
  if (progressBar) {
    progressBar.classList.remove('hidden');
    progressBar.style.width = '0%';
  }
  if (recordBtnText) recordBtnText.textContent = 'Dừng quay (00:00)';
  if (recordIcon) {
    recordIcon.className = 'w-3 h-3 rounded-sm bg-white animate-pulse';
  }

  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    const min = Math.floor(recordingSeconds / 60);
    const sec = recordingSeconds % 60;
    const formatted = `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
    
    if (timerText) timerText.textContent = `${formatted} / 00:30`;
    if (recordBtnText) recordBtnText.textContent = `Dừng quay (${formatted})`;
    if (progressBar) {
      const pct = Math.min(100, (recordingSeconds / MAX_RECORDING_SECONDS) * 100);
      progressBar.style.width = `${pct}%`;
    }

    if (recordingSeconds >= MAX_RECORDING_SECONDS) {
      stopWebcamRecording(true);
    }
  }, 1000);
}

function stopWebcamRecording(shouldSave = true) {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  const statusBadge = document.getElementById('webcam-record-status');
  const progressBar = document.getElementById('webcam-record-progress');
  const recordBtnText = document.getElementById('btn-webcam-record-text');
  const recordIcon = document.getElementById('webcam-record-icon');

  if (statusBadge) statusBadge.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (recordBtnText) recordBtnText.textContent = 'Bắt đầu quay';
  if (recordIcon) {
    recordIcon.className = 'w-3 h-3 rounded-full bg-white animate-pulse';
  }

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    if (!shouldSave) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
    }
    mediaRecorder.stop();
  }
}

function handleRecordingFinished() {
  if (!recordedChunks.length) {
    showToast('Video không có dữ liệu, vui lòng thử lại.', 'error');
    return;
  }

  const mime = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'video/webm';
  const blob = new Blob(recordedChunks, { type: mime });
  recordedVideoBlob = blob;

  // Show in viewfinder preview overlay
  const previewOverlay = document.getElementById('webcam-recorded-preview-overlay');
  const previewVideo = document.getElementById('webcam-recorded-video');
  const liveControls = document.getElementById('webcam-live-controls');

  if (previewVideo) {
    previewVideo.src = URL.createObjectURL(blob);
    previewVideo.play().catch(() => {});
  }
  if (previewOverlay) previewOverlay.classList.remove('hidden');
  if (liveControls) liveControls.classList.add('hidden');

  confirmWebcamRecording(false);
}

function retakeWebcamRecording() {
  recordedVideoBlob = null;
  const previewOverlay = document.getElementById('webcam-recorded-preview-overlay');
  const previewVideo = document.getElementById('webcam-recorded-video');
  const liveControls = document.getElementById('webcam-live-controls');

  if (previewVideo) {
    previewVideo.pause();
    previewVideo.src = '';
  }
  if (previewOverlay) previewOverlay.classList.add('hidden');
  if (liveControls) liveControls.classList.remove('hidden');
}

function confirmWebcamRecording(showSuccessToast = true) {
  if (!recordedVideoBlob) return;

  const ext = recordedVideoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([recordedVideoBlob], `webcam_moment_${Date.now()}.${ext}`, {
    type: recordedVideoBlob.type || 'video/webm'
  });

  selectedFile = file;
  window.capturedWebcamBase64 = null;

  // Cập nhật Live Preview
  const liveImg = document.getElementById('live-preview-img');
  const liveVideo = document.getElementById('live-preview-video');
  const defaultOverlay = document.getElementById('live-preview-default-overlay');

  if (defaultOverlay) defaultOverlay.classList.add('hidden');
  if (liveImg) liveImg.classList.add('hidden');
  if (liveVideo) {
    liveVideo.classList.remove('hidden');
    liveVideo.src = URL.createObjectURL(recordedVideoBlob);
    liveVideo.muted = true;
    liveVideo.play().catch(() => {});
  }

  const label = document.getElementById('selected-file-label');
  if (label) {
    label.textContent = `✓ Đã quay video từ Webcam (${recordingSeconds}s). Sẵn sàng đăng!`;
    label.classList.remove('hidden');
  }

  if (showSuccessToast) {
    showToast(`Đã chọn video webcam (${recordingSeconds}s)! Bạn có thể chọn gradient pill và bấm Đăng Ngay. 🎉`, 'success');
  }
}

// Audience & Specific Friends Selection
async function handleAudienceChange(value) {
  const box = document.getElementById('friends-selector-box');
  if (!box) return;
  if (value === 'select') {
    box.classList.remove('hidden');
    await loadFriendsForAudience();
  } else {
    box.classList.add('hidden');
  }
}

async function loadFriendsForAudience() {
  const listEl = document.getElementById('post-friends-list');
  if (!listEl) return;

  if (cachedAudienceFriends.length > 0) {
    renderAudienceFriendsList(cachedAudienceFriends);
    return;
  }

  listEl.innerHTML = `<div class="text-xs text-gray-500 py-3 text-center col-span-full">Đang tải danh sách bạn bè...</div>`;
  const res = await apiFetch('/api/locket/friends');
  if (res && res.success && res.data) {
    cachedAudienceFriends = res.data;
    renderAudienceFriendsList(cachedAudienceFriends);
  } else {
    listEl.innerHTML = `<div class="text-xs text-rose-400 py-3 text-center col-span-full">Không thể tải bạn bè để chọn.</div>`;
  }
}

function renderAudienceFriendsList(friends) {
  const listEl = document.getElementById('post-friends-list');
  if (!listEl) return;

  if (!friends || friends.length === 0) {
    listEl.innerHTML = `<div class="text-xs text-gray-500 py-3 text-center col-span-full">Bạn chưa có bạn bè Locket nào.</div>`;
    return;
  }

  listEl.innerHTML = friends.map(f => {
    const name = (f.first_name ? `${f.first_name} ${f.last_name || ''}`.trim() : f.username) || 'Bạn bè';
    const uid = f.uid || f.id;
    const avatar = f.profile_picture_url || DEFAULT_AVATAR;
    return `
      <label class="p-2.5 rounded-xl bg-obsidian-900 border border-white/[0.08] hover:border-amber-500/40 flex items-center gap-2.5 cursor-pointer transition select-none">
        <input type="checkbox" name="post-recipient-friend" value="${uid}" onchange="updateSelectedFriendsCount()" class="rounded border-gray-600 text-amber-500 focus:ring-amber-400">
        <img src="${avatar}" class="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0">
        <div class="truncate">
          <p class="text-xs font-semibold text-gray-200 truncate leading-tight">${escapeHtml(name)}</p>
          <p class="text-[10px] text-amber-400 font-mono truncate leading-tight">@${f.username || 'user'}</p>
        </div>
      </label>
    `;
  }).join('');
  updateSelectedFriendsCount();
}

function updateSelectedFriendsCount() {
  const checked = document.querySelectorAll('input[name="post-recipient-friend"]:checked');
  const countEl = document.getElementById('selected-friends-count');
  if (countEl) countEl.textContent = checked.length;
}

function toggleSelectAllFriends() {
  const cbs = document.querySelectorAll('input[name="post-recipient-friend"]');
  const allChecked = Array.from(cbs).length > 0 && Array.from(cbs).every(cb => cb.checked);
  cbs.forEach(cb => cb.checked = !allChecked);
  const btn = document.getElementById('btn-toggle-all-friends');
  if (btn) btn.textContent = !allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  updateSelectedFriendsCount();
}

async function submitMomentPost() {
  const isCustom = document.getElementById('custom-gradient-toggle').checked;
  const caption = document.getElementById('post-caption-input').value.trim();
  const audience = (document.querySelector('input[name="audience"]:checked') || {}).value || 'all';

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

    if (audience === 'select') {
      const selectedUids = Array.from(document.querySelectorAll('input[name="post-recipient-friend"]:checked')).map(cb => cb.value);
      if (selectedUids.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 người bạn để gửi khoảnh khắc!', 'error');
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="rocket" class="w-5 h-5"></i><span>ĐĂNG KHOẢNH KHẮC LÊN LOCKET NGAY</span>`;
        lucide.createIcons();
        return;
      }
      formData.append('recipients', JSON.stringify(selectedUids));
    }

    let finalCaption = caption;
    if (isCustom) {
      formData.append('noteType', 'standard');
      formData.append('colors', JSON.stringify([
        document.getElementById('custom-color-1').value,
        document.getElementById('custom-color-2').value
      ]));
      formData.append('textColor', document.getElementById('custom-text-color').value);
      formData.append('icon', document.getElementById('custom-emoji').value || '🚀');
    } else {
      const p = allPresets[selectedPresetKey] || {};
      formData.append('noteType', selectedPresetKey);
      if (p.colors && p.colors.length) formData.append('colors', JSON.stringify(p.colors));
      if (p.text_color) formData.append('textColor', p.text_color);
      if (p.icon) formData.append('icon', p.icon);
      if (!finalCaption && p.text) {
        finalCaption = p.text;
      }
    }
    formData.set('caption', finalCaption || '');

    if (selectedSpotifyTrack) {
      formData.append('spotifyTrack', JSON.stringify(selectedSpotifyTrack));
    }

    const token = localStorage.getItem('locket_jwt_token');
    const response = await fetch('/api/locket/moments/post', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    let res = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      res = await response.json();
    } else {
      const rawText = await response.text();
      if (response.status === 413) {
        throw new Error('Tệp video quá lớn (vượt quá dung lượng cho phép của máy chủ).');
      } else if (!response.ok) {
        throw new Error(`Máy chủ báo lỗi ${response.status}: ${response.statusText || 'Không xác định'}`);
      } else {
        try {
          res = JSON.parse(rawText);
        } catch (_) {
          throw new Error('Phản hồi từ máy chủ không hợp lệ.');
        }
      }
    }

    if (res && res.success) {
      showToast('Đã đăng khoảnh khắc lên Locket thành công! 🎉', 'success');
      selectedFile = null;
      window.capturedWebcamBase64 = null;
      document.getElementById('selected-file-label').classList.add('hidden');
      document.getElementById('post-caption-input').value = '';
      
      // Reset Live Preview về hero.jpeg và hiện lại overlay nhắc nhở
      const liveImg = document.getElementById('live-preview-img');
      const liveVideo = document.getElementById('live-preview-video');
      if (liveVideo) liveVideo.classList.add('hidden');
      if (liveImg) {
        liveImg.src = '/images/hero.jpeg';
        liveImg.classList.remove('hidden');
      }
      const defaultOverlay = document.getElementById('live-preview-default-overlay');
      if (defaultOverlay) defaultOverlay.classList.remove('hidden');

      if (typeof removeSpotifyTrack === 'function') {
        removeSpotifyTrack();
      }

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

  if (res.myInviteLink) {
    window.currentMyInviteLink = res.myInviteLink;
    const linkDisplay = document.getElementById('my-invite-link-display');
    if (linkDisplay) linkDisplay.textContent = res.myInviteLink;
  }

  const friends = res.data;
  document.getElementById('friends-count').textContent = friends.length;

  if (!friends.length) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-gray-500 text-xs">Chưa có bạn bè nào. Hãy gửi lời mời kết bạn ở ô phía trên!</div>`;
    return;
  }

  container.innerHTML = friends.map(f => `
    <div class="glass-panel p-4 rounded-3xl border border-white/[0.08] hover:border-amber-500/30 transition flex flex-col justify-between group">
      <div onclick="openUserProfile('${f.username || f.uid || f.id}')" class="flex items-center gap-3 mb-3 cursor-pointer" title="Nhấn để xem hồ sơ Discord">
        <img src="${f.profile_picture_url || '/images/locket.webp'}" class="w-12 h-12 rounded-full object-cover border border-amber-500/30 group-hover:scale-105 group-hover:border-amber-400 transition shrink-0" onerror="this.src=DEFAULT_AVATAR">
        <div class="truncate flex-1">
          <h4 class="text-xs font-bold text-white truncate group-hover:text-amber-400 transition">${f.first_name ? `${f.first_name} ${f.last_name || ''}`.trim() : f.username}</h4>
          <p class="text-[11px] text-amber-400 font-mono truncate">@${f.username || 'user'}</p>
        </div>
        <button type="button" class="p-1 rounded-lg text-gray-500 group-hover:text-amber-400 transition" title="Xem hồ sơ">
          <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/[0.06]">
        <button onclick="openUserProfile('${f.username || f.uid || f.id}')" class="px-2 py-1.5 rounded-xl bg-obsidian-850 border border-white/10 hover:border-amber-400 text-[10px] font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1 transition">
          <i data-lucide="user" class="w-3 h-3 text-amber-400"></i>
          <span>Hồ sơ</span>
        </button>
        <button onclick="viewFriendMoments('${f.uid || f.id}')" class="px-2 py-1.5 rounded-xl bg-obsidian-850 border border-white/10 hover:border-amber-400 text-[10px] font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1 transition">
          <i data-lucide="image" class="w-3 h-3 text-amber-400"></i>
          <span>Moments</span>
        </button>
        <button onclick="openChatWithAuthor('${f.uid || f.id}', '${f.first_name || f.username}', '${f.profile_picture_url || ''}', '${f.username || ''}')" class="px-2 py-1.5 rounded-xl bg-obsidian-850 border border-white/10 hover:border-amber-400 text-[10px] font-semibold text-gray-300 hover:text-white flex items-center justify-center gap-1 transition">
          <i data-lucide="message-circle" class="w-3 h-3 text-amber-400"></i>
          <span>Chat</span>
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

async function sendFriendRequest() {
  const input = document.getElementById('add-friend-input');
  const btn = document.getElementById('btn-send-friend');
  const val = input.value.trim();
  if (!val) {
    showToast('Vui lòng nhập Username hoặc dán link locket.cam/...', 'error');
    return;
  }

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div><span>Đang kiểm tra...</span>`;
  }

  try {
    const res = await apiFetch('/api/locket/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val })
    });

    if (res && res.success) {
      if (res.requireInviteLink) {
        openFriendInviteModal(res);
      } else if (res.alreadyFriends) {
        showToast(res.msg || 'Hai bạn đã là bạn bè trên Locket!', 'info');
      } else if (res.accepted) {
        showToast(res.msg || 'Đã đồng ý kết bạn thành công!', 'success');
        loadFriends();
      } else {
        showToast(res.msg || 'Đã gửi lời mời kết bạn thành công!', 'success');
      }
      input.value = '';
    } else {
      showToast(res ? res.msg : 'Gửi lời mời thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi khi gửi kết bạn: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      lucide.createIcons();
    }
  }
}

function openFriendInviteModal(data) {
  const modal = document.getElementById('modal-friend-invite');
  if (!modal) return;

  const u = data.user || {};
  const avatarEl = document.getElementById('invite-friend-avatar');
  const nameEl = document.getElementById('invite-friend-name');
  const userEl = document.getElementById('invite-friend-username');
  const btnOpen = document.getElementById('btn-open-target-invite');
  const btnOpenLabel = document.getElementById('btn-open-target-invite-label');

  if (avatarEl) avatarEl.src = u.profile_picture_url || '/images/locket.webp';
  if (nameEl) nameEl.textContent = u.display_name || (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username) || 'Người dùng Locket';
  if (userEl) userEl.textContent = `@${u.username || 'user'}`;
  
  const targetLink = data.targetInviteLink || `https://locket.cam/${u.username}`;
  if (btnOpen) {
    btnOpen.href = targetLink;
    if (btnOpenLabel) btnOpenLabel.textContent = `Mở Locket để kết bạn (@${u.username || 'user'})`;
  }

  if (data.myInviteLink) {
    window.currentMyInviteLink = data.myInviteLink;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function closeFriendInviteModal() {
  const modal = document.getElementById('modal-friend-invite');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function copyMyInviteLinkFromCard() {
  const linkDisplay = document.getElementById('my-invite-link-display');
  const link = (linkDisplay && linkDisplay.textContent && !linkDisplay.textContent.includes('Đang tải')) ? linkDisplay.textContent : window.currentMyInviteLink;
  if (!link || link.includes('...')) {
    showToast('Đang tải link mời, vui lòng đợi giây lát...', 'info');
    return;
  }
  navigator.clipboard.writeText(link).then(() => {
    showToast('Đã sao chép link kết bạn Locket của bạn! 📋', 'success');
  }).catch(() => {
    showToast('Link mời của bạn: ' + link, 'info');
  });
}

function copyMyInviteLinkFromModal() {
  const link = window.currentMyInviteLink;
  if (!link) {
    showToast('Chưa có link mời của bạn.', 'error');
    return;
  }
  navigator.clipboard.writeText(link).then(() => {
    showToast('Đã sao chép link mời của bạn! Hãy gửi cho bạn bè để kết nối. 📋', 'success');
  }).catch(() => {
    showToast('Link mời của bạn: ' + link, 'info');
  });
}

async function checkFriendshipStatus() {
  showToast('Đang kiểm tra lại danh sách bạn bè...', 'info');
  await loadFriends();
  closeFriendInviteModal();
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
            <img src="${req.user_profile_pic || '/images/locket.webp'}" class="w-10 h-10 rounded-full object-cover">
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
  container.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs flex items-center justify-center gap-2"><div class="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div><span>Đang tải hội thoại...</span></div>`;

  const res = await apiFetch('/api/locket/chat/conversations');
  if (!res || !res.success || !res.data || !res.data.length) {
    allConversations = [];
    container.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Chưa có cuộc trò chuyện nào.</div>`;
    return;
  }

  allConversations = res.data;
  renderConversationsList(allConversations);

  // Tự động chọn và nạp tin nhắn cho cuộc trò chuyện đầu tiên nếu chưa chọn ai, hoặc giữ peer hiện tại
  const target = activePeerUid 
    ? allConversations.find(c => c.peer_uid === activePeerUid) || allConversations[0]
    : allConversations[0];

  if (target) {
    selectConversation(
      target.peer_uid, 
      target.peer_name, 
      target.peer_avatar, 
      target.peer_username, 
      target.conversation_id
    );
  }
}

function renderConversationsList(list) {
  const container = document.getElementById('conversations-list');
  if (!container) return;
  if (!list || !list.length) {
    container.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Không tìm thấy cuộc trò chuyện nào.</div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const isActive = activePeerUid === c.peer_uid;
    const name = escapeHtml(c.peer_name || c.peer_username || 'Bạn bè');
    const lastMsg = escapeHtml(c.last_message || 'Bắt đầu trò chuyện');
    const activeClasses = isActive ? 'bg-amber-500/10 border-l-4 border-amber-400 pl-2' : '';
    return `
      <div id="convo-item-${c.peer_uid}" onclick="selectConversation('${c.peer_uid}', '${escapeHtml(c.peer_name || 'Bạn bè')}', '${c.peer_avatar || ''}', '${c.peer_username || ''}', '${c.conversation_id || ''}')" 
           class="p-3 hover:bg-white/[0.04] cursor-pointer flex items-center justify-between gap-3 transition ${activeClasses}">
        <div class="flex items-center gap-2.5 truncate">
          <img src="${c.peer_avatar || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full object-cover border border-amber-500/20 shrink-0 bg-white/5">
          <div class="truncate">
            <h4 class="text-xs font-bold text-white truncate">${name}</h4>
            <p class="text-[11px] text-gray-400 truncate">${lastMsg}</p>
          </div>
        </div>
        ${c.unread_count ? `<span class="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">${c.unread_count}</span>` : ''}
      </div>
    `;
  }).join('');
}

function highlightActiveConversation(peerUid) {
  document.querySelectorAll('#conversations-list > div').forEach(el => {
    el.classList.remove('bg-amber-500/10', 'border-l-4', 'border-amber-400', 'pl-2');
  });
  const activeEl = document.getElementById(`convo-item-${peerUid}`);
  if (activeEl) {
    activeEl.classList.add('bg-amber-500/10', 'border-l-4', 'border-amber-400', 'pl-2');
  }
}

function filterConversations() {
  const query = (document.getElementById('chat-search').value || '').trim().toLowerCase();
  if (!query) {
    renderConversationsList(allConversations);
    return;
  }
  const filtered = allConversations.filter(c => {
    const name = (c.peer_name || '').toLowerCase();
    const username = (c.peer_username || '').toLowerCase();
    const lastMsg = (c.last_message || '').toLowerCase();
    return name.includes(query) || username.includes(query) || lastMsg.includes(query);
  });
  renderConversationsList(filtered);
}

function openChatWithAuthor(peerUid, peerName, peerAvatar, peerUsername) {
  switchTab('chat');
  const existing = allConversations.find(c => c.peer_uid === peerUid);
  const cid = existing ? existing.conversation_id : null;
  selectConversation(peerUid, peerName, peerAvatar, peerUsername, cid);
}

async function selectConversation(peerUid, peerName, peerAvatar, peerUsername, conversationId = null) {
  activePeerUid = peerUid;
  activePeerDetails = { peerUid, peerName, peerAvatar, peerUsername, conversationId };

  highlightActiveConversation(peerUid);

  document.getElementById('chat-peer-name').textContent = peerName || 'Bạn bè Locket';
  document.getElementById('chat-peer-username').textContent = peerUsername ? `@${peerUsername}` : '';
  const avatarEl = document.getElementById('chat-peer-avatar');
  if (avatarEl) avatarEl.src = peerAvatar || DEFAULT_AVATAR;

  const container = document.getElementById('chat-messages-container');
  container.innerHTML = `<div class="m-auto text-center text-gray-500 text-xs flex items-center justify-center gap-2"><div class="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div><span>Đang tải tin nhắn...</span></div>`;

  const url = conversationId 
    ? `/api/locket/chat/messages/${peerUid}?conversationId=${encodeURIComponent(conversationId)}` 
    : `/api/locket/chat/messages/${peerUid}`;

  try {
    const res = await apiFetch(url);
    if (!res || !res.success || !res.data || !res.data.length) {
      container.innerHTML = `<div class="m-auto text-center text-gray-500 text-xs">Chưa có tin nhắn nào trong cuộc trò chuyện này.<br><span class="text-amber-400 mt-1 inline-block">Hãy gửi tin nhắn đầu tiên!</span></div>`;
      return;
    }

    const messages = res.data;
    container.innerHTML = messages.map(m => renderChatMessage(m)).join('');
    scrollChatToBottom();
  } catch (err) {
    console.error('Lỗi khi tải tin nhắn:', err);
    container.innerHTML = `<div class="m-auto text-center text-rose-400 text-xs">Không thể tải tin nhắn. Hãy bấm nút làm mới để thử lại.</div>`;
  }
}

function scrollChatToBottom(smooth = false) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  const scrollAction = () => {
    container.scrollTop = container.scrollHeight;
    if (container.lastElementChild) {
      container.lastElementChild.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  };
  scrollAction();
  requestAnimationFrame(() => {
    scrollAction();
    setTimeout(scrollAction, 50);
    setTimeout(scrollAction, 150);
    setTimeout(scrollAction, 300);
  });
}

function renderChatMessage(msg) {
  const myLocketUid = (activeLocketAccount && (activeLocketAccount.locket_uid || activeLocketAccount.id)) || '';
  const isMe = msg.is_me === true || (myLocketUid && msg.sender_uid === myLocketUid);
  const text = msg.msg || msg.text || '';
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const reaction = msg.reaction || (msg.reactions && msg.reactions.length ? msg.reactions[0].emoji : null);

  return `
    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full">
      <div class="relative max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-xs ${isMe ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold rounded-br-sm shadow-md' : 'bg-obsidian-800 text-gray-100 rounded-bl-sm border border-white/10'}">
        <p class="whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(text)}</p>
        <span class="text-[9px] ${isMe ? 'text-black/60' : 'text-gray-400'} block text-right mt-1 font-mono">${time}</span>
        ${reaction ? `
          <div class="absolute -bottom-2 ${isMe ? 'left-2' : 'right-2'} text-xs bg-obsidian-900 border border-white/20 rounded-full px-1.5 py-0.5 shadow flex items-center justify-center">
            ${reaction}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function appendMessageBubble(msg) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  if (container.querySelector('.m-auto.text-center')) {
    container.innerHTML = '';
  }
  container.insertAdjacentHTML('beforeend', renderChatMessage(msg));
  scrollChatToBottom(true);
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !activePeerUid) return;

  input.value = '';
  // Hiển thị ngay tin nhắn gửi
  appendMessageBubble({ is_me: true, text, timestamp: new Date().toISOString() });

  const res = await apiFetch('/api/locket/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      receiverUid: activePeerUid, 
      text,
      conversationId: activePeerDetails ? activePeerDetails.conversationId : null
    })
  });

  if (!res || !res.success) {
    showToast(res ? res.msg : 'Không thể gửi tin nhắn', 'error');
  } else {
    setTimeout(() => {
      refreshCurrentChatSilent();
    }, 800);
  }
}

function refreshCurrentChat() {
  if (activePeerUid && activePeerDetails) {
    selectConversation(activePeerUid, activePeerDetails.peerName, activePeerDetails.peerAvatar, activePeerDetails.peerUsername, activePeerDetails.conversationId);
  }
}

async function refreshCurrentChatSilent() {
  if (isSilentRefreshing || !activePeerUid || !activePeerDetails) return;
  const container = document.getElementById('chat-messages-container');
  if (!container) return;

  const url = activePeerDetails.conversationId 
    ? `/api/locket/chat/messages/${activePeerUid}?conversationId=${encodeURIComponent(activePeerDetails.conversationId)}` 
    : `/api/locket/chat/messages/${activePeerUid}`;

  isSilentRefreshing = true;
  try {
    const res = await apiFetch(url);
    if (res && res.success && res.data) {
      const messages = res.data;
      const currentCount = container.querySelectorAll('.flex.flex-col').length;
      if (messages.length !== currentCount) {
        container.innerHTML = messages.map(m => renderChatMessage(m)).join('');
        scrollChatToBottom();
      }
    }
  } catch (_) {
  } finally {
    isSilentRefreshing = false;
  }
}

function startChatPolling() {
  stopChatPolling();
  chatPollInterval = setInterval(() => {
    if (activeTab === 'chat' && activePeerUid) {
      refreshCurrentChatSilent();
    }
  }, 4000);
}

function stopChatPolling() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
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

  let res = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    res = await response.json();
  } else {
    const rawText = await response.text();
    try {
      res = JSON.parse(rawText);
    } catch (_) {
      res = { success: false, msg: `Lỗi máy chủ (${response.status})` };
    }
  }

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

// ================= SPOTIFY MUSIC SEARCH & ATTACH =================
function openSpotifyModal() {
  const modal = document.getElementById('modal-spotify');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('spotify-search-input');
    if (input) {
      input.focus();
      if (!input.value.trim()) {
        input.value = 'Shape of You';
        searchSpotifyTracks();
      }
    }
    lucide.createIcons();
  }
}

function closeSpotifyModal() {
  const modal = document.getElementById('modal-spotify');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  if (currentAudioPreview) {
    currentAudioPreview.pause();
    currentAudioPreview = null;
  }
}

function quickSpotifySearch(query) {
  const input = document.getElementById('spotify-search-input');
  if (input) {
    input.value = query;
    searchSpotifyTracks();
  }
}

async function searchSpotifyTracks() {
  const input = document.getElementById('spotify-search-input');
  const q = input ? input.value.trim() : '';
  const listEl = document.getElementById('spotify-results-list');
  if (!listEl) return;

  if (!q) {
    listEl.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Vui lòng nhập tên bài hát hoặc ca sĩ...</div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="py-8 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
      <div class="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
      <span>Đang tìm kiếm bài hát trên Spotify...</span>
    </div>
  `;

  try {
    const res = await apiFetch(`/api/spotify/search?q=${encodeURIComponent(q)}&limit=10`);
    if (!res || !res.success || !res.data || !res.data.length) {
      listEl.innerHTML = `<div class="py-8 text-center text-gray-500 text-xs">Không tìm thấy bài hát nào cho "${escapeHtml(q)}".</div>`;
      return;
    }

    listEl.innerHTML = res.data.map(track => {
      const trackJson = JSON.stringify(track).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      return `
        <div class="p-2.5 rounded-2xl hover:bg-white/[0.04] transition flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${track.thumbnail || track.image || '/images/locket.webp'}" class="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0">
            <div class="min-w-0">
              <h5 class="text-xs font-bold text-white truncate">${escapeHtml(track.name)}</h5>
              <p class="text-[11px] text-gray-400 truncate">${escapeHtml(track.artists)}</p>
              <p class="text-[9px] text-gray-500 truncate">${escapeHtml(track.album)}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            ${track.preview_url ? `
              <button type="button" onclick="playAudioPreview('${track.preview_url}')" class="p-2 rounded-xl bg-obsidian-850 text-gray-400 hover:text-emerald-400 border border-white/10 transition" title="Nghe thử 30s">
                <i data-lucide="play" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
            <button type="button" onclick='selectSpotifyTrack(${trackJson})' 
                    class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-1 shadow-md">
              <span>Gắn bài này</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
    lucide.createIcons();
  } catch (err) {
    listEl.innerHTML = `<div class="py-8 text-center text-rose-400 text-xs">Lỗi khi tìm kiếm: ${err.message}</div>`;
  }
}

let currentAudioPreview = null;
function playAudioPreview(url) {
  if (currentAudioPreview) {
    currentAudioPreview.pause();
    currentAudioPreview = null;
  }
  if (url) {
    currentAudioPreview = new Audio(url);
    currentAudioPreview.play().catch(e => console.warn('Audio play blocked:', e));
  }
}

function selectSpotifyTrack(track) {
  selectedSpotifyTrack = track;

  // Cập nhật banner Spotify
  const box = document.getElementById('spotify-attached-box');
  const thumb = document.getElementById('spotify-track-thumb');
  const nameEl = document.getElementById('spotify-track-name');
  const artistEl = document.getElementById('spotify-track-artist');
  const linkEl = document.getElementById('spotify-track-link');
  const btnLabel = document.getElementById('spotify-btn-label');

  if (box) box.classList.remove('hidden');
  if (thumb) thumb.src = track.thumbnail || track.image || '/images/locket.webp';
  if (nameEl) nameEl.textContent = track.name;
  if (artistEl) artistEl.textContent = track.artists;
  if (linkEl) linkEl.href = track.url || '#';
  if (btnLabel) btnLabel.textContent = `Đổi: ${track.name.substring(0, 15)}...`;

  // Gán caption
  const captionInput = document.getElementById('post-caption-input');
  if (captionInput) {
    captionInput.value = `${track.name} - ${track.artists}`;
  }

  // Tự động chuyển preset sang spotify_music
  selectedPresetKey = 'spotify_music';
  if (allPresets['spotify_music']) {
    allPresets['spotify_music'].text = `${track.name} - ${track.artists}`;
  }
  renderPresets();
  updateLivePreview();

  closeSpotifyModal();
  showToast(`Đã gắn nhạc Spotify: ${track.name} 🎵`, 'success');
}

function removeSpotifyTrack() {
  selectedSpotifyTrack = null;
  const box = document.getElementById('spotify-attached-box');
  const btnLabel = document.getElementById('spotify-btn-label');
  if (box) box.classList.add('hidden');
  if (btnLabel) btnLabel.textContent = 'Gắn nhạc Spotify';

  const captionInput = document.getElementById('post-caption-input');
  if (captionInput && captionInput.value.startsWith('🎵')) {
    captionInput.value = '';
  }

  selectedPresetKey = 'standard';
  renderPresets();
  updateLivePreview();
  showToast('Đã gỡ bài hát Spotify', 'info');
}

// ================= VIEW FRIEND MOMENTS MODAL =================
async function viewFriendMoments(friendUid) {
  const modal = document.getElementById('modal-friend-moments');
  const content = document.getElementById('friend-moments-content');
  const title = document.getElementById('friend-moments-name');
  const countEl = document.getElementById('friend-moments-count');
  const avatar = document.getElementById('friend-moments-avatar');

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  content.innerHTML = `
    <div class="col-span-full py-16 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
      <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs">Đang tải toàn bộ khoảnh khắc của bạn bè...</p>
    </div>
  `;

  const res = await apiFetch(`/api/locket/moments/user/${friendUid}`);
  if (!res || !res.success || !res.data || !res.data.length) {
    content.innerHTML = `
      <div class="col-span-full py-16 text-center text-gray-500 space-y-2">
        <i data-lucide="image-off" class="w-10 h-10 mx-auto text-gray-600"></i>
        <p class="text-xs font-semibold">Người bạn này chưa chia sẻ khoảnh khắc nào với bạn.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const moments = res.data;
  const first = moments[0];
  if (title) title.textContent = first.author_name || 'Khoảnh khắc bạn bè';
  if (countEl) countEl.textContent = `${moments.length} khoảnh khắc đã chia sẻ`;
  if (avatar) avatar.src = first.profile_picture_url || DEFAULT_AVATAR;

  content.innerHTML = moments.map(m => renderMomentCard(m)).join('');
  lucide.createIcons();
}

function closeFriendMomentsModal() {
  const modal = document.getElementById('modal-friend-moments');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// ================= DISCORD-STYLE FULL USER PROFILE =================
let currentProfileData = null;
let profileHistory = [];

function searchUserProfile() {
  const input = document.getElementById('add-friend-input');
  if (!input) return;
  let val = input.value.trim();
  if (!val) {
    showToast('Vui lòng nhập Username hoặc link Locket để xem hồ sơ', 'warning');
    return;
  }
  openUserProfile(val);
}

async function openUserProfile(identifier, pushHistory = true) {
  if (!identifier) return;
  const modal = document.getElementById('modal-user-profile');
  if (!modal) return;

  // Clean identifier
  identifier = String(identifier).trim().replace(/^@/, '');
  if (identifier.includes('locket.cam/')) {
    const m = identifier.match(/locket\.cam\/([a-zA-Z0-9_.-]+)/);
    if (m) identifier = m[1];
  }

  // Push to history if navigating from an already opened profile
  if (pushHistory && currentProfileData && currentProfileData.profile) {
    const curUid = currentProfileData.profile.uid;
    const curUsername = currentProfileData.profile.username;
    if (curUid !== identifier && curUsername !== identifier) {
      profileHistory.push(currentProfileData);
    }
  }

  // Update back button
  updateProfileHistoryBackBtn();

  // Show modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Loading skeleton / placeholder
  const displayNameEl = document.getElementById('uprofile-display-name');
  const usernameEl = document.getElementById('uprofile-username');
  const uidEl = document.getElementById('uprofile-uid');
  const emailEl = document.getElementById('uprofile-email');
  const phoneEl = document.getElementById('uprofile-phone');
  const linkEl = document.getElementById('uprofile-link');
  const friendsCountEl = document.getElementById('uprofile-friends-count');
  const friendsListEl = document.getElementById('uprofile-friends-list');
  const momentsGridEl = document.getElementById('uprofile-moments-grid');

  if (displayNameEl) displayNameEl.textContent = 'Đang tải hồ sơ...';
  if (usernameEl) usernameEl.textContent = `@${identifier}`;
  if (uidEl) uidEl.textContent = '...';
  if (emailEl) emailEl.textContent = '...';
  if (phoneEl) phoneEl.textContent = '...';
  if (linkEl) {
    linkEl.textContent = '...';
    linkEl.href = '#';
  }
  if (friendsCountEl) friendsCountEl.textContent = '...';
  if (friendsListEl) {
    friendsListEl.innerHTML = `
      <div class="col-span-full py-8 text-center text-gray-500 text-xs flex flex-col items-center justify-center gap-2">
        <div class="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Đang nạp danh sách bạn bè...</span>
      </div>
    `;
  }
  if (momentsGridEl) {
    momentsGridEl.innerHTML = `
      <div class="col-span-full py-4 text-center text-gray-500 text-xs">Đang tải khoảnh khắc...</div>
    `;
  }

  try {
    const res = await apiFetch(`/api/locket/friends/profile/${encodeURIComponent(identifier)}`);
    if (!res || !res.success || !res.data) {
      throw new Error((res && res.msg) || 'Không thể tìm thấy thông tin người dùng này trên Locket.');
    }

    const { profile, friends, friendsCount, mutualFriends, recentMoments } = res.data;
    currentProfileData = res.data;

    // 1. Header & Avatar
    const avatarEl = document.getElementById('uprofile-avatar');
    if (avatarEl) avatarEl.src = profile.profile_picture_url || DEFAULT_AVATAR;

    // 2. Names
    if (displayNameEl) displayNameEl.textContent = profile.display_name || profile.username || 'Người dùng Locket';
    if (usernameEl) usernameEl.textContent = profile.username ? `@${profile.username}` : (profile.uid ? `@${profile.uid.substring(0, 8)}...` : '');

    // 3. Status text
    const statusTextEl = document.getElementById('uprofile-status-text');
    if (statusTextEl) {
      if (profile.relationship === 'self') {
        statusTextEl.textContent = 'Tài khoản của bạn (Đang hoạt động)';
      } else if (profile.relationship === 'friend') {
        statusTextEl.textContent = 'Bạn bè trên Locket';
      } else {
        statusTextEl.textContent = 'Người dùng Locket (Chưa kết bạn)';
      }
    }

    // 4. Badges
    const badgeContainer = document.getElementById('uprofile-badges');
    if (badgeContainer) {
      let badgesHtml = '';
      if (profile.celebrity || profile.badge === 'celebrity') {
        badgesHtml += `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">⭐ Celebrity</span>`;
      }
      if (profile.is_local_account) {
        badgesHtml += `<span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1">🛡️ Tài khoản Pro</span>`;
      }
      if (profile.relationship === 'self') {
        badgesHtml += `<span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">Bạn</span>`;
      } else if (profile.relationship === 'friend') {
        badgesHtml += `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">✓ Bạn bè</span>`;
      }
      badgeContainer.innerHTML = badgesHtml;
    }

    // 5. Action Buttons
    const btnChat = document.getElementById('btn-uprofile-chat');
    const btnMoments = document.getElementById('btn-uprofile-view-moments');
    const btnAdd = document.getElementById('btn-uprofile-add');
    const btnUnfriend = document.getElementById('btn-uprofile-unfriend');

    if (btnChat) {
      if (profile.relationship === 'self') {
        btnChat.classList.add('hidden');
      } else {
        btnChat.classList.remove('hidden');
        btnChat.onclick = () => openChatFromProfile(profile.uid, profile.username, profile.display_name, profile.profile_picture_url);
      }
    }

    if (btnMoments) {
      if (profile.relationship === 'friend' || profile.relationship === 'self') {
        btnMoments.classList.remove('hidden');
        btnMoments.onclick = () => {
          closeUserProfileModal();
          viewFriendMoments(profile.uid);
        };
      } else {
        btnMoments.classList.add('hidden');
      }
    }

    if (btnAdd) {
      if (profile.relationship === 'none') {
        btnAdd.classList.remove('hidden');
        btnAdd.onclick = () => sendFriendRequestFromProfile(profile.username || profile.uid);
      } else {
        btnAdd.classList.add('hidden');
      }
    }

    if (btnUnfriend) {
      if (profile.relationship === 'friend') {
        btnUnfriend.classList.remove('hidden');
        btnUnfriend.onclick = () => unfriendFromProfile(profile.uid, profile.display_name || profile.username);
      } else {
        btnUnfriend.classList.add('hidden');
      }
    }

    // 6. Detailed Fields
    if (uidEl) uidEl.textContent = profile.uid || '-';
    if (emailEl) emailEl.textContent = profile.email || 'Ẩn theo chính sách bảo mật Locket';
    if (phoneEl) phoneEl.textContent = profile.phone_number || 'Chưa công khai';

    if (linkEl) {
      linkEl.textContent = profile.invite_link || '-';
      linkEl.href = profile.invite_link || '#';
    }

    const deviceRow = document.getElementById('uprofile-device-row');
    const deviceEl = document.getElementById('uprofile-device');
    if (deviceRow && deviceEl) {
      if (profile.device_model || profile.ios_version) {
        deviceRow.classList.remove('hidden');
        deviceEl.textContent = `${profile.device_model || 'Thiết bị Apple'} (${profile.ios_version || 'iOS'})`;
      } else {
        deviceEl.textContent = 'Ứng dụng Locket Camera';
      }
    }

    // 7. Friends List
    if (friendsCountEl) friendsCountEl.textContent = friendsCount || 0;

    if (friendsListEl) {
      if (friends && friends.length > 0) {
        friendsListEl.innerHTML = friends.map(f => {
          const friendName = (f.first_name ? `${f.first_name} ${f.last_name || ''}`.trim() : (f.username || f.uid));
          const friendSub = f.username ? `@${f.username}` : (f.uid ? `${f.uid.substring(0, 10)}...` : '');
          const friendAvatar = f.profile_picture_url || DEFAULT_AVATAR;
          const friendId = f.username || f.uid;
          return `
            <div onclick="openUserProfile('${friendId}')" class="p-2 rounded-xl bg-black/40 hover:bg-white/10 border border-white/5 hover:border-amber-400/40 cursor-pointer flex items-center justify-between gap-2.5 transition group" title="Nhấn để xem hồ sơ @${f.username || f.uid}">
              <div class="flex items-center gap-2.5 min-w-0">
                <img src="${friendAvatar}" alt="${escapeHtml(friendName)}" class="w-8 h-8 rounded-full object-cover border border-white/10 group-hover:border-amber-400/50 transition shrink-0" onerror="this.src=DEFAULT_AVATAR">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-white group-hover:text-amber-400 truncate transition">${escapeHtml(friendName)}</p>
                  <p class="text-[10px] text-gray-400 font-mono truncate">${escapeHtml(friendSub)}</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-gray-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition shrink-0"></i>
            </div>
          `;
        }).join('');
      } else {
        friendsListEl.innerHTML = `
          <div class="col-span-full py-4 text-center text-gray-500 text-xs">
            ${profile.celebrity ? 'Tài khoản nổi tiếng đã đạt giới hạn bạn bè tối đa (3000).' : 'Danh sách bạn bè riêng tư hoặc tài khoản chưa công khai.'}
          </div>
        `;
      }
    }

    // 8. Recent Moments
    const momentsCountEl = document.getElementById('uprofile-moments-count');
    if (momentsCountEl) momentsCountEl.textContent = recentMoments ? recentMoments.length : 0;

    const viewAllMomentsBtn = document.getElementById('btn-uprofile-view-all-moments');

    if (momentsGridEl) {
      if (recentMoments && recentMoments.length > 0) {
        if (viewAllMomentsBtn) {
          viewAllMomentsBtn.classList.remove('hidden');
          viewAllMomentsBtn.onclick = () => {
            closeUserProfileModal();
            viewFriendMoments(profile.uid);
          };
        }
        momentsGridEl.innerHTML = recentMoments.map(m => `
          <div class="relative aspect-square rounded-xl overflow-hidden group border border-white/10 bg-black cursor-pointer hover:border-amber-400/50 transition" onclick="closeUserProfileModal(); viewFriendMoments('${profile.uid}')">
            <img src="${m.thumbnail_url}" alt="Moment" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
            ${m.video_url ? '<div class="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white"><i data-lucide="play" class="w-2.5 h-2.5 fill-white"></i></div>' : ''}
            ${m.caption ? `<div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-[10px] text-white truncate font-medium">${escapeHtml(m.caption)}</div>` : ''}
          </div>
        `).join('');
      } else {
        if (viewAllMomentsBtn) viewAllMomentsBtn.classList.add('hidden');
        momentsGridEl.innerHTML = `
          <div class="col-span-full py-4 text-center text-gray-500 text-xs">
            ${profile.relationship === 'friend' || profile.relationship === 'self' ? 'Chưa có khoảnh khắc nào gần đây' : 'Chỉ bạn bè mới có thể xem khoảnh khắc'}
          </div>
        `;
      }
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Lỗi nạp profile:', err);
    showToast(err.message || 'Không thể tải hồ sơ người dùng', 'error');
    if (displayNameEl) displayNameEl.textContent = 'Không tìm thấy hồ sơ';
    if (usernameEl) usernameEl.textContent = `@${identifier}`;
    if (friendsListEl) {
      friendsListEl.innerHTML = `<div class="col-span-full py-4 text-center text-rose-400 text-xs">${escapeHtml(err.message || 'Lỗi khi tải hồ sơ')}</div>`;
    }
  }
}

function updateProfileHistoryBackBtn() {
  const btnBack = document.getElementById('btn-profile-history-back');
  const countSpan = document.getElementById('uprofile-history-count');
  if (!btnBack) return;
  if (profileHistory.length > 0) {
    btnBack.classList.remove('hidden');
    if (countSpan) countSpan.textContent = profileHistory.length;
  } else {
    btnBack.classList.add('hidden');
  }
}

function historyBackUserProfile() {
  if (profileHistory.length === 0) return;
  const prev = profileHistory.pop();
  if (prev && prev.profile) {
    openUserProfile(prev.profile.uid || prev.profile.username, false);
  }
}

function closeUserProfileModal() {
  const modal = document.getElementById('modal-user-profile');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  profileHistory = [];
  currentProfileData = null;
  updateProfileHistoryBackBtn();
}

function copyUserProfileUsername() {
  if (!currentProfileData || !currentProfileData.profile) return;
  const username = currentProfileData.profile.username || currentProfileData.profile.uid;
  navigator.clipboard.writeText(username).then(() => {
    showToast(`Đã sao chép: @${username} 📋`, 'success');
  });
}

function copyUserProfileUid() {
  if (!currentProfileData || !currentProfileData.profile) return;
  const uid = currentProfileData.profile.uid;
  navigator.clipboard.writeText(uid).then(() => {
    showToast(`Đã sao chép UID: ${uid} 📋`, 'success');
  });
}

function copyUserProfileLink() {
  if (!currentProfileData || !currentProfileData.profile) return;
  const link = currentProfileData.profile.invite_link;
  if (!link) {
    showToast('Người dùng chưa có link Locket công khai', 'info');
    return;
  }
  navigator.clipboard.writeText(link).then(() => {
    showToast(`Đã sao chép link Locket: ${link} 📋`, 'success');
  });
}

function openChatFromProfile(peerUid, username, displayName, avatar) {
  closeUserProfileModal();
  openChatWithAuthor(peerUid, displayName, avatar, username);
}

async function sendFriendRequestFromProfile(usernameOrUid) {
  showToast('Đang gửi lời mời kết bạn...', 'info');
  try {
    const res = await apiFetch('/api/locket/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameOrUid })
    });
    if (res && res.success) {
      showToast('Đã gửi lời mời kết bạn thành công! 🎉', 'success');
      openUserProfile(usernameOrUid, false);
    } else {
      showToast(res.msg || 'Không thể gửi kết bạn', 'error');
    }
  } catch (e) {
    showToast(e.message || 'Lỗi gửi kết bạn', 'error');
  }
}

async function unfriendFromProfile(targetUid, name) {
  if (!confirm(`Bạn có chắc muốn hủy kết bạn với ${name}?`)) return;
  try {
    const res = await apiFetch('/api/locket/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userUid: targetUid })
    });
    if (res && res.success) {
      showToast(`Đã hủy kết bạn với ${name}`, 'success');
      await loadFriends();
      openUserProfile(targetUid, false);
    } else {
      showToast(res.msg || 'Không thể hủy kết bạn', 'error');
    }
  } catch (e) {
    showToast(e.message || 'Lỗi hủy kết bạn', 'error');
  }
}
