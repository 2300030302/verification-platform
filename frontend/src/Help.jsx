import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './context/useAuth';
import { chatAPI } from './services/api';
import './Help.css';

const SUGGESTED_QUESTIONS = [
  'What documents do I need?',
  'What counts as valid address proof?',
  'What is my verification status?',
  'Why was my document flagged?',
  'What should I upload next?',
  'What happens after I submit my documents?',
];

function Help() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messageCounterRef = useRef(0);

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
      const res = await chatAPI.sendMessage(text);
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
        setError(res.error || 'The assistant could not process your question. Please try again.');
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to contact the assistant. Please check your connection and try again.'
      );
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
            <h1 className="help-title">BNP Paribas Verification Assistant</h1>
            <p className="help-subtitle">
              Instant guidance on required documents, verification status, and resolving consistency flags.
            </p>
          </div>
        </div>
        <div className="help-header-right">
          {messages.length > 0 && (
            <button className="clear-chat-btn" onClick={handleClearChat} title="Clear conversation history">
              🗑️ New Chat
            </button>
          )}
        </div>
      </header>

      {/* Suggested Quick Questions */}
      <div className="suggested-prompts-bar">
        <span className="suggested-label">💡 Suggested Questions:</span>
        <div className="prompts-chips-wrapper">
          {SUGGESTED_QUESTIONS.map((q, idx) => (
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
              placeholder="Ask a question about your documents, status, or requirements..."
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
              {loading ? '...' : 'Send ✈️'}
            </button>
          </form>
          <div className="chat-footer-disclaimer">
            ⚖️ <strong>Compliance Notice:</strong> The assistant explains existing documentation. Final onboarding determinations are executed by human compliance officers.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Help;