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
  const [infoBoardId, setInfoBoardId] = useState<string | null>(null);
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
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">Team Whiteboards</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-gray-900 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            新しいボード
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-sm text-gray-500">{user.displayName}</span>
          {user.isAdmin && (
            <button onClick={onAdmin} className="text-sm text-gray-400 hover:text-gray-900 transition">
              管理
            </button>
          )}
          <button
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-gray-900 transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <p className="mb-6 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : boards.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400 mb-3">ボードがありません</p>
            <button
              onClick={openCreateModal}
              className="text-sm text-gray-900 underline underline-offset-2 hover:no-underline transition"
            >
              最初のボードを作成
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {[
              ...groups.map((g) => ({ id: g.id, name: g.name })),
              { id: null, name: 'グループなし' },
            ].map(({ id: gid, name: gname }) => {
              const groupBoards = boards.filter((b) =>
                gid === null ? !b.groupId : b.groupId === gid,
              );
              return (
                <section key={gid ?? '__none__'}>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                    {gname}
                  </h2>
                  {groupBoards.length === 0 ? (
                    <p className="text-sm text-gray-300">ボードなし</p>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupBoards.map((board) => (
                      <div
                        key={board.id}
                        className="group relative rounded-xl border border-gray-300 bg-white hover:border-gray-400 transition-all"
                      >
                        {editingBoardId === board.id ? (
                          <div className="w-full text-left p-5">
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
                              className="w-full font-medium text-gray-900 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => onSelectBoard(board.id)}
                            className="w-full text-left p-5"
                          >
                            <h3 className="font-medium text-gray-900 text-sm">{board.title}</h3>
                          </button>
                        )}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuOpenBoardId === board.id ? menuRef : undefined}>
                          <button
                            onClick={() => setMenuOpenBoardId(menuOpenBoardId === board.id ? null : board.id)}
                            className="p-1 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM8.5 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM15.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                            </svg>
                          </button>
                          {menuOpenBoardId === board.id && (
                            <div className="absolute right-0 top-8 z-10 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                              <button
                                onClick={() => { setEditingBoardId(board.id); setEditingTitle(board.title); setMenuOpenBoardId(null); }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition"
                              >
                                名前変更
                              </button>
                              {(user.isAdmin || board.createdBy === user.id) && groups.length > 0 && (
                                <button
                                  onClick={() => { setChangingGroupBoardId(board.id); setMenuOpenBoardId(null); }}
                                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition"
                                >
                                  グループ変更
                                </button>
                              )}
                              <button
                                onClick={() => { duplicateBoard(board.id); setMenuOpenBoardId(null); }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition"
                              >
                                複製
                              </button>
                              {user.isAdmin && (
                                <button
                                  onClick={() => { setInfoBoardId(board.id); setMenuOpenBoardId(null); }}
                                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition"
                                >
                                  情報
                                </button>
                              )}
                              {(user.isAdmin || board.createdBy === user.id) && (
                                <button
                                  onClick={() => { deleteBoard(board.id); setMenuOpenBoardId(null); }}
                                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-gray-50 transition"
                                >
                                  削除
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {changingGroupBoardId === board.id && (
                          <div className="px-5 pb-4">
                            <select
                              value={board.groupId ?? ''}
                              onChange={(e) => {
                                changeBoardGroup(board.id, e.target.value);
                                setChangingGroupBoardId(null);
                              }}
                              onBlur={() => setChangingGroupBoardId(null)}
                              autoFocus
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
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
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900 mb-5">新しいボードを作成</h2>
            <form onSubmit={createBoard} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                  タイトル
                </label>
                <input
                  type="text"
                  placeholder="ボードのタイトルを入力"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                    グループ
                  </label>
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                  >
                    <option value="">グループなし</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ボード情報モーダル */}
      {infoBoardId && (() => {
        const board = boards.find((b) => b.id === infoBoardId);
        if (!board) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setInfoBoardId(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-gray-900 mb-5">ボード情報</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">タイトル</dt>
                  <dd className="text-gray-900 mt-0.5">{board.title}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">作成者</dt>
                  <dd className="text-gray-900 mt-0.5">{board.createdByName || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">作成者ID</dt>
                  <dd className="text-gray-500 mt-0.5 text-xs font-mono break-all">{board.createdBy}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">作成日</dt>
                  <dd className="text-gray-900 mt-0.5">{new Date(board.createdAt).toLocaleString('ja-JP')}</dd>
                </div>
                {board.groupId && (
                  <div>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">グループ</dt>
                    <dd className="text-gray-900 mt-0.5">{groups.find((g) => g.id === board.groupId)?.name ?? 'グループ'}</dd>
                  </div>
                )}
              </dl>
              <div className="flex justify-end pt-5">
                <button
                  onClick={() => setInfoBoardId(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
