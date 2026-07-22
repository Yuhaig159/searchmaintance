
  /* ═══════════════════════════════════════════════════════════════════════
     AI ASSISTANT FEATURE (GEMINI 2.5 FLASH) - V130-AI OVERHAUL
     Full-featured chat with markdown rendering, conversation memory,
     auto-resize textarea, and polished UX.
     ═══════════════════════════════════════════════════════════════════════ */

  let isAiLoading = false;
  let aiConversationHistory = []; // Store conversation for context

  function initAiTab() {
    const input = document.getElementById('aiInput');
    if (input && !input.hasListener) {
      // Enter to send, Shift+Enter for newline
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitAiQuery();
        }
      });
      // Auto-resize textarea
      input.addEventListener('input', () => autoResizeTextarea(input));
      input.hasListener = true;
    }
    if (!window.currentInfoData && typeof loadInfoData === 'function') {
      try { loadInfoData(); } catch(e) {}
    }
    scrollAiToBottom();
  }

  function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function scrollAiToBottom() {
    const container = document.getElementById('aiChatMessages');
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  }

  /**
   * Convert basic markdown-like text to HTML for display
   */
  function formatAiMarkdown(text) {
    if (!text) return '';
    let html = text;

    // Escape HTML entities first (prevent XSS)
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--ios-fill-tertiary);padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>');

    // Unordered lists: - item or * item (at start of line)
    html = html.replace(/^[\-\*]\s+(.+)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => '<ul style="margin:8px 0;padding-left:20px;">' + match + '</ul>');

    // Ordered lists: 1. item
    html = html.replace(/^\d+\.\s+(.+)/gm, '<li>$1</li>');
    // Wrap consecutive <li> not already in <ul> into <ol>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('<ul')) return match; // already wrapped
      return '<ol style="margin:8px 0;padding-left:20px;">' + match + '</ol>';
    });

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up double <br> inside lists
    html = html.replace(/<br>\s*<\/ul>/g, '</ul>');
    html = html.replace(/<br>\s*<\/ol>/g, '</ol>');
    html = html.replace(/<\/li><br>/g, '</li>');

    return html;
  }

  function appendAiMessage(text, isBot = false) {
    const container = document.getElementById('aiChatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${isBot ? 'bot' : 'user'}`;

    const displayText = isBot ? formatAiMarkdown(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
      <div class="ai-msg-content">${displayText}</div>
      <div class="ai-msg-time">${timeStr}</div>
    `;

    container.appendChild(msgDiv);
    scrollAiToBottom();

    // Store in conversation history for context
    aiConversationHistory.push({
      role: isBot ? 'assistant' : 'user',
      text: text,
      time: timeStr
    });

    // Keep only last 10 messages for context
    if (aiConversationHistory.length > 10) {
      aiConversationHistory = aiConversationHistory.slice(-10);
    }

    return msgDiv;
  }

  function showAiTyping() {
    const container = document.getElementById('aiChatMessages');
    const input = document.getElementById('aiInput');
    const btn = document.getElementById('sendAiBtn');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-msg bot ai-typing-wrapper';
    typingDiv.id = 'aiTypingIndicator';
    typingDiv.style.background = 'transparent';
    typingDiv.style.boxShadow = 'none';
    typingDiv.style.border = 'none';
    typingDiv.innerHTML = `<div class="ai-typing"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
    container.appendChild(typingDiv);
    scrollAiToBottom();
  }

  function removeAiTyping() {
    const indicator = document.getElementById('aiTypingIndicator');
    if (indicator) indicator.remove();
    const input = document.getElementById('aiInput');
    const btn = document.getElementById('sendAiBtn');
    if (input) {
      input.disabled = false;
      input.focus();
    }
    if (btn) btn.disabled = false;
  }

  function sendAiSuggestion(text) {
    if (isAiLoading) return;
    document.getElementById('aiInput').value = text;
    submitAiQuery();
  }

  function clearAiChat() {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;
    container.innerHTML = '';
    aiConversationHistory = [];

    // Re-add welcome message
    appendAiMessage('Chào bạn! Tôi là trợ lý AI chuyên về đội xe. Tôi có dữ liệu về lịch sử bảo dưỡng và GPS thời gian thực. Bạn muốn hỏi gì không?', true);
    showToast('🗑️ Đã xóa lịch sử trò chuyện');
  }

  function tryProcessFastLocalAiQuery(query) {
    if (!query) return null;
    const qLower = query.toLowerCase().trim();
    const qClean = qLower.replace(/[\s\-\.]/g, '');

    // Tìm biển số xuất hiện trong câu hỏi
    let foundInfo = null;
    let foundPlate = null;

    if (window.currentInfoData && Array.isArray(window.currentInfoData)) {
      for (let v of window.currentInfoData) {
        const plateVal = typeof getColValue === 'function' ? getColValue(v, ['biển số', 'plate', 'bks', 'mã xe', 'xe']) : (v['Biển Số'] || v['biển số']);
        if (!plateVal || plateVal === '---') continue;
        const cleanP = plateVal.replace(/[\s\-\.]/g, '').toLowerCase();
        const matchNumber = cleanP.match(/\d{4,5}$/);
        const shortNum = matchNumber ? matchNumber[0] : '';

        if (qClean.includes(cleanP) || (shortNum && shortNum.length >= 4 && qClean.includes(shortNum))) {
          foundInfo = v;
          foundPlate = plateVal;
          break;
        }
      }
    }

    // 1A. Người dùng CHỈ HỎI SỐ ĐIỆN THOẠI
    const isPhoneOnly = ['sđt', 'điện thoại', 'phone', 'số đt', 'gọi', 'liên hệ'].some(k => qLower.includes(k));
    if (foundInfo && isPhoneOnly) {
      const getVal = (keys) => typeof getColValue === 'function' ? getColValue(foundInfo, keys) : '---';
      const plate = getVal(['biển số', 'plate', 'bks', 'mã xe', 'xe']);
      const driver = getVal(['tài xế', 'driver', 'người lái', 'lái xe']);
      const phone = getVal(['điện thoại', 'số điện thoại', 'sđt', 'phone', 'số đt']);
      const pic = getVal(['người phụ trách', 'pic', 'quản lý', 'phụ trách', 'nvpt']);

      if (phone !== '---') {
        const nameStr = driver !== '---' ? driver : pic;
        return `⚡ **Số điện thoại xe ${plate}** (${nameStr}): 📞 [**${phone}**](tel:${phone})`;
      } else {
        return `⚡ Xe **${plate}** hiện chưa cập nhật số điện thoại.`;
      }
    }

    // 1B. Người dùng CHỈ HỎI TÀI XẾ
    const isDriverOnly = ['tài xế', 'lái xe', 'ai lái'].some(k => qLower.includes(k));
    if (foundInfo && isDriverOnly) {
      const getVal = (keys) => typeof getColValue === 'function' ? getColValue(foundInfo, keys) : '---';
      const plate = getVal(['biển số', 'plate', 'bks', 'mã xe', 'xe']);
      const driver = getVal(['tài xế', 'driver', 'người lái', 'lái xe']);
      const phone = getVal(['điện thoại', 'số điện thoại', 'sđt', 'phone', 'số đt']);

      let answer = `⚡ **Tài xế xe ${plate}**: **${driver}**`;
      if (phone !== '---') answer += ` (📞 [${phone}](tel:${phone}))`;
      return answer;
    }

    // 1C. Người dùng CHỈ HỎI NGƯỜI PHỤ TRÁCH
    const isPicOnly = ['phụ trách', 'quản lý', 'nvpt'].some(k => qLower.includes(k));
    if (foundInfo && isPicOnly) {
      const getVal = (keys) => typeof getColValue === 'function' ? getColValue(foundInfo, keys) : '---';
      const plate = getVal(['biển số', 'plate', 'bks', 'mã xe', 'xe']);
      const pic = getVal(['người phụ trách', 'pic', 'quản lý', 'phụ trách', 'nvpt']);
      const branch = getVal(['nhánh', 'bộ phận']);

      return `⚡ **Người phụ trách xe ${plate}**: **${pic}** ${branch !== '---' ? `(${branch})` : ''}`;
    }

    // 1D. Người dùng HỎI THÔNG TIN TỔNG QUAN
    const isInfoIntent = ['thông tin', 'chi tiết', 'tổng quan', 'xe gì', 'ở đâu', 'khu vực', 'chức danh'].some(k => qLower.includes(k));
    if (foundInfo && isInfoIntent) {
      const getVal = (keys) => typeof getColValue === 'function' ? getColValue(foundInfo, keys) : '---';
      const plate = getVal(['biển số', 'plate', 'bks', 'mã xe', 'xe']);
      const pic = getVal(['người phụ trách', 'pic', 'quản lý', 'phụ trách', 'nvpt']);
      const driver = getVal(['tài xế', 'driver', 'người lái', 'lái xe']);
      const phone = getVal(['điện thoại', 'số điện thoại', 'sđt', 'phone', 'số đt']);
      const brand = getVal(['hãng xe', 'hãng']);
      const model = getVal(['model', 'dòng xe']);
      const type = getVal(['loại xe', 'loại']);
      const fuel = getVal(['loại nl', 'nhiên liệu']);
      const norm = getVal(['định mức', 'l/100km']);
      const area = getVal(['khu vực', 'địa bàn', 'vùng']);
      const branch = getVal(['nhánh', 'bộ phận']);

      let answer = `⚡ **THÔNG TIN XE ${plate}** *(Phản hồi tức thì)*\n\n`;
      answer += `- 🚘 **Dòng xe**: ${brand !== '---' ? brand + ' ' : ''}${model !== '---' ? model : type}\n`;
      answer += `- 👤 **Người phụ trách**: **${pic}** ${branch !== '---' ? `(${branch})` : ''}\n`;
      answer += `- 🛞 **Tài xế**: **${driver}**\n`;
      if (phone !== '---') answer += `- 📞 **Số điện thoại**: [${phone}](tel:${phone})\n`;
      if (fuel !== '---' || norm !== '---') answer += `- ⛽ **Nhiên liệu**: ${fuel} ${norm !== '---' ? `(${norm} L/100km)` : ''}\n`;
      if (area !== '---') answer += `- 📍 **Khu vực**: ${area}\n`;

      return answer;
    }

    // 2. Tra cứu tổng quan số lượng xe
    const isCountIntent = (qLower.includes('bao nhiêu xe') || qLower.includes('tổng số xe') || qLower.includes('danh sách xe')) && !qLower.includes('bảo dưỡng');
    if (isCountIntent && window.currentInfoData && window.currentInfoData.length > 0) {
      const total = window.currentInfoData.length;
      let answer = `⚡ **TỔNG QUAN ĐỘI XE** *(Phản hồi tức thì)*\n\n`;
      answer += `Hệ thống đang quản lý **${total} xe** trong danh mục Info Car.\n\n`;
      answer += `**Một số xe tiêu biểu:**\n`;
      window.currentInfoData.slice(0, 6).forEach((v, idx) => {
        const getVal = (keys) => typeof getColValue === 'function' ? getColValue(v, keys) : '---';
        const p = getVal(['biển số', 'plate', 'bks', 'mã xe']);
        const pic = getVal(['người phụ trách', 'phụ trách']);
        answer += `${idx + 1}. **${p}** - Phụ trách: ${pic}\n`;
      });
      if (total > 6) answer += `\n*(Chạm vào tab **Info Car List** ở thanh điều hướng dưới để xem danh sách chi tiết)*`;
      return answer;
    }

    return null;
  }

  function submitAiQuery() {
    const input = document.getElementById('aiInput');
    const query = input ? input.value.trim() : '';
    if (!query || isAiLoading) return;

    isAiLoading = true;
    input.value = '';
    input.style.height = 'auto'; // Reset textarea height

    // Hide suggestion chips after first question
    const suggestionsEl = document.getElementById('aiSuggestions');
    if (suggestionsEl) suggestionsEl.style.display = 'none';

    appendAiMessage(query, false);

    // ⚡ KIỂM TRA BỘ XỬ LÝ TỨC THÌ (FAST LOCAL ENGINE)
    const fastAnswer = tryProcessFastLocalAiQuery(query);
    if (fastAnswer) {
      isAiLoading = false;
      appendAiMessage(fastAnswer, true);
      return;
    }

    showAiTyping();

    // Build conversation context for better AI responses
    const recentContext = aiConversationHistory.slice(-6).map(m =>
      `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.text.substring(0, 200)}`
    ).join('\n');

    // Build active plate context if user is viewing a specific plate
    const activePlate = window.currentPlate || '';

    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') +
      'action=askAi&query=' + encodeURIComponent(query);

    // Thêm AbortController để timeout tránh kẹt trạng thái khi rớt mạng hoặc máy sleep
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // Tăng timeout lên 60 giây (Gemini có thể xử lý lâu)

    fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'askAi',
        args: [query],
        conversationContext: recentContext,
        activePlate: activePlate
      })
    })
      .then(async res => {
        clearTimeout(timeoutId);
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          if (text.includes('Service Unavailable') || text.includes('Error 500')) {
            throw new Error('Dịch vụ Google Script tạm bận hoặc đang bảo trì.');
          }
          if (text.includes('<!DOCTYPE')) {
            throw new Error('Server trả về trang lỗi HTML. Có thể URL Web App đã hết hạn hoặc cần deploy lại.');
          }
          throw new Error('Máy chủ phản hồi không đúng định dạng.');
        }
      })
      .then(res => {
        isAiLoading = false;
        removeAiTyping();
        if (res && res.success) {
          appendAiMessage(res.answer || res.message || 'AI không có câu trả lời cụ thể.', true);
        } else {
          const err = res?.error || res?.stt || 'Lỗi không xác định từ Backend';
          appendAiMessage('⚠️ ' + err, true);
          console.error('AI Error:', res);
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        isAiLoading = false;
        removeAiTyping();
        let userMsg = '❌ ' + err.message;
        if (err.name === 'AbortError') {
          userMsg = '❌ Kết nối bị quá hạn (Timeout). Vui lòng thử lại sau.';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          userMsg = '❌ Không thể kết nối tới Server. Kiểm tra kết nối Internet.';
        }
        appendAiMessage(userMsg, true);
        console.error('Fetch Error:', err);
      });
  }

  // Helper function to make element draggable (supports mouse & touch)
  function makeElementDraggable(elmnt, dragAnchor, onReleaseCallback) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    var isDragging = false;
    var startX = 0, startY = 0;

    dragAnchor.addEventListener('mousedown', dragMouseDown);
    dragAnchor.addEventListener('touchstart', dragTouchStart, { passive: false });

    function dragMouseDown(e) {
      if (e.target.closest('button') || e.target.closest('textarea')) return;
      e = e || window.event;
      e.preventDefault();
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.addEventListener('mouseup', closeDragElement);
      document.addEventListener('mousemove', elementDrag);
    }

    function dragTouchStart(e) {
      if (e.target.closest('button') || e.target.closest('textarea')) return;
      e.preventDefault(); // Ngăn trình duyệt tạo sự kiện chuột ảo (gây lỗi nhấn kép)
      isDragging = false;
      var touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      pos3 = touch.clientX;
      pos4 = touch.clientY;
      document.addEventListener('touchend', closeDragElement);
      document.addEventListener('touchmove', elementTouchDrag, { passive: false });
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      isDragging = true;
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      let newTop = elmnt.offsetTop - pos2;
      let newLeft = elmnt.offsetLeft - pos1;
      
      const maxLeft = window.innerWidth - elmnt.offsetWidth;
      const maxTop = window.innerHeight - elmnt.offsetHeight;
      
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      
      const deltaX = newLeft - elmnt.offsetLeft;
      const deltaY = newTop - elmnt.offsetTop;

      elmnt.style.top = newTop + "px";
      elmnt.style.left = newLeft + "px";
      elmnt.style.bottom = "auto";
      elmnt.style.right = "auto";

      // Link movement between widget and active chatbox
      const widget = document.getElementById('aiFloatingWidget');
      const chatbox = document.getElementById('aiFloatingChatbox');
      if (widget && chatbox) {
        if (elmnt === widget && chatbox.classList.contains('active')) {
          let cbTop = chatbox.offsetTop + deltaY;
          let cbLeft = chatbox.offsetLeft + deltaX;
          cbLeft = Math.max(0, Math.min(cbLeft, window.innerWidth - chatbox.offsetWidth));
          cbTop = Math.max(0, Math.min(cbTop, window.innerHeight - chatbox.offsetHeight));
          chatbox.style.top = cbTop + "px";
          chatbox.style.left = cbLeft + "px";
          chatbox.style.bottom = "auto";
          chatbox.style.right = "auto";
        } else if (elmnt === chatbox) {
          let wgTop = widget.offsetTop + deltaY;
          let wgLeft = widget.offsetLeft + deltaX;
          wgLeft = Math.max(0, Math.min(wgLeft, window.innerWidth - widget.offsetWidth));
          wgTop = Math.max(0, Math.min(wgTop, window.innerHeight - widget.offsetHeight));
          widget.style.top = wgTop + "px";
          widget.style.left = wgLeft + "px";
          widget.style.bottom = "auto";
          widget.style.right = "auto";
        }
      }
    }

    function elementTouchDrag(e) {
      isDragging = true;
      var touch = e.touches[0];
      pos1 = pos3 - touch.clientX;
      pos2 = pos4 - touch.clientY;
      pos3 = touch.clientX;
      pos4 = touch.clientY;
      
      let newTop = elmnt.offsetTop - pos2;
      let newLeft = elmnt.offsetLeft - pos1;
      
      const maxLeft = window.innerWidth - elmnt.offsetWidth;
      const maxTop = window.innerHeight - elmnt.offsetHeight;
      
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      
      const deltaX = newLeft - elmnt.offsetLeft;
      const deltaY = newTop - elmnt.offsetTop;

      elmnt.style.top = newTop + "px";
      elmnt.style.left = newLeft + "px";
      elmnt.style.bottom = "auto";
      elmnt.style.right = "auto";

      // Link movement between widget and active chatbox
      const widget = document.getElementById('aiFloatingWidget');
      const chatbox = document.getElementById('aiFloatingChatbox');
      if (widget && chatbox) {
        if (elmnt === widget && chatbox.classList.contains('active')) {
          let cbTop = chatbox.offsetTop + deltaY;
          let cbLeft = chatbox.offsetLeft + deltaX;
          cbLeft = Math.max(0, Math.min(cbLeft, window.innerWidth - chatbox.offsetWidth));
          cbTop = Math.max(0, Math.min(cbTop, window.innerHeight - chatbox.offsetHeight));
          chatbox.style.top = cbTop + "px";
          chatbox.style.left = cbLeft + "px";
          chatbox.style.bottom = "auto";
          chatbox.style.right = "auto";
        } else if (elmnt === chatbox) {
          let wgTop = widget.offsetTop + deltaY;
          let wgLeft = widget.offsetLeft + deltaX;
          wgLeft = Math.max(0, Math.min(wgLeft, window.innerWidth - widget.offsetWidth));
          wgTop = Math.max(0, Math.min(wgTop, window.innerHeight - widget.offsetHeight));
          widget.style.top = wgTop + "px";
          widget.style.left = wgLeft + "px";
          widget.style.bottom = "auto";
          widget.style.right = "auto";
        }
      }
    }

    function closeDragElement(e) {
      document.removeEventListener('mouseup', closeDragElement);
      document.removeEventListener('mousemove', elementDrag);
      document.removeEventListener('touchend', closeDragElement);
      document.removeEventListener('touchmove', elementTouchDrag);
      
      let endX = startX;
      let endY = startY;
      if (e) {
        if (typeof e.clientX === 'number') {
          endX = e.clientX;
          endY = e.clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
          endX = e.changedTouches[0].clientX;
          endY = e.changedTouches[0].clientY;
        }
      }
      
      const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
      if (onReleaseCallback) {
        onReleaseCallback(distance > 15);
      }
    }
  }

  // Self-initialize floating assistant
  (function initFloatingAssistant() {
    const widget = document.getElementById('aiFloatingWidget');
    const chatbox = document.getElementById('aiFloatingChatbox');
    const closeBtn = document.getElementById('closeAiChatBtn');
    const header = document.getElementById('aiFloatingHeader');

    if (!widget || !chatbox) return;

    // Make Widget draggable
    makeElementDraggable(widget, widget, function(wasDragged) {
      if (!wasDragged) {
        toggleChatbox();
      }
    });

    // Make Chatbox draggable via its header
    makeElementDraggable(chatbox, header);

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        chatbox.classList.remove('active');
      });
    }

    // Initialize input actions
    initAiTab();

    function toggleChatbox() {
      const isActive = chatbox.classList.contains('active');
      if (!isActive) {
        if (!chatbox.style.top) {
          repositionChatbox();
        }
        chatbox.classList.add('active');
        const input = document.getElementById('aiInput');
        if (input) input.focus();
      } else {
        chatbox.classList.remove('active');
      }
    }

    function repositionChatbox() {
      const widgetRect = widget.getBoundingClientRect();
      const chatboxWidth = 380;
      const chatboxHeight = 520;
      
      let left = widgetRect.left + widgetRect.width / 2 - chatboxWidth / 2;
      let top = widgetRect.top - chatboxHeight - 15;
      
      // Boundaries
      left = Math.max(10, Math.min(left, window.innerWidth - chatboxWidth - 10));
      top = Math.max(10, Math.min(top, window.innerHeight - chatboxHeight - 10));
      
      chatbox.style.left = left + 'px';
      chatbox.style.top = top + 'px';
      chatbox.style.bottom = 'auto';
      chatbox.style.right = 'auto';
    }
  })();
