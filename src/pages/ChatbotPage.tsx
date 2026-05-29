import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Sparkles, RefreshCw, Bot, Plus, ChevronLeft, Trash2, ThumbsUp, ThumbsDown, Clock, CircleStop as StopCircle, Zap, Activity, TriangleAlert as AlertTriangle, ChartBar as BarChart3 } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { chatApi } from '@/lib/api';
import { ChatMessage, ChatSession, ToolTrace } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { AgentTracePanel } from '@/components/chat/AgentTracePanel';
import { cn, formatRelativeTime } from '@/lib/utils';

const BASE_URL = '/api/v1';

const SUGGESTED_PROMPTS = [
  { icon: AlertTriangle, label: 'Why is health score low?', color: '#F59E0B' },
  { icon: Activity, label: 'Summarize current incidents', color: '#EF4444' },
  { icon: BarChart3, label: 'Which connector is failing most?', color: '#3B82F6' },
  { icon: Clock, label: 'What changed in last 24h?', color: '#10B981' },
  { icon: Zap, label: 'Show slowest connectors', color: '#8B5CF6' },
  { icon: MessageSquare, label: 'Give me an LOB overview', color: '#06B6D4' },
];

interface StreamingCursor {
  visible: boolean;
}

function StreamingText({ text }: { text: string }) {
  const [cursor, setCursor] = useState<StreamingCursor>({ visible: true });

  useEffect(() => {
    const interval = setInterval(() => {
      setCursor(prev => ({ visible: !prev.visible }));
    }, 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <span>
      {text}
      <span
        className="inline-block w-0.5 h-4 ml-0.5 align-middle transition-opacity duration-100"
        style={{
          background: 'var(--accent)',
          opacity: cursor.visible ? 1 : 0,
        }}
      />
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-slide-in-up">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div
        className="px-4 py-3.5 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
        style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {[0, 1, 2].map((i) => (
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
    </div>
  );
}

interface MessageBubbleProps {
  msg: ChatMessage;
  onSuggestionClick: (s: string) => void;
  onFeedback?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
  sessionId?: string;
  feedback?: Record<string, string>;
}

function MessageBubble({ msg, onSuggestionClick, onFeedback, feedback }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const isStreaming = msg.is_streaming;
  const msgFeedback = msg.messageId ? feedback?.[msg.messageId] : undefined;
  const hasAgentTrace = !isUser && ((msg.activeAgents?.length ?? 0) > 0 || (msg.toolTraces?.length ?? 0) > 0);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-blue-700'
            : 'bg-gradient-to-br from-slate-700 to-slate-900'
        )}
      >
        {isUser ? (
          <span className="text-white text-[11px] font-bold leading-none">U</span>
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-white" />
        )}
      </div>

      <div className={cn('flex flex-col gap-1.5 max-w-[80%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm shadow-sm'
              : 'rounded-2xl rounded-tl-sm',
            msg.is_error && !isUser && 'border-red-500/30'
          )}
          style={isUser ? undefined : {
            background: 'var(--glass-bg)',
            border: `1px solid ${msg.is_error ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : isStreaming && msg.content ? (
            <StreamingText text={msg.content} />
          ) : (
            <MarkdownMessage content={msg.content} />
          )}
        </div>

        {hasAgentTrace && (
          <AgentTracePanel
            activeAgents={msg.activeAgents ?? []}
            traces={msg.toolTraces ?? []}
            isRunning={!!isStreaming}
          />
        )}

        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="text-xs px-3 py-1.5 rounded-full border transition-all duration-150 font-medium hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'var(--app-surface)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                  (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                  (e.currentTarget as HTMLElement).style.background = 'var(--app-surface)';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {formatRelativeTime(msg.timestamp)}
            {msg.response_time_ms && !isUser && (
              <span className="ml-1 opacity-60">· {(msg.response_time_ms / 1000).toFixed(1)}s</span>
            )}
          </span>

          {!isUser && msg.messageId && onFeedback && !msg.is_streaming && !msg.is_error && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onFeedback(msg.messageId!, 'thumbs_up')}
                className={cn(
                  'p-0.5 rounded transition-all duration-150',
                  msgFeedback === 'thumbs_up' ? 'opacity-100' : 'opacity-40 hover:opacity-80'
                )}
                style={{ color: msgFeedback === 'thumbs_up' ? '#10B981' : 'var(--text-muted)' }}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => onFeedback(msg.messageId!, 'thumbs_down')}
                className={cn(
                  'p-0.5 rounded transition-all duration-150',
                  msgFeedback === 'thumbs_down' ? 'opacity-100' : 'opacity-40 hover:opacity-80'
                )}
                style={{ color: msgFeedback === 'thumbs_down' ? '#EF4444' : 'var(--text-muted)' }}
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function SessionItem({ session, isActive, onClick, onDelete }: SessionItemProps) {
  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150',
        isActive
          ? 'text-white'
          : 'hover:bg-white/5'
      )}
      style={isActive ? { background: 'var(--accent)', } : undefined}
      onClick={onClick}
    >
      <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate leading-tight" style={{ color: isActive ? 'white' : 'var(--text-primary)' }}>
          {session.title || 'New conversation'}
        </p>
        <p className="text-[10px] mt-0.5 opacity-60" style={{ color: isActive ? 'white' : 'var(--text-muted)' }}>
          {session.message_count} messages · {formatRelativeTime(session.updated_at)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className={cn(
          'p-1 rounded-lg opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all duration-150 flex-shrink-0',
        )}
        style={{ color: isActive ? 'white' : 'var(--text-muted)' }}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

const WELCOME_CONTENT = "Hello! I'm **Tachyon**, your AI health intelligence assistant.\n\nI can help you:\n- Analyze connector and project health\n- Identify and explain incidents\n- Summarize performance metrics\n- Compare health trends over time\n- Provide actionable recommendations\n\nWhat would you like to know?";

export function ChatbotPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { access_token } = useAuthStore();
  const { prefilledInput, clearPrefilledInput } = useChatStore();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPageTitle('Tachyon AI');
    setBreadcrumbs([{ label: 'Tachyon AI' }]);
    loadSessions();
  }, []);

  useEffect(() => {
    if (prefilledInput) {
      setInput(prefilledInput);
      clearPrefilledInput();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [prefilledInput, clearPrefilledInput]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await chatApi.listSessions();
      setSessions(res.data || []);
    } catch {
      setSessions([]);
    }
  };

  const loadSession = async (sessionId: string) => {
    setIsLoadingSession(true);
    setActiveSessionId(sessionId);
    try {
      const res = await chatApi.getHistory(sessionId);
      const records = res.data || [];
      const converted: ChatMessage[] = records.map((r: { id: string; role: 'user' | 'assistant'; content: string; created_at: string; is_streaming: boolean; is_error: boolean; response_time_ms?: number }) => ({
        id: r.id,
        role: r.role as 'user' | 'assistant',
        content: r.content,
        timestamp: r.created_at,
        is_streaming: r.is_streaming,
        is_error: r.is_error,
        response_time_ms: r.response_time_ms,
        messageId: r.id,
      }));
      setMessages(converted.length > 0 ? converted : [welcomeMsg()]);
    } catch {
      setMessages([welcomeMsg()]);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const welcomeMsg = (): ChatMessage => ({
    id: 'welcome',
    role: 'assistant',
    content: WELCOME_CONTENT,
    timestamp: new Date().toISOString(),
    suggestions: SUGGESTED_PROMPTS.map(p => p.label).slice(0, 4),
  });

  const createNewSession = async () => {
    try {
      const res = await chatApi.createSession({});
      const session: ChatSession = res.data;
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([welcomeMsg()]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setMessages([welcomeMsg()]);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await chatApi.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([welcomeMsg()]);
      }
    } catch {
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    streamingMsgIdRef.current = null;
  };

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isStreaming) return;

    setInput('');

    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const res = await chatApi.createSession({});
        const session: ChatSession = res.data;
        sessionId = session.id;
        setSessions(prev => [session, ...prev]);
        setActiveSessionId(session.id);
      } catch {
        return;
      }
    }

    const userMsgId = `u-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => {
      const filtered = prev.filter(m => m.id !== 'welcome');
      return [...filtered, userMsg];
    });

    const assistantMsgId = `a-stream-${Date.now()}`;
    streamingMsgIdRef.current = assistantMsgId;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      is_streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`,
        },
        body: JSON.stringify({ session_id: sessionId, message: content }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMessageId: string | null = null;
      let traceCounter = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'session') {
              finalMessageId = event.message_id;
            } else if (event.type === 'agents') {
              const activeAgents: string[] = event.active ?? [];
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId ? { ...m, activeAgents } : m
                )
              );
            } else if (event.type === 'tool_start') {
              const traceId = `trace-${traceCounter++}`;
              const newTrace: ToolTrace = {
                id: traceId,
                agent: event.agent,
                tool: event.tool,
                args: event.args ?? {},
                status: 'running',
              };
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, toolTraces: [...(m.toolTraces ?? []), newTrace] }
                    : m
                )
              );
            } else if (event.type === 'tool_result') {
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantMsgId) return m;
                  const updatedTraces = (m.toolTraces ?? []).map(t =>
                    t.agent === event.agent && t.tool === event.tool && t.status === 'running'
                      ? {
                          ...t,
                          status: (event.status ?? 'success') as ToolTrace['status'],
                          result: event.result,
                          duration_ms: event.duration_ms,
                        }
                      : t
                  );
                  return { ...m, toolTraces: updatedTraces };
                })
              );
            } else if (event.type === 'delta') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.text, is_streaming: true }
                    : m
                )
              );
            } else if (event.type === 'done') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        is_streaming: false,
                        suggestions: event.suggestions,
                        response_time_ms: event.response_time_ms,
                        messageId: finalMessageId || m.id,
                        agents_used: event.agents_used,
                        tools_executed: event.tools_executed,
                      }
                    : m
                )
              );
              setSessions(prev =>
                prev.map(s =>
                  s.id === sessionId
                    ? { ...s, message_count: s.message_count + 2, updated_at: new Date().toISOString() }
                    : s
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
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId && m.is_streaming
              ? { ...m, is_streaming: false, content: m.content || '*(generation stopped)*' }
              : m
          )
        );
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'Sorry, I encountered an error. Please try again.', is_streaming: false, is_error: true }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      streamingMsgIdRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, isStreaming, activeSessionId, access_token]);

  const handleFeedback = async (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => {
    if (!activeSessionId || feedback[messageId]) return;
    setFeedback(prev => ({ ...prev, [messageId]: rating }));
    try {
      await chatApi.submitFeedback({
        session_id: activeSessionId,
        message_id: messageId,
        rating,
      });
    } catch {
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const visibleMessages = messages.filter(m => m.content !== '' || m.is_streaming || m.id === 'welcome');

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4 animate-fade-in">
      {showSidebar && (
        <div
          className="w-64 flex-shrink-0 flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <button
              onClick={createNewSession}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: 'var(--accent)',
                color: 'white',
                boxShadow: '0 2px 8px var(--accent-shadow, rgba(59,130,246,0.3))',
              }}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scroll-area">
            {sessions.length === 0 ? (
              <div className="text-center py-8 px-3">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No conversations yet</p>
              </div>
            ) : (
              sessions.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => loadSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                />
              ))
            )}
          </div>

          <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-2 px-2 py-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.5)' }}
              />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Tachyon AI · Active
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(v => !v)}
              className="p-1.5 rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
              style={{
                color: 'var(--text-muted)',
                background: showSidebar ? 'var(--app-surface)' : 'transparent',
              }}
            >
              <ChevronLeft className={cn('w-4 h-4 transition-transform duration-300', !showSidebar && 'rotate-180')} />
            </button>
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}
            >
              <Bot className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight leading-tight" style={{ color: 'var(--text-primary)' }}>
                Tachyon AI
              </h2>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                Health Intelligence Assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <Button
                variant="secondary"
                size="sm"
                icon={<StopCircle className="w-3.5 h-3.5" />}
                onClick={stopGeneration}
              >
                Stop
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={createNewSession}
            >
              New Chat
            </Button>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden" padding="none">
          <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-area" style={{ minHeight: 0 }}>
            {isLoadingSession ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex gap-2 items-center" style={{ color: 'var(--text-muted)' }}>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
                  <span className="text-sm">Loading conversation...</span>
                </div>
              </div>
            ) : visibleMessages.length === 0 ? (
              <EmptyState onPromptClick={sendMessage} />
            ) : (
              visibleMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onSuggestionClick={sendMessage}
                  onFeedback={handleFeedback}
                  sessionId={activeSessionId || undefined}
                  feedback={feedback}
                />
              ))
            )}
            {isStreaming && visibleMessages[visibleMessages.length - 1]?.content === '' && (
              <TypingIndicator />
            )}
            <div ref={messagesEndRef} />
          </div>

          <div
            className="p-4 flex-shrink-0"
            style={{
              borderTop: '1px solid var(--app-border)',
              background: 'var(--app-bg-subtle)',
            }}
          >
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-end gap-2"
            >
              <div className="flex-1 relative group">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about health status, incidents, performance..."
                  rows={1}
                  className="w-full pl-4 pr-4 py-3 text-sm rounded-xl outline-none transition-all duration-150 resize-none"
                  style={{
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--text-primary)',
                    lineHeight: '1.5',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    fieldSizing: 'content' as React.CSSProperties['fieldSizing'],
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--app-border)';
                    e.currentTarget.style.boxShadow = '';
                  }}
                  disabled={isStreaming}
                />
              </div>
              <Button
                type="submit"
                icon={<Send className="w-4 h-4" />}
                loading={isStreaming && !input}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 self-end"
              >
                Send
              </Button>
            </form>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ onPromptClick }: { onPromptClick: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-8 px-4">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-xl font-bold mb-1.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Ask Tachyon anything
      </h3>
      <p className="text-sm text-center mb-8 max-w-sm" style={{ color: 'var(--text-muted)' }}>
        Powered by AI health intelligence. Ask about incidents, connector status, performance trends, or system health.
      </p>
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-lg">
        {SUGGESTED_PROMPTS.map((prompt) => {
          const Icon = prompt.icon;
          return (
            <button
              key={prompt.label}
              onClick={() => onPromptClick(prompt.label)}
              className="flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] group"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = prompt.color + '60';
                (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${prompt.color}15`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: prompt.color + '18' }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: prompt.color }} />
              </div>
              <span className="text-sm font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {prompt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
