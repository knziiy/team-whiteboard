import { useEffect, useRef, useCallback } from 'react';
import type { ServerMessage, ClientMessage } from '@whiteboard/shared';
import { useBoardStore } from '../store/boardStore';

export function useWebSocket(boardId: string, token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const handleServerMessage = useBoardStore((s) => s.handleServerMessage);

  const connect = useCallback(() => {
    if (!token || !boardId) return;

    const wsBase = import.meta.env['VITE_WS_URL'] as string | undefined;
    const base = wsBase ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    const url = `${base}/ws?boardId=${boardId}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        handleServerMessage(msg);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (retryCount.current < 8) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
        retryCount.current++;
        retryRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [boardId, token, handleServerMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send };
}
