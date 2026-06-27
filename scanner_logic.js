let currentScannedData = null;
let currentPreviewUrl = null;

function triggerQuoteScan() {
    document.getElementById('quoteFileInput').click();
}

/**
 * Xử lý file (Ảnh/PDF) và tạo bản xem trước
 */
function handleQuoteFile(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const mimeType = file.type || 'image/jpeg';
    
    // Tạo URL xem trước
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = URL.createObjectURL(file);
    
    showLoading(true);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        let base64Data = e.target.result.split(',')[1];
        
        if (mimeType === 'application/pdf') {
            sendQuoteToAi(base64Data, mimeType);
        } else {
            // Nén ảnh nếu là hình chụp
            compressImage(file, function(compressedBase64) {
                sendQuoteToAi(compressedBase64, mimeType);
            });
        }
    };
    reader.readAsDataURL(file);
    
    input.value = '';
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 1200;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function sendQuoteToAi(base64Data, mimeType) {
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=extractQuote';
    
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64Data: base64Data, mimeType: mimeType })
    })
    .then(res => res.json())
    .then(res => {
        showLoading(false);
        if (res && res.isCompressed) res = decompressKeys(res);

        if (res && res.error) {
            alert('❌ Lỗi: ' + res.error);
        } else if (res && res.plate !== undefined) {
            renderScanReview(res, mimeType);
        } else {
            alert('❌ AI không trả về dữ liệu hợp lệ.');
        }
    })
    .catch(err => {
        showLoading(false);
        alert('❌ Lỗi kết nối: ' + err.message);
    });
}

/**
 * Hiển thị Modal Side-by-Side
 */
