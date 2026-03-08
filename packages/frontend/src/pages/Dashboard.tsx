import React, { useEffect, useRef, useState } from 'react';
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState('');
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [changingGroupBoardId, setChangingGroupBoardId] = useState<string | null>(null);
  const [menuOpenBoardId, setMenuOpenBoardId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpenBoardId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenBoardId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenBoardId]);

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

  const openCreateModal = () => {
    setNewTitle('');
    setNewGroupId('');
    setShowCreateModal(true);
  };

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const board = await api.boards.create(
        { title: newTitle.trim(), groupId: newGroupId || undefined },
        user.idToken,
      );
      setBoards((prev) => [board, ...prev]);
      setShowCreateModal(false);
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

  const duplicateBoard = async (id: string) => {
    try {
      const board = await api.boards.duplicate(id, user.idToken);
      setBoards((prev) => [board, ...prev]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteBoard = async (id: string) => {
    if (!window.confirm('このボードを削除しますか？')) return;
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
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            新しいボード
          </button>
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

        {loading ? (
          <p className="text-gray-500 text-sm">読み込み中...</p>
        ) : boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm mb-2">ボードがありません</p>
            <button
              onClick={openCreateModal}
              className="text-sm text-blue-600 hover:underline"
            >
              最初のボードを作成
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => (
              <div
                key={board.id}
                className="relative bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
              >
                {editingBoardId === board.id ? (
                  <div className="w-full text-left p-4">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => renameBoard(board.id)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter') renameBoard(board.id);
                        if (e.key === 'Escape') setEditingBoardId(null);
                      }}
                      autoFocus
                      className="w-full font-medium text-gray-900 border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {board.groupId && (
                      <p className="text-xs text-gray-400 mt-1">
                        {groups.find((g) => g.id === board.groupId)?.name ?? 'グループ'}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectBoard(board.id)}
                    className="w-full text-left p-4"
                  >
                    <h3 className="font-medium text-gray-900">{board.title}</h3>
                    {board.groupId && (
                      <p className="text-xs text-gray-400 mt-1">
                        {groups.find((g) => g.id === board.groupId)?.name ?? 'グループ'}
                      </p>
                    )}
                  </button>
                )}
                {(user.isAdmin || board.createdBy === user.id) && (
                  <div className="absolute top-2 right-2" ref={menuOpenBoardId === board.id ? menuRef : undefined}>
                    <button
                      onClick={() => setMenuOpenBoardId(menuOpenBoardId === board.id ? null : board.id)}
                      className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {menuOpenBoardId === board.id && (
                      <div className="absolute right-0 top-8 z-10 w-36 bg-white rounded-lg shadow-lg border py-1">
                        {user.isAdmin && (
                          <button
                            onClick={() => { setEditingBoardId(board.id); setEditingTitle(board.title); setMenuOpenBoardId(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            名前変更
                          </button>
                        )}
                        {user.isAdmin && groups.length > 0 && (
                          <button
                            onClick={() => { setChangingGroupBoardId(board.id); setMenuOpenBoardId(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            グループ変更
                          </button>
                        )}
                        {user.isAdmin && (
                          <button
                            onClick={() => { duplicateBoard(board.id); setMenuOpenBoardId(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            複製
                          </button>
                        )}
                        <button
                          onClick={() => { deleteBoard(board.id); setMenuOpenBoardId(null); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-gray-100"
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {changingGroupBoardId === board.id && (
                  <div className="px-4 pb-3">
                    <select
                      value={board.groupId ?? ''}
                      onChange={(e) => {
                        changeBoardGroup(board.id, e.target.value);
                        setChangingGroupBoardId(null);
                      }}
                      onBlur={() => setChangingGroupBoardId(null)}
                      autoFocus
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">グループなし</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">新しいボードを作成</h2>
            <form onSubmit={createBoard} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  placeholder="ボードのタイトルを入力"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    グループ
                  </label>
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">グループなし</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
