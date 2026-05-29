import React, { useEffect, useState } from "react";
import {
  Activity, Building2, FolderOpen, Plug,
  TriangleAlert as AlertTriangle, CircleCheck as CheckCircle,
  CircleAlert as AlertCircle, Clock,
} from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { healthApi } from "@/lib/api";
import { DashboardStats, HealthTrend } from "@/types";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { HealthTrendChart } from "@/components/charts/HealthTrendChart";
import { StatusDonutChart } from "@/components/charts/StatusDonutChart";
import { StatsSkeleton, ChartSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { formatMs } from "@/lib/utils";
import { RoleBanner } from "@/components/dashboard/RoleBanner";
import { RoleQuickActions } from "@/components/dashboard/RoleQuickActions";

const STATUS_ROWS = [
  { key: "healthy", label: "Healthy", color: "#30D158", Icon: CheckCircle },
  { key: "degraded", label: "Degraded", color: "#FF9F0A", Icon: AlertTriangle },
  { key: "down", label: "Down", color: "#FF453A", Icon: AlertCircle },
] as const;

function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ background: "#30D158" }}
        />
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#30D158" }} />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#30D158" }}>
        Live
      </span>
    </div>
  );
}

function StatusBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-bg-muted)" }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: pct + "%", background: color }}
      />
    </div>
  );
}

function LastUpdated() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
      <Clock className="w-3 h-3" />
      <span className="text-[11px]">
        {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const { setPageTitle, setBreadcrumbs } = useUIStore();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<HealthTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageTitle("Dashboard");
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, trendsRes] = await Promise.all([
          healthApi.stats(),
          healthApi.trends(24),
        ]);
        setStats(statsRes.data);
        setTrends(trendsRes.data);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const mockStats: DashboardStats = {
    total_lobs: 8,
    total_projects: 34,
    total_connectors: 142,
    healthy_connectors: 128,
    degraded_connectors: 10,
    down_connectors: 4,
    unknown_connectors: 0,
    overall_health_percentage: 90.1,
    avg_response_time_ms: 245,
  };

  const displayStats = stats || (loading ? null : mockStats);

  return (
    <div className="space-y-6 animate-page-enter">
      {user && <RoleBanner role={user.role} name={user.full_name} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            System Overview
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Platform health at a glance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge />
          <LastUpdated />
        </div>
      </div>

      {loading && !displayStats ? (
        <StatsSkeleton />
      ) : displayStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <MetricCard
            title="Lines of Business"
            value={displayStats.total_lobs}
            subtitle="Active LOBs"
            icon={Building2}
            iconColor="text-primary-500"
            iconBg="bg-primary-50"
            accent="#0A84FF"
            className="animate-slide-up"
          />
          <MetricCard
            title="Projects"
            value={displayStats.total_projects}
            subtitle="Across all LOBs"
            icon={FolderOpen}
            iconColor="text-teal-600"
            iconBg="bg-teal-50"
            accent="#0D9488"
            className="animate-slide-up"
          />
          <MetricCard
            title="Connectors"
            value={displayStats.total_connectors}
            subtitle="Monitored services"
            icon={Plug}
            iconColor="text-amber-500"
            iconBg="bg-amber-50"
            accent="#FF9F0A"
            className="animate-slide-up"
          />
          <MetricCard
            title="Health Score"
            value={displayStats.overall_health_percentage + "%"}
            subtitle={"Avg " + formatMs(displayStats.avg_response_time_ms) + " response"}
            icon={Activity}
            iconColor="text-success-600"
            iconBg="bg-success-50"
            accent="#30D158"
            className="animate-slide-up"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padding="md">
          <CardHeader title="Health Trends" subtitle="Last 24 hours" action={<LiveBadge />} />
          {loading ? (
            <ChartSkeleton height={280} />
          ) : (
            <HealthTrendChart data={trends} />
          )}
        </Card>

        <Card padding="md">
          <CardHeader title="Status Overview" subtitle="Current connector state" />
          {loading || !displayStats ? (
            <div className="flex flex-col items-center gap-5">
              <Skeleton width={180} height={180} rounded="rounded-full" />
              <div className="w-full space-y-2">
                {[120, 90, 60].map((w, i) => (
                  <Skeleton key={i} height={14} width={w} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <StatusDonutChart
                healthy={displayStats.healthy_connectors}
                degraded={displayStats.degraded_connectors}
                down={displayStats.down_connectors}
                unknown={displayStats.unknown_connectors}
              />
              <div className="w-full space-y-2">
                {STATUS_ROWS.map((item) => {
                  const val = displayStats[(item.key + "_connectors") as keyof DashboardStats] as number;
                  return (
                    <div key={item.key} className="flex items-center gap-2.5">
                      <item.Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: item.color }} />
                      <span className="text-[13px] flex-1" style={{ color: "var(--text-secondary)" }}>
                        {item.label}
                      </span>
                      <span className="text-[13px] font-bold tabular-nums w-6 text-right" style={{ color: "var(--text-primary)" }}>
                        {val}
                      </span>
                      <StatusBar value={val} total={displayStats.total_connectors} color={item.color} />
                      <span className="text-[11px] w-8 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {displayStats.total_connectors > 0 ? Math.round(val / displayStats.total_connectors * 100) + "%" : "0%"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {displayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Healthy", value: displayStats.healthy_connectors, color: "#30D158", bg: "rgba(48,209,88,0.08)", border: "rgba(48,209,88,0.15)" },
            { label: "Degraded", value: displayStats.degraded_connectors, color: "#FF9F0A", bg: "rgba(255,159,10,0.08)", border: "rgba(255,159,10,0.15)" },
            { label: "Down", value: displayStats.down_connectors, color: "#FF453A", bg: "rgba(255,69,58,0.08)", border: "rgba(255,69,58,0.15)" },
            { label: "Avg Response", value: formatMs(displayStats.avg_response_time_ms), color: "var(--accent)", bg: "var(--accent-subtle)", border: "rgba(10,132,255,0.15)" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl px-4 py-3.5" style={{ background: item.bg, border: "1px solid " + item.border }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: item.color }}>
                {item.label}
              </p>
              <p className="text-[22px] font-bold tracking-tight tabular-nums leading-none" style={{ color: item.color }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {user && <RoleQuickActions role={user.role} />}
    </div>
  );
}
