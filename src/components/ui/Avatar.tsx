import React from 'react';
import { cn } from '@/lib/utils';

type PresenceStatus = 'online' | 'offline' | 'away' | 'busy';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  presence?: PresenceStatus;
  className?: string;
}

const sizeMap = {
  xs: { avatar: 'w-6 h-6', text: 'text-[9px]', dot: 'w-1.5 h-1.5' },
  sm: { avatar: 'w-7 h-7', text: 'text-[10px]', dot: 'w-2 h-2' },
  md: { avatar: 'w-8 h-8', text: 'text-xs', dot: 'w-2 h-2' },
  lg: { avatar: 'w-10 h-10', text: 'text-sm', dot: 'w-2.5 h-2.5' },
  xl: { avatar: 'w-12 h-12', text: 'text-base', dot: 'w-3 h-3' },
};

const presenceColors: Record<PresenceStatus, string> = {
  online: 'bg-success',
  offline: 'bg-neutral-300',
  away: 'bg-warning',
  busy: 'bg-danger',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ name, src, size = 'md', presence, className }: AvatarProps) {
  const s = sizeMap[size];

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(s.avatar, 'rounded-full object-cover')}
        />
      ) : (
        <div className={cn(
          s.avatar,
          'rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center',
        )}>
          <span className={cn(s.text, 'font-bold text-white leading-none')}>{getInitials(name)}</span>
        </div>
      )}
      {presence && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-[1.5px] border-white',
            s.dot,
            presenceColors[presence],
          )}
        />
      )}
    </div>
  );
}
