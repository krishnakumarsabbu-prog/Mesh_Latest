import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  required?: boolean;
}

export function Input({ label, error, hint, prefixIcon, suffixIcon, className, id, required, style, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-wide uppercase flex items-center gap-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
          {required && <span className="text-[10px]" style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <div className="relative group">
        {prefixIcon && (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-150 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {prefixIcon}
          </div>
        )}
        <input
          id={inputId}
          required={required}
          className={cn(
            'hm-input w-full px-3 py-2.5 rounded-xl text-sm outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'hm-input-error',
            prefixIcon && 'pl-9',
            suffixIcon && 'pr-9',
            className
          )}
          style={style}
          {...props}
        />
        {suffixIcon && (
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {suffixIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--danger)' }}>
          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--danger)' }} />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  required?: boolean;
}

export function Select({ label, error, hint, options, className, id, required, style, ...props }: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-wide uppercase flex items-center gap-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
          {required && <span className="text-[10px]" style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <div className="relative group">
        <select
          id={inputId}
          required={required}
          className={cn(
            'hm-input w-full appearance-none pl-3 pr-9 py-2.5 rounded-xl text-sm outline-none cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'hm-input-error',
            className
          )}
          style={style}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: 'var(--app-bg-subtle)', color: 'var(--text-primary)' }}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors duration-150"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
      {error && (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--danger)' }}>
          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--danger)' }} />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function TextArea({ label, error, hint, className, id, required, style, ...props }: TextAreaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-wide uppercase flex items-center gap-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
          {required && <span className="text-[10px]" style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        required={required}
        className={cn(
          'hm-input w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none',
          error && 'hm-input-error',
          className
        )}
        style={style}
        rows={3}
        {...props}
      />
      {error && (
        <p className="text-xs flex items-center gap-1" style={{ color: 'var(--danger)' }}>
          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--danger)' }} />
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
