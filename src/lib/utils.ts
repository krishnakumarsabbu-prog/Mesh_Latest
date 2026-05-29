import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy': return '#30D158';
    case 'degraded': return '#FF9F0A';
    case 'down':
    case 'error':
    case 'timeout': return '#FF453A';
    default: return '#A1A1AA';
  }
}

export function getStatusBgClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'healthy': return 'bg-success-50 text-success-600 border-success-100';
    case 'degraded': return 'bg-warning-50 text-warning-500 border-warning-100';
    case 'down':
    case 'error': return 'bg-danger-50 text-danger-500 border-danger-100';
    default: return 'bg-neutral-100 text-neutral-500 border-neutral-200';
  }
}

export function formatMs(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '…';
}
