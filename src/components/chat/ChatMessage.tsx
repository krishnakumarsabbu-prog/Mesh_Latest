import React from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/store/chatStore';

interface Props {
  message: ChatMessageType;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold mr-2 mt-0.5"
          style={{ background: 'rgba(0,229,153,0.12)', color: '#00E599', border: '1px solid rgba(0,229,153,0.25)' }}
        >
          AI
        </div>
      )}

      <div className={cn('flex flex-col max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
            isUser
              ? 'rounded-br-sm'
              : 'rounded-bl-sm'
          )}
          style={
            isUser
              ? {
                  background: 'rgba(0,108,255,0.18)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(0,108,255,0.3)',
                }
              : {
                  background: 'var(--app-bg-subtle)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--app-border)',
                }
          }
        >
          {message.isHtml ? (
            <span
              dangerouslySetInnerHTML={{ __html: message.content }}
              style={{ display: 'block' }}
              className="chat-html-content"
            />
          ) : (
            message.content
          )}
        </div>
        <span className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-muted)' }}>
          {formatTime(message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp))}
        </span>
      </div>

      {isUser && (
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ml-2 mt-0.5"
          style={{ background: 'rgba(0,108,255,0.12)', color: '#006CFF', border: '1px solid rgba(0,108,255,0.25)' }}
        >
          U
        </div>
      )}
    </div>
  );
}
