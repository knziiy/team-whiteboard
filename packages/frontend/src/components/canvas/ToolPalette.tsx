import React, { useState } from 'react';
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

const TOOL_DEFAULTS: Partial<Record<string, { fill: string; stroke: string }>> = {
  sticky: { fill: '#ffffff', stroke: '#212121' },
  rect:   { fill: '#ffffff', stroke: '#212121' },
  circle: { fill: '#ffffff', stroke: '#212121' },
  arrow:  { fill: '#212121', stroke: '#212121' },
  freehand: { fill: '#212121', stroke: '#212121' },
};

const COLORS = [
  '#FFEB3B', '#FF9800', '#F44336', '#E91E63',
  '#9C27B0', '#3F51B5', '#2196F3', '#4CAF50',
  '#ffffff', '#9E9E9E', '#212121',
];

interface Props {
  onApplyColor?: (color: string) => void;
  onApplyStrokeColor?: (color: string) => void;
  onApplyFontSize?: (size: number) => void;
  onApplyTextColor?: (color: string) => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}

type OpenPicker = 'fill' | 'stroke' | 'text' | null;

function ColorRow({
  label,
  current,
  isOpen,
  onToggle,
  onSelect,
}: {
  label: string;
  current: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="border-t border-gray-100 mt-1 pt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-1 py-0.5 rounded hover:bg-gray-50 transition"
        title={`${label}色を選択`}
      >
        <span className="text-xs text-gray-400 w-6 flex-shrink-0">{label}</span>
        <span
          className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"
          style={{ backgroundColor: current }}
        />
        <span className="text-gray-300 text-xs ml-auto">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="grid grid-cols-4 gap-1 mt-2 px-1">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onSelect(color)}
              title={color}
              className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                current === color ? 'border-gray-900 scale-110' : 'border-gray-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ToolPalette({ onApplyColor, onApplyStrokeColor, onApplyFontSize, onApplyTextColor, onBringToFront, onSendToBack }: Props) {
  const activeTool = useBoardStore((s) => s.activeTool);
  const activeColor = useBoardStore((s) => s.activeColor);
  const activeStrokeColor = useBoardStore((s) => s.activeStrokeColor);
  const setActiveTool = useBoardStore((s) => s.setActiveTool);
  const setActiveColor = useBoardStore((s) => s.setActiveColor);
  const setActiveStrokeColor = useBoardStore((s) => s.setActiveStrokeColor);
  const selectedElementId = useBoardStore((s) => s.selectedElementId);
  const elements = useBoardStore((s) => s.elements);

  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);

  const selectedEl = selectedElementId ? elements.get(selectedElementId) : null;
  const isSticky = selectedEl?.type === 'sticky';
  const isShapeSelected = selectedEl?.type === 'rect' || selectedEl?.type === 'circle' || selectedEl?.type === 'sticky';
  const isShapeTool = activeTool === 'rect' || activeTool === 'circle' || activeTool === 'sticky';
  const showStrokePicker = isShapeSelected || isShapeTool;
  const showTextPicker = isSticky;
  const currentFontSize = isSticky ? ((selectedEl!.props as StickyProps).fontSize ?? 14) : 14;
  const currentTextColor = isSticky ? ((selectedEl!.props as StickyProps).textColor ?? '#212121') : '#212121';
  const hasSelection = selectedEl != null;

  // 選択中オブジェクトがある場合はそのオブジェクトの色を表示、なければ store のアクティブカラーを表示
  const selectedProps = selectedEl?.props as any;
  const displayFillColor = selectedEl ? (selectedProps?.fill ?? activeColor) : activeColor;
  const displayStrokeColor = selectedEl ? (selectedProps?.stroke ?? activeStrokeColor) : activeStrokeColor;

  const toggle = (picker: OpenPicker) =>
    setOpenPicker((prev) => (prev === picker ? null : picker));

  return (
    <div className="flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 shadow-sm p-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => {
            setActiveTool(tool.id);
            const defaults = TOOL_DEFAULTS[tool.id];
            if (defaults) {
              setActiveColor(defaults.fill);
              setActiveStrokeColor(defaults.stroke);
            }
          }}
          title={tool.label}
          className={`w-full h-10 rounded-lg text-lg flex items-center justify-center transition ${
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
            className="w-full text-xs text-gray-500 hover:bg-gray-100 rounded-md px-1 py-1.5 text-center transition"
          >↑ 最前面</button>
          <button
            onClick={onSendToBack}
            title="最背面に移動"
            className="w-full text-xs text-gray-500 hover:bg-gray-100 rounded-md px-1 py-1.5 text-center transition"
          >↓ 最背面</button>
        </div>
      )}

      <ColorRow
        label="色"
        current={displayFillColor}
        isOpen={openPicker === 'fill'}
        onToggle={() => toggle('fill')}
        onSelect={(color) => {
          setActiveColor(color);
          onApplyColor?.(color);
          setOpenPicker(null);
        }}
      />

      {showStrokePicker && (
        <ColorRow
          label="枠線"
          current={displayStrokeColor}
          isOpen={openPicker === 'stroke'}
          onToggle={() => toggle('stroke')}
          onSelect={(color) => {
            setActiveStrokeColor(color);
            onApplyStrokeColor?.(color);
            setOpenPicker(null);
          }}
        />
      )}

      {showTextPicker && (
        <div className="border-t border-gray-100 mt-1 pt-2">
          <p className="text-xs text-gray-400 mb-1.5 px-1">文字</p>
          <div className="flex items-center justify-between gap-1 px-1 mb-1.5">
            <button
              onClick={() => onApplyFontSize?.(Math.max(8, currentFontSize - 2))}
              className="w-6 h-6 rounded hover:bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center transition"
            >−</button>
            <span className="text-xs text-gray-500 w-6 text-center">{currentFontSize}</span>
            <button
              onClick={() => onApplyFontSize?.(Math.min(72, currentFontSize + 2))}
              className="w-6 h-6 rounded hover:bg-gray-100 text-gray-500 text-base leading-none flex items-center justify-center transition"
            >+</button>
          </div>
          <button
            onClick={() => toggle('text')}
            className="flex items-center gap-2 w-full px-1 py-0.5 rounded hover:bg-gray-50 transition"
            title="文字色を選択"
          >
            <span className="text-xs text-gray-400 w-6 flex-shrink-0">色</span>
            <span
              className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"
              style={{ backgroundColor: currentTextColor }}
            />
            <span className="text-gray-300 text-xs ml-auto">{openPicker === 'text' ? '▲' : '▼'}</span>
          </button>
          {openPicker === 'text' && (
            <div className="grid grid-cols-4 gap-1 mt-2 px-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => { onApplyTextColor?.(color); setOpenPicker(null); }}
                  title={color}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    currentTextColor === color ? 'border-gray-900 scale-110' : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
