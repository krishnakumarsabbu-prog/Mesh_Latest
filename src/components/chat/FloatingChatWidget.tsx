import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Sparkles, Bot, Minimize2, Maximize2, MessageSquare, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { chatApi } from '@/lib/api';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

const BASE_URL = '/api/v1';

interface MiniMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  is_streaming?: boolean;
  is_error?: boolean;
}

const QUICK_PROMPTS = [
  { label: 'System health summary', icon: '🏥' },
  { label: 'Show failing connectors', icon: '🔌' },
  { label: 'Active incidents overview', icon: '🚨' },
  { label: 'Runtime location status', icon: '📍' },
];

export function FloatingChatWidget() {
  const location = useLocation();
  const { access_token } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<MiniMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pulseActive, setPulseActive] = useState(true);
  const [unread, setUnread] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hide on the full chatbot page
  if (location.pathname === '/chatbot') return null;

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Stop pulse animation after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => setPulseActive(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    try {
      const res = await chatApi.createSession({});
      const id = res.data.id;
      setSessionId(id);
      return id;
    } catch {
      throw new Error('Failed to create session');
    }
  }, [sessionId]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isStreaming) return;

    setInput('');

    let sid: string;
    try {
      sid = await ensureSession();
    } catch {
      return;
    }

    const userMsg: MiniMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: MiniMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      is_streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`,
        },
        body: JSON.stringify({ session_id: sid, message: content }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === 'delta') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            } else if (event.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, is_streaming: false }
                    : m
                )
              );
            } else if (event.type === 'error') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: event.message || 'An error occurred.', is_streaming: false, is_error: true }
                    : m
                )
              );
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId && m.is_streaming
              ? { ...m, is_streaming: false, content: m.content || '*(stopped)*' }
              : m
          )
        );
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'Connection error. Please try again.', is_streaming: false, is_error: true }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, ensureSession, access_token]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleToggle = () => {
    setIsOpen(v => !v);
    setUnread(0);
  };

  return (
    <>
      {/* Chat Panel */}
      <div
        className={cn(
          'fixed z-50 transition-all duration-500 ease-out',
          isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none',
          isExpanded
            ? 'bottom-4 right-4 w-[560px] h-[680px]'
            : 'bottom-20 right-5 w-[380px] h-[520px]',
        )}
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          className="w-full h-full rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(10,132,255,0.12) 0%, rgba(94,92,230,0.08) 100%)',
              borderBottom: '1px solid var(--app-border)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%)',
                  boxShadow: '0 4px 12px rgba(10,132,255,0.4)',
                }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-[13px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  Tachyon AI
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#30D158', boxShadow: '0 0 6px rgba(48,209,88,0.6)' }}
                  />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Agentic · Live
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(v => !v)}
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--app-surface)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleToggle}
                className="p-1.5 rounded-lg transition-all hover:scale-110"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; e.currentTarget.style.color = '#FF453A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-area" style={{ minHeight: 0 }}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%)',
                    boxShadow: '0 8px 24px rgba(10,132,255,0.3)',
                  }}
                >
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    How can I help you?
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    I can analyze health, diagnose incidents, and provide insights.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full mt-2 px-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => sendMessage(p.label)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: 'var(--app-surface)',
                        border: '1px solid var(--app-border)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-subtle)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--app-border)';
                        e.currentTarget.style.boxShadow = '';
                      }}
                    >
                      <span className="text-[14px]">{p.icon}</span>
                      <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-blue-700'
                        : 'bg-gradient-to-br from-slate-700 to-slate-900',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <span className="text-white text-[9px] font-bold">U</span>
                    ) : (
                      <Sparkles className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div className={cn('max-w-[85%]', msg.role === 'user' ? 'text-right' : 'text-left')}>
                    <div
                      className={cn(
                        'px-3 py-2 text-[12px] leading-relaxed inline-block',
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white rounded-xl rounded-tr-sm'
                          : 'rounded-xl rounded-tl-sm',
                        msg.is_error && 'border-red-500/30',
                      )}
                      style={msg.role === 'user' ? undefined : {
                        background: 'var(--glass-bg, var(--app-surface))',
                        border: `1px solid ${msg.is_error ? 'rgba(239,68,68,0.3)' : 'var(--glass-border, var(--app-border))'}`,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {msg.role === 'user' ? (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      ) : msg.is_streaming && !msg.content ? (
                        <div className="flex items-center gap-1.5 py-1">
                          {[0, 1, 2].map(i => (
                            <span
                              key={i}
                              className="w-1.5 h-1.5 rounded-full animate-bounce"
                              style={{
                                background: 'var(--accent)',
                                animationDelay: `${i * 0.18}s`,
                                animationDuration: '1.1s',
                                opacity: 0.7,
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <MarkdownMessage content={msg.content} />
                      )}
                      {msg.is_streaming && msg.content && (
                        <span
                          className="inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse"
                          style={{ background: 'var(--accent)' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            className="px-3 py-3 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--app-border)',
              background: 'var(--app-bg-subtle, var(--app-bg))',
            }}
          >
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Tachyon anything..."
                  rows={1}
                  disabled={isStreaming}
                  className="w-full pl-3 pr-3 py-2.5 text-[12px] rounded-xl outline-none transition-all resize-none"
                  style={{
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--text-primary)',
                    lineHeight: '1.5',
                    maxHeight: '80px',
                    overflowY: 'auto',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--app-border)';
                    e.currentTarget.style.boxShadow = '';
                  }}
                />
              </div>
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className="p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{
                  background: input.trim() ? 'var(--accent)' : 'var(--app-surface)',
                  color: input.trim() ? 'white' : 'var(--text-muted)',
                  boxShadow: input.trim() ? '0 4px 12px var(--accent-shadow, rgba(59,130,246,0.3))' : 'none',
                }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Agentic AI · Multi-tool orchestration
                </span>
              </div>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                ↵ Send
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleToggle}
        className={cn(
          'fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group',
          isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100',
        )}
        style={{
          background: 'linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%)',
          boxShadow: '0 8px 32px rgba(10,132,255,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(10,132,255,0.5), 0 0 0 1px rgba(255,255,255,0.15) inset';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(10,132,255,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset';
        }}
        aria-label="Open AI Assistant"
      >
        <MessageSquare className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />

        {/* Pulse ring */}
        {pulseActive && (
          <>
            <span className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: '#0A84FF' }} />
            <span
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style={{ background: '#30D158', borderColor: 'var(--app-bg)', boxShadow: '0 0 6px rgba(48,209,88,0.6)' }}
            />
          </>
        )}

        {/* Unread badge */}
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
            style={{ background: '#FF453A', boxShadow: '0 2px 6px rgba(255,69,58,0.4)' }}
          >
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
