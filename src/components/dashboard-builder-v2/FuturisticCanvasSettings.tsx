import React, { useState } from 'react';
import { Settings2, LayoutGrid as Layout, Palette, Lightbulb, BookOpen, X, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardTemplate } from '@/types';

interface Props {
  template: DashboardTemplate | null;
  onUpdateName: (name: string) => void;
  onClose: () => void;
}

const ACCENT_COLORS = [
  '#0ea5e9', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#f97316', '#84cc16', '#6366f1',
];

const THEMES = [
  { id: 'dark', label: 'Dark', bg: '#0a0f1c', accent: '#0ea5e9' },
  { id: 'midnight', label: 'Midnight', bg: '#050a14', accent: '#06b6d4' },
  { id: 'slate', label: 'Slate', bg: '#0f172a', accent: '#38bdf8' },
  { id: 'forest', label: 'Forest', bg: '#0a1a0f', accent: '#10b981' },
];

export function FuturisticCanvasSettings({ template, onUpdateName, onClose }: Props) {
  const [name, setName] = useState(template?.name || 'New Dashboard');
  const [desc, setDesc] = useState(template?.description || '');
  const [columns, setColumns] = useState(12);
  const [spacing, setSpacing] = useState<'compact' | 'medium' | 'relaxed'>('medium');
  const [selectedTheme, setSelectedTheme] = useState('dark');
  const [selectedAccent, setSelectedAccent] = useState('#0ea5e9');
  const [expandedSection, setExpandedSection] = useState<string | null>('identity');

  const toggle = (s: string) => setExpandedSection(prev => prev === s ? null : s);

  return (
    <div
      className="w-72 flex-shrink-0 flex flex-col"
      style={{
        background: 'rgba(10, 15, 28, 0.95)',
        borderLeft: '1px solid rgba(56, 189, 248, 0.12)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(56,189,248,0.2)' }}
          >
            <Settings2 className="w-3.5 h-3.5" style={{ color: '#38bdf8' }} />
          </div>
          <span className="text-sm font-bold" style={{ color: '#f1f5f9' }}>Canvas Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-all"
          style={{ color: 'rgba(148,163,184,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.5)'; }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
        {/* Identity */}
        <SettingsSection
          id="identity"
          label="Dashboard Identity"
          icon={<Settings2 className="w-3.5 h-3.5" />}
          expanded={expandedSection === 'identity'}
          onToggle={() => toggle('identity')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Dashboard Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  onUpdateName(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(56,189,248,0.12)',
                  color: '#f1f5f9',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.35)'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.12)'; }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Description
              </label>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={2}
                placeholder="Describe this dashboard..."
                className="w-full px-3 py-2 text-xs rounded-xl outline-none resize-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(56,189,248,0.12)',
                  color: '#f1f5f9',
                }}
                onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(56,189,248,0.35)'; }}
                onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(56,189,248,0.12)'; }}
              />
            </div>
            {template && (
              <div className="flex gap-2">
                <div
                  className="flex-1 px-2 py-1.5 rounded-lg text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.4)' }}>Scope</p>
                  <p className="text-xs font-semibold capitalize mt-0.5" style={{ color: '#0ea5e9' }}>{template.scope}</p>
                </div>
                <div
                  className="flex-1 px-2 py-1.5 rounded-lg text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.4)' }}>Version</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: '#10b981' }}>v{template.version}</p>
                </div>
              </div>
            )}
          </div>
        </SettingsSection>

        {/* Layout */}
        <SettingsSection
          id="layout"
          label="Layout Settings"
          icon={<Layout className="w-3.5 h-3.5" />}
          expanded={expandedSection === 'layout'}
          onToggle={() => toggle('layout')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Grid Columns: {columns}
              </label>
              <input
                type="range"
                min={6}
                max={16}
                value={columns}
                onChange={e => setColumns(parseInt(e.target.value))}
                className="w-full"
                style={{ accentColor: '#0ea5e9' }}
              />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'rgba(148,163,184,0.4)' }}>
                <span>6</span>
                <span>12</span>
                <span>16</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Widget Spacing
              </label>
              <div className="flex gap-1.5">
                {(['compact', 'medium', 'relaxed'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSpacing(s)}
                    className="flex-1 py-1.5 text-[10px] font-semibold rounded-lg capitalize transition-all"
                    style={
                      spacing === s
                        ? { background: 'rgba(14,165,233,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }
                        : { background: 'rgba(255,255,255,0.03)', color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(255,255,255,0.06)' }
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Theme */}
        <SettingsSection
          id="theme"
          label="Theme & Color"
          icon={<Palette className="w-3.5 h-3.5" />}
          expanded={expandedSection === 'theme'}
          onToggle={() => toggle('theme')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Theme
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTheme(t.id)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                    style={{
                      background: selectedTheme === t.id ? `${t.accent}12` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedTheme === t.id ? t.accent + '30' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-md flex-shrink-0"
                      style={{ background: t.bg, border: `2px solid ${t.accent}` }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: selectedTheme === t.id ? '#f1f5f9' : 'rgba(148,163,184,0.6)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Accent Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setSelectedAccent(color)}
                    className="w-6 h-6 rounded-full transition-all"
                    style={{
                      background: color,
                      boxShadow: selectedAccent === color ? `0 0 0 2px rgba(255,255,255,0.15), 0 0 12px ${color}60` : `0 0 8px ${color}30`,
                      transform: selectedAccent === color ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* AI Suggestions */}
        <SettingsSection
          id="ai"
          label="AI Suggestions"
          icon={<Lightbulb className="w-3.5 h-3.5" />}
          expanded={expandedSection === 'ai'}
          onToggle={() => toggle('ai')}
        >
          <div className="space-y-2">
            {[
              { title: 'Add health score widget', desc: 'Recommended based on scope', color: '#10b981' },
              { title: 'Response time chart', desc: 'High-impact for observability', color: '#0ea5e9' },
              { title: 'Alert feed panel', desc: 'Essential for operations', color: '#f59e0b' },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${s.color}25`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
              >
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: s.color }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: '#e2e8f0' }}>{s.title}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.5)' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        {/* Guide */}
        <SettingsSection
          id="guide"
          label="Canvas Guide"
          icon={<BookOpen className="w-3.5 h-3.5" />}
          expanded={expandedSection === 'guide'}
          onToggle={() => toggle('guide')}
        >
          <div className="space-y-2">
            {[
              { step: '1', text: 'Open Widget Library from left panel' },
              { step: '2', text: 'Click any widget to add it to canvas' },
              { step: '3', text: 'Drag widgets to reposition them' },
              { step: '4', text: 'Resize via the corner handle' },
              { step: '5', text: 'Click widget to configure settings' },
              { step: '6', text: 'Save to publish your dashboard' },
            ].map(g => (
              <div key={g.step} className="flex items-start gap-2.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}
                >
                  {g.step}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>{g.text}</p>
              </div>
            ))}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  id, label, icon, expanded, onToggle, children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${expanded ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.06)'}` }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all"
        style={{ background: expanded ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.02)' }}
      >
        <span style={{ color: expanded ? '#38bdf8' : 'rgba(148,163,184,0.5)' }}>{icon}</span>
        <span className="flex-1 text-xs font-semibold" style={{ color: expanded ? '#f1f5f9' : 'rgba(148,163,184,0.7)' }}>{label}</span>
        <span style={{ color: 'rgba(148,163,184,0.4)' }}>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1" style={{ background: 'rgba(0,0,0,0.15)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
