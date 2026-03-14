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
  sticky:   { fill: '#ffffff', stroke: '#212121' },
  rect:     { fill: '#ffffff', stroke: '#212121' },
  circle:   { fill: '#ffffff', stroke: '#212121' },
  arrow:    { fill: '#212121', stroke: '#212121' },
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

  const selectedProps = selectedEl?.props as any;
  const displayFillColor = selectedEl ? (selectedProps?.fill ?? activeColor) : activeColor;
  const displayStrokeColor = selectedEl ? (selectedProps?.stroke ?? activeStrokeColor) : activeStrokeColor;

  const toggle = (picker: OpenPicker) =>
    setOpenPicker((prev) => (prev === picker ? null : picker));

  const currentForPicker = openPicker === 'fill' ? displayFillColor
    : openPicker === 'stroke' ? displayStrokeColor
    : currentTextColor;

  const popupLabel = openPicker === 'fill' ? '色' : openPicker === 'stroke' ? '枠線' : '文字色';

  return (
    <div className="relative flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-xl border border-gray-100 shadow-sm p-2 w-14">
      {/* ツール */}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => {
            setActiveTool(tool.id);
            setOpenPicker(null);
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

      {/* 前面・背面 */}
      {hasSelection && (
        <div className="border-t border-gray-100 pt-1.5 flex flex-col gap-0.5">
          <button
            onClick={onBringToFront}
            title="最前面に移動"
            className="w-full text-xs text-gray-400 hover:bg-gray-100 rounded-md py-1.5 transition"
          >↑前面</button>
          <button
            onClick={onSendToBack}
            title="最背面に移動"
            className="w-full text-xs text-gray-400 hover:bg-gray-100 rounded-md py-1.5 transition"
          >↓背面</button>
        </div>
      )}

      {/* カラースウォッチ */}
      <div className="border-t border-gray-100 pt-2 flex flex-col items-center gap-1.5">
        {/* 塗り */}
        <button
          onClick={() => toggle('fill')}
          title="色"
          className={`w-8 h-8 rounded-lg border-2 transition hover:scale-105 flex items-center justify-center ${
            openPicker === 'fill' ? 'border-gray-900 ring-2 ring-gray-300' : 'border-gray-200'
          }`}
          style={{ backgroundColor: displayFillColor }}
        />
        {/* 枠線 */}
        {showStrokePicker && (
          <button
            onClick={() => toggle('stroke')}
            title="枠線"
            className={`w-8 h-8 rounded-lg border-2 bg-white transition hover:scale-105 ${
              openPicker === 'stroke' ? 'ring-2 ring-gray-300' : ''
            }`}
            style={{ borderColor: displayStrokeColor }}
          />
        )}
        {/* 文字 */}
        {showTextPicker && (
          <>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onApplyFontSize?.(Math.max(8, currentFontSize - 2))}
                className="w-5 h-5 rounded hover:bg-gray-100 text-gray-400 text-sm leading-none flex items-center justify-center transition"
              >−</button>
              <span className="text-xs text-gray-400 w-5 text-center">{currentFontSize}</span>
              <button
                onClick={() => onApplyFontSize?.(Math.min(72, currentFontSize + 2))}
                className="w-5 h-5 rounded hover:bg-gray-100 text-gray-400 text-sm leading-none flex items-center justify-center transition"
              >+</button>
            </div>
            <button
              onClick={() => toggle('text')}
              title="文字色"
              className={`w-8 h-8 rounded-lg border-2 transition hover:scale-105 flex items-center justify-center ${
                openPicker === 'text' ? 'border-gray-900 ring-2 ring-gray-300' : 'border-gray-200'
              }`}
              style={{ backgroundColor: currentTextColor }}
            >
              <span className="text-xs font-bold mix-blend-difference text-white">A</span>
            </button>
          </>
        )}
      </div>

      {/* カラーポップアップ（左に展開） */}
      {openPicker && (
        <div className="absolute right-full mr-2 bottom-0 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg p-3 w-36">
          <p className="text-xs text-gray-400 mb-2">{popupLabel}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  if (openPicker === 'fill') {
                    setActiveColor(color);
                    onApplyColor?.(color);
                  } else if (openPicker === 'stroke') {
                    setActiveStrokeColor(color);
                    onApplyStrokeColor?.(color);
                  } else {
                    onApplyTextColor?.(color);
                  }
                  setOpenPicker(null);
                }}
                title={color}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  currentForPicker === color ? 'border-gray-900 scale-110' : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
