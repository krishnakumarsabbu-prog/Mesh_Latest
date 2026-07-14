import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App.tsx'
import './index.css'
import { notify } from './store/notificationStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
      ? reason
      : 'An unexpected error occurred'
  if (
    message.includes('AbortError') ||
    message.includes('NetworkError') ||
    message.includes('Failed to fetch') ||
    message.includes('Load failed')
  ) {
    return
  }
  notify.error('Unexpected Error', message)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
)
