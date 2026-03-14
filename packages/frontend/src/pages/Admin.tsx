import React, { useEffect, useState, useCallback } from 'react';
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
  const [activeTab, setActiveTab] = useState<'groups' | 'users' | 'userManagement'>('groups');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserCompany, setNewUserCompany] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserGroupIds, setNewUserGroupIds] = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

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
    setAddUserSearch('');
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

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserName.trim() || !newUserPassword) return;
    setCreatingUser(true);
    try {
      await api.users.create(
        {
          email: newUserEmail.trim(),
          displayName: newUserName.trim(),
          company: newUserCompany.trim() || undefined,
          temporaryPassword: newUserPassword,
          groupIds: newUserGroupIds.length > 0 ? newUserGroupIds : undefined,
        },
        user.idToken,
      );
      const u = await api.users.list(user.idToken);
      setUsers(u);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserCompany('');
      setNewUserPassword('');
      setNewUserGroupIds([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const toggleGroupId = (gid: string) => {
    setNewUserGroupIds((prev) => prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]);
  };

  const [addUserSearch, setAddUserSearch] = useState('');

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

        {/* タブ */}
        <div className="flex gap-1 mb-8 border-b border-gray-100">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === 'groups'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            グループ設定
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === 'users'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            ユーザー作成
          </button>
          <button
            onClick={() => setActiveTab('userManagement')}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === 'userManagement'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            ユーザー管理
          </button>
        </div>

        {/* グループ設定タブ */}
        {activeTab === 'groups' && (
          <div className={`grid grid-cols-1 gap-8 ${selectedGroup ? 'md:grid-cols-[280px_1fr]' : 'md:grid-cols-2'}`}>
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
                {members.length > 0 ? (
                  <table className="w-full text-sm mb-6">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">名前</th>
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">メール</th>
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">会社名</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.userId} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="py-2.5 text-gray-900">{m.displayName}</td>
                          <td className="py-2.5 text-gray-500">{m.email}</td>
                          <td className="py-2.5 text-gray-500">{m.company || ''}</td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => removeMember(m.userId)}
                              className="text-xs text-gray-300 hover:text-red-500 transition"
                            >
                              グループから削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-gray-400 mb-6">メンバーがいません</p>
                )}

                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">ユーザーを追加</h3>
                {users.filter((u) => !memberIds.has(u.id)).length > 0 ? (
                  <>
                    <input
                      type="text"
                      placeholder="名前・会社名で絞り込み"
                      value={addUserSearch}
                      onChange={(e) => setAddUserSearch(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition mb-3"
                    />
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">名前</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">メール</th>
                          <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">会社名</th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users
                          .filter((u) => {
                            if (memberIds.has(u.id)) return false;
                            if (!addUserSearch.trim()) return true;
                            const q = addUserSearch.toLowerCase();
                            return (
                              (u.displayName ?? '').toLowerCase().includes(q) ||
                              (u.company ?? '').toLowerCase().includes(q)
                            );
                          })
                          .map((u) => (
                            <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                              <td className="py-2.5 text-gray-900">{u.displayName}</td>
                              <td className="py-2.5 text-gray-500">{u.email}</td>
                              <td className="py-2.5 text-gray-500">{u.company || ''}</td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => addMember(u.id)}
                                  className="text-xs text-gray-400 hover:text-gray-900 transition"
                                >
                                  追加
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">追加可能なユーザーがいません</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ユーザー管理タブ */}
        {activeTab === 'userManagement' && (
          <UserManagementTab user={user} onError={setError} />
        )}

        {/* ユーザー作成タブ */}
        {activeTab === 'users' && (
          <div className="max-w-md">
            <form onSubmit={createUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">メールアドレス</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">名前</label>
                <input
                  type="text"
                  placeholder="山田 太郎"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">会社名（任意）</label>
                <input
                  type="text"
                  placeholder="株式会社○○"
                  value={newUserCompany}
                  onChange={(e) => setNewUserCompany(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">初期パスワード</label>
                <input
                  type="password"
                  placeholder="初回ログイン時に変更されます"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">グループ割り当て（任意）</label>
                  <div className="space-y-1.5">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newUserGroupIds.includes(g.id)}
                          onChange={() => toggleGroupId(g.id)}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={creatingUser}
                className="w-full bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {creatingUser ? '作成中...' : 'ユーザーを作成'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── ユーザー管理タブ ─────────────────────────────────────────────────────────

function UserManagementTab({ user, onError }: { user: AuthUser; onError: (msg: string) => void }) {
  const [managedUsers, setManagedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const u = await api.users.list(user.idToken);
      setManagedUsers(u);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user.idToken, onError]);

  useEffect(() => { reload(); }, [reload]);

  const handleDisable = async (u: any) => {
    if (!window.confirm(`「${u.displayName}」を無効化しますか？ログイン中の場合は強制ログアウトされます。`)) return;
    try {
      await api.users.disable(u.id, user.idToken);
      await reload();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const handleEnable = async (u: any) => {
    if (!window.confirm(`「${u.displayName}」を有効化しますか？`)) return;
    try {
      await api.users.enable(u.id, user.idToken);
      await reload();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const handleDelete = async (u: any) => {
    if (!window.confirm(`「${u.displayName}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.users.delete(u.id, user.idToken);
      await reload();
    } catch (e: any) {
      onError(e.message);
    }
  };

  if (loading) return <p className="text-sm text-gray-400">読み込み中...</p>;

  return (
    <div>
      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-6">
        管理者の設定はこちらの画面ではできません。Cognitoで設定する必要があります。
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">名前</th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">メール</th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">会社名</th>
            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider pb-2">ステータス</th>
            <th className="w-36"></th>
          </tr>
        </thead>
        <tbody>
          {managedUsers.map((u) => (
            <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
              <td className="py-2.5 text-gray-900">
                {u.displayName}
                {u.isAdmin && (
                  <span className="ml-2 text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded">管理者</span>
                )}
              </td>
              <td className="py-2.5 text-gray-500">{u.email}</td>
              <td className="py-2.5 text-gray-500">{u.company || ''}</td>
              <td className="py-2.5">
                {u.disabled ? (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">無効</span>
                ) : (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">有効</span>
                )}
              </td>
              <td className="py-2.5 text-right">
                {u.id !== user.id && (
                  <span className="flex gap-3 justify-end">
                    {u.disabled ? (
                      <button
                        onClick={() => handleEnable(u)}
                        className="text-xs text-gray-400 hover:text-green-600 transition"
                      >
                        有効化
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDisable(u)}
                        className="text-xs text-gray-400 hover:text-orange-500 transition"
                      >
                        無効化
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-xs text-gray-300 hover:text-red-500 transition"
                    >
                      削除
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {managedUsers.length === 0 && (
        <p className="text-sm text-gray-400 mt-4">ユーザーがいません</p>
      )}
    </div>
  );
}
