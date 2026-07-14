/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Hook to read the active session id from the route and keep the
 * dc-exit store in sync. Fetches available data centers from the
 * runtime API to populate the session's dataCenterShort.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDcExitStore } from '@/modules/dc-exit/store/dcExitStore';
import { runtimeApi } from '@/lib/api';

export function useDcExitSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, setSession, updateSession } = useDcExitStore();

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    if (session?.sessionId === sessionId && session.dataCenterShort) {
      return;
    }

    (async () => {
      let dcShort = '';
      try {
        const res = await runtimeApi.getDataCenters();
        const dcs = res.data;
        if (dcs.length > 0) {
          dcShort = dcs[0].short_name ?? dcs[0].name;
        }
      } catch {
        // If runtime API is unavailable, leave empty — pages will show empty states.
      }

      setSession({
        sessionId,
        currentStep: 'discover',
        dataCenterShort: dcShort,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    })();
  }, [sessionId, session, setSession, updateSession]);

  return { sessionId, session };
}
