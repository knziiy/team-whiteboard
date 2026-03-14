import React from 'react';
import { Rect, Ellipse, Transformer } from 'react-konva';
import { useRef, useEffect } from 'react';
import type Konva from 'konva';
import type { RectProps, CircleProps } from '@whiteboard/shared';

interface RectNodeProps {
  id: string;
  props: RectProps;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (props: RectProps) => void;
}

export function RectNode({ id, props, isSelected, onSelect, onChange }: RectNodeProps) {
  const shapeRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && shapeRef.current && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Rect
        ref={shapeRef}
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        fill={props.fill ?? '#3B82F6'}
        stroke={props.stroke ?? '#212121'}
        strokeWidth={props.strokeWidth ?? 2}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ ...props, x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current!;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...props,
            x: node.x(),
            y: node.y(),
            width: Math.max(20, node.width() * scaleX),
            height: Math.max(20, node.height() * scaleY),
          });
        }}
      />
      {isSelected && <Transformer ref={trRef} keepRatio={false} />}
    </>
  );
}

interface CircleNodeProps {
  id: string;
  props: CircleProps;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (props: CircleProps) => void;
}

export function CircleNode({ id, props, isSelected, onSelect, onChange }: CircleNodeProps) {
  const shapeRef = useRef<Konva.Ellipse>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const radiusX = props.radiusX ?? props.radius ?? 50;
  const radiusY = props.radiusY ?? props.radius ?? 50;

  useEffect(() => {
    if (isSelected && shapeRef.current && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Ellipse
        ref={shapeRef}
        x={props.x}
        y={props.y}
        radiusX={radiusX}
        radiusY={radiusY}
        fill={props.fill ?? '#3B82F6'}
        stroke={props.stroke ?? '#212121'}
        strokeWidth={props.strokeWidth ?? 2}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ ...props, x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current!;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...props,
            x: node.x(),
            y: node.y(),
            radiusX: Math.max(10, radiusX * scaleX),
            radiusY: Math.max(10, radiusY * scaleY),
          });
        }}
      />
      {isSelected && <Transformer ref={trRef} keepRatio={false} />}
    </>
  );
}
