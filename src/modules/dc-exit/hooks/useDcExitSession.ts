/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Hook to read the active session id from the route and keep the
 * dc-exit store in sync. Fetches available data centers from the
 * runtime API to populate the session's dataCenterShort (source)
 * and targetDataCenterShort (target), and starts the incident clock.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDcExitStore } from '@/modules/dc-exit/store/dcExitStore';
import { runtimeApi } from '@/lib/api';

export function useDcExitSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, setSession, updateSession, startIncident } = useDcExitStore();

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
      let targetDcShort = '';
      try {
        const res = await runtimeApi.getDataCenters();
        const dcs = res.data;
        if (dcs.length > 0) {
          dcShort = dcs[0].short_name ?? dcs[0].name;
        }
        // Auto-pick the second DC as target (or first if only one)
        if (dcs.length > 1) {
          targetDcShort = dcs[1].short_name ?? dcs[1].name;
        } else if (dcs.length === 1) {
          targetDcShort = dcShort;
        }
      } catch {
        // If runtime API is unavailable, leave empty — pages will show empty states.
      }

      setSession({
        sessionId,
        currentStep: 'discover',
        dataCenterShort: dcShort,
        targetDataCenterShort: targetDcShort,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Start the incident countdown clock on first session creation
      startIncident();
    })();
  }, [sessionId, session, setSession, updateSession, startIncident]);

  return { sessionId, session };
}
