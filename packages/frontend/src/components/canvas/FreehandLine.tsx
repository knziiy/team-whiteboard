import React from 'react';
import { Line } from 'react-konva';
import type { FreehandProps } from '@whiteboard/shared';

interface Props {
  id: string;
  props: FreehandProps;
  isSelected: boolean;
  onSelect: () => void;
}

export default function FreehandLine({ id, props, isSelected, onSelect }: Props) {
  return (
    <Line
      points={props.points}
      stroke={props.stroke ?? '#374151'}
      strokeWidth={props.strokeWidth ?? 3}
      tension={props.tension ?? 0.5}
      lineCap="round"
      lineJoin="round"
      globalCompositeOperation="source-over"
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}
