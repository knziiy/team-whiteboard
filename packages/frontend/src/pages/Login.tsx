import React, { useState } from 'react';
import { useAuth, LOCAL_MODE } from '../hooks/useAuth';

export default function Login() {
  if (LOCAL_MODE) {
    return <LocalLogin />;
  }
  return <CognitoLogin />;
}

// ─── Local dev login ───────────────────────────────────────────────────────────

function LocalLogin() {
  const { login } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    login(displayName.trim(), isAdmin);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2 text-center">Team Whiteboards</h1>
        <p className="text-xs text-center text-amber-600 bg-amber-50 rounded px-3 py-1.5 mb-6">
          ローカル開発モード
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: 田中太郎"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="rounded"
            />
            管理者として入る
          </label>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
          >
            入室
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Cognito login ─────────────────────────────────────────────────────────────

type Mode = 'login' | 'register' | 'confirm';

function CognitoLogin() {
  const { login, register, confirm } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        await register!(email, password, displayName);
        setMessage('確認コードをメールに送信しました。');
        setMode('confirm');
      } else {
        await confirm!(email, code);
        setMessage('登録完了。ログインしてください。');
        setMode('login');
      }
    } catch (err: any) {
      setError(err.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Team Whiteboards</h1>

        {message && (
          <p className="mb-4 text-sm text-green-600 bg-green-50 p-3 rounded">{message}</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {mode !== 'confirm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {mode === 'confirm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">確認コード</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'register' ? '登録' : '確認'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'login' ? (
            <button
              onClick={() => { setMode('register'); setError(''); setMessage(''); }}
              className="text-blue-600 hover:underline"
            >
              アカウント作成
            </button>
          ) : (
            <button
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className="text-blue-600 hover:underline"
            >
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
