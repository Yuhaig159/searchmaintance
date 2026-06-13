const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyJtGnyQcq5bxvAHqARyZ11x0mXIVlttBo3P6o7bSk06K_iN7oImLGToWWxX3nFrTaguA/exec',
  VERSION: "V128-AI",
  BUILD_DATE: "2026-04-09"
};

const MAINTENANCE_TARGETS = [
  { label: "Lọc gió động cơ", keys: ["LỌC GIÓ"], subKeys: ["ĐỘNG CƠ", "MÁY"], interval: 60000 },
  { label: "Lọc gió A/C", keys: ["LỌC GIÓ"], subKeys: ["A/C", "MÁY LẠNH", "CABIN", "ĐIỀU HÒA"], interval: 60000 },
  { label: "Lọc dầu", keys: ["LỌC DẦU"], interval: 80000 },
  { label: "Lọc nhiên liệu", keys: ["LỌC NHIÊN LIỆU"], interval: 50000 },
  { label: "Bố phanh", keys: ["BỐ PHANH", "MÔ PHANH", "PAD PHANH"], interval: 170000 },
  { label: "Dây curoa", keys: ["DÂY CUROA", "CUROA"], interval: 180000 },
  { label: "Nhớt hộp số sàn", keys: ["NHỚT", "DẦU"], subKeys: ["SÀN"], interval: 240000 },
  { label: "Nhớt hộp số tự động", keys: ["NHỚT", "DẦU"], subKeys: ["TỰ ĐỘNG"], interval: 200000 },
  { label: "Vỏ xe", keys: ["VỎ", "LỐP"], interval: 80000 },
  { label: "Bình ắc quy", keys: ["ẮC QUY", "BÌNH ELECTRIC", "PIN"], interval: 60000 } // Added battery
];

const google = {
  script: {
    get run() {
      let successCb = () => { };
      let failureCb = console.error;

      const runner = new Proxy({}, {
        get: function (target, prop) {
          if (prop === 'withSuccessHandler') {
            return function (cb) { successCb = cb; return runner; };
          }
          if (prop === 'withFailureHandler') {
            return function (cb) { failureCb = cb; return runner; };
          }
          return function (...args) {
            if (CONFIG.API_URL === 'YOUR_GOOGLE_WEB_APP_URL_HERE') {
              return failureCb(new Error("⚠️ Vui lòng điền API URL ở đầu file scripts.js"));
            }

            // Dùng POST request kèm theo action trên URL để tránh mất dữ liệu khi Redirect
            const finalUrl = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=' + prop;

            fetch(finalUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
              },
              body: JSON.stringify({ action: prop, args: args })
            })
              .then(res => {
                if (!res.ok) throw new Error("📡 Lỗi mạng hoặc URL không chính xác (" + res.status + ")");
                return res.text();
              })
              .then(text => {
                try {
                  return JSON.parse(text);
                } catch (e) {
                  throw new Error("❌ Không thể đọc dữ liệu máy chủ: " + text.substring(0, 50));
                }
              })
              .then(data => {
                if (data && data.serverApiError) {
                  failureCb(new Error(data.serverApiError));
                } else {
                  // 🔓 Giải nén nếu dữ liệu được nén từ Backend V125
                  if (data && data.isCompressed) {
                    data = decompressKeys(data);
                  }
                  successCb(data);
                }
              })
              .catch(e => failureCb(e));
          }
        }
      });
      return runner;
    }
  }
};

/**
 * Giải nén các Key viết tắt từ Backend để Frontend xử lý bình thường
 */
function decompressKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(decompressKeys);

  const reverseMapping = {
    p: 'plate',
    d: 'date',
    do: 'dateObj',
    kd: 'kmDisplay',
    k: 'km',
    s: 'system',
    c: 'category',
    w: 'work',
    mt: 'maintenanceType',
    dt: 'details',
    t: 'type',
    st: 'subType',
    vh: 'vehicles',
    stt: 'status'
  };

  const newObj = {};
  for (let key in obj) {
    let newKey = reverseMapping[key] || key;
    let value = obj[key];

    if (value && typeof value === 'object') {
      newObj[newKey] = decompressKeys(value);
    } else {
      newObj[newKey] = value;
    }
  }
  return newObj;
}
let rawData = [];
let currentPlate = '';
let initialStats = null;
let currentPage = 0;
const ITEMS_PER_PAGE = 10;
let isLoadingMore = false;
let filteredData = [];
const USER_ID = 'user_' + Math.random().toString(36).substr(2, 9);

const DataCache = {
  _mem: new Map(),
  get: function (key) {
    if (this._mem.has(key)) return this._mem.get(key);
    try {
      const cached = localStorage.getItem('cache_' + key);
      if (cached) {
        const item = JSON.parse(cached);
        if (Date.now() - item.time < 3600000) return item.data; // Cache 1h
      }
    } catch (e) { }
    return null;
  },
  set: function (key, data) {
    this._mem.set(key, data);
    try {
      localStorage.setItem('cache_' + key, JSON.stringify({ data: data, time: Date.now() }));
    } catch (e) {
      if (e.name === 'QuotaExceededError') localStorage.clear();
    }
  },
  clear: function () {
    this._mem.clear();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cache_')) {
        localStorage.removeItem(key);
      }
    }
  }
};

(function init() {
  document.body.setAttribute('data-theme', localStorage.getItem('theme') || 'light');
  loadInitialData();
  setupEventListeners();
  setupNetworkListeners();
  setupKeyboardShortcuts();
  loadLogo();
})();

function loadLogo() {
  fetch('Logo.html')
    .then(res => res.text())
    .then(svg => {
      const container = document.getElementById('logoContainer');
      if (container) container.innerHTML = svg;
    })
    .catch(e => console.error("Logo load error:", e));
}

