import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import type { KonvaEventObject } from 'konva/lib/Node';
import type {
  BoardElement,
  StickyProps,
  RectProps,
  CircleProps,
  ArrowProps,
  FreehandProps,
} from '@whiteboard/shared';
import { useBoardStore, type UndoResult } from '../store/boardStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../api/client';
import ToolPalette from '../components/canvas/ToolPalette';
import StickyNote from '../components/canvas/StickyNote';
import { RectNode, CircleNode } from '../components/canvas/ShapeNode';
import ArrowNode from '../components/canvas/ArrowNode';
import FreehandLine from '../components/canvas/FreehandLine';
import UserPresence from '../components/canvas/UserPresence';
import type { AuthUser } from '../hooks/useAuth';

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

interface Props {
  boardId: string;
  user: AuthUser;
  onBack: () => void;
}

export default function Board({ boardId, user, onBack }: Props) {
  const elements = useBoardStore((s) => s.elements);
  const activeTool = useBoardStore((s) => s.activeTool);
  const activeColor = useBoardStore((s) => s.activeColor);
  const selectedElementId = useBoardStore((s) => s.selectedElementId);
  const setSelectedElement = useBoardStore((s) => s.setSelectedElement);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const upsertElement = useBoardStore((s) => s.upsertElement);
  const removeElement = useBoardStore((s) => s.removeElement);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const setDrawingElementId = useBoardStore((s) => s.setDrawingElementId);

  const lockedElements = useBoardStore((s) => s.lockedElements);

  const { send } = useWebSocket(boardId, user.idToken);

  // ID of the sticky note currently being text-edited
  const [editingId, setEditingId] = useState<string | null>(null);
  // Ref mirror of editingId for synchronous access in event handlers (avoids stale closure)
  const editingIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDrawing = useRef(false);
  const drawingId = useRef<string | null>(null);
  const lastCursorSend = useRef(0);
  const lastFreehandSend = useRef(0);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const clipboardEl = useRef<BoardElement | null>(null);
  const pasteCount = useRef(0);

  // ── Zoom / Pan state ─────────────────────────────────────────────────────────
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const [boardTitle, setBoardTitle] = useState('');
  const [showCursors, setShowCursors] = useState(() => getCookie('wb_show_cursors') === '1');

  // boardId が変わったらストアをクリアして REST API で初期要素を取得する
  // （WebSocket init の到着前や接続失敗時のフォールバック）
  useEffect(() => {
    let cancelled = false;
    const state = useBoardStore.getState();
    state.setElements([]); // 前のボードの残留要素をクリア
    state.setActiveTool('select'); // ツールをリセット
    state.setSelectedElement(null); // 選択をリセット
    setEditingId(null);
    editingIdRef.current = null;
    api.boards.get(boardId, user.idToken).then((b) => {
      if (!cancelled) setBoardTitle(b.title);
    }).catch(() => {});
    api.boards.listElements(boardId, user.idToken).then((els) => {
      // WebSocket init が先に到着済みなら REST レスポンスで上書きしない
      if (!cancelled && useBoardStore.getState().elements.size === 0) {
        useBoardStore.getState().setElements(els);
      }
    }).catch(() => {
      // エラー時は WebSocket init に委ねる
    });
    return () => { cancelled = true; };
  }, [boardId, user.idToken]);

  useEffect(() => {
    const onResize = () => setStageSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Convert screen pointer position to canvas coordinates
  const toCanvas = useCallback((px: number, py: number) => ({
    x: (px - stagePos.x) / stageScale,
    y: (py - stagePos.y) / stageScale,
  }), [stagePos, stageScale]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    const pointer = stage.getPointerPosition()!;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Zoom centered on cursor
      const SCALE_FACTOR = 1.08;
      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = Math.min(4, Math.max(0.1, stageScale * (direction > 0 ? SCALE_FACTOR : 1 / SCALE_FACTOR)));
      const newX = pointer.x - (pointer.x - stagePos.x) * (newScale / stageScale);
      const newY = pointer.y - (pointer.y - stagePos.y) * (newScale / stageScale);
      setStageScale(newScale);
      setStagePos({ x: newX, y: newY });
    } else if (e.evt.shiftKey) {
      // Horizontal pan
      setStagePos((prev) => ({ x: prev.x - e.evt.deltaY, y: prev.y }));
    } else {
      // Vertical pan (also support deltaX for trackpads)
      setStagePos((prev) => ({ x: prev.x - e.evt.deltaX, y: prev.y - e.evt.deltaY }));
    }
  }, [stageScale, stagePos]);

  const sendElement = useCallback(
    (element: BoardElement, type: 'element_add' | 'element_update' = 'element_update') => {
      // Only record undo history for the current user's own elements
      const isOwn = element.createdBy === user.id;
      upsertElement(element, isOwn);
      send({ type, element });
    },
    [upsertElement, send, user.id],
  );

  // Keep editingIdRef in sync with editingId state
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  // ── Sticky text editing with lock ───────────────────────────────────────────
  const pendingLockId = useRef<string | null>(null);

  const startEditing = useCallback((id: string) => {
    // 他のユーザーがロック中なら編集不可
    const lock = useBoardStore.getState().lockedElements.get(id);
    if (lock && lock.userId !== user.id) return;

    // ロックリクエストを送信し、サーバーからの応答を待つ
    pendingLockId.current = id;
    send({ type: 'element_lock', elementId: id });
    setSelectedElement(id);
    // ロック失敗時のタイムアウト（2秒以内に応答がなければクリア）
    setTimeout(() => {
      if (pendingLockId.current === id) pendingLockId.current = null;
    }, 2000);
  }, [setSelectedElement, send, user.id]);

  // サーバーからロック成功通知が来たら編集モードに入る
  useEffect(() => {
    if (!pendingLockId.current) return;
    const lock = lockedElements.get(pendingLockId.current);
    if (lock && lock.userId === user.id) {
      const id = pendingLockId.current;
      pendingLockId.current = null;
      setEditingId(id);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [lockedElements, user.id]);

  const commitEdit = useCallback(() => {
    // editingIdRef を使い、stale closure を回避しつつ二重呼び出しを防止
    const id = editingIdRef.current;
    if (!id || !textareaRef.current) return;
    editingIdRef.current = null; // 即座にクリア（二重呼び出し防止）
    const el = useBoardStore.getState().elements.get(id);
    if (el) {
      const updated: BoardElement = {
        ...el,
        props: { ...(el.props as StickyProps), text: textareaRef.current.value },
        updatedAt: new Date().toISOString(),
      };
      sendElement(updated);
    }
    // アンロック送信
    send({ type: 'element_unlock', elementId: id });
    setEditingId(null);
  }, [sendElement, send]);

  // ── Stage events ─────────────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // If clicking outside while editing, commit the edit
      if (editingIdRef.current) {
        commitEdit();
        return;
      }

      if (activeTool === 'select') {
        if (e.target === e.target.getStage()) {
          setSelectedElement(null);
          // Start panning
          const stage = e.target.getStage()!;
          const ptr = stage.getPointerPosition()!;
          isPanning.current = true;
          panStart.current = { px: ptr.x, py: ptr.y, sx: stagePos.x, sy: stagePos.y };
        }
        return;
      }

      const stage = e.target.getStage()!;
      const rawPos = stage.getPointerPosition()!;
      const pos = toCanvas(rawPos.x, rawPos.y);
      const id = uuidv4();

      if (activeTool === 'sticky') {
        const el: BoardElement = {
          id,
          boardId,
          type: 'sticky',
          props: { x: pos.x, y: pos.y, text: '', fill: activeColor, width: 160, height: 120 } as StickyProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
        setActiveTool('select');
        // Immediately enter edit mode
        startEditing(id);
        return;
      }

      drawingId.current = id;

      if (activeTool === 'rect') {
        const el: BoardElement = {
          id,
          boardId,
          type: 'rect',
          props: { x: pos.x, y: pos.y, width: 100, height: 80, fill: activeColor } as RectProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
        setActiveTool('select');
        setSelectedElement(id);
        return;
      }

      if (activeTool === 'circle') {
        const el: BoardElement = {
          id,
          boardId,
          type: 'circle',
          props: { x: pos.x, y: pos.y, radius: 50, fill: activeColor } as CircleProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
        setActiveTool('select');
        setSelectedElement(id);
        return;
      }

      if (activeTool === 'arrow') {
        isDrawing.current = true;
        drawingId.current = id;
        const el: BoardElement = {
          id,
          boardId,
          type: 'arrow',
          props: { points: [pos.x, pos.y, pos.x, pos.y], stroke: activeColor === '#ffffff' ? '#212121' : activeColor } as ArrowProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
        return;
      }

      if (activeTool === 'freehand') {
        isDrawing.current = true;
        setDrawingElementId(id);
        const el: BoardElement = {
          id,
          boardId,
          type: 'freehand',
          props: { points: [pos.x, pos.y], stroke: activeColor === '#ffffff' ? '#212121' : activeColor, strokeWidth: 3 } as FreehandProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
      }
    },
    [activeTool, activeColor, boardId, commitEdit, elements.size,
     sendElement, setActiveTool, setSelectedElement, startEditing, user.id, stagePos, toCanvas],
  );

  const handleStageMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage()!;
      const rawPos = stage.getPointerPosition()!;

      // Panning
      if (isPanning.current && panStart.current) {
        const dx = rawPos.x - panStart.current.px;
        const dy = rawPos.y - panStart.current.py;
        setStagePos({ x: panStart.current.sx + dx, y: panStart.current.sy + dy });
        return;
      }

      const pos = toCanvas(rawPos.x, rawPos.y);

      const now = Date.now();
      if (showCursors && now - lastCursorSend.current > 250) {
        lastCursorSend.current = now;
        send({ type: 'cursor_move', x: pos.x, y: pos.y });
      }

      if (!isDrawing.current || !drawingId.current) return;

      const el = useBoardStore.getState().elements.get(drawingId.current);
      if (!el) return;

      if (el.type === 'arrow') {
        const currentPoints = (el.props as ArrowProps).points;
        const newProps: ArrowProps = {
          ...(el.props as ArrowProps),
          points: [currentPoints[0], currentPoints[1], pos.x, pos.y],
        };
        const updated: BoardElement = { ...el, props: newProps, updatedAt: new Date().toISOString() };
        upsertElement(updated, false);
        if (now - lastFreehandSend.current > 50) {
          lastFreehandSend.current = now;
          send({ type: 'element_update', element: updated });
        }
        return;
      }

      if (el.type !== 'freehand') return;

      const newProps: FreehandProps = {
        ...(el.props as FreehandProps),
        points: [...(el.props as FreehandProps).points, pos.x, pos.y],
      };
      const updated: BoardElement = { ...el, props: newProps, updatedAt: new Date().toISOString() };
      upsertElement(updated, false); // don't pollute undo stack while drawing

      // 50ms間隔で他クライアントに中間更新を送信
      if (now - lastFreehandSend.current > 50) {
        lastFreehandSend.current = now;
        send({ type: 'element_update', element: updated });
      }
    },
    [send, upsertElement, toCanvas, showCursors],
  );

  const handleStageMouseUp = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
    if (isDrawing.current && drawingId.current) {
      const el = useBoardStore.getState().elements.get(drawingId.current);
      if (el) {
        send({ type: 'element_update', element: el });
        if (el.type === 'arrow') {
          setActiveTool('select');
          setSelectedElement(drawingId.current);
        }
      }
      setDrawingElementId(null);
    }
    isDrawing.current = false;
    drawingId.current = null;
  }, [send, setDrawingElementId, setActiveTool, setSelectedElement]);

  const performUndo = useCallback(() => {
    const result: UndoResult | null = undo();
    if (!result) return;
    if (result.type === 'delete') {
      send({ type: 'element_delete', elementId: result.id });
    } else {
      send({ type: 'element_update', element: result.element });
    }
  }, [undo, send]);

  const performRedo = useCallback(() => {
    const result: UndoResult | null = redo();
    if (!result) return;
    if (result.type === 'delete') {
      send({ type: 'element_delete', elementId: result.id });
    } else {
      send({ type: 'element_update', element: result.element });
    }
  }, [redo, send]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inTextInput = document.activeElement?.tagName === 'TEXTAREA'
        || document.activeElement?.tagName === 'INPUT';

      // Delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inTextInput) {
        const { selectedElementId, elements } = useBoardStore.getState();
        if (!selectedElementId) return;
        const target = elements.get(selectedElementId);
        const isOwn = target?.createdBy === user.id;
        removeElement(selectedElementId, isOwn);
        send({ type: 'element_delete', elementId: selectedElementId });
        setSelectedElement(null);
      }

      // Copy (Ctrl+C / Cmd+C)
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inTextInput) {
        const { selectedElementId, elements } = useBoardStore.getState();
        if (!selectedElementId) return;
        const el = elements.get(selectedElementId);
        if (!el) return;
        clipboardEl.current = el;
        pasteCount.current = 0;
      }

      // Paste (Ctrl+V / Cmd+V)
      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !inTextInput) {
        const src = clipboardEl.current;
        if (!src) return;
        e.preventDefault();
        pasteCount.current += 1;
        const offset = pasteCount.current * 20;
        const pasted: BoardElement = {
          ...src,
          id: uuidv4(),
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
          props: { ...src.props, x: (src.props as any).x + offset, y: (src.props as any).y + offset },
        };
        const { upsertElement, setSelectedElement } = useBoardStore.getState();
        upsertElement(pasted, true);
        send({ type: 'element_add', element: pasted });
        setSelectedElement(pasted.id);
      }

      // Undo (Ctrl+Z / Cmd+Z)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !inTextInput) {
        e.preventDefault();
        performUndo();
      }

      // Redo (Ctrl+Shift+Z / Cmd+Shift+Z)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey && !inTextInput) {
        e.preventDefault();
        performRedo();
      }

      // Escape: cancel editing or deselect
      if (e.key === 'Escape') {
        if (editingIdRef.current) {
          commitEdit();
        } else {
          setSelectedElement(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitEdit, removeElement, send, setSelectedElement, performUndo, performRedo, user.id]);

  const updateElement = useCallback(
    (el: BoardElement, newProps: BoardElement['props']) => {
      const updated = { ...el, props: newProps, updatedAt: new Date().toISOString() };
      sendElement(updated);
    },
    [sendElement],
  );

  const applyColorToSelected = useCallback((color: string) => {
    const { selectedElementId, elements: els } = useBoardStore.getState();
    if (!selectedElementId) return;
    const el = els.get(selectedElementId);
    if (!el) return;
    if (el.type === 'sticky' || el.type === 'rect' || el.type === 'circle') {
      updateElement(el, { ...el.props, fill: color } as BoardElement['props']);
    } else if (el.type === 'arrow' || el.type === 'freehand') {
      updateElement(el, { ...el.props, stroke: color } as BoardElement['props']);
    }
  }, [updateElement]);

  const applyFontSizeToSelected = useCallback((size: number) => {
    const { selectedElementId, elements: els } = useBoardStore.getState();
    if (!selectedElementId) return;
    const el = els.get(selectedElementId);
    if (!el || el.type !== 'sticky') return;
    updateElement(el, { ...el.props, fontSize: size } as StickyProps);
  }, [updateElement]);

  const applyTextColorToSelected = useCallback((color: string) => {
    const { selectedElementId, elements: els } = useBoardStore.getState();
    if (!selectedElementId) return;
    const el = els.get(selectedElementId);
    if (!el || el.type !== 'sticky') return;
    updateElement(el, { ...el.props, textColor: color } as StickyProps);
  }, [updateElement]);

  const bringToFront = useCallback(() => {
    const { selectedElementId, elements: els } = useBoardStore.getState();
    if (!selectedElementId) return;
    const el = els.get(selectedElementId);
    if (!el) return;
    const maxZ = Math.max(...Array.from(els.values()).map((e) => e.zIndex));
    sendElement({ ...el, zIndex: maxZ + 1 });
  }, [sendElement]);

  const sendToBack = useCallback(() => {
    const { selectedElementId, elements: els } = useBoardStore.getState();
    if (!selectedElementId) return;
    const el = els.get(selectedElementId);
    if (!el) return;
    const minZ = Math.min(...Array.from(els.values()).map((e) => e.zIndex));
    sendElement({ ...el, zIndex: minZ - 1 });
  }, [sendElement]);

  // Get sticky being edited for textarea positioning
  const editingEl = editingId ? elements.get(editingId) : null;
  const editingProps = editingEl?.props as StickyProps | undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      {/* Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 shadow-sm px-4 py-2">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-900 transition">
          &larr;
        </button>
        <div className="w-px h-4 bg-gray-200" />
        <span className="text-sm font-medium text-gray-900">{boardTitle || 'ボード'}</span>
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center gap-1">
          <button
            onClick={performUndo}
            title="元に戻す (Ctrl+Z)"
            className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            onClick={performRedo}
            title="やり直し (Ctrl+Shift+Z)"
            className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => {
              const cx = stageSize.width / 2;
              const cy = stageSize.height / 2;
              const newScale = Math.max(0.1, stageScale / 1.25);
              setStagePos({ x: cx - (cx - stagePos.x) * (newScale / stageScale), y: cy - (cy - stagePos.y) * (newScale / stageScale) });
              setStageScale(newScale);
            }}
            className="px-2 py-1 text-gray-400 hover:text-gray-900 hover:bg-gray-50 text-sm leading-none transition"
          >−</button>
          <button
            onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }}
            className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 border-x border-gray-200 min-w-[3rem] text-center transition"
          >{Math.round(stageScale * 100)}%</button>
          <button
            onClick={() => {
              const cx = stageSize.width / 2;
              const cy = stageSize.height / 2;
              const newScale = Math.min(4, stageScale * 1.25);
              setStagePos({ x: cx - (cx - stagePos.x) * (newScale / stageScale), y: cy - (cy - stagePos.y) * (newScale / stageScale) });
              setStageScale(newScale);
            }}
            className="px-2 py-1 text-gray-400 hover:text-gray-900 hover:bg-gray-50 text-sm leading-none transition"
          >+</button>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        <button
          onClick={() => {
            const next = !showCursors;
            setShowCursors(next);
            setCookie('wb_show_cursors', next ? '1' : '0', 365);
          }}
          title={showCursors ? 'カーソル表示をオフ' : 'カーソル表示をオン'}
          className={`p-1 rounded transition ${showCursors ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'}`}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 0 L0 12 L4 8 L8 16 L10 15 L6 7 L12 7 Z" />
          </svg>
        </button>
      </div>

      {/* Tool palette */}
      <div className="absolute top-4 right-4 z-10">
        <ToolPalette
          onApplyColor={applyColorToSelected}
          onApplyFontSize={applyFontSizeToSelected}
          onApplyTextColor={applyTextColorToSelected}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
        />
      </div>

      {/* Online users */}
      <OnlineUserBadges />

      {/* Canvas */}
      <div ref={stageContainerRef} className="relative flex-1">
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          pixelRatio={window.devicePixelRatio * stageScale}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onWheel={handleWheel}
          style={{ cursor: activeTool === 'select' ? 'grab' : 'crosshair' }}
        >
          <Layer>
            {Array.from(elements.values())
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => {
                const isSelected = el.id === selectedElementId;
                const onSelect = () => { if (!editingIdRef.current) setSelectedElement(el.id); };

                if (el.type === 'sticky') {
                  const lock = lockedElements.get(el.id);
                  const isLockedByOther = !!lock && lock.userId !== user.id;
                  return (
                    <StickyNote
                      key={el.id}
                      id={el.id}
                      props={el.props as StickyProps}
                      isSelected={isSelected}
                      isEditing={el.id === editingId}
                      isLockedByOther={isLockedByOther}
                      lockedByName={isLockedByOther ? lock.displayName : undefined}
                      onSelect={onSelect}
                      onDblClick={() => {
                        if (isLockedByOther) return;
                        startEditing(el.id);
                      }}
                      onChange={(p) => updateElement(el, p)}
                    />
                  );
                }
                if (el.type === 'rect') {
                  return (
                    <RectNode
                      key={el.id}
                      id={el.id}
                      props={el.props as RectProps}
                      isSelected={isSelected}
                      onSelect={onSelect}
                      onChange={(p) => updateElement(el, p)}
                    />
                  );
                }
                if (el.type === 'circle') {
                  return (
                    <CircleNode
                      key={el.id}
                      id={el.id}
                      props={el.props as CircleProps}
                      isSelected={isSelected}
                      onSelect={onSelect}
                      onChange={(p) => updateElement(el, p)}
                    />
                  );
                }
                if (el.type === 'arrow') {
                  return (
                    <ArrowNode
                      key={el.id}
                      id={el.id}
                      props={el.props as ArrowProps}
                      isSelected={isSelected}
                      onSelect={onSelect}
                      onChange={(p) => updateElement(el, p)}
                    />
                  );
                }
                if (el.type === 'freehand') {
                  return (
                    <FreehandLine
                      key={el.id}
                      id={el.id}
                      props={el.props as FreehandProps}
                      isSelected={isSelected}
                      onSelect={onSelect}
                    />
                  );
                }
                return null;
              })}
          </Layer>
        </Stage>

        {/* Sticky textarea overlay — rendered as DOM, positioned over canvas */}
        {editingId && editingProps && (
          <textarea
            ref={textareaRef}
            defaultValue={editingProps.text}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); commitEdit(); }
            }}
            style={{
              position: 'absolute',
              left: editingProps.x * stageScale + stagePos.x,
              top: editingProps.y * stageScale + stagePos.y,
              width: (editingProps.width ?? 160) * stageScale,
              height: (editingProps.height ?? 120) * stageScale,
              background: editingProps.fill ?? '#FFEB3B',
              color: editingProps.textColor ?? '#1a1a1a',
              border: '2px solid #3B82F6',
              borderRadius: 4,
              padding: 8,
              fontSize: (editingProps.fontSize ?? 14) * stageScale,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              zIndex: 20,
            }}
          />
        )}

        {/* Cursor overlay */}
        {showCursors && <UserPresence currentUserId={user.id} stageScale={stageScale} stagePos={stagePos} />}
      </div>
    </div>
  );
}

function OnlineUserBadges() {
  const onlineUsers = useBoardStore((s) => s.onlineUsers);
  if (onlineUsers.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-4 z-10 flex gap-1.5">
      {onlineUsers.map((u) => (
        <div
          key={u.userId}
          title={u.displayName}
          className="bg-gray-900 text-white text-xs w-7 h-7 rounded-full flex items-center justify-center font-medium"
        >
          {u.displayName[0]?.toUpperCase()}
        </div>
      ))}
    </div>
  );
}
