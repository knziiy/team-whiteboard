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

export interface ClientElementLock {
  type: 'element_lock';
  elementId: string;
}

export interface ClientElementUnlock {
  type: 'element_unlock';
  elementId: string;
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
  | ClientElementLock
  | ClientElementUnlock
  | ClientCursorMove
  | ClientPing
  | ClientRequestInit;

// Server → Client messages
export interface LockedElementInfo {
  elementId: string;
  userId: string;
  displayName: string;
}

export interface ServerInit {
  type: 'init';
  elements: BoardElement[];
  onlineUsers: OnlineUser[];
  lockedElements?: LockedElementInfo[];
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

export interface ServerElementLocked {
  type: 'element_locked';
  elementId: string;
  userId: string;
  displayName: string;
}

export interface ServerElementUnlocked {
  type: 'element_unlocked';
  elementId: string;
}

export interface ServerForceLogout {
  type: 'force_logout';
  reason: string;
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
  | ServerElementLocked
  | ServerElementUnlocked
  | ServerCursorMove
  | ServerUserJoined
  | ServerUserLeft
  | ServerForceLogout
  | ServerError;
