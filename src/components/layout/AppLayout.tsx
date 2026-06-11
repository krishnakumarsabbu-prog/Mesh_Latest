import React, { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NotificationContainer } from '@/components/ui/Notification';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/lib/utils';

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-page-enter">
      {children}
    </div>
  );
}

export function AppLayout() {
  const { isAuthenticated } = useAuthStore();
  const { sidebarCollapsed } = useUIStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-graphite', 'theme-aurora', 'theme-frost', 'theme-harness', 'theme-harness-dark');
    if (theme === 'graphite') root.classList.add('theme-graphite');
    else if (theme === 'aurora') root.classList.add('theme-aurora');
    else if (theme === 'frost') root.classList.add('theme-frost');
    else if (theme === 'harness-dark') root.classList.add('theme-harness-dark');
    else if (theme === 'harness') root.classList.add('theme-harness');
    // default (harness light) uses :root variables — no class needed
    document.body.style.background = 'var(--app-bg)';
    document.body.style.color = 'var(--text-primary)';
  }, [theme]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--app-bg)' }}
    >
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar />
      <Header />

      <main
        id="main-content"
        className={cn(
          'min-h-screen pt-[52px] transition-all duration-250 ease-out',
          sidebarCollapsed ? 'pl-[52px]' : 'pl-[220px]',
        )}
      >
        <div className="px-6 py-6 max-w-screen-2xl mx-auto">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      <NotificationContainer />
    </div>
  );
}
