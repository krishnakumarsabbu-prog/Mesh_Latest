import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Building2, MapPin, Network, Server, Database, Activity, ShieldCheck, HelpCircle } from 'lucide-react';
import type { ApplicationLocationDetail, RuntimeAsset } from '@/types';
import { AssetStatusBadge } from './AssetStatusBadge';
import { ConfidenceBadge } from './ConfidenceBadge';

interface RuntimeHierarchyTreeProps {
  detail: ApplicationLocationDetail;
}

interface HierarchyNode {
  id: string;
  name: string;
  type: 'dc' | 'neighborhood' | 'cluster' | 'asset';
  status?: string;
  children?: HierarchyNode[];
  asset?: RuntimeAsset;
}

export function RuntimeHierarchyTree({ detail }: RuntimeHierarchyTreeProps) {
  // Build tree nodes dynamically from the detail assets
  const treeData = useMemo(() => {
    const rootNodes: HierarchyNode[] = [];
    const allAssets = detail.components.flatMap((c) => c.assets);

    // Group assets by Data Center
    const dcMap = new Map<string, { name: string; assets: RuntimeAsset[] }>();
    allAssets.forEach((asset) => {
      const dcShort = asset.data_center?.short_name || 'UNKNOWN_DC';
      const dcName = asset.data_center?.name || 'Unknown Data Center';
      if (!dcMap.has(dcShort)) {
        dcMap.set(dcShort, { name: dcName, assets: [] });
      }
      dcMap.get(dcShort)!.assets.push(asset);
    });

    // Traverse DCs
    dcMap.forEach(({ name: dcName, assets: dcAssets }, dcShort) => {
      const dcNode: HierarchyNode = {
        id: `dc-${dcShort}`,
        name: `${dcName} (${dcShort})`,
        type: 'dc',
        children: [],
        status: dcAssets.some(a => a.latest_operational_state === 'ACTIVE') ? 'ACTIVE' : 'STANDBY'
      };

      // Group by Neighborhood
      const nhMap = new Map<string, RuntimeAsset[]>();
      dcAssets.forEach((asset) => {
        const neighborhood = asset.metadata?.neighborhood || 'DEFAULT_ZONE';
        if (!nhMap.has(neighborhood)) {
          nhMap.set(neighborhood, []);
        }
        nhMap.get(neighborhood)!.push(asset);
      });

      // Traverse Neighborhoods
      nhMap.forEach((nhAssets, nhName) => {
        const nhNode: HierarchyNode = {
          id: `dc-${dcShort}-nh-${nhName}`,
          name: `Neighborhood: ${nhName}`,
          type: 'neighborhood',
          children: [],
          status: nhAssets.some(a => a.latest_operational_state === 'ACTIVE') ? 'ACTIVE' : 'STANDBY'
        };

        // Group by Cluster
        const clusterMap = new Map<string, RuntimeAsset[]>();
        nhAssets.forEach((asset) => {
          const cluster = asset.metadata?.cluster || asset.tech_stack || 'default-cluster';
          if (!clusterMap.has(cluster)) {
            clusterMap.set(cluster, []);
          }
          clusterMap.get(cluster)!.push(asset);
        });

        // Traverse Clusters
        clusterMap.forEach((clusterAssets, clusterName) => {
          const clusterNode: HierarchyNode = {
            id: `dc-${dcShort}-nh-${nhName}-cluster-${clusterName}`,
            name: `Cluster/Stack: ${clusterName}`,
            type: 'cluster',
            children: [],
            status: clusterAssets.some(a => a.latest_operational_state === 'ACTIVE') ? 'ACTIVE' : 'STANDBY'
          };

          // Add Leaf Assets
          clusterAssets.forEach((asset) => {
            const assetNode: HierarchyNode = {
              id: asset.id,
              name: asset.name,
              type: 'asset',
              status: asset.latest_operational_state || 'UNKNOWN',
              asset
            };
            clusterNode.children!.push(assetNode);
          });

          nhNode.children!.push(clusterNode);
        });

        dcNode.children!.push(nhNode);
      });

      rootNodes.push(dcNode);
    });

    return rootNodes;
  }, [detail]);

  return (
    <div className="p-5 rounded-2xl border backdrop-blur-md" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <div>
          <h3 className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: 'var(--text-primary)' }}>
            Logical Deployment Hierarchy
          </h3>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Hierarchical mapping from Application to leaf container pods and data storage nodes
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {treeData.length === 0 ? (
          <div className="text-center py-8 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            No hierarchy data found for this environment.
          </div>
        ) : (
          treeData.map((node) => (
            <TreeNode key={node.id} node={node} level={0} />
          ))
        )}
      </div>
    </div>
  );
}

function TreeNode({ node, level }: { node: HierarchyNode; level: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = () => {
    switch (node.type) {
      case 'dc':
        return <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'neighborhood':
        return <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />;
      case 'cluster':
        return <Network className="w-4 h-4 text-blue-400 flex-shrink-0" />;
      case 'asset':
        if (node.name.toLowerCase().includes('db') || node.asset?.asset_type?.includes('DB') || node.asset?.asset_type?.includes('MONGO')) {
          return <Database className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
        }
        return <Server className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />;
    }
  };

  return (
    <div className="select-none flex flex-col gap-0.5">
      <div
        className="flex items-center gap-2.5 py-2 px-3 rounded-xl hover:bg-[var(--app-surface-hover)] cursor-pointer transition-colors"
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
        {hasChildren ? (
          <span className="text-[var(--text-muted)]">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        ) : (
          <span className="w-3.5 h-3.5" />
        )}
        {getIcon()}
        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{node.name}</span>

        {/* Badges for status */}
        <div className="ml-auto flex items-center gap-2">
          {node.type === 'asset' && node.asset && (
            <>
              {node.asset.write_authority && (
                <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]/20">
                  WRITE PRIMARY
                </span>
              )}
              {node.asset.is_deterministic === false && (
                <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase bg-[var(--warning-subtle)] text-[var(--warning)] border border-[var(--warning)]/20">
                  INFERRED
                </span>
              )}
              {node.asset.latest_confidence_level && (
                <ConfidenceBadge level={node.asset.latest_confidence_level} showLabel={false} />
              )}
            </>
          )}

          {node.status && (
            <span
              className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                node.status === 'ACTIVE' || node.status === 'PRIMARY'
                  ? 'bg-[var(--success-subtle)] text-[var(--success)] border-[var(--success)]/20'
                  : node.status === 'STANDBY' || node.status === 'SECONDARY' || node.status === 'PHYSICAL_STANDBY'
                  ? 'bg-[var(--warning-subtle)] text-[var(--warning)] border-[var(--warning)]/20'
                  : 'bg-[var(--app-bg-muted)] text-[var(--text-secondary)] border-[var(--app-border)]'
              }`}
            >
              {node.status}
            </span>
          )}
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
