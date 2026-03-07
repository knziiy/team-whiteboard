import { useEffect, useRef, useCallback } from 'react';
import type { ServerMessage, ClientMessage } from '@whiteboard/shared';
import { useBoardStore } from '../store/boardStore';

const PING_INTERVAL_MS = 25000; // CloudFront origin read timeout は30sのため25sでping

export function useWebSocket(boardId: string, token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCount = useRef(0);
  const mountedRef = useRef(true);
  const pendingRef = useRef<ClientMessage[]>([]);
  const handleServerMessage = useBoardStore((s) => s.handleServerMessage);

  const connect = useCallback(() => {
    if (!token || !boardId || !mountedRef.current) return;

    const wsBase = import.meta.env['VITE_WS_URL'] as string | undefined;
    const base = wsBase ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    const url = `${base}/ws?boardId=${boardId}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
      // 未送信メッセージをフラッシュ
      const pending = pendingRef.current.splice(0);
      for (const msg of pending) {
        ws.send(JSON.stringify(msg));
      }
      // keepalive ping（CloudFront 30s timeout 対策）
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
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
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (mountedRef.current && retryCount.current < 8) {
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
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // 接続中または再接続待ちの場合はキューに積む
      pendingRef.current.push(message);
    }
  }, []);

  return { send };
}
