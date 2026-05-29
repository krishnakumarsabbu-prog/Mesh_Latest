import React, { useEffect, useState } from 'react';
import { GitBranch, Building2, Users, Layers, Globe, ToggleLeft, ToggleRight, Lock, Eye, EyeOff } from 'lucide-react';
import { Input, TextArea } from '@/components/ui/Input';
import { Lob, Team, Component } from '@/types';
import { lobApi, teamApi, componentApi } from '@/lib/api';
import { slugify } from '@/lib/utils';

export interface Step1Data {
  name: string;
  slug: string;
  description: string;
  lob_id: string;
  team_id: string;
  component_id: string;
  environment: string;
  color: string;
  import_mode: 'manual' | 'git';
  repository_url: string;
  branch: string;
  access_token: string;
}

interface Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
}

const ENV_OPTIONS = [
  { value: 'production', label: 'Production', color: 'bg-red-500' },
  { value: 'staging', label: 'Staging', color: 'bg-amber-500' },
  { value: 'development', label: 'Development', color: 'bg-blue-500' },
  { value: 'testing', label: 'Testing', color: 'bg-slate-500' },
];

const COLOR_OPTIONS = [
  '#30D158', '#0A84FF', '#FF9F0A', '#FF453A', '#BF5AF2',
  '#64D2FF', '#FFD60A', '#FF6B35', '#30D158', '#5AC8FA',
];

export function Step1Source({ data, onChange }: Props) {
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    Promise.all([lobApi.list(), teamApi.list()]).then(([lobRes, teamRes]) => {
      setLobs(lobRes.data);
      setTeams(teamRes.data);
    });
  }, []);

  useEffect(() => {
    if (data.team_id) {
      componentApi.list(undefined, data.team_id).then((res) => {
        setComponents(res.data);
      }).catch(() => {
        setComponents([]);
      });
    } else {
      setComponents([]);
    }
  }, [data.team_id]);

  const filteredTeams = data.lob_id
    ? teams.filter((t) => t.lob_id === data.lob_id)
    : teams;

  const set = (patch: Partial<Step1Data>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-6">
      {/* Component Identity */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Component Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Component Name *</label>
            <Input
              value={data.name}
              onChange={(e) => {
                const name = e.target.value;
                set({ name, slug: slugify(name) });
              }}
              placeholder="e.g. Payment Gateway"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug *</label>
            <Input
              value={data.slug}
              onChange={(e) => set({ slug: e.target.value })}
              placeholder="payment-gateway"
              className="font-mono"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <TextArea
            value={data.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Brief description of this component..."
            rows={2}
          />
        </div>
      </div>

      {/* Organization */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Organization</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Building2 className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Line of Business *
            </label>
            <select
              value={data.lob_id}
              onChange={(e) => set({ lob_id: e.target.value, team_id: '', component_id: '' })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="">Select LOB...</option>
              {lobs.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Users className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Team
            </label>
            <select
              value={data.team_id}
              onChange={(e) => set({ team_id: e.target.value, component_id: '' })}
              disabled={!data.lob_id}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
            >
              <option value="">No team</option>
              {filteredTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Layers className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Project *
            </label>
            <select
              value={data.component_id}
              onChange={(e) => set({ component_id: e.target.value })}
              disabled={!data.team_id}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
            >
              <option value="">Select Project...</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Environment */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          <Globe className="inline w-4 h-4 mr-1.5" />
          Environment
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {ENV_OPTIONS.map((env) => (
            <button
              key={env.value}
              type="button"
              onClick={() => set({ environment: env.value })}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-150 ${
                data.environment === env.value
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${env.color}`} />
              <span className="text-xs font-medium">{env.label}</span>
              {data.environment === env.value && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Component Color</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set({ color: c })}
              className={`w-8 h-8 rounded-full transition-all duration-150 ${
                data.color === c ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Source Toggle */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Connector Source</h3>
        <div className="flex items-center gap-3 p-1 bg-slate-800 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => set({ import_mode: 'manual' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              data.import_mode === 'manual'
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Manual Setup
          </button>
          <button
            type="button"
            onClick={() => set({ import_mode: 'git' })}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              data.import_mode === 'git'
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Git Import
          </button>
        </div>

        {data.import_mode === 'git' && (
          <div className="mt-4 space-y-4 p-4 bg-slate-800/60 rounded-xl border border-slate-700">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Repository URL *</label>
              <Input
                value={data.repository_url}
                onChange={(e) => set({ repository_url: e.target.value })}
                placeholder="https://github.com/org/repo"
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Supports GitHub and GitLab repositories</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Branch</label>
                <Input
                  value={data.branch}
                  onChange={(e) => set({ branch: e.target.value })}
                  placeholder="main"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  <Lock className="inline w-3 h-3 mr-1" />
                  Access Token
                  <span className="ml-1 text-xs text-slate-500">(optional)</span>
                </label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={data.access_token}
                    onChange={(e) => set({ access_token: e.target.value })}
                    placeholder="ghp_xxxx..."
                    className="font-mono text-sm pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
