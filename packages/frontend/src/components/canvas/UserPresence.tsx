import React from 'react';
import { useBoardStore } from '../../store/boardStore';

interface Props {
  currentUserId: string;
  stageScale: number;
  stagePos: { x: number; y: number };
}

// Rendered as DOM overlay outside the canvas, positioned absolutely
export default function UserPresence({ currentUserId, stageScale, stagePos }: Props) {
  const cursors = useBoardStore((s) => s.cursors);
  const onlineUsers = useBoardStore((s) => s.onlineUsers);

  return (
    <>
      {Array.from(cursors.values())
        .filter((c) => c.userId !== currentUserId)
        .map((cursor) => {
          const user = onlineUsers.find((u) => u.userId === cursor.userId);
          if (!user) return null; // オンラインでないユーザーのカーソルは表示しない
          const label = user.displayName;
          // cursor coords are in canvas space; convert to screen space
          const screenX = cursor.x * stageScale + stagePos.x;
          const screenY = cursor.y * stageScale + stagePos.y;
          return (
            <div
              key={cursor.userId}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY,
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 100,
                transform: 'translate(0, 0)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path
                  d="M0 0 L0 12 L4 8 L8 16 L10 15 L6 7 L12 7 Z"
                  fill="#3B82F6"
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
              <span
                style={{
                  background: '#3B82F6',
                  color: 'white',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  display: 'block',
                  marginTop: 2,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
    </>
  );
}
