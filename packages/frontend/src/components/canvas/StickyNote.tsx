import React, { useState, useRef } from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { StickyProps } from '@whiteboard/shared';

interface Props {
  id: string;
  props: StickyProps;
  isSelected: boolean;
  isEditing: boolean;
  isLockedByOther: boolean;
  lockedByName?: string;
  onSelect: () => void;
  onDblClick: () => void;
  onChange: (props: StickyProps) => void;
}

const MIN_W = 80;
const MIN_H = 36;
const HANDLE_R = 6;

export default function StickyNote({ props, isSelected, isEditing, isLockedByOther, lockedByName, onSelect, onDblClick, onChange }: Props) {
  const w = props.width ?? 160;
  const h = props.height ?? 120;

  // Live resize preview (local only — onChange is called only on drag end)
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  // Persist drag start position across re-renders (let variables reset on each render)
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const displayW = preview?.w ?? w;
  const displayH = preview?.h ?? h;

  const stopBubble = (e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; };

  const handles = [
    { id: 'br' as const, cx: displayW, cy: displayH },
    { id: 'bl' as const, cx: 0, cy: displayH },
    { id: 'tr' as const, cx: displayW, cy: 0 },
    { id: 'tl' as const, cx: 0, cy: 0 },
  ];

  const computeResize = (handleId: string, dx: number, dy: number) => {
    let { x, y } = props;
    let newW = w;
    let newH = h;
    if (handleId === 'br') {
      newW = Math.max(MIN_W, w + dx);
      newH = Math.max(MIN_H, h + dy);
    } else if (handleId === 'bl') {
      const dw = Math.min(dx, w - MIN_W);
      x = x + dw;
      newW = Math.max(MIN_W, w - dw);
      newH = Math.max(MIN_H, h + dy);
    } else if (handleId === 'tr') {
      newW = Math.max(MIN_W, w + dx);
      const dh = Math.min(dy, h - MIN_H);
      y = y + dh;
      newH = Math.max(MIN_H, h - dh);
    } else if (handleId === 'tl') {
      const dw = Math.min(dx, w - MIN_W);
      const dh = Math.min(dy, h - MIN_H);
      x = x + dw;
      y = y + dh;
      newW = Math.max(MIN_W, w - dw);
      newH = Math.max(MIN_H, h - dh);
    }
    return { x, y, newW, newH };
  };

  return (
    <Group
      x={props.x}
      y={props.y}
      draggable={!isEditing}
      onClick={(e) => { stopBubble(e); onSelect(); }}
      onTap={onSelect}
      onDblClick={(e) => { stopBubble(e); onDblClick(); }}
      onDragEnd={(e) => {
        onChange({ ...props, x: e.target.x(), y: e.target.y() });
      }}
    >
      <Rect
        width={displayW}
        height={displayH}
        fill={props.fill ?? '#ffffff'}
        shadowBlur={isSelected ? 0 : 3}
        shadowColor="rgba(0,0,0,0.15)"
        cornerRadius={4}
        stroke={isLockedByOther ? '#EF4444' : isSelected ? '#3B82F6' : (props.stroke ?? '#d1d5db')}
        strokeWidth={isLockedByOther ? 2 : isSelected ? 2 : 1}
        dash={isLockedByOther ? [6, 3] : undefined}
      />
      {!isEditing && (
        <Text
          text={props.text || (isSelected && !isLockedByOther ? 'ダブルクリックで編集' : '')}
          width={displayW}
          height={displayH}
          padding={8}
          fontSize={props.fontSize ?? 14}
          fill={props.text ? (props.textColor ?? '#1a1a1a') : '#9ca3af'}
          wrap="word"
          listening={false}
        />
      )}
      {isLockedByOther && (
        <Text
          text={`🔒 ${lockedByName ?? ''}が編集中`}
          x={4}
          y={displayH - 18}
          width={displayW - 8}
          fontSize={11}
          fill="#EF4444"
          listening={false}
        />
      )}

      {/* Resize handles — only when selected and not editing */}
      {isSelected && !isEditing && handles.map(({ id, cx, cy }) => (
        <Circle
          key={id}
          x={cx}
          y={cy}
          radius={HANDLE_R}
          fill="white"
          stroke="#3B82F6"
          strokeWidth={2}
          draggable
          onMouseDown={(e) => {
            e.cancelBubble = true;
            dragStart.current = { x: e.target.x(), y: e.target.y() };
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            if (!dragStart.current) return;
            const dx = e.target.x() - dragStart.current.x;
            const dy = e.target.y() - dragStart.current.y;
            const { newW, newH } = computeResize(id, dx, dy);
            setPreview({ w: newW, h: newH });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            if (!dragStart.current) return;
            const dx = e.target.x() - dragStart.current.x;
            const dy = e.target.y() - dragStart.current.y;
            e.target.x(cx);
            e.target.y(cy);
            dragStart.current = null;
            setPreview(null);
            const { x, y, newW, newH } = computeResize(id, dx, dy);
            onChange({ ...props, x, y, width: newW, height: newH });
          }}
        />
      ))}
    </Group>
  );
}
