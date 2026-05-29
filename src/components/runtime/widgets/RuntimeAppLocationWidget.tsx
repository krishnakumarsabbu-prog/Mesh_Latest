import React from 'react';
import { MapPin, CircleCheck as CheckCircle } from 'lucide-react';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import { ConfidenceBadge } from '@/components/runtime/ConfidenceBadge';
import { TechStackIcon } from '@/components/runtime/TechStackIcon';
import type { LiveWidgetData, TechStack } from '@/types';

interface Props {
  widget: LiveWidgetData;
}

export function RuntimeAppLocationWidget({ widget }: Props) {
  const { applications } = useRuntimeLocationStore();
  const appId = (widget.display_config?.appId as string) || null;
  const envFilter = (widget.display_config?.environment as string) || 'PRODUCTION';

  const apps = applications
    .filter((a) => envFilter === 'ALL' || a.environment === envFilter)
    .filter((a) => !appId || a.application_id === appId)
    .slice(0, 4);

  if (apps.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-neutral-700 truncate">{widget.title}</p>
          {widget.subtitle && <p className="text-xs text-neutral-400 mt-0.5 truncate">{widget.subtitle}</p>}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-6 h-6 text-neutral-300 mx-auto mb-1" strokeWidth={1.5} />
            <p className="text-xs text-neutral-400">No data — seed runtime location data</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-700 truncate">{widget.title}</p>
          {widget.subtitle && <p className="text-xs text-neutral-400 mt-0.5 truncate">{widget.subtitle}</p>}
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 bg-blue-50 text-blue-600">
          {envFilter}
        </span>
      </div>
      <div className="flex-1 px-3 pb-3 flex flex-col gap-2 overflow-auto">
        {apps.map((app) => (
          <div
            key={`${app.application_id}-${app.environment}`}
            className="rounded-xl border border-neutral-100 px-3 py-2 bg-neutral-50"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-neutral-800 truncate">{app.application_name}</span>
              <ConfidenceBadge level={app.overall_confidence} showLabel={false} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {app.data_centers.slice(0, 3).map((dc) => (
                <span
                  key={dc}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600"
                >
                  {dc}
                </span>
              ))}
              {app.data_centers.length > 3 && (
                <span className="text-[9px] text-neutral-400">+{app.data_centers.length - 3}</span>
              )}
              {app.primary_write_dc && (
                <div className="flex items-center gap-0.5 ml-auto">
                  <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-[9px] text-emerald-600 font-semibold">{app.primary_write_dc}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
