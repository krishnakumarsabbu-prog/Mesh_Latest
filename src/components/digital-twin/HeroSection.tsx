import { motion } from 'framer-motion';
import { Search, Activity, ShieldCheck, Zap, TrendingUp, Gauge, Server, Database, Building2, Cpu, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Layers, GitBranch, Eye } from 'lucide-react';
import type { DTHero } from '@/store/digitalTwinStore';

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  healthy: { color: '#00B074', bg: 'rgba(0,176,116,0.12)', label: 'Healthy' },
  degraded: { color: '#FFB100', bg: 'rgba(255,177,0,0.12)', label: 'Degraded' },
  down: { color: '#FF003C', bg: 'rgba(255,0,60,0.12)', label: 'Down' },
  unknown: { color: '#8A97A8', bg: 'rgba(138,151,168,0.12)', label: 'Unknown' },
};

const confidenceColor = (score: number) => {
  if (score >= 85) return '#00B074';
  if (score >= 60) return '#FFB100';
  if (score >= 35) return '#FF8800';
  return '#FF003C';
};

const truthColor = (truth: string) => {
  if (truth === 'VERIFIED') return '#00B074';
  if (truth === 'PARTIAL') return '#FFB100';
  return '#FF003C';
};

export function HeroSection({ hero }: { hero: DTHero }) {
  const st = statusConfig[hero.status] || statusConfig.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-[20px] border border-white/[0.06] p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(18,24,38,0.95) 0%, rgba(11,16,32,0.98) 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #00B074 0%, transparent 70%)' }}
      />

      <div className="relative flex items-start justify-between gap-6">
        {/* Left: App identity */}
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="flex-shrink-0 w-14 h-14 rounded-[16px] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}
          >
            <Eye className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-[22px] font-bold tracking-tight truncate" style={{ color: '#E6EAF0', letterSpacing: '-0.02em' }}>
                {hero.application_name}
              </h1>
              <span
                className="px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap"
                style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}33` }}
              >
                {st.label.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12px] flex-wrap" style={{ color: '#98A2B3' }}>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" style={{ color: '#FF003C' }} />
                <span className="font-semibold" style={{ color: '#FF003C' }}>{hero.criticality}</span>
              </span>
              <span className="opacity-30">|</span>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {hero.lob}
              </span>
              <span className="opacity-30">|</span>
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {hero.data_centers.join(', ')}
              </span>
              <span className="opacity-30">|</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                v{hero.version}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick metrics */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <MetricChip icon={Activity} label="Health" value={`${hero.health_score}`} suffix="/100" color={confidenceColor(hero.health_score)} />
          <MetricChip icon={Gauge} label="Confidence" value={`${hero.confidence_score}`} suffix="/100" color={confidenceColor(hero.confidence_score)} />
          <MetricChip icon={Zap} label="Runtime Truth" value={hero.runtime_truth} color={truthColor(hero.runtime_truth)} />
          <MetricChip icon={TrendingUp} label="Traffic" value={`${hero.traffic_rpm.toLocaleString()}`} suffix=" rpm" color="#3B82F6" />
        </div>
      </div>

      {/* Bottom: Asset summary bar */}
      <div className="relative mt-4 flex items-center gap-4 pt-4 border-t border-white/[0.04]">
        <AssetPill icon={Server} label="Total Assets" value={hero.total_assets} color="#3B82F6" />
        <AssetPill icon={CheckCircle2} label="Active" value={hero.active_assets} color="#00B074" />
        <AssetPill icon={Cpu} label="Standby" value={hero.standby_assets} color="#FFB100" />
        {hero.degraded_assets > 0 && (
          <AssetPill icon={AlertTriangle} label="Degraded" value={hero.degraded_assets} color="#FF003C" />
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[11px]" style={{ color: '#667085' }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: hero.alignment_status === 'ALIGNED' ? '#00B074' : '#FFB100' }} />
            Alignment: {hero.alignment_status}
          </span>
          <span className="opacity-30">|</span>
          <span>{hero.tech_stacks.length} tech stacks</span>
        </div>
      </div>
    </motion.div>
  );
}

function MetricChip({
  icon: Icon, label, value, suffix, color,
}: { icon: React.ElementType; label: string; value: string; suffix?: string; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-white/[0.05]"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} strokeWidth={2} />
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#667085' }}>{label}</p>
        <p className="text-[14px] font-bold leading-none mt-0.5" style={{ color }}>
          {value}<span className="text-[10px] font-normal opacity-60">{suffix}</span>
        </p>
      </div>
    </div>
  );
}

function AssetPill({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5" style={{ color }} strokeWidth={2} />
      <span className="text-[12px] font-bold" style={{ color: '#E6EAF0' }}>{value}</span>
      <span className="text-[11px]" style={{ color: '#667085' }}>{label}</span>
    </div>
  );
}
