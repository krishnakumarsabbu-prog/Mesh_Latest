import React from 'react';
import { Database, MessageSquare, Zap, Server, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TechStack } from '@/types';

interface TechStackIconProps {
  techStack: TechStack;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

const TECH_CONFIG: Record<TechStack, { Icon: React.ElementType; color: string; label: string }> = {
  ibm_mq:  { Icon: MessageSquare, color: '#FF9F0A', label: 'IBM MQ' },
  mongodb: { Icon: Database,      color: '#30D158', label: 'MongoDB' },
  oracle:  { Icon: Database,      color: '#FF453A', label: 'Oracle' },
  mssql:   { Icon: Database,      color: '#0A84FF', label: 'MS SQL' },
  kafka:   { Icon: Zap,           color: '#FF9F0A', label: 'Kafka' },
  vm:      { Icon: Server,        color: '#8E8E93', label: 'VM' },
  ocp:     { Icon: Box,           color: '#FF453A', label: 'OCP' },
};

export function TechStackIcon({ techStack, size = 14, showLabel = false, className }: TechStackIconProps) {
  const cfg = TECH_CONFIG[techStack] ?? TECH_CONFIG['vm'];
  const { Icon, color, label } = cfg;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Icon style={{ color, width: size, height: size }} strokeWidth={2} />
      {showLabel && (
        <span className="text-[10px] font-semibold" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}

export function techStackLabel(stack: TechStack): string {
  return TECH_CONFIG[stack]?.label ?? stack;
}
