import { useState, useEffect } from 'react';
import { lobApi } from '@/lib/api';

export interface LobFilters {
  search?: string;
}

export function useLobs(filters?: LobFilters) {
  const [data, setData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    lobApi.list(filters)
      .then(r => { setData(r.data); setError(null); })
      .catch(e => setError(e))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.search]);

  return { data, isLoading, error };
}
