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
import ToolPalette from '../components/canvas/ToolPalette';
import StickyNote from '../components/canvas/StickyNote';
import { RectNode, CircleNode } from '../components/canvas/ShapeNode';
import ArrowNode from '../components/canvas/ArrowNode';
import FreehandLine from '../components/canvas/FreehandLine';
import UserPresence from '../components/canvas/UserPresence';
import type { AuthUser } from '../hooks/useAuth';

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

  const { send } = useWebSocket(boardId, user.idToken);

  // ID of the sticky note currently being text-edited
  const [editingId, setEditingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDrawing = useRef(false);
  const drawingId = useRef<string | null>(null);
  const lastCursorSend = useRef(0);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  // ── Zoom / Pan state ─────────────────────────────────────────────────────────
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

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

  // ── Sticky text editing ──────────────────────────────────────────────────────
  const startEditing = useCallback((id: string) => {
    setEditingId(id);
    setSelectedElement(id);
    // Focus textarea after render
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [setSelectedElement]);

  const commitEdit = useCallback(() => {
    if (!editingId || !textareaRef.current) return;
    const el = useBoardStore.getState().elements.get(editingId);
    if (el) {
      const updated: BoardElement = {
        ...el,
        props: { ...(el.props as StickyProps), text: textareaRef.current.value },
        updatedAt: new Date().toISOString(),
      };
      sendElement(updated);
    }
    setEditingId(null);
  }, [editingId, sendElement]);

  // ── Stage events ─────────────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // If clicking outside while editing, commit the edit
      if (editingId) {
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
        const el: BoardElement = {
          id,
          boardId,
          type: 'arrow',
          props: { points: [pos.x, pos.y, pos.x + 100, pos.y], stroke: activeColor } as ArrowProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
        setActiveTool('select');
        setSelectedElement(id);
        return;
      }

      if (activeTool === 'freehand') {
        isDrawing.current = true;
        const el: BoardElement = {
          id,
          boardId,
          type: 'freehand',
          props: { points: [pos.x, pos.y], stroke: activeColor, strokeWidth: 3 } as FreehandProps,
          zIndex: elements.size,
          createdBy: user.id,
          updatedAt: new Date().toISOString(),
        };
        sendElement(el, 'element_add');
      }
    },
    [activeTool, activeColor, boardId, editingId, commitEdit, elements.size,
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
      if (now - lastCursorSend.current > 30) {
        lastCursorSend.current = now;
        send({ type: 'cursor_move', x: pos.x, y: pos.y });
      }

      if (!isDrawing.current || !drawingId.current) return;

      const el = useBoardStore.getState().elements.get(drawingId.current);
      if (!el || el.type !== 'freehand') return;

      const newProps: FreehandProps = {
        ...(el.props as FreehandProps),
        points: [...(el.props as FreehandProps).points, pos.x, pos.y],
      };
      const updated: BoardElement = { ...el, props: newProps, updatedAt: new Date().toISOString() };
      upsertElement(updated, false); // don't pollute undo stack while drawing

      if (now % 100 < 30) send({ type: 'element_update', element: updated });
    },
    [send, upsertElement, toCanvas],
  );

  const handleStageMouseUp = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
    if (isDrawing.current && drawingId.current) {
      const el = useBoardStore.getState().elements.get(drawingId.current);
      if (el) send({ type: 'element_update', element: el });
    }
    isDrawing.current = false;
    drawingId.current = null;
  }, [send]);

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

      // Undo (Ctrl+Z / Cmd+Z)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !inTextInput) {
        e.preventDefault();
        const result: UndoResult | null = undo();
        if (!result) return;
        if (result.type === 'delete') {
          send({ type: 'element_delete', elementId: result.id });
        } else {
          send({ type: 'element_update', element: result.element });
        }
      }

      // Escape: cancel editing or deselect
      if (e.key === 'Escape') {
        if (editingId) {
          commitEdit();
        } else {
          setSelectedElement(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingId, commitEdit, removeElement, send, setSelectedElement, undo, user.id]);

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

  // Get sticky being edited for textarea positioning
  const editingEl = editingId ? elements.get(editingId) : null;
  const editingProps = editingEl?.props as StickyProps | undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-white rounded-xl shadow px-4 py-2">
        <button onClick={onBack} className="text-blue-600 text-sm hover:underline">
          ← 戻る
        </button>
        <span className="text-sm text-gray-500">ボード</span>
        <span className="text-xs text-gray-400">
          Delete: 削除　Ctrl+Z: Undo　ダブルクリック: 付箋編集　Ctrl+ホイール: ズーム
        </span>
        <div className="flex items-center gap-1 border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => {
              const cx = stageSize.width / 2;
              const cy = stageSize.height / 2;
              const newScale = Math.max(0.1, stageScale / 1.25);
              setStagePos({ x: cx - (cx - stagePos.x) * (newScale / stageScale), y: cy - (cy - stagePos.y) * (newScale / stageScale) });
              setStageScale(newScale);
            }}
            className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 text-sm leading-none"
          >−</button>
          <button
            onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }}
            className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 border-x border-gray-200"
          >{Math.round(stageScale * 100)}%</button>
          <button
            onClick={() => {
              const cx = stageSize.width / 2;
              const cy = stageSize.height / 2;
              const newScale = Math.min(4, stageScale * 1.25);
              setStagePos({ x: cx - (cx - stagePos.x) * (newScale / stageScale), y: cy - (cy - stagePos.y) * (newScale / stageScale) });
              setStageScale(newScale);
            }}
            className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 text-sm leading-none"
          >＋</button>
        </div>
      </div>

      {/* Tool palette */}
      <div className="absolute top-4 right-4 z-10">
        <ToolPalette onApplyColor={applyColorToSelected} />
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
                const onSelect = () => { if (!editingId) setSelectedElement(el.id); };

                if (el.type === 'sticky') {
                  return (
                    <StickyNote
                      key={el.id}
                      id={el.id}
                      props={el.props as StickyProps}
                      isSelected={isSelected}
                      isEditing={el.id === editingId}
                      onSelect={onSelect}
                      onDblClick={() => startEditing(el.id)}
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
        <UserPresence currentUserId={user.id} stageScale={stageScale} stagePos={stagePos} />
      </div>
    </div>
  );
}

function OnlineUserBadges() {
  const onlineUsers = useBoardStore((s) => s.onlineUsers);
  if (onlineUsers.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-4 z-10 flex gap-2">
      {onlineUsers.map((u) => (
        <div
          key={u.userId}
          title={u.displayName}
          className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full"
        >
          {u.displayName[0]?.toUpperCase()}
        </div>
      ))}
    </div>
  );
}
