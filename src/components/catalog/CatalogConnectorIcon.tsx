import React from 'react';
import { ChartBar as BarChart2, Activity, Cpu, GitMerge, ClipboardList, Globe, Database, Plug, Zap, Server, Box, Network, Search, CircleAlert as AlertCircle } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  'bar-chart-2': BarChart2,
  'activity': Activity,
  'cpu': Cpu,
  'git-merge': GitMerge,
  'clipboard-list': ClipboardList,
  'globe': Globe,
  'database': Database,
  'plug': Plug,
  'zap': Zap,
  'server': Server,
  'box': Box,
  'network': Network,
  'search': Search,
};

interface CatalogConnectorIconProps {
  icon?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: { container: 'w-8 h-8 rounded-xl', icon: 'w-4 h-4' },
  md: { container: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5' },
  lg: { container: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7' },
  xl: { container: 'w-16 h-16 rounded-2xl', icon: 'w-8 h-8' },
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function CatalogConnectorIcon({ icon, color = '#2563EB', size = 'md' }: CatalogConnectorIconProps) {
  const IconComp = (icon && ICON_MAP[icon]) ? ICON_MAP[icon] : AlertCircle;
  const { container, icon: iconClass } = sizeMap[size];
  const bg = hexToRgba(color, 0.12);

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${container}`}
      style={{ background: bg }}
    >
      <IconComp className={iconClass} style={{ color }} />
    </div>
  );
}
