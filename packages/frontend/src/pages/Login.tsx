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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-bold mb-1 text-center tracking-tight text-gray-900">Team Whiteboards</h1>
        <p className="text-xs text-center text-gray-400 mb-8">ローカル開発モード</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">表示名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: 田中太郎"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            管理者として入る
          </label>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
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
  const [company, setCompany] = useState('');
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
        await register!(email, password, displayName, company || undefined);
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

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-bold mb-8 text-center tracking-tight text-gray-900">Team Whiteboards</h1>

        {message && (
          <p className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{message}</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">表示名</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">会社名</label>
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="任意" className={inputClass} />
              </div>
            </>
          )}

          {mode !== 'confirm' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">パスワード</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputClass} />
            </div>
          )}

          {mode === 'confirm' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">確認コード</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required className={inputClass} />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'register' ? '登録' : '確認'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {mode === 'login' ? (
            <button
              onClick={() => { setMode('register'); setError(''); setMessage(''); }}
              className="text-sm text-gray-400 hover:text-gray-900 transition"
            >
              アカウント作成
            </button>
          ) : (
            <button
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className="text-sm text-gray-400 hover:text-gray-900 transition"
            >
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