function renderScanReview(data, mimeType) {
    currentScannedData = data;
    
    // 1. Hiển thị Preview
    const previewPanel = document.getElementById('scanPreviewPanel');
    if (mimeType === 'application/pdf') {
        previewPanel.innerHTML = `<iframe src="${currentPreviewUrl}#toolbar=0" type="application/pdf"></iframe>`;
    } else {
        previewPanel.innerHTML = `<img src="${currentPreviewUrl}" alt="Preview">`;
    }

    // 2. Điền thông tin cơ bản
    document.getElementById('scanPlate').value = data.plate || '';
    document.getElementById('scanDate').value = data.date || new Date().toLocaleDateString('vi-VN');
    document.getElementById('scanKm').value = data.km || 0;
    document.getElementById('scanGrandTotal').value = data.grandTotal || 0;
    
    // 3. Render danh sách hạng mục
    const listContainer = document.getElementById('scanItemsList');
    listContainer.innerHTML = '';
    (data.items || []).forEach((item, index) => {
        addScanItemRow(item, index);
    });
    
    document.getElementById('scanReviewModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function addScanItemRow(item, index) {
    const container = document.getElementById('scanItemsList');
    const card = document.createElement('div');
    card.className = 'scan-item-card';
    
    const classifications = ['Bảo dưỡng định kỳ', 'Thay thế phụ tùng', 'Sửa chữa phát sinh'];
    const systems = ['Động cơ', 'Phanh', 'Gầm', 'Điện', 'Lốp', 'Điều hòa', 'Khác'];

    card.innerHTML = `
        <button class="scan-del-btn" onclick="removeScanItemRow(${index})">
            <span class="material-icons">delete</span>
        </button>
        <div class="scan-item-grid">
            <div class="scan-input-group">
                <label>Tên hạng mục</label>
                <input type="text" value="${item.category || ''}" oninput="updateItem(${index}, 'category', this.value)">
            </div>
            <div class="scan-input-group">
                <label>Hệ thống</label>
                <select onchange="updateItem(${index}, 'system', this.value)">
                    ${systems.map(s => `<option value="${s}" ${item.system === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="scan-input-group" style="margin-bottom:12px;">
            <label>Phân loại</label>
            <select onchange="updateItem(${index}, 'classification', this.value)">
                ${classifications.map(c => `<option value="${c}" ${item.classification === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
        </div>
        <div class="scan-item-row-3">
            <div class="scan-input-group">
                <label>Chi tiết công việc</label>
                <input type="text" value="${item.work || ''}" oninput="updateItem(${index}, 'work', this.value)">
            </div>
            <div class="scan-input-group">
                <label>Số lượng</label>
                <input type="number" value="${item.qty || 1}" oninput="updateItem(${index}, 'qty', this.value)">
            </div>
            <div class="scan-input-group">
                <label>Đơn vị</label>
                <input type="text" value="${item.unit || ''}" oninput="updateItem(${index}, 'unit', this.value)">
            </div>
        </div>
    `;
    container.appendChild(card);
}

function updateItem(index, field, value) {
    if (field === 'qty') value = parseFloat(value) || 0;
    currentScannedData.items[index][field] = value;
}

function addScanItem() {
    if (!currentScannedData) return;
    const newItem = { category: '', system: 'Khác', classification: 'Sửa chữa phát sinh', work: '', qty: 1, unit: '' };
    currentScannedData.items.push(newItem);
    addScanItemRow(newItem, currentScannedData.items.length - 1);
}

function removeScanItemRow(index) {
    currentScannedData.items.splice(index, 1);
    const listContainer = document.getElementById('scanItemsList');
    listContainer.innerHTML = '';
    currentScannedData.items.forEach((item, i) => addScanItemRow(item, i));
}

function closeScanReview() {
    document.getElementById('scanReviewModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
    currentScannedData = null;
}

function submitScannedData() {
    const btn = document.getElementById('saveScanBtn');
    btn.disabled = true;
    btn.innerText = 'Đang lưu vào hệ thống...';
    
    currentScannedData.plate = document.getElementById('scanPlate').value;
    currentScannedData.date = document.getElementById('scanDate').value;
    currentScannedData.km = document.getElementById('scanKm').value;
    currentScannedData.grandTotal = parseFloat(document.getElementById('scanGrandTotal').value) || 0;
    
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=saveScannedRecords';
    
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ data: currentScannedData })
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            alert('✅ Đã lưu thành công ' + res.count + ' hạng mục vào cơ sở dữ liệu!');
            closeScanReview();
            forceRefresh();
        } else {
            alert('❌ Lỗi: ' + res.error);
        }
    })
    .catch(err => alert('❌ Lỗi lưu dữ liệu: ' + err.message))
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="font-size:18px;">save</span> Xác nhận lưu vào hệ thống';
    });
}

// ═══════════════════════════════════════════════════════════════════
// MASTER PROMPT V1.0 — PDF 2 TRANG (Báo Giá + Phiếu Đề Nghị)
// ═══════════════════════════════════════════════════════════════════

let masterExtractedData = null;

/**
 * Override handleQuoteFile: PDF → Master pipeline | Ảnh → Legacy pipeline
 */
const _origHandleQuoteFile = window.handleQuoteFile;
window.handleQuoteFile = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.type === 'application/pdf') {
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(file);
        showLoading(true);
        const reader = new FileReader();
        reader.onload = e => sendPdfToMasterAi(e.target.result.split(',')[1], 'application/pdf', file.name);
        reader.readAsDataURL(file);
        input.value = '';
    } else {
        _origHandleQuoteFile(input);
    }
};

function sendPdfToMasterAi(base64Data, mimeType, fileName) {
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=extractMaintenancePdf';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64Data, mimeType, fileName })
    })
    .then(r => r.json())
    .then(res => {
        showLoading(false);
        const data = res.data || res;
        if (data && data.metadata) {
            masterExtractedData = data;
            renderMasterReview(data);
        } else {
            alert('❌ AI không trả về dữ liệu hợp lệ.\n' + (data.error || ''));
        }
    })
    .catch(err => { showLoading(false); alert('❌ Lỗi kết nối: ' + err.message); });
}

