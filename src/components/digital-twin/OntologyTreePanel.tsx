import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Search, Briefcase, Building2, Users, AppWindow, Layers, Package, Server, Cpu, Network, HardDrive, Database, MessageSquare, Code, ShieldCheck, FileCheck, Lock, KeyRound, Activity, ChartBar as BarChart3, FileText, Route, TriangleAlert as AlertTriangle, Gauge, BadgeCheck, Scale, Brain, Box, Play, GitBranch, Download, Upload, Globe, Circle } from 'lucide-react';
import type { DTOntologyNode } from '@/store/digitalTwinStore';

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Building2, Users, AppWindow, Layers, Package,
  Server, Cpu, Network, HardDrive, Database, MessageSquare, Code,
  ShieldCheck, FileCheck, Lock, KeyRound, Activity, BarChart3,
  FileText, Route, AlertTriangle, Gauge, BadgeCheck, Scale,
  Brain, Box, Play, GitBranch, Download, Upload, Globe, Circle,
};

const statusColor = (status: string) => {
  if (status === 'healthy') return '#00B074';
  if (status === 'degraded') return '#FFB100';
  if (status === 'down') return '#FF003C';
  return '#8A97A8';
};

interface TreeNodeProps {
  node: DTOntologyNode;
  depth: number;
  searchQuery: string;
}

function TreeNode({ node, depth, searchQuery }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = ICON_MAP[node.icon] || Circle;
  const matchesSearch = !searchQuery || node.label.toLowerCase().includes(searchQuery.toLowerCase());

  if (!matchesSearch && !hasChildren) return null;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] cursor-pointer transition-all group"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-40" />
            : <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColor(node.status) }} strokeWidth={1.8} />
        <span className="text-[11.5px] font-medium truncate flex-1" style={{ color: '#E6EAF0' }}>
          {node.label}
        </span>
        {node.count > 0 && (
          <span
            className="px-1.5 py-0.5 text-[9px] font-bold rounded-full flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#98A2B3' }}
          >
            {node.count}
          </span>
        )}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: statusColor(node.status) }}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} searchQuery={searchQuery} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function OntologyTreePanel({ ontology }: { ontology: DTOntologyNode[] }) {
  const [search, setSearch] = useState('');

  const filteredCount = useMemo(() => {
    const count = (nodes: DTOntologyNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + (n.children ? count(n.children) : 0), 0);
    return count(ontology);
  }, [ontology]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.04]">
        <Briefcase className="w-4 h-4" style={{ color: '#3B82F6' }} />
        <h3 className="text-[12px] font-bold tracking-tight" style={{ color: '#E6EAF0' }}>
          Enterprise Ontology
        </h3>
        <span className="text-[10px] ml-auto" style={{ color: '#667085' }}>{filteredCount} nodes</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#667085' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ontology..."
            className="w-full pl-8 pr-3 py-1.5 text-[11px] rounded-[8px] border border-white/[0.06] outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.02)', color: '#E6EAF0' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#3B82F655'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 scrollbar-thin">
        {ontology.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} searchQuery={search} />
        ))}
      </div>
    </div>
  );
}
