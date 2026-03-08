import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  user: AuthUser;
  onBack: () => void;
}

export default function Admin({ user, onBack }: Props) {
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.groups.list(user.idToken), api.users.list(user.idToken)])
      .then(([g, u]) => {
        setGroups(g);
        setUsers(u);
      })
      .catch((e) => setError(e.message));
  }, [user.idToken]);

  const loadMembers = async (group: any) => {
    setSelectedGroup(group);
    try {
      const m = await api.groups.listMembers(group.id, user.idToken);
      setMembers(m);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const g = await api.groups.create({ name: newGroupName.trim() }, user.idToken);
      setGroups((prev) => [...prev, g]);
      setNewGroupName('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteGroup = async (id: string) => {
    if (!window.confirm('このグループを削除しますか？')) return;
    try {
      await api.groups.delete(id, user.idToken);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      if (selectedGroup?.id === id) {
        setSelectedGroup(null);
        setMembers([]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await api.groups.addMember(selectedGroup.id, userId, user.idToken);
      const m = await api.groups.listMembers(selectedGroup.id, user.idToken);
      setMembers(m);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await api.groups.removeMember(selectedGroup.id, userId, user.idToken);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const memberIds = new Set(members.map((m) => m.userId));

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-900 transition">
          &larr; ダッシュボード
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">管理</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <p className="mb-6 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Groups list */}
          <div>
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">グループ</h2>
            <form onSubmit={createGroup} className="flex gap-2 mb-5">
              <input
                type="text"
                placeholder="グループ名"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
              />
              <button
                type="submit"
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
              >
                作成
              </button>
            </form>
            <ul className="space-y-1">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition ${
                    selectedGroup?.id === g.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <button
                    onClick={() => loadMembers(g)}
                    className="text-sm font-medium flex-1 text-left"
                  >
                    {g.name}
                  </button>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    className={`text-xs ml-2 transition ${
                      selectedGroup?.id === g.id ? 'text-gray-400 hover:text-white' : 'text-gray-300 hover:text-red-500'
                    }`}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Members */}
          {selectedGroup && (
            <div>
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
                {selectedGroup.name} のメンバー
              </h2>
              <ul className="space-y-1 mb-6">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition">
                    <div>
                      <span className="text-sm text-gray-900">{m.displayName}</span>
                      <span className="text-xs text-gray-400 ml-2">{m.email}</span>
                    </div>
                    <button
                      onClick={() => removeMember(m.userId)}
                      className="text-xs text-gray-300 hover:text-red-500 transition"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">ユーザーを追加</h3>
              <ul className="space-y-1">
                {users
                  .filter((u) => !memberIds.has(u.id))
                  .map((u) => (
                    <li key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition">
                      <div>
                        <span className="text-sm text-gray-900">{u.displayName}</span>
                        <span className="text-xs text-gray-400 ml-2">{u.email}</span>
                      </div>
                      <button
                        onClick={() => addMember(u.id)}
                        className="text-xs text-gray-400 hover:text-gray-900 transition"
                      >
                        追加
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