function setupEventListeners() {
  const heroInput = document.getElementById('heroInput');
  heroInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') startSearch();
  });

  // Real-time license plate formatting (e.g. 51K12345 -> 51K-123.45)
  heroInput.addEventListener('input', e => {
    let cursor = e.target.selectionStart;
    let original = e.target.value;
    let val = original.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const match = val.match(/^(\d{2}[A-Z]{1,2})(\d{1,5})$/);
    if (match) {
      let numPart = match[2];
      if (numPart.length === 4) {
        val = `${match[1]}-${numPart}`;
      } else if (numPart.length === 5) {
        val = `${match[1]}-${numPart.slice(0, 3)}.${numPart.slice(3)}`;
      } else {
        val = `${match[1]}-${numPart}`;
      }
    }

    if (val !== original) {
      e.target.value = val;
      // Adjust cursor intuitively (basic approach)
      let diff = val.length - original.length;
      e.target.setSelectionRange(cursor + diff, cursor + diff);
    }
  });  // Quick search with clear button
  const quickSearchInput = document.getElementById('quickSearchInput');
  const chipClear = document.querySelector('.chip-clear');

  // V107: Fix debounce — dùng function bình thường + truy cập trực tiếp quickSearchInput
  quickSearchInput.addEventListener('input', debounce(function () {
    // Show/hide clear button
    if (quickSearchInput.value.trim()) {
      chipClear.classList.remove('hidden');
    } else {
      chipClear.classList.add('hidden');
    }
    resetPagination();
    renderUILazy();
  }, 150));

  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeReplacementModal();
    }
  });
}

function setupNetworkListeners() {
  window.addEventListener('online', () => {
    showToast('✅ Đã kết nối Internet');
    document.body.classList.remove('offline-mode');
  });
  window.addEventListener('offline', () => {
    showToast('📵 Đang ở chế độ Offline');
    document.body.classList.add('offline-mode');
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('heroInput').focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      if (document.getElementById('appSection').classList.contains('active')) forceRefresh();
    }
  });
}

function loadInitialData() {
  google.script.run
    .withSuccessHandler(response => {
      if (response.success) {
        initialStats = response.stats;
        if (response.autoUpdated) showToast("✨ Dữ liệu đã được đồng bộ!");
      }
    })
    .withFailureHandler(err => console.log("Initial data load failed:", err.message))
    .getInitialData();
}

function toggleTheme() {
  const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  showToast(newTheme === 'dark' ? '🌙 Chế độ tối' : '☀️ Chế độ sáng');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2700);
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function startSearch() {
  const val = document.getElementById('heroInput').value.trim();
  if (!val) { showToast('⚠️ Vui lòng nhập biển số xe'); return; }

  if (window.navigator?.vibrate) window.navigator.vibrate(50);

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');

  doSearch(val);
}

