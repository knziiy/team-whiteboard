/**
 * ローカル開発用: インプロセス WebSocket 接続マップ。
 * 本番では API Gateway Management API が担当するメッセージ送信を、
 * ローカル環境では実際の ws.WebSocket インスタンスへの直送で代替する。
 */

type SendFn = (data: string) => void;

const _map = new Map<string, SendFn>();

export function registerLocalWs(connectionId: string, send: SendFn): void {
  _map.set(connectionId, send);
}

export function unregisterLocalWs(connectionId: string): void {
  _map.delete(connectionId);
}

export function sendLocalMessage(connectionId: string, data: string): void {
  _map.get(connectionId)?.(data);
}
