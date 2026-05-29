import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  loading?: boolean;
  className?: string;
  rowClassName?: (row: T) => string;
  stickyHeader?: boolean;
}

type SortDir = 'asc' | 'desc' | null;

export function Table<T extends object>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No data available',
  emptyIcon,
  loading = false,
  className,
  rowClassName,
  stickyHeader = false,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const aStr = String(av ?? '').toLowerCase();
      const bStr = String(bv ?? '').toLowerCase();
      const cmp = aStr.localeCompare(bStr);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <ChevronsUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
    if (sortDir === 'asc') return <ChevronUp className="w-3 h-3 text-primary-500" />;
    return <ChevronDown className="w-3 h-3 text-primary-500" />;
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr
            className="border-b"
            style={{ borderColor: 'var(--app-border)' }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left',
                  stickyHeader && 'backdrop-blur-sm',
                  col.sortable && 'cursor-pointer select-none group',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.width && `w-${col.width}`,
                  col.className
                )}
                style={{ background: stickyHeader ? 'var(--app-bg-subtle)' : undefined }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <div className={cn(
                  'inline-flex items-center gap-1.5',
                  col.align === 'right' && 'flex-row-reverse',
                )}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400">
                    {col.header}
                  </span>
                  {col.sortable && <SortIcon colKey={col.key} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr
                key={i}
                className="border-b"
                style={{ borderColor: 'var(--app-border-subtle)' }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-4">
                    <div
                      className="h-3.5 rounded-lg shimmer-bg"
                      style={{ width: `${55 + (i * 13 + col.key.length * 7) % 35}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  {emptyIcon && (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'var(--app-bg-muted)' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{emptyIcon}</span>
                    </div>
                  )}
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {emptyMessage}
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'group border-b transition-all duration-100',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row),
                )}
                style={{ borderColor: 'var(--app-border-subtle)' }}
                onMouseEnter={(e) => {
                  if (onRowClick) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-subtle)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '';
                }}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3.5 text-sm',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {col.render
                      ? col.render((row as Record<string, unknown>)[col.key], row)
                      : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
