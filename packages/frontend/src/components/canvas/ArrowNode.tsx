import React, { useState } from 'react';
import { Arrow, Circle, Group } from 'react-konva';
import type { ArrowProps } from '@whiteboard/shared';

interface Props {
  id: string;
  props: ArrowProps;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (props: ArrowProps) => void;
}

export default function ArrowNode({ id, props, isSelected, onSelect, onChange }: Props) {
  const basePoints = props.points.length >= 4 ? props.points : [0, 0, 100, 0];

  // ドラッグ中のリアルタイム表示用ローカル状態
  const [dragPoints, setDragPoints] = useState<number[] | null>(null);

  const displayPoints = dragPoints ?? basePoints;
  const [x1, y1, x2, y2] = displayPoints;

  // 端点ドラッグ（傾き変更）
  const handleDragMove = (index: 0 | 1, x: number, y: number) => {
    const newPoints = [...basePoints];
    newPoints[index * 2] = x;
    newPoints[index * 2 + 1] = y;
    setDragPoints(newPoints);
  };

  const handleDragEnd = (index: 0 | 1, x: number, y: number) => {
    setDragPoints(null);
    const newPoints = [...basePoints];
    newPoints[index * 2] = x;
    newPoints[index * 2 + 1] = y;
    onChange({ ...props, points: newPoints });
  };

  // 矢印本体ドラッグ（傾きを維持したまま移動）
  const handleBodyDragEnd = (e: any) => {
    const node = e.target;
    const dx = node.x();
    const dy = node.y();
    node.position({ x: 0, y: 0 });
    onChange({
      ...props,
      points: [
        basePoints[0] + dx,
        basePoints[1] + dy,
        basePoints[2] + dx,
        basePoints[3] + dy,
      ],
    });
  };

  return (
    <Group
      onClick={onSelect}
      onTap={onSelect}
      draggable={isSelected}
      onDragEnd={handleBodyDragEnd}
    >
      <Arrow
        points={[x1!, y1!, x2!, y2!]}
        stroke={props.stroke ?? '#374151'}
        fill={props.fill ?? '#374151'}
        strokeWidth={props.strokeWidth ?? 2}
        pointerLength={props.pointerLength ?? 10}
        pointerWidth={props.pointerWidth ?? 10}
        hitStrokeWidth={20}
      />
      {isSelected && (
        <>
          <Circle
            x={x1}
            y={y1}
            radius={6}
            fill="white"
            stroke="#3B82F6"
            strokeWidth={2}
            draggable
            onDragMove={(e) => { e.cancelBubble = true; handleDragMove(0, e.target.x(), e.target.y()); }}
            onDragEnd={(e) => { e.cancelBubble = true; handleDragEnd(0, e.target.x(), e.target.y()); }}
          />
          <Circle
            x={x2}
            y={y2}
            radius={6}
            fill="white"
            stroke="#3B82F6"
            strokeWidth={2}
            draggable
            onDragMove={(e) => { e.cancelBubble = true; handleDragMove(1, e.target.x(), e.target.y()); }}
            onDragEnd={(e) => { e.cancelBubble = true; handleDragEnd(1, e.target.x(), e.target.y()); }}
          />
        </>
      )}
    </Group>
  );
}
