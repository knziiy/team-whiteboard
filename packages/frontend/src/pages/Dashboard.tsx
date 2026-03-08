import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  user: AuthUser;
  onSelectBoard: (boardId: string) => void;
  onAdmin: () => void;
  onLogout: () => void;
}

export default function Dashboard({ user, onSelectBoard, onAdmin, onLogout }: Props) {
  const [boards, setBoards] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [error, setError] = useState('');
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    Promise.all([
      api.boards.list(user.idToken),
      api.groups.list(user.idToken),
    ])
      .then(([b, g]) => {
        setBoards(b);
        setGroups(g);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.idToken]);

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const board = await api.boards.create(
        { title: newTitle.trim(), groupId: newGroupId || undefined },
        user.idToken,
      );
      setBoards((prev) => [board, ...prev]);
      setNewTitle('');
      setNewGroupId('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renameBoard = async (id: string) => {
    if (!editingTitle.trim()) {
      setEditingBoardId(null);
      return;
    }
    try {
      const updated = await api.boards.update(id, { title: editingTitle.trim() }, user.idToken);
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title: updated.title } : b)));
    } catch (err: any) {
      setError(err.message);
    }
    setEditingBoardId(null);
  };

  const changeBoardGroup = async (boardId: string, groupId: string) => {
    try {
      const updated = await api.boards.update(
        boardId,
        { groupId: groupId || null },
        user.idToken,
      );
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, groupId: updated.groupId } : b)),
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      await api.boards.delete(id, user.idToken);
      setBoards((prev) => prev.filter((b) => b.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Team Whiteboards</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.displayName}</span>
          {user.isAdmin && (
            <button onClick={onAdmin} className="text-sm text-blue-600 hover:underline">
              管理
            </button>
          )}
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>
        )}

        <form onSubmit={createBoard} className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="新しいボードのタイトル"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {groups.length > 0 && (
            <select
              value={newGroupId}
              onChange={(e) => setNewGroupId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">グループなし</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            作成
          </button>
        </form>

        {loading ? (
          <p className="text-gray-500 text-sm">読み込み中...</p>
        ) : boards.length === 0 ? (
          <p className="text-gray-500 text-sm">ボードがありません。作成してください。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => (
              <div
                key={board.id}
                className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => onSelectBoard(board.id)}
                  className="w-full text-left p-4"
                >
                  {editingBoardId === board.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => renameBoard(board.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameBoard(board.id);
                        if (e.key === 'Escape') setEditingBoardId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-full font-medium text-gray-900 border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <h3 className="font-medium text-gray-900">{board.title}</h3>
                  )}
                  {board.groupId && (
                    <p className="text-xs text-gray-400 mt-1">
                      {groups.find((g) => g.id === board.groupId)?.name ?? 'グループ'}
                    </p>
                  )}
                </button>
                {(user.isAdmin || board.createdBy === user.id) && (
                  <div className="border-t px-4 py-2 flex flex-col gap-2">
                    <div className="flex gap-3">
                      {user.isAdmin && editingBoardId !== board.id && (
                        <button
                          onClick={() => { setEditingBoardId(board.id); setEditingTitle(board.title); }}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          名前変更
                        </button>
                      )}
                      <button
                        onClick={() => deleteBoard(board.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        削除
                      </button>
                    </div>
                    {user.isAdmin && groups.length > 0 && (
                      <select
                        value={board.groupId ?? ''}
                        onChange={(e) => changeBoardGroup(board.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">グループなし</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
