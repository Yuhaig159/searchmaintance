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
            const MAX_WIDTH = 1600;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
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

