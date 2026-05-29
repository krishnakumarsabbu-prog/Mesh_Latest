import { useState, useEffect } from 'react';
import { projectApi } from '@/lib/api';

export interface ProjectFilters {
  lob_id?: string;
  team_id?: string;
}

export function useProjects(filters?: ProjectFilters) {
  const [data, setData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    projectApi.list(filters?.lob_id, filters?.team_id)
      .then(r => { setData(r.data); setError(null); })
      .catch(e => setError(e))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.lob_id, filters?.team_id]);

  return { data, isLoading, error };
}