function toggleHeroClearBtn() {
  const val = document.getElementById('heroInput').value;
  const btn = document.getElementById('heroClearBtn');
  if (btn) {
    if (val.length > 0) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
}

function backToHero() {
  if (window.navigator?.vibrate) window.navigator.vibrate(20);

  document.getElementById('heroInput').value = '';
  const clearBtn = document.getElementById('heroClearBtn');
  if (clearBtn) clearBtn.classList.add('hidden');

  rawData = [];
  currentPlate = '';
  resetPagination();

  if (typeof switchBottomNavTab === 'function') {
    switchBottomNavTab('history');
  } else {
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
  }
}

function doSearch(plateVal) {
  let val = '';
  if (plateVal) val = plateVal.trim();
  else val = document.getElementById('heroInput').value.trim();

  val = val.replace(/[\s\-\.]/g, '').toUpperCase();
  if (!val) { showToast('⚠️ Vui lòng nhập biển số xe'); return; }

  currentPlate = val;
  document.getElementById('heroInput').value = val;
  toggleHeroClearBtn();

  // ⚡ INSTANT LOAD: Kiểm tra bộ nhớ đệm trước
  const cached = DataCache.get(val);
  if (cached) {
    hideLoading();
    rawData = cached.data;
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    renderSummary(cached);
    renderUILazy();
    initInfiniteScroll();
    console.log("⚡ Instant load from cache: " + val);
  } else {
    showLoading();
  }

  resetPagination();

  // Vẫn gọi Server để cập nhật dữ liệu mới nhất (Stale-While-Revalidate)
  google.script.run
    .withSuccessHandler(response => {
      hideLoading();
      if (response.error) {
        if (!cached) {
          showToast('❌ ' + response.error);
          document.getElementById('emptyState').classList.remove('hidden');
          document.getElementById('mainContent').classList.add('hidden');
        }
        return;
      }

      // Cập nhật Cache và UI
      DataCache.set(val, response);
      rawData = response.data;
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('mainContent').classList.remove('hidden');
      renderSummary(response);
      renderUILazy();
      initInfiniteScroll();
    })
    .withFailureHandler(err => {
      hideLoading();
      if (!cached) showToast('❌ Lỗi kết nối: ' + err.message);
    })
    .searchData(val, USER_ID);
}

function openReplacementModal(htmlContent) {
  const modal = document.getElementById('replacementModal');
  document.querySelector('#replacementTable tbody').innerHTML = htmlContent;
  modal.classList.remove('hidden');

  // ⚡ V112: Làm mờ và giảm độ sáng toàn bộ nền
  document.getElementById('appSection').classList.add('modal-blur-bg');
  document.querySelector('.bottom-nav').classList.add('modal-blur-bg');
  const backBtn = document.getElementById('backToTopBtn');
  if (backBtn) backBtn.classList.add('hidden');

  document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
}

function closeReplacementModal() {
  document.getElementById('replacementModal').classList.add('hidden');

  // ⚡ V112: Khôi phục nền cũ
  document.getElementById('appSection').classList.remove('modal-blur-bg');
  document.querySelector('.bottom-nav').classList.remove('modal-blur-bg');

  const backBtn = document.getElementById('backToTopBtn');
  // Check if we should show back btn (if scrolled down)
  if (backBtn && document.getElementById('mainContent').scrollTop > 200) {
    backBtn.classList.remove('hidden');
  }

  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
}

/* ═══════════════════════════════════════════════════════════════════════
   V107: Classification logic đã được chuyển hoàn toàn sang Backend (Code.gs)
   Frontend sử dụng trực tiếp d.maintenanceType từ search response
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
   ANALYZE MAINTENANCE INTERVALS
   ═══════════════════════════════════════════════════════════════════════ */
// V107: Dùng d.maintenanceType từ backend, không re-classify
function analyzeMaintenanceIntervals(data) {
  const periodicMaintenance = [];
  const replacements = [];
  let lastOilChangeGroup = null;

  data.forEach(group => {
    let containsOilChange = false;
    let hasPeriodic = false, hasReplacement = false;

    group.details.forEach(d => {
      // Keyword Search for "Nhớt máy" (Engine Oil)
      const content = ((d.category || '') + ' ' + (d.work || '') + ' ' + (d.system || '')).toUpperCase();
      if (content.includes("NHỚT MÁY")) {
        containsOilChange = true;
      }

      if (!d.maintenanceType) d.maintenanceType = { type: 'PERIODIC', subType: null };
      if (d.maintenanceType.type === 'PERIODIC') hasPeriodic = true;
      else hasReplacement = true;
    });

    if (containsOilChange && !lastOilChangeGroup) {
      lastOilChangeGroup = group;
    }

    if (hasPeriodic) periodicMaintenance.push(group);
    if (hasReplacement) replacements.push(group);
  });

  periodicMaintenance.sort((a, b) => b.km - a.km);
  replacements.sort((a, b) => b.km - a.km);

  return {
    periodicMaintenance,
    replacements,
    lastPeriodicKm: periodicMaintenance.length > 0 ? periodicMaintenance[0].km : 0,
    lastPeriodicDate: periodicMaintenance.length > 0 ? periodicMaintenance[0].date : '',
    lastReplacementKm: replacements.length > 0 ? replacements[0].km : 0,
    lastOilKm: lastOilChangeGroup ? lastOilChangeGroup.km : 0,
    lastOilDate: lastOilChangeGroup ? lastOilChangeGroup.date : ''
  };
}


function renderSummary(response) {
  const analysis = analyzeMaintenanceIntervals(rawData);
  const maxKm = Math.max(...rawData.map(g => g.km), 0);
  const normalizePlate = p => p.replace(/[\s\-\.]/g, '').toUpperCase();

  const savedPlates = typeof getSpecialPlates === 'function' ? getSpecialPlates() : ['51K529.01', '51K723.57', '51K728.49', '51D729.70', '51K727.37'];
  const defaultInterval = typeof getDefaultInterval === 'function' ? getDefaultInterval() : 10000;
  const plateCleaned = normalizePlate(response.plate);
  const interval = savedPlates.map(normalizePlate).includes(plateCleaned) ? 5000 : defaultInterval;

  const lastMilestoneKm = analysis.lastOilKm > 0 ? analysis.lastOilKm : analysis.lastPeriodicKm;
  const lastMilestoneDate = analysis.lastOilKm > 0 ? analysis.lastOilDate : analysis.lastPeriodicDate;
  const nextPeriodicKm = lastMilestoneKm > 0 ? lastMilestoneKm + interval : (Math.ceil(maxKm / interval) * interval || interval);

  const targets = MAINTENANCE_TARGETS;
  const latestReplacements = {};
  targets.forEach(t => latestReplacements[t.label] = { km: '---', date: '', nextDue: Infinity });

  rawData.forEach(g => {
    g.details.forEach(d => {
      const fullTxt = ((d.category || '') + ' ' + (d.work || '') + ' ' + (d.system || '')).toUpperCase();
      targets.forEach(t => {
        if (latestReplacements[t.label].km !== '---') return;
        const match = t.keys.some(k => fullTxt.includes(k)) && (!t.subKeys || t.subKeys.some(s => fullTxt.includes(s)));
        if (match) {
          const km = parseInt(g.km);
          latestReplacements[t.label] = { km: g.kmDisplay || km.toLocaleString('vi-VN'), date: g.date, nextDue: km + t.interval };
        }
      });
    });
  });

  const replacementRowsHtml = targets.map(t => {
    const item = latestReplacements[t.label];
    const hasData = item.km !== '---';
    const rowKm = hasData ? item.km.replace(/\D/g, '') : '';
    const currentKmVal = hasData ? parseInt(item.km.replace(/\./g, '')) : 0;
    const nextServiceKm = hasData ? (currentKmVal + t.interval).toLocaleString('vi-VN') : '---';

    return `
        <tr onclick="${hasData ? `MapsToReplacementCard('${t.label}', '${rowKm}', '${item.date}')` : ''}"
            style="cursor: ${hasData ? 'pointer' : 'default'}; border-bottom: 1px solid var(--ios-sep-light);">
          <td style="padding: 12px 0;">
            <div style="font-weight: 700; font-size: 15px; color: var(--ios-text);">${t.label}</div>
            <div style="font-size: 10px; color: var(--ios-text-secondary); margin-top: 2px;">Ngày thay: ${hasData ? item.date : '---'}</div>
          </td>
          <td style="text-align: right; padding: 12px 0; white-space: nowrap;">
            <div style="font-size: 14px; font-weight: 800; color: var(--ios-text);">Đã thay: ${item.km}</div>
            <div style="color: var(--brand-orange); font-weight: 800; font-size: 16px; margin: 2px 0;">Kỳ tới: ${nextServiceKm}</div>
          </td>
        </tr>`;
  }).join('');

  window.currentReplacementTableHtml = replacementRowsHtml;
  const isOverdue = (nextPeriodicKm - maxKm) <= 0;

  document.getElementById('summaryContainer').innerHTML = `
      <div class="summary-card ${isOverdue ? 'warning-state' : ''}">
        <div class="summary-item">
          <span class="label">Bảo dưỡng kỳ trước</span>
          <div class="value">${lastMilestoneKm > 0 ? lastMilestoneKm.toLocaleString('vi-VN') : '---'}</div>
          <div class="summary-item-subtitle">${lastMilestoneDate || ''}</div>
        </div>
        <div class="summary-item right-align">
          <span class="label">Bảo dưỡng kỳ sau</span>
          <div class="value">${nextPeriodicKm.toLocaleString('vi-VN')}</div>
        </div>
        <button onclick="openReplacementModal(window.currentReplacementTableHtml)" class="summary-btn">
          Chi tiết mốc phụ tùng
        </button>
      </div>`;
}

function renderUILazy() {
  const qVal = document.getElementById('quickSearchInput').value.toUpperCase();

  filteredData = rawData.map(group => ({
    ...group,
    details: group.details.filter(d =>
      !qVal || (d.category + d.work + d.system).toUpperCase().includes(qVal)
    )
  })).filter(group => group.details.length > 0);

  const start = currentPage * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageData = filteredData.slice(start, end);

  let html = '';
  pageData.forEach((group, index) => {
    let hasPeriodic = false, hasReplacement = false;
    group.details.forEach(d => {
      const type = d.maintenanceType?.type || 'REPAIR';
      if (type === 'PERIODIC') hasPeriodic = true;
      else if (type === 'REPLACEMENT') hasReplacement = true;
    });

    let badgeType = '', badgeClass = '';
    if (hasPeriodic && hasReplacement) { badgeType = 'Hỗn hợp'; badgeClass = 'mixed'; }
    else if (hasPeriodic) { badgeType = 'Định kỳ'; badgeClass = 'periodic'; }
    else if (hasReplacement) { badgeType = 'Phát sinh'; badgeClass = 'replacement'; }

    // Staggered delay for spring animation
    const delay = currentPage === 0 ? index * 0.04 : 0;

    html += `
        <div class="card fade-in-up-spring" style="animation-delay: ${delay}s">
          <div class="card-header">
            <div class="card-header-left">
              <div class="card-title">${group.date}</div>
              ${badgeType ? `<span class="card-badge ${badgeClass}">● ${badgeType}</span>` : ''}
            </div>
            <div>
              <div class="card-km">${group.kmDisplay || Number(group.km).toLocaleString('vi-VN')}</div>
              <div class="card-km-label">KM</div>
            </div>
          </div>
          <div class="card-body">
            ${group.details.map(d => {
      const type = d.maintenanceType?.type || 'REPAIR';
      const isPeriodic = type === 'PERIODIC';
      return `
                <div class="work-item">
                  <div class="work-item-icon ${isPeriodic ? '' : 'replacement'}" role="img">
                    ${isPeriodic ? '✓' : '🔧'}
                  </div>
                  <div class="work-item-content">
                    <span class="tag system-icon">${d.system}</span>
                    <div class="work-desc"><strong>${d.category}</strong> ${d.work}</div>
                  </div>
                </div>`;
    }).join('')}
          </div>
        </div>`;
  });

  const resultsList = document.getElementById('resultsList');
  if (currentPage === 0) {
    resultsList.innerHTML = html || '<p style="text-align:center; padding:20px; color:var(--ios-secondary)">Không tìm thấy nội dung khớp</p>';
  } else {
    resultsList.innerHTML += html;
  }

  updateInfiniteScrollTrigger();
  isLoadingMore = false;
}

function resetPagination() {
  currentPage = 0;
  isLoadingMore = false;
}

function forceRefresh() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('loading');
  showLoading();

  // Clear client-side cache
  DataCache.clear();

  google.script.run
    .withSuccessHandler(result => {
      if (btn) btn.classList.remove('loading');
      hideLoading();
      if (result.success) {
        showToast(`✅ ${result.message}`);
        loadInitialData();
        if (currentPlate) doSearch();
      } else {
        showToast('❌ ' + result.message);
      }
    })
    .withFailureHandler(err => {
      btn.classList.remove('loading');
      hideLoading();
      showToast('❌ Lỗi: ' + err.message);
    })
    .forceRefreshData();
}