function renderMasterReview(data) {
    const bg = data.bao_gia || {};
    const pd = data.phieu_de_nghi || {};
    const xe = bg.thong_tin_xe || {};
    const tt = bg.tong_tien || {};
    const items = bg.chi_tiet_hang_muc || [];
    const warnings = data.metadata?.warnings || [];

    // Điền các field legacy để modal chung dùng được
    currentScannedData = {
        _master: data,
        plate: pd.bien_so_xe || xe.bien_so || '',
        date:  bg.ngay_bao_gia || pd.ngay_de_nghi || '',
        km:    xe.so_km || pd.so_km_thuc_hien || 0,
        grandTotal: tt.tong_cong || 0,
        items: items.map(item => ({
            category: item.ten_phu_tung_dich_vu || '',
            classification: 'Bảo dưỡng định kỳ',
            system: 'Khác',
            work: bg.loai_cong_viec || '',
            qty: item.so_luong || 1,
            unit: item.don_vi_tinh || '',
            unitPrice: item.don_gia_chua_vat || 0,
            lineTotal: item.thanh_tien_chua_vat || 0
        }))
    };

    // Preview
    const previewPanel = document.getElementById('scanPreviewPanel');
    if (previewPanel) {
        previewPanel.innerHTML = `<iframe src="${currentPreviewUrl}#toolbar=0" type="application/pdf" style="width:100%;height:100%;border:none;border-radius:12px;"></iframe>`;
    }

    // Fill header inputs
    const sv = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    sv('scanPlate',      pd.bien_so_xe || xe.bien_so);
    sv('scanDate',       bg.ngay_bao_gia || pd.ngay_de_nghi);
    sv('scanKm',         xe.so_km || pd.so_km_thuc_hien);
    sv('scanGrandTotal', tt.tong_cong);

    // Build detail panel
    const listContainer = document.getElementById('scanItemsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // Block 1 — Phiếu Đề Nghị
    const pBlock = document.createElement('div');
    pBlock.className = 'master-section-block';
    pBlock.innerHTML = `
<div class="master-section-title"><span class="material-icons">assignment</span> Phiếu Đề Nghị — ${pd.ma_bieu_mau || 'BM01/NS'}</div>
<div class="master-info-grid">
  <div class="master-info-row"><span class="master-label">Người đề nghị</span><span>${pd.nguoi_de_nghi || '—'}</span></div>
  <div class="master-info-row"><span class="master-label">Người sử dụng</span><span>${pd.nguoi_su_dung || '—'}</span></div>
  <div class="master-info-row"><span class="master-label">Phòng ban</span><span>${pd.phong_ban || '—'}</span></div>
  <div class="master-info-row"><span class="master-label">KM kỳ trước</span><span>${(pd.so_km_ky_truoc||0).toLocaleString('vi-VN')}</span></div>
  <div class="master-info-row"><span class="master-label">KM thực hiện</span><span>${(pd.so_km_thuc_hien||0).toLocaleString('vi-VN')}</span></div>
  <div class="master-info-row"><span class="master-label">Đơn vị thực hiện</span><span>${pd.don_vi_thuc_hien || '—'}</span></div>
</div>
${(pd.hang_muc||[]).map(h => `<div class="master-hang-muc-row">
  <span class="master-hm-stt">${h.stt}</span>
  <span class="master-hm-name">${h.noi_dung||''}</span>
  <span class="master-badge${h.sua_chua?' badge-repair':''}">SC</span>
  <span class="master-badge${h.thay_the?' badge-replace':''}">TT</span>
</div>`).join('')}`;
    listContainer.appendChild(pBlock);

    // Block 2 — Báo Giá items
    const bgBlock = document.createElement('div');
    bgBlock.className = 'master-section-block';
    bgBlock.innerHTML = `<div class="master-section-title"><span class="material-icons">receipt_long</span> Báo Giá — ${bg.ten_garage||''}</div>`;
    items.forEach(item => {
        const r = document.createElement('div');
        r.className = 'master-item-row';
        r.innerHTML = `
<div class="master-item-name">${item.stt}. ${item.ten_phu_tung_dich_vu||''}</div>
<div class="master-item-meta">
  <span>${item.so_luong||''} ${item.don_vi_tinh||''}</span>
  <span>${(item.don_gia_chua_vat||0).toLocaleString('vi-VN')} đ</span>
  <span class="master-item-total">${(item.thanh_tien_chua_vat||0).toLocaleString('vi-VN')} đ</span>
</div>`;
        bgBlock.appendChild(r);
    });
    const totRow = document.createElement('div');
    totRow.className = 'master-total-block';
    totRow.innerHTML = `
<div class="master-total-row"><span>Trước VAT</span><span>${(tt.tien_truoc_vat||0).toLocaleString('vi-VN')} đ</span></div>
<div class="master-total-row"><span>Thuế VAT</span><span>${(tt.thue_vat||0).toLocaleString('vi-VN')} đ</span></div>
<div class="master-total-row master-grand-total"><span>TỔNG CỘNG</span><span>${(tt.tong_cong||0).toLocaleString('vi-VN')} đ</span></div>`;
    bgBlock.appendChild(totRow);
    listContainer.appendChild(bgBlock);

    // Block 3 — Warnings
    if (warnings.length > 0) {
        const wBlock = document.createElement('div');
        wBlock.className = 'master-warnings-block';
        wBlock.innerHTML = `<div class="master-section-title warn"><span class="material-icons">warning_amber</span> Cảnh báo (${warnings.length})</div>` +
            warnings.map(w => `<div class="master-warn-item">⚠ ${w}</div>`).join('');
        listContainer.appendChild(wBlock);
    }

    // Hook nút lưu sang submitMasterData
    const saveBtn = document.getElementById('saveScanBtn');
    if (saveBtn) {
        saveBtn.onclick = submitMasterData;
    }

    const modal = document.getElementById('scanReviewModal');
    if (modal) { modal.classList.remove('hidden'); document.body.classList.add('modal-open'); }
}

function submitMasterData() {
    if (!masterExtractedData) { submitScannedData(); return; }
    const btn = document.getElementById('saveScanBtn');
    if (btn) { btn.disabled = true; btn.innerText = 'Đang lưu...'; }

    // Cho phép user sửa plate/date/km trước khi lưu
    const plate = document.getElementById('scanPlate')?.value;
    const date  = document.getElementById('scanDate')?.value;
    const km    = parseInt(document.getElementById('scanKm')?.value) || 0;
    if (plate && masterExtractedData.phieu_de_nghi) masterExtractedData.phieu_de_nghi.bien_so_xe = plate;
    if (date  && masterExtractedData.bao_gia)       masterExtractedData.bao_gia.ngay_bao_gia     = date;
    if (km    && masterExtractedData.bao_gia?.thong_tin_xe) masterExtractedData.bao_gia.thong_tin_xe.so_km = km;

    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=saveMasterExtraction';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ masterData: masterExtractedData })
    })
    .then(r => r.json())
    .then(res => {
        const d = res.data || res;
        if (d.success) {
            const warnMsg = d.warnings?.length ? `\n⚠ ${d.warnings.length} cảnh báo` : '';
            alert(`✅ Đã lưu ${d.count} hạng mục!\nGarage: ${d.garage||''} | Tổng: ${(d.tong_cong||0).toLocaleString('vi-VN')} đ${warnMsg}`);
            closeScanReview();
            masterExtractedData = null;
            if (typeof forceRefresh === 'function') forceRefresh();
        } else {
            alert('❌ Lỗi: ' + (d.error || 'Không xác định'));
        }
    })
    .catch(err => alert('❌ Lỗi lưu: ' + err.message))
    .finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons" style="font-size:18px;">save</span> Xác nhận lưu vào hệ thống'; }
    });
}
