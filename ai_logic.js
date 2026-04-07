
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
    
    // Convert newlines to breaks for AI responses
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
    typingDiv.style.background = 'transparent';
    typingDiv.style.boxShadow = 'none';
    typingDiv.style.border = 'none';
    typingDiv.id = 'aiTypingIndicator';
    typingDiv.innerHTML = `
      <div class="ai-typing">
        <div class="ai-dot"></div>
        <div class="ai-dot"></div>
        <div class="ai-dot"></div>
      </div>
    `;
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

    // UI state
    isAiLoading = true;
    input.value = '';
    appendAiMessage(query, false);
    showAiTyping();

    // Call Backend
    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'action=askAi';
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'askAi',
        args: [query]
      })
    })
    .then(res => res.json())
    .then(res => {
      isAiLoading = false;
      removeAiTyping();
      if (res && res.success) {
        appendAiMessage(res.answer, true);
      } else {
        const errorMsg = res?.error || res?.message || 'Không thể lấy câu trả lời từ AI';
        appendAiMessage('❌ Lỗi: ' + errorMsg, true);
      }
      if (input) input.focus();
    })
    .catch(err => {
      isAiLoading = false;
      removeAiTyping();
      appendAiMessage('❌ Lỗi kết nối: ' + err.message, true);
      if (input) input.focus();
    });
  }