function MapsToReplacementCard(partName, km, date) {
  closeReplacementModal();

  const cards = document.querySelectorAll('.card');
  let foundCard = null;

  cards.forEach(card => {
    const cardKm = card.querySelector('.card-km')?.textContent.replace(/\D/g, '');
    const cardDate = card.querySelector('.card-title')?.textContent.trim();
    if (cardKm === km && cardDate === date) foundCard = card;
  });

  if (foundCard) {
    foundCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      if (window.navigator?.vibrate) window.navigator.vibrate([50, 30, 50]);
      foundCard.style.transition = 'all 0.5s ease';
      foundCard.style.border = '2px solid var(--brand-orange)';
      foundCard.style.backgroundColor = 'rgba(252, 175, 23, 0.15)';
      foundCard.style.boxShadow = '0 0 25px rgba(252, 175, 23, 0.5)';
      showToast(`📍 Đã tìm thấy mục: ${partName}`);
    }, 500);

    setTimeout(() => {
      foundCard.style.border = '';
      foundCard.style.backgroundColor = '';
      foundCard.style.boxShadow = '';
    }, 3500);
  } else {
    showToast(`⚠️ Bản ghi ${km} KM hiện không nằm trong danh sách hiển thị`);
  }
}

let scrollTimeout;
let rafPending = false;

