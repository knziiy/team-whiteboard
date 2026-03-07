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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          ← ダッシュボード
        </button>
        <h1 className="text-xl font-bold">管理者パネル</h1>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Groups list */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold mb-3">グループ</h2>
            <form onSubmit={createGroup} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="グループ名"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
              >
                作成
              </button>
            </form>
            <ul className="space-y-2">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                    selectedGroup?.id === g.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
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
                    className="text-xs text-red-500 hover:text-red-700 ml-2"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Members */}
          {selectedGroup && (
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h2 className="font-semibold mb-3">{selectedGroup.name} のメンバー</h2>
              <ul className="space-y-2 mb-4">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between text-sm">
                    <span>{m.displayName} ({m.email})</span>
                    <button
                      onClick={() => removeMember(m.userId)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
              <h3 className="text-sm font-medium mb-2 text-gray-600">ユーザーを追加</h3>
              <ul className="space-y-1">
                {users
                  .filter((u) => !memberIds.has(u.id))
                  .map((u) => (
                    <li key={u.id} className="flex items-center justify-between text-sm">
                      <span>{u.displayName} ({u.email})</span>
                      <button
                        onClick={() => addMember(u.id)}
                        className="text-xs text-blue-600 hover:text-blue-800"
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
