import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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

type Mode = 'login' | 'register' | 'confirm' | 'newPassword' | 'totp' | 'totpSetup';

function CognitoLogin() {
  const {
    login, register, confirm, completeNewPassword, newPasswordRequired,
    totpRequired, totpSetupRequired, totpSetupData,
    submitTotp, setupTotp, verifyTotpSetup,
  } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // newPasswordRequired が true になったら mode を切り替え
  React.useEffect(() => {
    if (newPasswordRequired) setMode('newPassword');
  }, [newPasswordRequired]);

  React.useEffect(() => {
    if (totpRequired) setMode('totp');
  }, [totpRequired]);

  React.useEffect(() => {
    if (totpSetupRequired) {
      setMode('totpSetup');
      setupTotp?.().catch((err: any) => setError(err.message ?? 'TOTPセットアップに失敗しました'));
    }
  }, [totpSetupRequired]); // eslint-disable-line react-hooks/exhaustive-deps

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
      } else if (mode === 'newPassword') {
        if (newPassword !== newPasswordConfirm) {
          setError('パスワードが一致しません');
          setLoading(false);
          return;
        }
        await completeNewPassword!(newPassword);
      } else if (mode === 'totp') {
        await submitTotp!(code);
      } else if (mode === 'totpSetup') {
        await verifyTotpSetup!(code);
      } else {
        await confirm!(email, code);
        setMessage('登録完了。ログインしてください。');
        setMode('login');
      }
    } catch (err: any) {
      if (err.message === 'NEW_PASSWORD_REQUIRED' || err.message === 'TOTP_REQUIRED' || err.message === 'TOTP_SETUP_REQUIRED') {
        // mode は useEffect で切り替わるので何もしない
      } else {
        setError(err.message ?? 'エラーが発生しました');
      }
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
          {mode === 'newPassword' && (
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">初回ログインのため、新しいパスワードを設定してください。</p>
          )}

          {mode === 'totp' && (
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">認証アプリに表示されている6桁のコードを入力してください。</p>
          )}

          {mode === 'totpSetup' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                管理者アカウントのセキュリティ強化のため、認証アプリの設定が必要です。
                Google Authenticator や Authy などのアプリでQRコードをスキャンしてください。
              </p>
              {totpSetupData ? (
                <div className="flex flex-col items-center gap-3">
                  <QRCodeSVG value={totpSetupData.qrUri} size={180} />
                  <p className="text-xs text-gray-400 text-center">QRコードが読み取れない場合は以下のシークレットキーを手動入力</p>
                  <code className="text-xs bg-gray-100 px-3 py-1.5 rounded font-mono break-all text-center">{totpSetupData.secret}</code>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center">QRコードを生成中...</p>
              )}
            </div>
          )}

          {mode !== 'newPassword' && mode !== 'totp' && mode !== 'totpSetup' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
            </div>
          )}

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

          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">パスワード</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputClass} />
            </div>
          )}

          {mode === 'newPassword' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">新しいパスワード</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoFocus className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">新しいパスワード（確認）</label>
                <input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} required minLength={8} className={inputClass} />
              </div>
            </>
          )}

          {mode === 'confirm' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">確認コード</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required className={inputClass} />
            </div>
          )}

          {(mode === 'totp' || mode === 'totpSetup') && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                {mode === 'totpSetup' ? '確認コード（アプリに表示された6桁）' : '認証コード（6桁）'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                placeholder="000000"
                className={inputClass}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'totpSetup' && !totpSetupData)}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'register' ? '登録' : mode === 'newPassword' ? 'パスワード変更' : mode === 'totp' ? '認証' : mode === 'totpSetup' ? '設定完了' : '確認'}
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
