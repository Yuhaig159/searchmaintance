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
/**
 * Xử lý sau khi người dùng chọn ảnh
 */
function handleQuoteFile(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const mimeType = file.type || 'image/jpeg';
    showLoading(true);
    
    // Nếu là file PDF, gửi trực tiếp. Nếu là ảnh, thực hiện nén.
    if (mimeType === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Data = e.target.result.split(',')[1];
            sendQuoteToAi(base64Data, mimeType);
        };
        reader.readAsDataURL(file);
    } else {
        compressImage(file, function(base64Data) {
            sendQuoteToAi(base64Data, mimeType);
        });
    }
    
    // Reset input
    input.value = '';
}

/**
 * Nén ảnh bằng Canvas để giảm dung lượng
 */
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Giới hạn chiều rộng tối đa 1600px để đảm bảo AI đọc được nhưng không quá nặng
            const MAX_WIDTH = 1600;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Nén chất lượng xuống 0.7
            const base64Data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            callback(base64Data);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Gửi ảnh/PDF lên backend để AI bóc tách
 */
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
        
        // 🔓 Giải nén nếu dữ liệu được nén từ Backend
        if (res && res.isCompressed && typeof decompressKeys === 'function') {
            res = decompressKeys(res);
        }

        if (res && res.error) {
            // Xử lý lỗi đặc thù cho Gemini
            if (res.error.includes('503') || res.error.includes('high demand') || res.error.includes('Busy')) {
                alert('⚠️ Hệ thống AI hiện đang quá tải (Busy). Vui lòng đợi khoảng 1 phút và nhấn nút quét lại.');
            } else {
                let msg = '❌ Lỗi: ' + res.error;
                if (res.raw) msg += '\n\nDữ liệu thô AI trả về:\n' + res.raw;
                alert(msg);
            }
        } else if (res && res.plate !== undefined) {
            renderScanReview(res);
        } else {
            console.error('Phản hồi AI không hợp lệ:', res);
            alert('❌ AI không trả về dữ liệu hợp lệ. Hãy thử chụp ảnh rõ nét hơn hoặc kiểm tra kỹ file PDF của bạn.');
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
