import { useState, useEffect } from 'react';
import { connectorApi } from '@/lib/api';

export function useConnectors(projectId?: string) {
  const [data, setData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    connectorApi.list(projectId)
      .then(r => { setData(r.data); setError(null); })
      .catch(e => setError(e))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  return { data, isLoading, error };
}
