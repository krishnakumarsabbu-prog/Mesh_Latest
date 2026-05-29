import React, { useEffect, useState } from 'react';
import { LayoutDashboard, CircleCheck as CheckCircle2, Circle, Loader as Loader2, PenLine, LayoutGrid, Layers } from 'lucide-react';
import { dashboardTemplateApi } from '@/lib/api';

export type DashboardChoice = 'template' | 'blank' | 'custom';

export interface Step3Data {
  choice: DashboardChoice;
  template_id: string;
}

interface Props {
  data: Step3Data;
  onChange: (data: Step3Data) => void;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  scope?: string;
  visibility?: string;
  is_default?: boolean;
  widgets?: unknown[];
}

const CHOICE_OPTIONS: { value: DashboardChoice; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'template',
    label: 'Use Template',
    description: 'Pick a pre-built dashboard template',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    value: 'blank',
    label: 'Start Blank',
    description: 'Register without any dashboard',
    icon: <Layers className="w-5 h-5" />,
  },
  {
    value: 'custom',
    label: 'Design Custom',
    description: 'Open the dashboard builder after registration',
    icon: <PenLine className="w-5 h-5" />,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  application: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  business: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  security: 'bg-red-500/20 text-red-300 border-red-500/30',
  default: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function TemplateCategoryBadge({ category }: { category?: string }) {
  const cls = CATEGORY_COLORS[category?.toLowerCase() || 'default'] || CATEGORY_COLORS.default;
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {category || 'general'}
    </span>
  );
}

export function Step3Dashboard({ data, onChange }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (data.choice === 'template') {
      setLoading(true);
      dashboardTemplateApi.list({ scope: 'project' }).then((res) => {
        setTemplates(res.data || []);
      }).finally(() => setLoading(false));
    }
  }, [data.choice]);

  const categories = ['', ...Array.from(new Set(templates.map((t) => t.category || 'general').filter(Boolean)))];
  const filtered = categoryFilter
    ? templates.filter((t) => (t.category || 'general') === categoryFilter)
    : templates;

  const set = (patch: Partial<Step3Data>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Dashboard Setup</h3>
        <div className="grid grid-cols-3 gap-3">
          {CHOICE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ choice: opt.value, template_id: opt.value !== 'template' ? '' : data.template_id })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all duration-150 ${
                data.choice === opt.value
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <div className={data.choice === opt.value ? 'text-sky-400' : 'text-slate-500'}>{opt.icon}</div>
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs mt-0.5 opacity-70">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Template grid */}
      {data.choice === 'template' && (
        <div className="space-y-4">
          {/* Category filter */}
          {categories.length > 2 && (
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat || 'all'}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                    categoryFilter === cat
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {cat || 'All'}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              No templates available. Choose "Start Blank" or "Design Custom".
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {filtered.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => set({ template_id: tmpl.id })}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 group ${
                    data.template_id === tmpl.id
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LayoutGrid className={`w-4 h-4 flex-shrink-0 ${data.template_id === tmpl.id ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span className="text-sm font-semibold text-slate-200 truncate">{tmpl.name}</span>
                        {tmpl.is_default && (
                          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      {tmpl.description && (
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{tmpl.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <TemplateCategoryBadge category={tmpl.category} />
                        {tmpl.widgets && tmpl.widgets.length > 0 && (
                          <span className="text-xs text-slate-500">{tmpl.widgets.length} widgets</span>
                        )}
                      </div>
                    </div>
                    {data.template_id === tmpl.id ? (
                      <CheckCircle2 className="w-5 h-5 text-sky-400 flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-600 flex-shrink-0 group-hover:text-slate-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {data.choice === 'template' && !data.template_id && templates.length > 0 && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Select a template to continue, or choose a different setup option above.
            </p>
          )}
        </div>
      )}

      {data.choice === 'blank' && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-center">
          <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">The project will be registered without a dashboard.</p>
          <p className="text-xs text-slate-500 mt-1">You can assign dashboards anytime from the project detail page.</p>
        </div>
      )}

      {data.choice === 'custom' && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-center">
          <PenLine className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">The Dashboard Builder will open after registration.</p>
          <p className="text-xs text-slate-500 mt-1">Build a fully custom dashboard layout with drag-and-drop widgets.</p>
        </div>
      )}
    </div>
  );
}