function handleScroll() {
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;
    const summary = document.getElementById('summaryContainer');
    const btn = document.getElementById('backToTopBtn');
    const mainContent = document.getElementById('mainContent');
    if (!btn) return;

    let shouldShow = false;
    const scrollPos = mainContent && !mainContent.classList.contains('hidden')
      ? Math.max(mainContent.scrollTop, window.scrollY)
      : window.scrollY;

    if (scrollPos > 300) {
      shouldShow = true;
    } else if (summary && summary.getBoundingClientRect().bottom < 0) {
      shouldShow = true;
    }

    if (shouldShow) {
      btn.classList.remove('hidden', 'ghost');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => btn.classList.add('ghost'), 3000);
    } else {
      btn.classList.add('hidden');
      clearTimeout(scrollTimeout);
    }
  });
}

window.addEventListener('scroll', handleScroll);

function initScrollListener() {
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.addEventListener('scroll', handleScroll);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollListener);
} else {
  initScrollListener();
}

function scrollToTop() {
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.navigator?.vibrate) window.navigator.vibrate(20);
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

console.log(`%c🚀 Tra Cứu Bảo Dưỡng Xe ${CONFIG.VERSION} 🏎️💨`, 'font-size: 16px; font-weight: bold; color: #E3B04B;');

/* ═══════════════════════════════════════════════════════════════════════
   NEW iOS 26 FEATURES
   ═══════════════════════════════════════════════════════════════════════ */



// Clear Quick Search
function clearQuickSearch() {
  const input = document.getElementById('quickSearchInput');
  input.value = '';
  document.querySelector('.chip-clear').classList.add('hidden');
  resetPagination();
  renderUILazy();
}

// Infinite Scroll
let infiniteScrollObserver = null;

function initInfiniteScroll() {
  // Cleanup existing observer
  if (infiniteScrollObserver) {
    infiniteScrollObserver.disconnect();
  }

  const trigger = document.getElementById('infiniteScrollTrigger');
  if (!trigger) return;

  infiniteScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isLoadingMore) {
        const hasMore = ((currentPage + 1) * ITEMS_PER_PAGE) < filteredData.length;
        if (hasMore) {
          loadMoreInfinite();
        }
      }
    });
  }, {
    root: null,
    rootMargin: '100px',
    threshold: 0.1
  });

  infiniteScrollObserver.observe(trigger);

  // Show/hide trigger based on data
  updateInfiniteScrollTrigger();
}

function loadMoreInfinite() {
  if (isLoadingMore) return;
  isLoadingMore = true;
  currentPage++;

  const trigger = document.getElementById('infiniteScrollTrigger');
  trigger.classList.remove('hidden');

  // V105: render ngay, không cần setTimeout
  renderUILazy();
  updateInfiniteScrollTrigger();
}

function updateInfiniteScrollTrigger() {
  const trigger = document.getElementById('infiniteScrollTrigger');
  const hasMore = ((currentPage + 1) * ITEMS_PER_PAGE) < filteredData.length;

  if (hasMore && filteredData.length > 0) {
    trigger.classList.remove('hidden');
  } else {
    trigger.classList.add('hidden');
  }
}

// (Stub replaced by full implementation below — see switchBottomNavTab)


function switchBottomNavTab(section) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const navItem = document.querySelector(`[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');

  // Hide all content sections
  ['mainContent', 'settingsSection', 'gpsSection', 'infoSection', 'emptyState'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  if (section === 'history') {
    if (rawData && rawData.length > 0 && currentPlate) {
      const el = document.getElementById('mainContent');
      el.classList.remove('hidden');
      el.scrollTop = 0;
    } else {
      document.getElementById('emptyState').classList.remove('hidden');
    }
  } else {
    let targetEl = null;
    if (section === 'gps') {
      targetEl = document.getElementById('gpsSection');
      targetEl.classList.remove('hidden');
      if (!currentFleetData) loadGpsData();
    } else if (section === 'info') {
      targetEl = document.getElementById('infoSection');
      targetEl.classList.remove('hidden');
      if (!currentInfoData) loadInfoData();
    } else if (section === 'settings') {
      targetEl = document.getElementById('settingsSection');
      targetEl.classList.remove('hidden');
      initSettingsTab();
    }
    if (targetEl) targetEl.scrollTop = 0;
  }
}

const DEFAULT_SPECIAL_PLATES = ['51K529.01', '51K723.57', '51K728.49', '51D729.70', '51K727.37'];

function getSpecialPlates() {
  try {
    const saved = localStorage.getItem('specialPlates');
    return saved ? JSON.parse(saved) : DEFAULT_SPECIAL_PLATES;
  } catch (e) { return DEFAULT_SPECIAL_PLATES; }
}

function getDefaultInterval() {
  return parseInt(localStorage.getItem('defaultInterval') || '10000');
}

function initSettingsTab() {
  // Dark mode toggle
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  document.getElementById('darkModeToggle').checked = isDark;

  // Interval selector
  const interval = getDefaultInterval();
  document.getElementById('defaultIntervalSelect').value = String(interval);

  // Special plates textarea
  const plates = getSpecialPlates();
  document.getElementById('specialPlatesTextarea').value = plates.join('\n');
}

function toggleThemeFromSettings(isDark) {
  const newTheme = isDark ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  showToast(isDark ? '🌙 Chế độ tối' : '☀️ Chế độ sáng');
}

function saveDefaultInterval(val) {
  localStorage.setItem('defaultInterval', val);
  showToast(`💾 Đã lưu khoảng cách mặc định: ${Number(val).toLocaleString('vi-VN')} KM`);
}

function saveSpecialPlates() {
  const txt = document.getElementById('specialPlatesTextarea').value;
  const plates = txt.split('\n').map(p => p.trim()).filter(p => p.length > 0);
  localStorage.setItem('specialPlates', JSON.stringify(plates));
  showToast(`💾 Đã lưu ${plates.length} biển số xe đặc biệt`);
}

function resetSpecialPlates() {
  localStorage.removeItem('specialPlates');
  document.getElementById('specialPlatesTextarea').value = DEFAULT_SPECIAL_PLATES.join('\n');
  showToast('↩ Đã khôi phục danh sách mặc định');
}

function clearAppLocalStorage() {
  if (!confirm('Xóa toàn bộ dữ liệu cục bộ (theme, cài đặt)? Không ảnh hưởng dữ liệu server.')) return;
  const theme = localStorage.getItem('theme');
  localStorage.clear();
  if (theme) localStorage.setItem('theme', theme);
  showToast('🗑️ Đã xóa dữ liệu cục bộ');
  initSettingsTab();
}

/* ═══════════════════════════════════════════════════════════════════════
   GPS LIVE STATUS FEATURE
   ═══════════════════════════════════════════════════════════════════════ */

let currentFleetData = null;
let currentFleetFilter = 'all';

function loadGpsData() {
  const emptyState = document.getElementById('gpsEmptyState');
  const vehicleList = document.getElementById('gpsVehicleList');

  emptyState.classList.remove('hidden');
  emptyState.querySelector('h3').textContent = 'Đang tải...';
  emptyState.querySelector('p').textContent = 'Đang lấy dữ liệu Đội xe từ server.';
  vehicleList.innerHTML = '';
  showLoading();

  const settings = {
    specialPlates: getSpecialPlates(),
    defaultInterval: getDefaultInterval()
  };

  google.script.run
    .withSuccessHandler(data => {
      hideLoading();
      if (!data || data.error || !data.success) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'Chưa có dữ liệu';
        emptyState.querySelector('p').textContent = data?.error || 'Vui lòng chạy Đồng bộ dữ liệu GPS trước.';
        return;
      }
      emptyState.classList.add('hidden');
      currentFleetData = data;
      renderFleetSummary(data);
      applyFleetFilters();
    })
    .withFailureHandler(err => {
      hideLoading();
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Lỗi kết nối';
      emptyState.querySelector('p').textContent = err.message;
      showToast('❌ Không thể tải dữ liệu Đội Xe');
    })
    .getFleetDashboard(settings);
}

function renderFleetSummary(data) {
  document.getElementById('fleetTotal').textContent = data.total || '--';
  document.getElementById('fleetOverdue').textContent = data.overdueCount || '0';
  document.getElementById('fleetDueSoon').textContent = data.dueSoonCount || '0';
  document.getElementById('fleetPending').textContent = data.pendingCount || '0';
  document.getElementById('fleetOk').textContent = data.okCount || '0';
}

function setFleetFilter(filter) {
  currentFleetFilter = filter;
  document.querySelectorAll('.fleet-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.fleet-tab[data-filter="${filter}"]`).classList.add('active');
  applyFleetFilters();
}

