import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex items-start w-full justify-start">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold mr-2"
        style={{ background: 'rgba(0,229,153,0.12)', color: '#00E599', border: '1px solid rgba(0,229,153,0.25)' }}
      >
        AI
      </div>
      <div
        className="rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1"
        style={{
          background: 'var(--app-bg-subtle)',
          border: '1px solid var(--app-border)',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{
              background: '#00E599',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '0.9s',
            }}
          />
        ))}
      </div>
    </div>
  );
}
