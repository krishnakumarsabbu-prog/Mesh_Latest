import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { notify } from './store/notificationStore'

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
    <App />
  </React.StrictMode>,
)
