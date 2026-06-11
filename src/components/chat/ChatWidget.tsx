import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { ChatWindow } from './ChatWindow';
import { cn } from '@/lib/utils';

export function ChatWidget() {
  const { isOpen, toggle, messages } = useChatStore();

  // Count unread bot messages (all bot messages when chat is closed)
  const unreadCount = !isOpen
    ? messages.filter((m) => m.role === 'bot' && m.id !== 'welcome').length
    : 0;

  return (
    <div
      className="fixed bottom-6 right-6 flex flex-col items-end gap-3"
      style={{ zIndex: 9999 }}
    >
      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ transformOrigin: 'bottom right' }}
          >
            <ChatWindow />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        onClick={toggle}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
        )}
        style={{
          background: isOpen
            ? 'rgba(255,0,60,0.12)'
            : 'linear-gradient(135deg, #006CFF 0%, #00E599 100%)',
          border: isOpen
            ? '1px solid rgba(255,0,60,0.3)'
            : '1px solid rgba(0,229,153,0.3)',
          boxShadow: isOpen
            ? '0 8px 32px rgba(255,0,60,0.2)'
            : '0 8px 32px rgba(0,108,255,0.35)',
        }}
        aria-label={isOpen ? 'Close chat' : 'Open HealthMesh AI chat'}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
            >
              <X size={22} style={{ color: '#FF003C' }} />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle size={22} style={{ color: '#fff' }} />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: '#FF003C', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
}
