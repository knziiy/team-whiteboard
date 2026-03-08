// Lambda・内部処理で使う共通型

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  company?: string;
}

// WebSocket $connect イベントの queryStringParameters
export interface ConnectQueryParams {
  boardId?: string;
  token?: string;
}

// connections テーブルのアイテム
export interface ConnectionItem {
  connectionId: string;
  boardId: string;
  userId: string;
  displayName: string;
  ttl: number;
}

// REST API レスポンス用エラー
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
