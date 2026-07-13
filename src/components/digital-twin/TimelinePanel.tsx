import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Rocket, TriangleAlert as AlertTriangle, GitBranch, Activity, TrendingUp, Shield, FileText, RotateCcw, Eye, Clock } from 'lucide-react';
import type { DTTimelineEvent } from '@/store/digitalTwinStore';

const typeIcon: Record<string, React.ElementType> = {
  DEPLOYMENT: Rocket,
  INCIDENT: AlertTriangle,
  CHANGE: GitBranch,
  ALERT: Activity,
  SCALING: TrendingUp,
  TRAFFIC: TrendingUp,
  DRIFT_DETECTION: Shield,
  AUDIT: FileText,
  FAILURE: AlertTriangle,
  RECOVERY: RotateCcw,
  SIMULATION: Eye,
  IMPORT: FileText,
  EVENT: Clock,
};

const typeColor: Record<string, string> = {
  DEPLOYMENT: '#3B82F6',
  INCIDENT: '#FF003C',
  CHANGE: '#8B5CF6',
  ALERT: '#FFB100',
  SCALING: '#06B6D4',
  TRAFFIC: '#10B981',
  DRIFT_DETECTION: '#F59E0B',
  AUDIT: '#667085',
  FAILURE: '#FF003C',
  RECOVERY: '#00B074',
  SIMULATION: '#A855F7',
  IMPORT: '#0EA5E9',
  EVENT: '#667085',
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}

export function TimelinePanel({ events }: { events: DTTimelineEvent[] }) {
  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  [events]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        <Clock className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
        <h4 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#98A2B3' }}>Timeline</h4>
        <span className="text-[10px] ml-auto" style={{ color: '#667085' }}>{sortedEvents.length} events</span>
      </div>

      {/* Horizontal timeline */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
        <div className="relative flex items-center gap-0 px-4 py-3 min-w-max">
          {/* Timeline line */}
          <div
            className="absolute left-4 right-4 top-1/2 h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          />

          {sortedEvents.slice(0, 20).map((event, i) => {
            const Icon = typeIcon[event.type] || Clock;
            const color = typeColor[event.type] || '#667085';
            const isCritical = event.severity === 'critical';

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                className="relative flex flex-col items-center group z-10"
                style={{ minWidth: 120, maxWidth: 160 }}
              >
                {/* Event card */}
                <div
                  className="absolute bottom-full mb-2 w-full px-2 py-1.5 rounded-[8px] border opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20"
                  style={{
                    background: 'rgba(18,24,38,0.98)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  }}
                >
                  <p className="text-[10px] font-bold" style={{ color }}>{event.type.replace(/_/g, ' ')}</p>
                  <p className="text-[9px] mt-0.5 leading-tight" style={{ color: '#98A2B3' }}>{event.title}</p>
                </div>

                {/* Dot */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                  style={{
                    background: isCritical ? `${color}22` : 'rgba(18,24,38,0.95)',
                    borderColor: color,
                    boxShadow: isCritical ? `0 0 12px ${color}44` : 'none',
                  }}
                >
                  <Icon className="w-3 h-3" style={{ color }} strokeWidth={2} />
                </div>

                {/* Label */}
                <div className="mt-1.5 text-center">
                  <p className="text-[9px] font-semibold truncate max-w-[140px]" style={{ color: '#E6EAF0' }}>
                    {event.type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#667085' }}>{formatTime(event.timestamp)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
