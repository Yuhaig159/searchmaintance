
  /* ═══════════════════════════════════════════════════════════════════════
     AI ASSISTANT FEATURE (GEMINI 1.5 FLASH) - [NEW V127-AI]
     ═══════════════════════════════════════════════════════════════════════ */

  let isAiLoading = false;

  function initAiTab() {
    const input = document.getElementById('aiInput');
    if (input && !input.hasListener) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitAiQuery();
        }
      });
      input.hasListener = true;
    }
    scrollAiToBottom();
  }

  function scrollAiToBottom() {
    const container = document.getElementById('aiChatMessages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function appendAiMessage(text, isBot = false) {
    const container = document.getElementById('aiChatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${isBot ? 'bot' : 'user'}`;
    
    const formattedText = text.replace(/\n/g, '<br>');
    msgDiv.innerHTML = `
      ${formattedText}
      <div class="ai-msg-time">${new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    container.appendChild(msgDiv);
    scrollAiToBottom();
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
    typingDiv.innerHTML = `<div class="ai-typing"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
    container.appendChild(typingDiv);
    scrollAiToBottom();
  }

  function removeAiTyping() {
    const indicator = document.getElementById('aiTypingIndicator');
    if (indicator) indicator.remove();
    const input = document.getElementById('aiInput');
    const btn = document.getElementById('sendAiBtn');
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
  }

  function sendAiSuggestion(text) {
    if (isAiLoading) return;
    document.getElementById('aiInput').value = text;
    submitAiQuery();
  }

  function submitAiQuery() {
    const input = document.getElementById('aiInput');
    const query = input? input.value.trim() : '';
    if (!query || isAiLoading) return;

    isAiLoading = true;
    input.value = '';
    appendAiMessage(query, false);
    showAiTyping();

    // ⚡ V127-AI: Gửi Action & Query qua URL để tránh lỗi CORS và mất Payload khi redirect
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 
                'action=askAi&query=' + encodeURIComponent(query);
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
    .then(async res => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch(e) {
        // Fallback: có thể Server trả về lỗi dạng Text thuần túy (HTML Error)
        if (text.includes('Service Unavailable') || text.includes('Error 500')) {
          throw new Error('Dịch vụ Google Script tạm bận hoặc đang bảo trì.');
        }
        throw new Error('Máy chủ phản hồi không đúng định dạng JSON.');
      }
    })
    .then(res => {
      isAiLoading = false;
      removeAiTyping();
      if (res && res.success) {
        appendAiMessage(res.answer || res.message || 'AI không có câu trả lời cụ thể cho vấn đề này.', true);
      } else {
        const err = res?.error || res?.stt || 'Lỗi không xác định từ Backend';
        appendAiMessage('⚠️ ' + err, true);
        console.error('AI Detail Error:', res);
      }
    })
    .catch(err => {
      isAiLoading = false;
      removeAiTyping();
      let userMsg = '❌ Lỗi kết nối: ' + err.message;
      if (err.message.includes('fetch')) userMsg = '❌ Không thể kết nối tới Server. Hãy kiểm tra Internet hoặc URL Web App.';
      appendAiMessage(userMsg, true);
      console.error('Fetch Error:', err);
    });
  }
