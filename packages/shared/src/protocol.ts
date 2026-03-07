import type { BoardElement, User } from './types.js';

// Client → Server messages
export interface ClientElementAdd {
  type: 'element_add';
  element: BoardElement;
}

export interface ClientElementUpdate {
  type: 'element_update';
  element: BoardElement;
}

export interface ClientElementDelete {
  type: 'element_delete';
  elementId: string;
}

export interface ClientCursorMove {
  type: 'cursor_move';
  x: number;
  y: number;
}

export interface ClientPing {
  type: 'ping';
}

export interface ClientRequestInit {
  type: 'request_init';
}

export type ClientMessage =
  | ClientElementAdd
  | ClientElementUpdate
  | ClientElementDelete
  | ClientCursorMove
  | ClientPing
  | ClientRequestInit;

// Server → Client messages
export interface ServerInit {
  type: 'init';
  elements: BoardElement[];
  onlineUsers: OnlineUser[];
}

export interface ServerElementAdd {
  type: 'element_add';
  element: BoardElement;
}

export interface ServerElementUpdate {
  type: 'element_update';
  element: BoardElement;
}

export interface ServerElementDelete {
  type: 'element_delete';
  elementId: string;
}

export interface ServerCursorMove {
  type: 'cursor_move';
  userId: string;
  x: number;
  y: number;
}

export interface ServerUserJoined {
  type: 'user_joined';
  user: OnlineUser;
}

export interface ServerUserLeft {
  type: 'user_left';
  userId: string;
}

export interface ServerError {
  type: 'error';
  message: string;
}

export interface OnlineUser {
  userId: string;
  displayName: string;
}

export type ServerMessage =
  | ServerInit
  | ServerElementAdd
  | ServerElementUpdate
  | ServerElementDelete
  | ServerCursorMove
  | ServerUserJoined
  | ServerUserLeft
  | ServerError;
