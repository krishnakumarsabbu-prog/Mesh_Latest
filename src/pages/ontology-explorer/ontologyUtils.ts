import { ApplicationLocationSummary, RuntimeDataCenter } from '@/types/runtime';

export interface HierarchyNode {
  id: string;
  label: string;
  type: 'ENTERPRISE' | 'REGION' | 'DC' | 'NBH' | 'APP';
  status: 'HEALTHY' | 'WARN' | 'CRITICAL';
  appId?: string; // Linked to database application
  children?: HierarchyNode[];
}

/**
 * Dynamically constructs the enterprise role hierarchy tree from the active
 * database application summaries and runtime datacenter locations.
 */
export const buildHierarchyFromDB = (
  apps: ApplicationLocationSummary[],
  dcs: RuntimeDataCenter[]
): HierarchyNode => {
  // 1. Root Enterprise Node
  const root: HierarchyNode = {
    id: 'enterprise-root',
    label: 'ENTERPRISE CO',
    type: 'ENTERPRISE',
    status: 'HEALTHY',
    children: []
  };

  // If we don't have any datacenters loaded yet, return a skeleton tree
  if (dcs.length === 0) {
    return root;
  }

  // 2. Group Datacenters by Region
  const regionsMap = new Map<string, RuntimeDataCenter[]>();
  dcs.forEach(dc => {
    const region = dc.region || 'US-EAST';
    if (!regionsMap.has(region)) {
      regionsMap.set(region, []);
    }
    regionsMap.get(region)!.push(dc);
  });

  // 3. Build Region -> Datacenter -> Neighborhood -> Application hierarchy
  regionsMap.forEach((regionDcs, regionName) => {
    const regionNode: HierarchyNode = {
      id: `reg-${regionName.toLowerCase().replace(/\s+/g, '-')}`,
      label: `REGION - ${regionName.toUpperCase()}`,
      type: 'REGION',
      status: 'HEALTHY',
      children: []
    };

    regionDcs.forEach(dc => {
      const dcNode: HierarchyNode = {
        id: `dc-${dc.id}`,
        label: dc.name,
        type: 'DC',
        status: 'HEALTHY',
        children: []
      };

      // Neighborhood/Zone Node inside DC
      const zoneName = dc.zone || 'Availability Zone';
      const nbhNode: HierarchyNode = {
        id: `nbh-${dc.id}-${zoneName.toLowerCase().replace(/\s+/g, '-')}`,
        label: zoneName,
        type: 'NBH',
        status: 'HEALTHY',
        children: []
      };

      // Find apps running on this specific DC (match on name or short_name)
      apps.forEach(app => {
        const matchesDc = app.data_centers?.some(appDc => 
          appDc.toLowerCase() === dc.name.toLowerCase() || 
          appDc.toLowerCase() === dc.short_name?.toLowerCase()
        );

        if (matchesDc) {
          nbhNode.children!.push({
            id: `app-${app.application_id}-${dc.id}`,
            label: app.application_name,
            type: 'APP',
            appId: app.application_id,
            status: app.alignment_status === 'DRIFTED' ? 'WARN' : 'HEALTHY'
          });
        }
      });

      // Update neighborhood status based on children status
      if (nbhNode.children!.some(c => c.status === 'WARN')) {
        nbhNode.status = 'WARN';
      } else if (nbhNode.children!.some(c => c.status === 'CRITICAL')) {
        nbhNode.status = 'CRITICAL';
      }

      dcNode.children!.push(nbhNode);

      // Update datacenter status based on children status
      if (dcNode.children!.some(c => c.status === 'WARN')) {
        dcNode.status = 'WARN';
      } else if (dcNode.children!.some(c => c.status === 'CRITICAL')) {
        dcNode.status = 'CRITICAL';
      }

      regionNode.children!.push(dcNode);
    });

    // Update region status based on children status
    if (regionNode.children!.some(c => c.status === 'WARN')) {
      regionNode.status = 'WARN';
    } else if (regionNode.children!.some(c => c.status === 'CRITICAL')) {
      regionNode.status = 'CRITICAL';
    }

    root.children!.push(regionNode);
  });

  // Update root status based on regions status
  if (root.children!.some(c => c.status === 'WARN')) {
    root.status = 'WARN';
  } else if (root.children!.some(c => c.status === 'CRITICAL')) {
    root.status = 'CRITICAL';
  }

  return root;
};
