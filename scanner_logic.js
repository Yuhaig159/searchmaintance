/**
 * AI QUOTE SCANNER LOGIC - V128-AI
 * Quản lý luồng chụp ảnh, bóc tách và lưu báo giá
 */

let currentScannedData = null;

/**
 * Kích hoạt chọn file/chụp ảnh
 */
function triggerQuoteScan() {
    document.getElementById('quoteFileInput').click();
}

/**
 * Xử lý sau khi người dùng chọn ảnh
 */
function handleQuoteFile(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    showLoading(true);
    
    // Đọc ảnh và chuyển sang Base64
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result.split(',')[1];
        sendQuoteToAi(base64Data);
    };
    reader.readAsDataURL(file);
    
    // Reset input để có thể chọn lại cùng 1 file
    input.value = '';
}

/**
 * Gửi ảnh lên backend để AI bóc tách
 */
function sendQuoteToAi(base64Data) {
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=extractQuote';
    
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64Data: base64Data })
    })
    .then(res => res.json())
    .then(res => {
        showLoading(false);
        if (res && res.plate !== undefined) {
            renderScanReview(res);
        } else {
            alert('❌ AI không thể đọc được báo giá này. Hãy thử chụp ảnh rõ nét hơn.');
        }
    })
    .catch(err => {
        showLoading(false);
        alert('❌ Lỗi kết nối: ' + err.message);
    });
}

/**
 * Hiển thị Modal kiểm duyệt dữ liệu
 */
function renderScanReview(data) {
    currentScannedData = data;
    
    document.getElementById('scanPlate').value = data.plate || '';
    document.getElementById('scanDate').value = data.date || new Date().toLocaleDateString('vi-VN');
    document.getElementById('scanKm').value = data.km || 0;
    
    const listContainer = document.getElementById('scanItemsList');
    listContainer.innerHTML = '';
    
    (data.items || []).forEach((item, index) => {
        addScanItemRow(item, index);
    });
    
    updateScanTotal();
    document.getElementById('scanReviewModal').classList.remove('hidden');
}

/**
 * Thêm một dòng hạng mục vào bảng review
 */
function addScanItemRow(item, index) {
    const container = document.getElementById('scanItemsList');
    const row = document.createElement('div');
    row.className = 'scan-item-row';
    row.innerHTML = `
        <input type="text" class="scan-item-name" placeholder="Tên hạng mục" value="${item.category}" oninput="updateCurrentData(${index}, 'category', this.value)">
        <input type="number" class="scan-item-cost" placeholder="Giá" value="${item.cost}" oninput="updateCurrentData(${index}, 'cost', this.value); updateScanTotal();">
        <button class="scan-item-del" onclick="removeScanItemRow(${index})">
            <span class="material-icons">delete_outline</span>
        </button>
    `;
    container.appendChild(row);
}

function updateCurrentData(index, field, value) {
    if (field === 'cost') value = parseInt(value) || 0;
    currentScannedData.items[index][field] = value;
}

function addScanItem() {
    if (!currentScannedData) return;
    const newItem = { category: '', cost: 0 };
    currentScannedData.items.push(newItem);
    addScanItemRow(newItem, currentScannedData.items.length - 1);
}

function removeScanItemRow(index) {
    currentScannedData.items.splice(index, 1);
    renderScanReview(currentScannedData);
}

function updateScanTotal() {
    const total = (currentScannedData.items || []).reduce((sum, item) => sum + (item.cost || 0), 0);
    document.getElementById('scanTotalAmount').innerText = total.toLocaleString('vi-VN');
}

function closeScanReview() {
    document.getElementById('scanReviewModal').classList.add('hidden');
    currentScannedData = null;
}

/**
 * Gửi dữ liệu đã duyệt để lưu vào Sheets
 */
function submitScannedData() {
    const btn = document.getElementById('saveScanBtn');
    btn.disabled = true;
    btn.innerText = 'Đang lưu...';
    
    // Cập nhật thông chính
    currentScannedData.plate = document.getElementById('scanPlate').value;
    currentScannedData.date = document.getElementById('scanDate').value;
    currentScannedData.km = document.getElementById('scanKm').value;
    
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=saveScannedRecords';
    
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ data: currentScannedData })
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            alert('✅ Đã lưu thành công ' + res.count + ' hạng mục!');
            closeScanReview();
            forceRefresh(); // Tải lại dữ liệu app
        } else {
            alert('❌ Lỗi: ' + res.error);
        }
    })
    .catch(err => alert('❌ Lỗi lưu dữ liệu: ' + err.message))
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="font-size:18px;">save</span> Xác nhận lưu';
    });
}
