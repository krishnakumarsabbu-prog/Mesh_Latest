import { useEffect, useRef, useCallback } from 'react';

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void;
  onStatusChange?: (status: WsStatus) => void;
  reconnectDelay?: number;
  maxRetries?: number;
}

const WS_BASE = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//localhost:8000`;
})();

export function useWebSocket(
  path: string | null | undefined,
  { onMessage, onStatusChange, reconnectDelay = 3000, maxRetries = 10 }: UseWebSocketOptions,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  const mountedRef = useRef(true);

  onMessageRef.current = onMessage;
  onStatusRef.current = onStatusChange;

  const connect = useCallback(() => {
    if (!path || !mountedRef.current) return;

    const url = `${WS_BASE}${path}`;
    onStatusRef.current?.('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      retryRef.current = 0;
      onStatusRef.current?.('connected');
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        onMessageRef.current(JSON.parse(e.data));
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      onStatusRef.current?.('disconnected');
      if (retryRef.current < maxRetries) {
        const delay = Math.min(reconnectDelay * Math.pow(1.5, retryRef.current), 30000);
        retryRef.current += 1;
        onStatusRef.current?.('reconnecting');
        timerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [path, reconnectDelay, maxRetries]);

  useEffect(() => {
    mountedRef.current = true;
    if (path) connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect, path]);

  const reconnect = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    retryRef.current = 0;
    connect();
  }, [connect]);

  return { reconnect };
}

export { WS_BASE };
export type { WsStatus };
