import { create } from 'zustand';
import type { BoardElement, ServerMessage, OnlineUser } from '@whiteboard/shared';

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

interface UndoPatch {
  id: string;
  before: BoardElement | null; // null = element was newly created (undo = delete it)
}

export type UndoResult =
  | { type: 'delete'; id: string }
  | { type: 'restore'; element: BoardElement };

interface BoardState {
  elements: Map<string, BoardElement>;
  onlineUsers: OnlineUser[];
  cursors: Map<string, CursorPosition>;
  selectedElementId: string | null;
  activeTool: 'select' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'freehand';
  activeColor: string;
  undoStack: UndoPatch[];

  setElements: (elements: BoardElement[]) => void;
  upsertElement: (element: BoardElement, saveHistory?: boolean) => void;
  removeElement: (id: string, saveHistory?: boolean) => void;
  undo: () => UndoResult | null;
  setSelectedElement: (id: string | null) => void;
  setActiveTool: (tool: BoardState['activeTool']) => void;
  setActiveColor: (color: string) => void;
  handleServerMessage: (message: ServerMessage) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  elements: new Map(),
  onlineUsers: [],
  cursors: new Map(),
  selectedElementId: null,
  activeTool: 'select',
  activeColor: '#ffffff',
  undoStack: [],

  setElements: (elements) =>
    set({ elements: new Map(elements.map((el) => [el.id, el])), undoStack: [] }),

  upsertElement: (element, saveHistory = true) =>
    set((state) => {
      const patch: UndoPatch = {
        id: element.id,
        before: state.elements.get(element.id) ?? null,
      };
      const next = new Map(state.elements);
      next.set(element.id, element);
      return {
        elements: next,
        undoStack: saveHistory
          ? [...state.undoStack.slice(-49), patch]
          : state.undoStack,
      };
    }),

  removeElement: (id, saveHistory = true) =>
    set((state) => {
      const patch: UndoPatch = { id, before: state.elements.get(id) ?? null };
      const next = new Map(state.elements);
      next.delete(id);
      return {
        elements: next,
        undoStack: saveHistory
          ? [...state.undoStack.slice(-49), patch]
          : state.undoStack,
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
      return { elements: next, undoStack: state.undoStack.slice(0, -1) };
    });
    return patch.before === null
      ? { type: 'delete', id: patch.id }
      : { type: 'restore', element: patch.before };
  },

  setSelectedElement: (id) => set({ selectedElementId: id }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveColor: (activeColor) => set({ activeColor }),

  // Server messages NEVER touch undoStack — only local operations do
  handleServerMessage: (message) => {
    switch (message.type) {
      case 'init':
        set({
          elements: new Map(message.elements.map((el) => [el.id, el])),
          onlineUsers: message.onlineUsers,
          undoStack: [],
        });
        break;
      case 'element_add':
      case 'element_update':
        set((state) => {
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
