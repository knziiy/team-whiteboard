import { create } from 'zustand';
import type { BoardElement, ServerMessage, OnlineUser } from '@whiteboard/shared';

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

interface UndoPatch {
  id: string;
  before: BoardElement | null; // null = didn't exist before (undo = delete)
  after: BoardElement | null;  // null = was deleted (redo = delete)
}

export type UndoResult =
  | { type: 'delete'; id: string }
  | { type: 'restore'; element: BoardElement };

interface LockInfo {
  userId: string;
  displayName: string;
}

interface BoardState {
  elements: Map<string, BoardElement>;
  onlineUsers: OnlineUser[];
  cursors: Map<string, CursorPosition>;
  lockedElements: Map<string, LockInfo>;
  drawingElementId: string | null;
  selectedElementId: string | null;
  activeTool: 'select' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'freehand';
  activeColor: string;
  undoStack: UndoPatch[];
  redoStack: UndoPatch[];

  setDrawingElementId: (id: string | null) => void;
  setElements: (elements: BoardElement[]) => void;
  upsertElement: (element: BoardElement, saveHistory?: boolean) => void;
  removeElement: (id: string, saveHistory?: boolean) => void;
  undo: () => UndoResult | null;
  redo: () => UndoResult | null;
  setSelectedElement: (id: string | null) => void;
  setActiveTool: (tool: BoardState['activeTool']) => void;
  setActiveColor: (color: string) => void;
  handleServerMessage: (message: ServerMessage) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  elements: new Map(),
  onlineUsers: [],
  cursors: new Map(),
  lockedElements: new Map(),
  drawingElementId: null,
  selectedElementId: null,
  activeTool: 'select',
  activeColor: '#ffffff',
  undoStack: [],
  redoStack: [],

  setDrawingElementId: (id) => set({ drawingElementId: id }),

  setElements: (elements) =>
    set({ elements: new Map(elements.map((el) => [el.id, el])), lockedElements: new Map(), undoStack: [], redoStack: [] }),

  upsertElement: (element, saveHistory = true) =>
    set((state) => {
      const patch: UndoPatch = {
        id: element.id,
        before: state.elements.get(element.id) ?? null,
        after: element,
      };
      const next = new Map(state.elements);
      next.set(element.id, element);
      return {
        elements: next,
        undoStack: saveHistory ? [...state.undoStack.slice(-49), patch] : state.undoStack,
        redoStack: saveHistory ? [] : state.redoStack,
      };
    }),

  removeElement: (id, saveHistory = true) =>
    set((state) => {
      const patch: UndoPatch = { id, before: state.elements.get(id) ?? null, after: null };
      const next = new Map(state.elements);
      next.delete(id);
      return {
        elements: next,
        undoStack: saveHistory ? [...state.undoStack.slice(-49), patch] : state.undoStack,
        redoStack: saveHistory ? [] : state.redoStack,
      };
    }),

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    const patch = undoStack[undoStack.length - 1]!;
    set((state) => {
      const next = new Map(state.elements);
      if (patch.before === null) {
        next.delete(patch.id);
      } else {
        next.set(patch.id, patch.before);
      }
      return {
        elements: next,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, patch],
      };
    });
    return patch.before === null
      ? { type: 'delete', id: patch.id }
      : { type: 'restore', element: patch.before };
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const patch = redoStack[redoStack.length - 1]!;
    set((state) => {
      const next = new Map(state.elements);
      if (patch.after === null) {
        next.delete(patch.id);
      } else {
        next.set(patch.id, patch.after);
      }
      return {
        elements: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, patch],
      };
    });
    return patch.after === null
      ? { type: 'delete', id: patch.id }
      : { type: 'restore', element: patch.after };
  },

  setSelectedElement: (id) => set({ selectedElementId: id }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveColor: (activeColor) => set({ activeColor }),

  // Server messages NEVER touch undoStack — only local operations do
  handleServerMessage: (message) => {
    switch (message.type) {
      case 'init': {
        const locks = new Map<string, LockInfo>();
        for (const l of message.lockedElements ?? []) {
          locks.set(l.elementId, { userId: l.userId, displayName: l.displayName });
        }
        set({
          elements: new Map(message.elements.map((el) => [el.id, el])),
          onlineUsers: message.onlineUsers,
          lockedElements: locks,
          undoStack: [],
          redoStack: [],
        });
        break;
      }
      case 'element_add':
      case 'element_update':
        set((state) => {
          // 自分が描画中の要素はサーバーエコーで上書きしない（ポイント消失防止）
          if (state.drawingElementId === message.element.id) return state;
          const next = new Map(state.elements);
          next.set(message.element.id, message.element);
          return { elements: next };
        });
        break;
      case 'element_delete':
        set((state) => {
          const next = new Map(state.elements);
          next.delete(message.elementId);
          return { elements: next };
        });
        break;
      case 'cursor_move':
        set((state) => {
          const next = new Map(state.cursors);
          next.set(message.userId, { userId: message.userId, x: message.x, y: message.y });
          return { cursors: next };
        });
        break;
      case 'element_locked':
        set((state) => {
          const next = new Map(state.lockedElements);
          next.set(message.elementId, { userId: message.userId, displayName: message.displayName });
          return { lockedElements: next };
        });
        break;
      case 'element_unlocked':
        set((state) => {
          const next = new Map(state.lockedElements);
          next.delete(message.elementId);
          return { lockedElements: next };
        });
        break;
      case 'user_joined':
        set((state) => ({
          onlineUsers: [...state.onlineUsers.filter((u) => u.userId !== message.user.userId), message.user],
        }));
        break;
      case 'user_left':
        set((state) => {
          const next = new Map(state.cursors);
          next.delete(message.userId);
          return {
            onlineUsers: state.onlineUsers.filter((u) => u.userId !== message.userId),
            cursors: next,
          };
        });
        break;
    }
  },
}));
