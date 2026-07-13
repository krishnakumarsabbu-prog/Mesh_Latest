import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, Sparkles, User, Bot } from 'lucide-react';

const SUGGESTED_QUESTIONS = [
  'Can I shutdown DC-East?',
  'What is the blast radius?',
  'Why is confidence only 82%?',
  'Explain the topology',
  'Find hidden dependencies',
  'Can I migrate this app?',
  'Generate an RCA',
  'Plan migration',
];

export function AICopilotPanel({
  aiHistory,
  aiLoading,
  onAsk,
  appId,
}: {
  aiHistory: { role: 'user' | 'assistant'; content: string; suggestions?: string[] }[];
  aiLoading: boolean;
  onAsk: (question: string) => void;
  appId: string;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiHistory, aiLoading]);

  const handleSubmit = (question?: string) => {
    const q = question || input.trim();
    if (!q || !appId) return;
    onAsk(q);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.04]">
        <div
          className="w-7 h-7 rounded-[8px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)' }}
        >
          <Brain className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-[12px] font-bold" style={{ color: '#E6EAF0' }}>AI Copilot</h3>
          <p className="text-[9px]" style={{ color: '#667085' }}>Powered by Knowledge Graph</p>
        </div>
        <Sparkles className="w-3.5 h-3.5 ml-auto" style={{ color: '#A855F7' }} />
      </div>

      {/* Chat history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {aiHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center mb-3"
              style={{ background: 'rgba(168,85,247,0.08)' }}
            >
              <Brain className="w-6 h-6" style={{ color: '#A855F7' }} />
            </div>
            <p className="text-[12px] font-semibold mb-1" style={{ color: '#E6EAF0' }}>Ask me anything</p>
            <p className="text-[10px] mb-4" style={{ color: '#667085' }}>I understand the full knowledge graph</p>
            <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="text-left px-3 py-2 rounded-[8px] text-[11px] font-medium transition-all"
                  style={{
                    color: '#98A2B3',
                    background: 'rgba(168,85,247,0.04)',
                    border: '1px solid rgba(168,85,247,0.08)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168,85,247,0.1)';
                    e.currentTarget.style.color = '#E6EAF0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(168,85,247,0.04)';
                    e.currentTarget.style.color = '#98A2B3';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {aiHistory.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex gap-2"
          >
            <div
              className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0"
              style={{
                background: msg.role === 'user' ? 'rgba(59,130,246,0.12)' : 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
              }}
            >
              {msg.role === 'user' ? (
                <User className="w-3 h-3" style={{ color: '#3B82F6' }} />
              ) : (
                <Bot className="w-3 h-3 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] leading-relaxed whitespace-pre-wrap"
                style={{ color: msg.role === 'user' ? '#E6EAF0' : '#98A2B3' }}
              >
                {msg.content}
              </p>
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSubmit(s)}
                      className="px-2 py-0.5 text-[9px] font-medium rounded-full transition-all"
                      style={{
                        background: 'rgba(168,85,247,0.08)',
                        color: '#A855F7',
                        border: '1px solid rgba(168,85,247,0.12)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {aiLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
            <div
              className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)' }}
            >
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="flex items-center gap-1 py-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#A855F7' }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Ask about topology, blast radius, migration..."
            className="flex-1 px-3 py-2 text-[11px] rounded-[10px] border border-white/[0.06] outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.02)', color: '#E6EAF0' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#A855F755'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || aiLoading}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-all disabled:opacity-30"
            style={{
              background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
            }}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
