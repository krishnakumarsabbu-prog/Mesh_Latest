import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveWidgetData } from '@/types';
import { notify } from '@/store/notificationStore';

interface StreamPayload {
  type: 'metrics' | 'health' | 'ping' | 'rule_violation';
  widgets?: LiveWidgetData[];
  health?: {
    overall_score?: number;
    overall_health_status?: string;
  };
  // rule_violation fields
  rules_matched?: number;
  total_score_impact?: number;
  adjusted_score?: number;
  health_status?: string;
  explanation?: string[];
  matched_rules?: Array<{ rule_id: string; rule_name: string; severity: string; action: string }>;
  timestamp?: string;
}

interface ProjectStreamState {
  widgets: LiveWidgetData[];
  health: StreamPayload['health'] | null;
  connected: boolean;
  lastUpdated: Date | null;
}

const WS_BASE = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//localhost:8000`;
})();

export function useProjectStream(
  projectId: string | null | undefined,
  assignmentId: string | null | undefined,
  hours: number = 24,
  enabled = true
): ProjectStreamState & { reconnect: () => void } {
  const [state, setState] = useState<ProjectStreamState>({
    widgets: [],
    health: null,
    connected: false,
    lastUpdated: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 5;

  const connect = useCallback(() => {
    if (!projectId || !assignmentId || !enabled) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const url = `${WS_BASE}/api/v1/projects/${projectId}/assignments/${assignmentId}/ws?hours=${hours}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setState(prev => ({ ...prev, connected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const payload: StreamPayload = JSON.parse(event.data);
        if (payload.type === 'metrics' && payload.widgets) {
          setState(prev => ({
            ...prev,
            widgets: payload.widgets!,
            health: payload.health ?? prev.health,
            lastUpdated: new Date(),
          }));
        } else if (payload.type === 'rule_violation') {
          const topRule = payload.matched_rules?.[0];
          const severityMap: Record<string, 'warning' | 'error'> = {
            critical: 'error',
            high: 'error',
            medium: 'warning',
            low: 'warning',
          };
          const notifType = severityMap[topRule?.severity ?? 'medium'] ?? 'warning';
          const title = `Rule Violation: ${topRule?.rule_name ?? 'Health Rule'}`;
          const message = `${payload.rules_matched} rule(s) triggered. Score: ${payload.adjusted_score?.toFixed(1)} (${payload.health_status})`;
          notify[notifType](title, message);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId, assignmentId, hours, enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  return { ...state, reconnect };
}
