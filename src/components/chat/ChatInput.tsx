import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5"
      style={{ borderTop: '1px solid var(--app-border)', background: 'var(--app-bg)' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your infrastructure..."
        disabled={disabled}
        className={cn(
          'flex-1 text-[13px] px-3 py-2 rounded-xl outline-none transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        style={{
          background: 'var(--app-bg-subtle)',
          border: '1px solid var(--app-border)',
          color: 'var(--text-primary)',
        }}
        autoComplete="off"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          value.trim() && !disabled ? 'hover:opacity-80 active:scale-95' : ''
        )}
        style={{
          background: value.trim() && !disabled ? '#006CFF' : 'var(--app-bg-subtle)',
          border: '1px solid var(--app-border)',
        }}
        aria-label="Send message"
      >
        <Send size={14} style={{ color: value.trim() && !disabled ? '#fff' : 'var(--text-muted)' }} />
      </button>
    </div>
  );
}
