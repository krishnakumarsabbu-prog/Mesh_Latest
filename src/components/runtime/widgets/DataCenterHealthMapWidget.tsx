import React from 'react';
import { Server } from 'lucide-react';
import { useRuntimeLocationStore } from '@/store/runtimeLocationStore';
import type { LiveWidgetData } from '@/types';

interface Props {
  widget: LiveWidgetData;
}

export function DataCenterHealthMapWidget({ widget }: Props) {
  const { applications, dataCenters } = useRuntimeLocationStore();
  const envFilter = (widget.display_config?.environment as string) || 'PRODUCTION';

  const dcNames = dataCenters.length > 0
    ? dataCenters.map((dc) => dc.short_name ?? dc.name)
    : ['IBB1', 'SHV', 'AZ3', 'GA-UAT', 'MA-UAT'];

  const relevantApps = applications.filter(
    (a) => envFilter === 'ALL' || a.environment === envFilter,
  );

  function getAppsInDc(dcShort: string) {
    return relevantApps.filter((a) =>
      a.data_centers.some((d) => d === dcShort || d.includes(dcShort)),
    );
  }

  if (dcNames.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-neutral-700 truncate">{widget.title}</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Server className="w-6 h-6 text-neutral-300 mx-auto mb-1" strokeWidth={1.5} />
            <p className="text-xs text-neutral-400">No data centers</p>
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
      <div className="flex-1 px-3 pb-3 grid grid-cols-3 gap-2 overflow-auto">
        {dcNames.slice(0, 6).map((dcName) => {
          const appsHere = getAppsInDc(dcName);
          const hasApps = appsHere.length > 0;
          return (
            <div
              key={dcName}
              className="rounded-xl border p-2 flex flex-col gap-1"
              style={{
                borderColor: hasApps ? 'rgba(48,209,88,0.3)' : '#e5e7eb',
                background: hasApps ? 'rgba(48,209,88,0.04)' : '#f9fafb',
              }}
            >
              <div className="flex items-center gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: hasApps ? '#30D158' : '#d1d5db' }}
                />
                <span className="text-[9px] font-bold text-neutral-700 truncate">{dcName}</span>
              </div>
              <span
                className="text-base font-bold leading-none"
                style={{ color: hasApps ? '#30D158' : '#9ca3af' }}
              >
                {appsHere.length}
              </span>
              <span className="text-[8px] text-neutral-400">
                app{appsHere.length !== 1 ? 's' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
