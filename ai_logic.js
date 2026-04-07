
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

    // ⚡ V127: Gửi Action & Query qua URL để đảm bảo GAS nhận được ngay cả khi CORS bị chặn
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 
                'action=askAi&query=' + encodeURIComponent(query);
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }
    })
    .then(async res => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch(e) {
        throw new Error('Server trả về không phải JSON: ' + text.substring(0, 100));
      }
    })
    .then(res => {
      isAiLoading = false;
      removeAiTyping();
      if (res && res.success) {
        appendAiMessage(res.answer || res.message, true);
      } else {
        const err = res?.error || res?.stt || 'Lỗi không xác định';
        appendAiMessage('❌ Lỗi hệ thống: ' + err, true);
        console.error('AI Detail Error:', res);
      }
    })
    .catch(err => {
      isAiLoading = false;
      removeAiTyping();
      appendAiMessage('❌ Lỗi kết nối: ' + err.message, true);
      console.error('Fetch Error:', err);
    });
  }
