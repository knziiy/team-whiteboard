import React from 'react';
import { useBoardStore } from '../../store/boardStore';
import type { StickyProps } from '@whiteboard/shared';

const TOOLS = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'sticky', label: 'Sticky', icon: '📝' },
  { id: 'rect', label: 'Rect', icon: '▭' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
  { id: 'freehand', label: 'Draw', icon: '✏' },
] as const;

const COLORS = [
  '#FFEB3B', '#FF9800', '#F44336', '#E91E63',
  '#9C27B0', '#3F51B5', '#2196F3', '#4CAF50',
  '#ffffff', '#9E9E9E', '#212121',
];

interface Props {
  onApplyColor?: (color: string) => void;
  onApplyFontSize?: (size: number) => void;
  onApplyTextColor?: (color: string) => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}

export default function ToolPalette({ onApplyColor, onApplyFontSize, onApplyTextColor, onBringToFront, onSendToBack }: Props) {
  const activeTool = useBoardStore((s) => s.activeTool);
  const activeColor = useBoardStore((s) => s.activeColor);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setActiveColor = useBoardStore((s) => s.setActiveColor);
  const selectedElementId = useBoardStore((s) => s.selectedElementId);
  const elements = useBoardStore((s) => s.elements);

  const selectedEl = selectedElementId ? elements.get(selectedElementId) : null;
  const isSticky = selectedEl?.type === 'sticky';
  const currentFontSize = isSticky ? ((selectedEl!.props as StickyProps).fontSize ?? 14) : 14;
  const hasSelection = selectedEl != null;

  return (
    <div className="flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 shadow-sm p-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={tool.label}
          className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center transition ${
            activeTool === tool.id
              ? 'bg-gray-900 text-white'
              : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      {hasSelection && (
        <div className="border-t border-gray-100 mt-1 pt-2 flex flex-col gap-1">
          <button
            onClick={onBringToFront}
            title="最前面に移動"
            className="w-full text-xs text-gray-500 hover:bg-gray-100 rounded-md px-1 py-1.5 text-left transition"
          >↑ 最前面</button>
          <button
            onClick={onSendToBack}
            title="最背面に移動"
            className="w-full text-xs text-gray-500 hover:bg-gray-100 rounded-md px-1 py-1.5 text-left transition"
          >↓ 最背面</button>
        </div>
      )}

      <div className="border-t border-gray-100 mt-1 pt-2">
        <div className="grid grid-cols-2 gap-1">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => {
                setActiveColor(color);
                onApplyColor?.(color);
              }}
              title={color}
              className={`w-4 h-4 rounded-full border-2 transition-transform ${
                activeColor === color ? 'border-gray-900 scale-125' : 'border-gray-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {isSticky && (
        <>
          <div className="border-t border-gray-100 mt-1 pt-2 flex items-center justify-between gap-1">
            <button
              onClick={() => onApplyFontSize?.(Math.max(8, currentFontSize - 2))}
              className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center transition"
            >−</button>
            <span className="text-xs text-gray-500 w-8 text-center">{currentFontSize}</span>
            <button
              onClick={() => onApplyFontSize?.(Math.min(72, currentFontSize + 2))}
              className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center transition"
            >+</button>
          </div>
          <div className="border-t border-gray-100 mt-1 pt-2">
            <p className="text-xs text-gray-400 mb-1 text-center">A</p>
            <div className="grid grid-cols-2 gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onApplyTextColor?.(color)}
                  title={color}
                  className="w-4 h-4 rounded-full border-2 border-gray-200 hover:scale-125 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
