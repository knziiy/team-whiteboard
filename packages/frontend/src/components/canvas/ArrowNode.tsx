import React from 'react';
import { Arrow, Circle, Group } from 'react-konva';
import { useState } from 'react';
import type { ArrowProps } from '@whiteboard/shared';

interface Props {
  id: string;
  props: ArrowProps;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (props: ArrowProps) => void;
}

export default function ArrowNode({ id, props, isSelected, onSelect, onChange }: Props) {
  const points = props.points;
  const [x1, y1, x2, y2] = points.length >= 4 ? points : [0, 0, 100, 0];

  const updatePoint = (index: 0 | 1, x: number, y: number) => {
    const newPoints = [...points];
    newPoints[index * 2] = x;
    newPoints[index * 2 + 1] = y;
    onChange({ ...props, points: newPoints });
  };

  return (
    <Group onClick={onSelect} onTap={onSelect}>
      <Arrow
        points={[x1!, y1!, x2!, y2!]}
        stroke={props.stroke ?? '#374151'}
        fill={props.fill ?? '#374151'}
        strokeWidth={props.strokeWidth ?? 2}
        pointerLength={props.pointerLength ?? 10}
        pointerWidth={props.pointerWidth ?? 10}
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
            onDragEnd={(e) => updatePoint(0, e.target.x(), e.target.y())}
          />
          <Circle
            x={x2}
            y={y2}
            radius={6}
            fill="white"
            stroke="#3B82F6"
            strokeWidth={2}
            draggable
            onDragEnd={(e) => updatePoint(1, e.target.x(), e.target.y())}
          />
        </>
      )}
    </Group>
  );
}
