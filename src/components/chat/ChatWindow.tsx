import React, { useEffect, useRef } from 'react';
import { X, RotateCcw, Bot } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { processMessage } from '@/services/chatService';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';

export function ChatWindow() {
  const { messages, isLoading, addMessage, setLoading, clearMessages, close } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function handleSend(text: string) {
    addMessage({ role: 'user', content: text });
    setLoading(true);
    try {
      const result = await processMessage(text);
      addMessage({ role: 'bot', content: result.content, isHtml: result.isHtml });
    } catch {
      addMessage({ role: 'bot', content: 'Sorry, something went wrong. Please try again.', isHtml: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        width: '380px',
        height: '520px',
        background: 'var(--app-bg)',
        border: '1px solid var(--app-border)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-bg-subtle)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,229,153,0.12)', border: '1px solid rgba(0,229,153,0.25)' }}
          >
            <Bot size={16} style={{ color: '#00E599' }} />
          </div>
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              HealthMesh AI
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Infrastructure Assistant
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150',
              'hover:opacity-80'
            )}
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <RotateCcw size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button
            onClick={close}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150',
              'hover:opacity-80'
            )}
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            title="Close chat"
            aria-label="Close chat"
          >
            <X size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3"
        style={{ scrollbarWidth: 'thin' }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
