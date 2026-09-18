import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './context/useAuth';
import { useLanguage } from './i18n/LanguageContext';
import { chatAPI } from './services/api';
import './Help.css';

function Help() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messageCounterRef = useRef(0);

  const suggestedQuestions = [
    t('help.q1', null, 'What documents do I need?'),
    t('help.q2', null, 'What counts as valid address proof?'),
    t('help.q3', null, 'What is my verification status?'),
    t('help.q4', null, 'Why was my document flagged?'),
    t('help.q5', null, 'What should I upload next?'),
    t('help.q6', null, 'What happens after I submit my documents?'),
  ];

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat history on mount
  useEffect(() => {
    let isMounted = true;
    chatAPI
      .getHistory()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && Array.isArray(res.messages)) {
          setMessages(res.messages);
        }
      })
      .catch((err) => {
        console.warn('Could not load chat history:', err.message);
      })
      .finally(() => {
        if (isMounted) setFetchingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || loading) return;

    setInputMessage('');
    setError('');

    messageCounterRef.current += 1;
    const clientTimestamp = new Date().toISOString();

    // Optimistically append customer message
    const tempUserMsg = {
      id: `temp-${messageCounterRef.current}`,
      sender: 'user',
      message: text,
      createdAt: clientTimestamp,
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await chatAPI.sendMessage(text, language);
      if (res.success && res.reply) {
        messageCounterRef.current += 1;
        const assistantMsg = {
          id: `asst-${messageCounterRef.current}`,
          sender: 'assistant',
          message: res.reply,
          createdAt: res.timestamp || clientTimestamp,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        let errorMsg = res?.error || 'The assistant could not process your question. Please try again.';
        if (typeof errorMsg === 'object' && errorMsg !== null) {
          errorMsg = errorMsg.message || JSON.stringify(errorMsg);
        }
        setError(String(errorMsg));
      }
    } catch (err) {
      let rawError =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to contact the assistant. Please check your connection and try again.';
      if (typeof rawError === 'object' && rawError !== null) {
        rawError = rawError.message || JSON.stringify(rawError);
      }
      setError(String(rawError));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear your conversation history?')) return;
    try {
      await chatAPI.clearHistory();
      setMessages([]);
      setError('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to clear chat history.');
    }
  };

  return (
    <div className="help-container">
      {/* Header */}
      <header className="help-header">
        <div className="help-header-left">
          <div className="assistant-avatar-badge">🤖</div>
          <div>
            <h1 className="help-title">{t('help.pageTitle', null, 'Customer AI Assistant')}</h1>
            <p className="help-subtitle">
              {t('help.pageSubtitle', null, 'Instant guidance on required documents, verification status, and resolving consistency flags.')}
            </p>
          </div>
        </div>
        <div className="help-header-right">
          {messages.length > 0 && (
            <button className="clear-chat-btn" onClick={handleClearChat} title="Clear conversation history">
              🗑️ {t('help.clearHistoryBtn', null, 'New Chat')}
            </button>
          )}
        </div>
      </header>

      {/* Suggested Quick Questions */}
      <div className="suggested-prompts-bar">
        <span className="suggested-label">💡 {t('help.suggestedTitle', null, 'Suggested Questions')}:</span>
        <div className="prompts-chips-wrapper">
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              className="prompt-chip"
              onClick={() => handleSendMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Body */}
      <div className="chat-body-card">
        <div className="messages-stream">
          {fetchingHistory ? (
            <div className="chat-loading-state">
              <div className="chat-spinner"></div>
              <p>Loading your conversation history...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-welcome-box">
              <div className="welcome-icon">🛡️</div>
              <h2>Welcome to Verification Support, {user?.name || 'Customer'}!</h2>
              <p>
                I am your dedicated BNP Paribas Verification Assistant. I can check your real-time case status,
                detail the documents you still need to upload, and explain any validation issues or flags.
              </p>
              <div className="welcome-hints">
                <div className="hint-card">
                  <strong>📋 Document Help</strong>
                  <span>Ask what counts as valid Government ID, Bank Statement, or Address Proof.</span>
                </div>
                <div className="hint-card">
                  <strong>🔍 Status Tracking</strong>
                  <span>Ask about your current verification status or what happens after you submit.</span>
                </div>
                <div className="hint-card">
                  <strong>⚠️ Issue Remediation</strong>
                  <span>Ask why a document was flagged and how to resolve discrepancies.</span>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`message-row ${msg.sender === 'user' ? 'row-user' : 'row-assistant'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="msg-avatar assistant-avatar" title="BNP Paribas Assistant">
                    🤖
                  </div>
                )}
                <div className={`message-bubble ${msg.sender === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
                  <div className="message-content">
                    {msg.message.split('\n').map((line, lIdx) => (
                      <p key={lIdx} className="message-paragraph">
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="message-time">
                    {msg.createdAt
                      ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div className="msg-avatar user-avatar" title={user?.name || 'You'}>
                    👤
                  </div>
                )}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {loading && (
            <div className="message-row row-assistant">
              <div className="msg-avatar assistant-avatar">🤖</div>
              <div className="message-bubble bubble-assistant bubble-loading">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="chat-error-banner">
            <span>⚠️ {error}</span>
            <button className="error-close-btn" onClick={() => setError('')}>
              ✕
            </button>
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="chat-input-container">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="chat-input-form"
          >
            <input
              ref={inputRef}
              type="text"
              className="chat-text-input"
              placeholder={t('help.chatPlaceholder', null, 'Ask a question about your documents, status, or requirements...')}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={loading || !inputMessage.trim()}
              title="Send message (Enter)"
            >
              {loading ? '...' : `${t('help.sendBtn', null, 'Send')} ✈️`}
            </button>
          </form>
          <div className="chat-footer-disclaimer">
            ⚖️ {t('help.chatDisclaimer', null, 'Answers are generated from your active verification records and BNP Paribas compliance guidelines.')}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Help;