function applyFleetFilters() {
  if (!currentFleetData || !currentFleetData.vehicles) return;
  const query = document.getElementById('fleetSearchInput').value.replace(/[\s\-\.]/g, '').toUpperCase();

  let filtered = currentFleetData.vehicles;

  if (currentFleetFilter !== 'all') {
    filtered = filtered.filter(v => v.status === currentFleetFilter);
  }

  if (query) {
    filtered = filtered.filter(v => v.plate.includes(query));
  }

  renderFleetVehicleList(filtered);
}

function renderFleetVehicleList(vehicles) {
  const container = document.getElementById('gpsVehicleList');
  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--ios-text-secondary)"><span class="material-icons" style="font-size:48px;opacity:0.5;margin-bottom:10px;display:block;">no_crash</span>Không tìm thấy xe phù hợp</div>';
    return;
  }

  const html = vehicles.map((v, index) => {
    const delay = index * 0.03;

    // Safety check for interval to prevent divide by zero
    const interval = v.interval || 10000;

    // Calculate progress percentage (how much of the interval is consumed)
    let progressPct = 0;
    if (v.lastPeriodicKm > 0 && v.nextDueKm > 0) {
      const consumed = v.estimatedTotal - v.lastPeriodicKm;
      progressPct = Math.max(0, Math.min(100, (consumed / interval) * 100));
    }

    // Format text
    const kmRemainingText = v.kmRemaining !== null ? Math.abs(v.kmRemaining).toLocaleString('vi-VN') : '--';
    let alertHtml = '';

    if (v.status === 'overdue') {
      alertHtml = `<div class="fleet-alert overdue">⚠️ Quá hạn <span style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px;">${kmRemainingText}</span> km — Cần bảo dưỡng!</div>`;
    } else if (v.status === 'due_soon') {
      alertHtml = `<div class="fleet-alert due_soon">⏳ Sắp đến hạn — Còn lại <span style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px;">${kmRemainingText}</span> km</div>`;
    } else if (v.status === 'pending') {
      alertHtml = `<div class="fleet-alert pending">📝 ĐÃ BẢO DƯỠNG — Đang chờ ký duyệt hồ sơ</div>`;
    }

    const odoStatus = v.statusOdo === 'Chưa nhập' ? '<span style="color:var(--brand-orange)">⚠️ Gốc trống</span>' : 'Đã Đbộ';
    const pendingActionText = v.pendingAuth ? 'Hủy chờ duyệt' : 'Chờ duyệt';
    const pendingActionIcon = v.pendingAuth ? 'close' : 'history_edu';

    return `
      <div class="fleet-card fade-in-up-spring" style="animation-delay:${delay}s">
        <div class="fleet-card-header">
          <div class="fleet-card-plate">
            <div class="fleet-status-dot ${v.status}"></div>
            ${v.plate}
          </div>
          <div style="display:flex;gap:6px;">
            ${(v.status === 'overdue' || v.status === 'due_soon' || v.pendingAuth) ?
        `<button class="fleet-edit-btn" onclick="togglePendingStatus('${v.plate}', ${!v.pendingAuth})" style="${v.pendingAuth ? 'background:var(--ios-fill-tertiary);color:var(--ios-text-secondary)' : 'color:#007AFF'}">
                <span class="material-icons" style="font-size:14px">${pendingActionIcon}</span> ${pendingActionText}
               </button>` : ''}
            <button class="fleet-edit-btn" onclick="showOdoEditor('${v.plate}', ${v.estimatedTotal})">
              <span class="material-icons" style="font-size:14px">edit</span> Sửa Km
            </button>
          </div>
        </div>
        
        <div class="fleet-metrics">
          <div>Km hiện tại: <span class="fleet-metric-val">${v.estimatedTotal ? v.estimatedTotal.toLocaleString('vi-VN') : '--'}</span></div>
          <div>Hôm nay: <span class="fleet-metric-val" style="color:var(--brand-green)">+${v.dayKm > 0 ? v.dayKm.toLocaleString('vi-VN') : '0'} km</span></div>
        </div>
        
        <div class="fleet-progress-wrap">
          <div class="fleet-progress-bar">
            <div class="fleet-progress-fill ${v.status}" style="width: ${progressPct}%"></div>
          </div>
          <div class="fleet-progress-labels">
            <span>BĐ cuối: ${v.lastPeriodicKm ? v.lastPeriodicKm.toLocaleString('vi-VN') : '---'}</span>
            <span>Tiếp theo: ${v.nextDueKm ? v.nextDueKm.toLocaleString('vi-VN') : '---'} (${(v.interval / 1000)}k)</span>
          </div>
        </div>
        
        ${alertHtml}
        
        <!-- Inline Editor Container (Hidden by default) -->
        <div id="odoEditor_${v.plate}" class="fleet-editor hidden">
          <div class="fleet-editor-title">Cập nhật Km thực tế — ${v.plate}</div>
          <div class="fleet-editor-input-wrap">
            <input type="number" id="odoInput_${v.plate}" class="fleet-editor-input" value="${v.estimatedTotal}" placeholder="Nhập số Km mới...">
          </div>
          <div class="fleet-editor-actions">
            <button class="fleet-editor-btn cancel" onclick="cancelOdoEditor('${v.plate}')">Hủy</button>
            <button class="fleet-editor-btn save" onclick="saveOdoEditor('${v.plate}')">Cập nhật ✓</button>
          </div>
        </div>
        

      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Inline Editor logic
function showOdoEditor(plate, currentKm) {
  const editor = document.getElementById(`odoEditor_${plate}`);
  if (editor) {
    editor.classList.remove('hidden');
    const input = document.getElementById(`odoInput_${plate}`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function cancelOdoEditor(plate) {
  const editor = document.getElementById(`odoEditor_${plate}`);
  if (editor) {
    editor.classList.add('hidden');
  }
}

function saveOdoEditor(plate) {
  const input = document.getElementById(`odoInput_${plate}`);
  if (!input) return;

  const newKm = parseInt(input.value);
  if (isNaN(newKm) || newKm <= 0) {
    showToast('❌ Vui lòng nhập số KM hợp lệ!');
    return;
  }

  showLoading();

  google.script.run
    .withSuccessHandler(success => {
      hideLoading();
      if (success) {
        showToast('✅ Đã cập nhật ODO thành công');
        cancelOdoEditor(plate);
        // Tải lại danh sách xe để refresh dữ liệu
        loadGpsData();
      } else {
        showToast('❌ Cập nhật thất bại. Vui lòng thử lại.');
      }
    })
    .withFailureHandler(err => {
      hideLoading();
      showToast('❌ Lỗi: ' + err.message);
    })
    .updateManualOdo(plate, newKm);
}

function togglePendingStatus(plate, isPending) {
  showLoading();
  google.script.run
    .withSuccessHandler(success => {
      hideLoading();
      if (success) {
        showToast(isPending ? '✅ Đã đánh dấu Chờ duyệt hồ sơ' : '✅ Đã hủy chờ duyệt');
        loadGpsData();
      } else {
        showToast('❌ Cập nhật thất bại');
      }
    })
    .withFailureHandler(err => {
      hideLoading();
      showToast('❌ Lỗi: ' + err.message);
    })
    .togglePendingAuth(plate, isPending);
}

/* ═══════════════════════════════════════════════════════════════════════
   INFO CAR FEATURE
   ═══════════════════════════════════════════════════════════════════════ */

let currentInfoData = null;

function loadInfoData() {
  const emptyState = document.getElementById('infoEmptyState');
  const vehicleList = document.getElementById('infoVehicleList');

  emptyState.classList.remove('hidden');
  emptyState.querySelector('h3').textContent = 'Đang tải...';
  emptyState.querySelector('p').textContent = 'Đang lấy dữ liệu Thông tin xe từ server.';
  vehicleList.innerHTML = '';
  showLoading();

  google.script.run
    .withSuccessHandler(res => {
      hideLoading();
      if (!res || !res.success || !res.data || res.data.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'Chưa có dữ liệu';
        emptyState.querySelector('p').textContent = res?.error || 'Không tìm thấy thông tin xe.';
        return;
      }
      emptyState.classList.add('hidden');
      currentInfoData = res.data;
      applyInfoFilters();
    })
    .withFailureHandler(err => {
      hideLoading();
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Lỗi kết nối';
      emptyState.querySelector('p').textContent = err.message;
      showToast('❌ Không thể tải Thông tin xe');
    })
    .getInfoCarData();
}

function applyInfoFilters() {
  if (!currentInfoData) return;
  const query = document.getElementById('infoSearchInput').value.toLowerCase();
  
  let filtered = currentInfoData;
  if (query) {
    filtered = currentInfoData.filter(v => {
      return Object.values(v).some(val => String(val).toLowerCase().includes(query));
    });
  }
  
  renderInfoVehicleList(filtered);
}

function getColValue(obj, keys) {
  const objKeys = Object.keys(obj);
  for (let key of keys) {
    const found = objKeys.find(k => k.toLowerCase().includes(key.toLowerCase()));
    if (found && obj[found]) return obj[found];
  }
  return '---';
}

function renderInfoVehicleList(vehicles) {
  const container = document.getElementById('infoVehicleList');
  if (!vehicles || vehicles.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--ios-text-secondary)"><span class="material-icons" style="font-size:48px;opacity:0.5;margin-bottom:10px;display:block;">no_crash</span>Không tìm thấy xe phù hợp</div>';
    return;
  }

  const html = vehicles.map((v, index) => {
    const delay = index * 0.03;
    
    // Attempt to identify core fields
    const plate = getColValue(v, ['biển số', 'plate', 'xe']);
    const pic = getColValue(v, ['người phụ trách', 'pic', 'quản lý', 'phụ trách', 'nvpt', 'người quản lý']);
    const driver = getColValue(v, ['tài xế', 'driver', 'người lái', 'lái xe']);
    const phone = getColValue(v, ['điện thoại', 'sđt', 'phone', 'số đt']);
    
    const getIconForKey = (key) => {
      const k = key.toLowerCase();
      if (k.includes('biển số') || k.includes('mã xe') || k.includes('xe')) return 'directions_car';
      if (k.includes('hãng') || k.includes('model') || k.includes('loại')) return 'time_to_leave';
      if (k.includes('chỗ')) return 'airline_seat_recline_normal';
      if (k.includes('năm sx') || k.includes('năm')) return 'calendar_month';
      if (k.includes('nhiên liệu') || k.includes('nl') || k.includes('xăng') || k.includes('dầu')) return 'local_gas_station';
      if (k.includes('định mức') || k.includes('l/100km')) return 'speed';
      if (k.includes('phụ trách') || k.includes('quản lý') || k.includes('tài xế')) return 'person';
      if (k.includes('chức danh')) return 'badge';
      if (k.includes('nhánh') || k.includes('vùng') || k.includes('bộ phận')) return 'domain';
      if (k.includes('điện thoại') || k.includes('sđt')) return 'phone';
      if (k.includes('stt')) return 'format_list_numbered';
      return 'label';
    };

    // Create detailed list of all columns in Bento Grid style
    const detailsHtml = Object.keys(v).filter(k => v[k]).map(k => {
      const icon = getIconForKey(k);
      const isLong = String(v[k]).length > 20 || String(k).length > 15;
      return `
        <div class="info-bento-item" ${isLong ? 'style="grid-column: span 2;"' : ''}>
          <div class="info-bento-icon-wrap">
            <span class="material-icons info-bento-icon">${icon}</span>
          </div>
          <div class="info-bento-content">
            <span class="info-bento-label">${k}</span>
            <span class="info-bento-value">${v[k]}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="info-card-container fade-in-up-spring" style="animation-delay:${delay}s" onclick="toggleInfoCard(this, event)">
        <div class="info-card">
          <div class="info-card-inner">
            <!-- FRONT: Quick Info -->
            <div class="info-card-front">
              <div class="info-front-content">
                <div class="info-front-header">
                  <div class="info-plate-badge">${plate}</div>
                  ${phone !== '---' ? `<a href="tel:${phone}" class="info-call-btn" onclick="event.stopPropagation();"><span class="material-icons" style="font-size:20px;">call</span></a>` : ''}
                </div>
                
                <div class="info-front-body">
                  <div class="info-role-row">
                    <div class="info-role-icon">
                      <span class="material-icons" style="font-size:20px;">admin_panel_settings</span>
                    </div>
                    <div class="info-role-text">
                      <span class="info-role-title">Phụ trách</span>
                      <span class="info-role-name">${pic}</span>
                    </div>
                  </div>
                  
                  <div class="info-role-row">
                    <div class="info-role-icon">
                      <span class="material-icons" style="font-size:20px;">badge</span>
                    </div>
                    <div class="info-role-text">
                      <span class="info-role-title">Tài xế</span>
                      <span class="info-role-name">${driver} ${phone !== '---' ? ` • ${phone}` : ''}</span>
                    </div>
                  </div>
                </div>

                <div class="info-front-footer">
                  <span class="material-icons" style="font-size:16px;">touch_app</span> Chạm để xem chi tiết
                </div>
              </div>
            </div>
            
            <!-- BACK: Full Details -->
            <div class="info-card-back">
              <div class="info-card-header">
                <div class="info-card-plate">${plate}</div>
                <button class="info-close-btn" onclick="closeInfoCard(event)">
                  <span class="material-icons" style="font-size:18px;">close</span>
                </button>
              </div>
              <div class="info-bento-grid">
                ${detailsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

let activeInfoCard = null;

function toggleInfoCard(containerEl, event) {
  if (event) event.stopPropagation();
  
  if (activeInfoCard && activeInfoCard !== containerEl) {
    activeInfoCard.classList.remove('expanded');
    activeInfoCard.querySelector('.info-card').classList.remove('flipped');
  }

  const isExpanded = containerEl.classList.contains('expanded');
  
  if (isExpanded) {
    closeInfoCard();
  } else {
    containerEl.classList.add('expanded');
    containerEl.querySelector('.info-card').classList.add('flipped');
    
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('infoOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'infoOverlay';
      overlay.className = 'info-overlay';
      overlay.onclick = closeInfoCard;
      document.getElementById('infoSection').appendChild(overlay);
    }
    overlay.classList.add('active');
    
    activeInfoCard = containerEl;
  }
}

function closeInfoCard() {
  if (activeInfoCard) {
    activeInfoCard.classList.remove('expanded');
    activeInfoCard.querySelector('.info-card').classList.remove('flipped');
    activeInfoCard = null;
  }
  const overlay = document.getElementById('infoOverlay');
  if (overlay) overlay.classList.remove('active');
}

