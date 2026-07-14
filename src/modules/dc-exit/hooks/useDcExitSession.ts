/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Hook to read the active session id from the route and keep the
 * dc-exit store in sync. Placeholder only - no business logic yet.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDcExitStore } from '@/modules/dc-exit/store/dcExitStore';

export function useDcExitSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { setSession, session } = useDcExitStore();

  useEffect(() => {
    // No backend yet; just track the id from the route.
    setSession(
      sessionId
        ? {
            sessionId,
            currentStep: 'discover',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null,
    );
  }, [sessionId, setSession]);

  return { sessionId, session };
}
