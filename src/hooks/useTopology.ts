import { useState, useEffect } from 'react';
import { topologyApi } from '@/lib/api';

export function useTopology() {
  const [data, setData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    topologyApi.graph()
      .then(r => { setData(r.data); setError(null); })
      .catch(e => setError(e))
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading, error };
}
