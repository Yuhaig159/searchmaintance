
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
    showAiTyping();

    // Build conversation context for better AI responses
    const recentContext = aiConversationHistory.slice(-6).map(m =>
      `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.text.substring(0, 200)}`
    ).join('\n');

    const url = CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') +
      'action=askAi&query=' + encodeURIComponent(query);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'askAi',
        args: [query],
        conversationContext: recentContext
      })
    })
      .then(async res => {
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
        isAiLoading = false;
        removeAiTyping();
        let userMsg = '❌ ' + err.message;
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          userMsg = '❌ Không thể kết nối tới Server. Kiểm tra kết nối Internet.';
        }
        appendAiMessage(userMsg, true);
        console.error('Fetch Error:', err);
      });
  }
