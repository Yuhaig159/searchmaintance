const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwUipO_fQ7XB0635MSN8cjg37VVmFLvZgeEVAaB5_tuo5gSBzo6C9ST5zCwZIB96Whu/exec',
  VERSION: "V126-GPS",
  BUILD_DATE: "2026-04-07"
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
      let successCb = () => {};
      let failureCb = console.error;
      
      const runner = new Proxy({}, {
        get: function(target, prop) {
          if (prop === 'withSuccessHandler') {
            return function(cb) { successCb = cb; return runner; };
          }
          if (prop === 'withFailureHandler') {
            return function(cb) { failureCb = cb; return runner; };
          }
          return function(...args) {
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
               } catch(e) {
                   throw new Error("❌ Không thể đọc dữ liệu máy chủ: " + text.substring(0,50));
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
    get: function(key) {
      if (this._mem.has(key)) return this._mem.get(key);
      try {
        const cached = localStorage.getItem('cache_' + key);
        if (cached) {
          const item = JSON.parse(cached);
          if (Date.now() - item.time < 3600000) return item.data; // Cache 1h
        }
      } catch (e) {}
      return null;
    },
    set: function(key, data) {
      this._mem.set(key, data);
      try {
        localStorage.setItem('cache_' + key, JSON.stringify({ data: data, time: Date.now() }));
      } catch (e) {
        if (e.name === 'QuotaExceededError') localStorage.clear();
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
    document.getElementById('heroInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') startSearch();
    });



    // Quick search with clear button
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

    document.getElementById('heroSection').classList.add('hidden');
    document.getElementById('appSection').classList.add('active');
    doSearch(val);
  }

  function backToHero() {
    document.getElementById('heroInput').value = '';
    document.getElementById('currentPlate').textContent = '--';
    document.getElementById('appHeader').style.display = 'none';
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('appSection').classList.remove('active');
    document.getElementById('heroSection').classList.remove('hidden');

    rawData = [];
    currentPlate = '';
    resetPagination();
  }

  function doSearch(plateVal) {
    let val = '';
    if (plateVal) val = plateVal.trim();
    else val = document.getElementById('heroInput').value.trim();
    
    val = val.replace(/[\s\-\.]/g, '').toUpperCase();
    if (!val) { showToast('⚠️ Vui lòng nhập biển số xe'); return; }

    currentPlate = val;
    
    // Update plate number display in header
    document.getElementById('appHeader').style.display = 'flex';
    document.getElementById('currentPlate').textContent = val;
    document.getElementById('headerBackBtn').classList.remove('hidden');
    document.getElementById('refreshBtn').classList.remove('hidden');

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
    btn.classList.add('loading');
    showLoading();

    google.script.run
      .withSuccessHandler(result => {
        btn.classList.remove('loading');
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

  window.onscroll = function () {
    if (rafPending) return;
    rafPending = true;

    requestAnimationFrame(() => {
      rafPending = false;
      const summary = document.getElementById('summaryContainer');
      const btn = document.getElementById('backToTopBtn');
      if (!summary || !btn) return;

      if (summary.getBoundingClientRect().bottom < 0) {
        btn.classList.remove('hidden', 'ghost');
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => btn.classList.add('ghost'), 3000);
      } else {
        btn.classList.add('hidden');
        clearTimeout(scrollTimeout);
      }
    });
  };

  function scrollToTop() {
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

  /* ═══════════════════════════════════════════════════════════════════════
     STATS FEATURE - FLEET STATISTICS
     ═══════════════════════════════════════════════════════════════════════ */

  let currentStatsData = null;
  let currentTimeRange = 'all';
  let maintenanceTypeChartInstance = null;
  let timelineChartInstance = null;

  // Load Stats Data
  function loadStatsData(timeRange) {
    const statsSection = document.getElementById('statsSection');
    const emptyState = document.getElementById('statsEmptyState');

    emptyState.classList.remove('hidden');
    showLoading();

    google.script.run
      .withSuccessHandler(data => {
        hideLoading();
        if (data.error) {
          emptyState.querySelector('h3').textContent = 'Lỗi tải dữ liệu';
          emptyState.querySelector('p').textContent = data.error;
          return;
        }

        emptyState.classList.add('hidden');
        currentStatsData = data;
        currentTimeRange = timeRange;

        renderStatsOverview(data);
        renderMaintenanceTypeChart(data);
        renderTimelineChart(data);
        renderTopServices(data);
      })
      .withFailureHandler(err => {
        hideLoading();
        emptyState.querySelector('h3').textContent = 'Lỗi kết nối';
        emptyState.querySelector('p').textContent = err.message;
        showToast('❌ Không thể tải thống kê');
      })
      .getFleetStats(timeRange);
  }

  // Render Overview Cards
  function renderStatsOverview(data) {
    document.getElementById('statTotalVehicles').textContent = data.totalVehicles || '--';
    document.getElementById('statTotalServices').textContent = data.totalServices || '--';
    document.getElementById('statAvgKm').textContent = data.avgKm ? data.avgKm.toLocaleString('vi-VN') : '--';
    document.getElementById('statMostActive').textContent = data.mostActive || '--';
  }

  // Render Maintenance Type Chart (Pie)
  function renderMaintenanceTypeChart(data) {
    const canvas = document.getElementById('maintenanceTypeChart');
    const ctx = canvas.getContext('2d');

    // Destroy previous chart
    if (maintenanceTypeChartInstance) {
      maintenanceTypeChartInstance.destroy();
    }

    const typeData = data.typeBreakdown || { periodic: 0, replacement: 0 };

    maintenanceTypeChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Bảo dưỡng định kỳ', 'Thay thế phụ tùng'],
        datasets: [{
          data: [typeData.periodic, typeData.replacement],
          backgroundColor: [
            'rgba(52, 199, 89, 0.8)',   // Green
            'rgba(255, 149, 0, 0.8)'     // Orange
          ],
          borderColor: [
            'rgba(52, 199, 89, 1)',
            'rgba(255, 149, 0, 1)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 13, weight: '600' },
              color: getComputedStyle(document.body).getPropertyValue('--ios-text').trim()
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = typeData.periodic + typeData.replacement;
                const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                return `${label}: ${value} (${percent}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Render Timeline Chart (Bar)
  function renderTimelineChart(data) {
    const canvas = document.getElementById('timelineChart');
    const ctx = canvas.getContext('2d');

    // Destroy previous chart
    if (timelineChartInstance) {
      timelineChartInstance.destroy();
    }

    const timeline = data.timeline || [];
    const labels = timeline.map(t => t.month);
    const values = timeline.map(t => t.count);

    timelineChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Số lần bảo dưỡng',
          data: values,
          backgroundColor: 'rgba(0, 122, 255, 0.7)',
          borderColor: 'rgba(0, 122, 255, 1)',
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: getComputedStyle(document.body).getPropertyValue('--ios-text-secondary').trim()
            },
            grid: {
              color: getComputedStyle(document.body).getPropertyValue('--ios-sep').trim()
            }
          },
          x: {
            ticks: {
              color: getComputedStyle(document.body).getPropertyValue('--ios-text-secondary').trim(),
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function (context) {
                return 'Tháng ' + context[0].label;
              }
            }
          }
        }
      }
    });
  }

  // Render Top Services
  function renderTopServices(data) {
    const container = document.getElementById('topServicesList');
    const services = data.topServices || [];

    if (services.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--ios-text-secondary)">Chưa có dữ liệu</p>';
      return;
    }

    const html = services.map(service => `
      <div class="service-item">
        <div class="service-item-left">
          <div class="service-name">${service.name}</div>
          <div class="service-last-date">Lần cuối: ${service.lastDate || '--'}</div>
        </div>
        <div class="service-count">${service.count}</div>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // Filter Stats by Time
  function filterStatsByTime(months) {
    // Update active button
    document.querySelectorAll('.time-filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-months="${months}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Reload stats
    loadStatsData(months);
  }

  function switchBottomNavTab(section) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.querySelector(`[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    // Hide all content sections
    ['mainContent', 'heroSection', 'statsSection', 'settingsSection', 'gpsSection', 'emptyState'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    const appHeader = document.getElementById('appHeader');
    const headerTitle = document.getElementById('currentPlate');
    const backBtn = document.getElementById('headerBackBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    if (section === 'history') {
      if (rawData && rawData.length > 0 && currentPlate) {
        const el = document.getElementById('mainContent');
        el.classList.remove('hidden');
        el.scrollTop = 0;
        appHeader.style.display = 'flex';
        headerTitle.textContent = currentPlate;
        backBtn.classList.remove('hidden');
        refreshBtn.classList.remove('hidden');
      } else {
        document.getElementById('heroSection').classList.remove('hidden');
        appHeader.style.display = 'none';
      }
    } else {
      appHeader.style.display = 'flex';
      backBtn.classList.add('hidden');
      refreshBtn.classList.add('hidden');
      
      let targetEl = null;
      if (section === 'stats') {
        targetEl = document.getElementById('statsSection');
        targetEl.classList.remove('hidden');
        headerTitle.textContent = 'Thống Kê';
        if (!currentStatsData) loadStatsData('all');
      } else if (section === 'gps') {
        targetEl = document.getElementById('gpsSection');
        targetEl.classList.remove('hidden');
        headerTitle.textContent = 'GPS Tracking';
        if (!currentGpsData) loadGpsData();
      } else if (section === 'settings') {
        targetEl = document.getElementById('settingsSection');
        targetEl.classList.remove('hidden');
        headerTitle.textContent = 'Cài Đặt';
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

  let currentGpsData = null;

  function loadGpsData() {
    const emptyState = document.getElementById('gpsEmptyState');
    const vehicleList = document.getElementById('gpsVehicleList');
    
    emptyState.classList.remove('hidden');
    emptyState.querySelector('h3').textContent = 'Đang tải...';
    emptyState.querySelector('p').textContent = 'Đang lấy dữ liệu GPS từ server.';
    vehicleList.innerHTML = '';
    showLoading();

    google.script.run
      .withSuccessHandler(data => {
        hideLoading();
        if (!data || data.error || !data.success) {
          emptyState.classList.remove('hidden');
          emptyState.querySelector('h3').textContent = 'Chưa có dữ liệu GPS';
          emptyState.querySelector('p').textContent = data?.error || 'Hãy chạy Đồng bộ GPS từ Google Sheets.';
          return;
        }
        emptyState.classList.add('hidden');
        currentGpsData = data;
        renderGpsSummary(data);
        renderGpsVehicleList(data.vehicles);
      })
      .withFailureHandler(err => {
        hideLoading();
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'Lỗi kết nối';
        emptyState.querySelector('p').textContent = err.message;
        showToast('❌ Không thể tải dữ liệu GPS');
      })
      .getLiveStatusData();
  }

  function renderGpsSummary(data) {
    document.getElementById('gpsTotalVehicles').textContent = data.total || '--';
    document.getElementById('gpsActiveCount').textContent = data.activeCount || '0';
    document.getElementById('gpsTotalDayKm').textContent = data.totalDayKm ? data.totalDayKm.toLocaleString('vi-VN') : '--';
  }

  function renderGpsVehicleList(vehicles) {
    const container = document.getElementById('gpsVehicleList');
    if (!vehicles || vehicles.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--ios-text-secondary)">Không có xe nào</p>';
      return;
    }

    const html = vehicles.map((v, index) => {
      const isActive = v.dayKm > 0;
      const statusClass = isActive ? 'gps-card-active' : 'gps-card-idle';
      const statusIcon = isActive ? '🟢' : '⚪';
      const statusText = isActive ? `${v.dayKm.toLocaleString('vi-VN')} km hôm nay` : 'Chưa di chuyển';
      const delay = index * 0.03;

      return `
        <div class="gps-card ${statusClass} fade-in-up-spring" style="animation-delay:${delay}s">
          <div class="gps-card-status-indicator"></div>
          <div class="gps-card-body">
            <div class="gps-card-plate">${v.plate}</div>
            <div class="gps-card-meta">${statusIcon} ${statusText}</div>
            <div class="gps-card-update">Cập nhật: ${v.lastUpdate || '--'}</div>
          </div>
          <div class="gps-card-right">
            <div class="gps-card-total-km">${v.estimatedTotal ? v.estimatedTotal.toLocaleString('vi-VN') : '--'}</div>
            <div class="gps-card-total-label">Km tổng</div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = html;
  }

  function filterGpsList() {
    if (!currentGpsData || !currentGpsData.vehicles) return;
    const query = document.getElementById('gpsSearchInput').value.replace(/[\s\-\.]/g, '').toUpperCase();
    
    if (!query) {
      renderGpsVehicleList(currentGpsData.vehicles);
      return;
    }

    const filtered = currentGpsData.vehicles.filter(v => v.plate.includes(query));
    renderGpsVehicleList(filtered);
  }