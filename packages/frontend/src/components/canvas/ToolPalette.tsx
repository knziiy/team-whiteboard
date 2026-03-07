import React from 'react';
import { useBoardStore } from '../../store/boardStore';

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
}

export default function ToolPalette({ onApplyColor }: Props) {
  const activeTool = useBoardStore((s) => s.activeTool);
  const activeColor = useBoardStore((s) => s.activeColor);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setActiveColor = useBoardStore((s) => s.setActiveColor);

  return (
    <div className="flex flex-col gap-2 bg-white rounded-xl shadow-lg border p-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={tool.label}
          className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-colors ${
            activeTool === tool.id
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="border-t mt-1 pt-2">
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
                activeColor === color ? 'border-blue-600 scale-125' : 'border-gray-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
