import React, { useEffect, useRef } from 'react';
import { CircleCheck as CheckCircle, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '@/store/notificationStore';
import { Notification } from '@/types';

const DEFAULT_DURATIONS = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: {
    bg: 'rgba(48,209,88,0.08)',
    border: 'rgba(48,209,88,0.2)',
    iconColor: '#30D158',
    titleColor: '#4ade80',
    barColor: '#30D158',
  },
  error: {
    bg: 'rgba(255,69,58,0.08)',
    border: 'rgba(255,69,58,0.2)',
    iconColor: '#FF453A',
    titleColor: '#f87171',
    barColor: '#FF453A',
  },
  warning: {
    bg: 'rgba(255,159,10,0.08)',
    border: 'rgba(255,159,10,0.2)',
    iconColor: '#FF9F0A',
    titleColor: '#fbbf24',
    barColor: '#FF9F0A',
  },
  info: {
    bg: 'rgba(10,132,255,0.08)',
    border: 'rgba(10,132,255,0.2)',
    iconColor: '#0A84FF',
    titleColor: '#60a5fa',
    barColor: '#0A84FF',
  },
};

function NotificationItem({ notification }: { notification: Notification }) {
  const { remove } = useNotificationStore();
  const Icon = icons[notification.type];
  const s = styles[notification.type];
  const duration = notification.duration ?? DEFAULT_DURATIONS[notification.type];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => remove(notification.id), duration);

    const raf = requestAnimationFrame(() => {
      if (progressRef.current) {
        progressRef.current.style.transition = `width ${duration}ms linear`;
        progressRef.current.style.width = '0%';
      }
    });

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(raf);
    };
  }, [notification.id, duration, remove]);

  function handleMouseEnter() {
    clearTimeout(timerRef.current);
    if (progressRef.current) {
      const computed = getComputedStyle(progressRef.current).width;
      progressRef.current.style.transition = 'none';
      progressRef.current.style.width = computed;
    }
  }

  function handleMouseLeave() {
    timerRef.current = setTimeout(() => remove(notification.id), 1500);
    if (progressRef.current) {
      progressRef.current.style.transition = 'width 1500ms linear';
      progressRef.current.style.width = '0%';
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.95, transition: { duration: 0.18, ease: 'easeIn' } }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-start gap-3 px-4 py-3.5 rounded-2xl overflow-hidden cursor-default"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: '0 8px 32px -6px rgba(0,0,0,0.35), 0 2px 8px -2px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(12px)',
        minWidth: '300px',
        maxWidth: '380px',
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
        style={{ background: s.barColor }}
      />
      <div
        className="absolute bottom-0 left-0 h-0.5"
        ref={progressRef}
        style={{ width: '100%', background: s.barColor, opacity: 0.35 }}
      />
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${s.barColor}18` }}
      >
        <Icon className="w-4 h-4" style={{ color: s.iconColor }} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold leading-tight" style={{ color: s.titleColor }}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {notification.message}
          </p>
        )}
      </div>
      <button
        onClick={() => remove(notification.id)}
        className="flex-shrink-0 p-1 rounded-lg transition-all duration-150 mt-0.5 focus-ring"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Dismiss notification"
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = '';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
        }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export function NotificationContainer() {
  const { notifications } = useNotificationStore();
  const capped = notifications.slice(-5);

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 pointer-events-none"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence mode="sync" initial={false}>
        {capped.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <NotificationItem notification={n} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
