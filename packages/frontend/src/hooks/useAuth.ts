import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { api } from '../api/client';
import { getRuntimeConfig } from '../lib/runtimeConfig';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  idToken: string;
}

export const LOCAL_MODE = import.meta.env['VITE_AUTH_MODE'] === 'local';

const LOCAL_STORAGE_KEY = 'whiteboard_local_user';

function makeLocalToken(user: Omit<AuthUser, 'idToken'>): string {
  return 'local.' + btoa(encodeURIComponent(JSON.stringify(user)));
}

function readLocalUser(): AuthUser | null {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw?.startsWith('local.')) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(raw.slice(6)))) as Omit<AuthUser, 'idToken'>;
    return { ...parsed, idToken: raw };
  } catch {
    return null;
  }
}

// CognitoUserPool を生成するヘルパー（config.json から値を取得）
async function createPool() {
  const [{ CognitoUserPool }, config] = await Promise.all([
    import('amazon-cognito-identity-js'),
    getRuntimeConfig(),
  ]);
  return new CognitoUserPool({
    UserPoolId: config.cognitoUserPoolId,
    ClientId: config.cognitoClientId,
  });
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (...args: any[]) => any;
  logout: () => void;
  register?: (email: string, password: string, displayName: string, company?: string) => Promise<void>;
  confirm?: (email: string, code: string) => Promise<void>;
  completeNewPassword?: (newPassword: string) => Promise<AuthUser>;
  newPasswordRequired: boolean;
  totpRequired: boolean;
  totpSetupRequired: boolean;
  totpSetupData: { secret: string; qrUri: string } | null;
  submitTotp?: (code: string) => Promise<AuthUser>;
  setupTotp?: () => Promise<void>;
  verifyTotpSetup?: (code: string) => Promise<AuthUser>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  newPasswordRequired: false,
  totpRequired: false,
  totpSetupRequired: false,
  totpSetupData: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPasswordRequired, setNewPasswordRequired] = useState(false);
  const [pendingCognitoUser, setPendingCognitoUser] = useState<any>(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpSetupRequired, setTotpSetupRequired] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrUri: string } | null>(null);

  useEffect(() => {
    if (LOCAL_MODE) {
      setUser(readLocalUser());
      setLoading(false);
      return;
    }

    createPool().then((pool) => {
      const cognitoUser = pool.getCurrentUser();
      if (!cognitoUser) { setLoading(false); return; }
      cognitoUser.getSession((err: Error | null, session: any) => {
        if (!err && session?.isValid()) setUser(parseCognitoSession(session));
        setLoading(false);
      });
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  // 5分間隔の定期セッションリフレッシュ（削除済みユーザーの検知）
  useEffect(() => {
    if (LOCAL_MODE || !user) return;

    const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5分
    const MAX_CONSECUTIVE_FAILURES = 3; // 3回連続失敗（15分相当）でログアウト
    let consecutiveFailures = 0;

    const signOutAndClear = async () => {
      try {
        const pool = await createPool();
        pool.getCurrentUser()?.signOut();
      } catch { /* ignore */ }
      setUser(null);
    };

    const refreshSession = async () => {
      try {
        const pool = await createPool();
        const cognitoUser = pool.getCurrentUser();
        if (!cognitoUser) { await signOutAndClear(); return; }
        cognitoUser.getSession((err: Error | null, session: any) => {
          if (err) {
            if (isAuthError(err)) {
              signOutAndClear();
            } else {
              consecutiveFailures++;
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                signOutAndClear();
              }
            }
          } else if (!session?.isValid()) {
            signOutAndClear();
          } else {
            consecutiveFailures = 0;
            setUser(parseCognitoSession(session));
          }
        });
      } catch (err) {
        if (isAuthError(err)) {
          await signOutAndClear();
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            await signOutAndClear();
          }
        }
      }
    };

    const timer = setInterval(refreshSession, SESSION_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // REST API 401 → ログアウト
  useEffect(() => {
    const handleUnauthorized = async () => {
      if (LOCAL_MODE) return;
      const pool = await createPool();
      pool.getCurrentUser()?.signOut();
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const localLogin = useCallback((displayName: string, isAdmin: boolean): AuthUser => {
    const u: Omit<AuthUser, 'idToken'> = {
      id: crypto.randomUUID(),
      email: `${displayName.toLowerCase().replace(/\s+/g, '.')}@local`,
      displayName,
      isAdmin,
    };
    const token = makeLocalToken(u);
    const authUser: AuthUser = { ...u, idToken: token };
    localStorage.setItem(LOCAL_STORAGE_KEY, token);
    setUser(authUser);
    // DynamoDB にユーザー情報を登録（ローカル開発でも DynamoDB Local に保存）
    api.users.upsertMe(token).catch(() => {});
    return authUser;
  }, []);

  const localLogout = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setUser(null);
  }, []);

  const cognitoLogin = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const { CognitoUser, AuthenticationDetails } = await import('amazon-cognito-identity-js');
    const pool = await createPool();
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
      cognitoUser.authenticateUser(
        new AuthenticationDetails({ Username: email, Password: password }),
        {
          onSuccess: async (session) => {
            const u = parseCognitoSession(session);
            // 管理者かつ TOTP 未設定の場合はセットアップを要求
            if (u.isAdmin) {
              const setupRequired = await new Promise<boolean>((res) => {
                cognitoUser.getUserData((err, data) => {
                  if (err) { res(false); return; }
                  const mfaList = data?.UserMFASettingList ?? [];
                  res(!mfaList.includes('SOFTWARE_TOKEN_MFA'));
                });
              });
              if (setupRequired) {
                setPendingCognitoUser(cognitoUser);
                setTotpSetupRequired(true);
                reject(new Error('TOTP_SETUP_REQUIRED'));
                return;
              }
            }
            setUser(u);
            api.users.upsertMe(u.idToken).catch(() => {});
            resolve(u);
          },
          onFailure: reject,
          newPasswordRequired: () => {
            setPendingCognitoUser(cognitoUser);
            setNewPasswordRequired(true);
            reject(new Error('NEW_PASSWORD_REQUIRED'));
          },
          totpRequired: () => {
            setPendingCognitoUser(cognitoUser);
            setTotpRequired(true);
            reject(new Error('TOTP_REQUIRED'));
          },
        },
      );
    });
  }, []);

  const completeNewPassword = useCallback(async (newPassword: string): Promise<AuthUser> => {
    if (!pendingCognitoUser) throw new Error('No pending password challenge');
    return new Promise((resolve, reject) => {
      pendingCognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: (session: any) => {
          const u = parseCognitoSession(session);
          setUser(u);
          setNewPasswordRequired(false);
          setPendingCognitoUser(null);
          api.users.upsertMe(u.idToken).catch(() => {});
          resolve(u);
        },
        onFailure: (err: Error) => {
          reject(err);
        },
      });
    });
  }, [pendingCognitoUser]);

  const submitTotp = useCallback(async (code: string): Promise<AuthUser> => {
    if (!pendingCognitoUser) throw new Error('No pending TOTP challenge');
    return new Promise((resolve, reject) => {
      pendingCognitoUser.sendMFACode(code, {
        onSuccess: (session: any) => {
          const u = parseCognitoSession(session);
          setUser(u);
          setTotpRequired(false);
          setPendingCognitoUser(null);
          api.users.upsertMe(u.idToken).catch(() => {});
          resolve(u);
        },
        onFailure: (err: Error) => reject(err),
      }, 'SOFTWARE_TOKEN_MFA');
    });
  }, [pendingCognitoUser]);

  const setupTotp = useCallback(async (): Promise<void> => {
    if (!pendingCognitoUser) throw new Error('No pending user');
    return new Promise((resolve, reject) => {
      pendingCognitoUser.associateSoftwareToken({
        associateSecretCode: (secret: string) => {
          const config = getRuntimeConfig();
          // QR URI を同期的に組み立てるのは難しいので非同期で処理
          config.then((cfg) => {
            const email = pendingCognitoUser.getUsername?.() ?? '';
            const issuer = encodeURIComponent(`Team Whiteboards (${cfg.cognitoUserPoolId})`);
            const account = encodeURIComponent(email);
            const qrUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
            setTotpSetupData({ secret, qrUri });
            resolve();
          }).catch(reject);
        },
        onFailure: (err: Error) => reject(err),
      });
    });
  }, [pendingCognitoUser]);

  const verifyTotpSetup = useCallback(async (code: string): Promise<AuthUser> => {
    if (!pendingCognitoUser) throw new Error('No pending user');
    return new Promise((resolve, reject) => {
      pendingCognitoUser.verifySoftwareToken(code, 'Authenticator', {
        onSuccess: (session: any) => {
          // TOTP を優先 MFA に設定
          pendingCognitoUser.setUserMfaPreference(null, { PreferredMfa: true, Enabled: true }, (err: Error | null) => {
            if (err) { reject(err); return; }
            // セッションを再取得
            pendingCognitoUser.getSession((err2: Error | null, newSession: any) => {
              if (err2 || !newSession?.isValid()) {
                // セッション取得失敗時は onSuccess のセッションを使用
                const u = parseCognitoSession(session);
                setUser(u);
                setTotpSetupRequired(false);
                setTotpSetupData(null);
                setPendingCognitoUser(null);
                api.users.upsertMe(u.idToken).catch(() => {});
                resolve(u);
                return;
              }
              const u = parseCognitoSession(newSession);
              setUser(u);
              setTotpSetupRequired(false);
              setTotpSetupData(null);
              setPendingCognitoUser(null);
              api.users.upsertMe(u.idToken).catch(() => {});
              resolve(u);
            });
          });
        },
        onFailure: (err: Error) => reject(err),
      });
    });
  }, [pendingCognitoUser]);

  const cognitoRegister = useCallback(async (email: string, password: string, displayName: string, company?: string): Promise<void> => {
    const { CognitoUserAttribute } = await import('amazon-cognito-identity-js');
    const pool = await createPool();
    const attrs = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: displayName }),
    ];
    if (company) {
      attrs.push(new CognitoUserAttribute({ Name: 'custom:company', Value: company }));
    }
    return new Promise((resolve, reject) => {
      pool.signUp(email, password, attrs, [], (err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const cognitoConfirm = useCallback(async (email: string, code: string): Promise<void> => {
    const { CognitoUser } = await import('amazon-cognito-identity-js');
    const pool = await createPool();
    return new Promise((resolve, reject) => {
      new CognitoUser({ Username: email, Pool: pool }).confirmRegistration(
        code, true, (err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const cognitoLogout = useCallback(async () => {
    const pool = await createPool();
    pool.getCurrentUser()?.signOut();
    setUser(null);
  }, []);

  if (LOCAL_MODE) {
    return {
      user, loading, login: localLogin, logout: localLogout,
      newPasswordRequired: false, totpRequired: false, totpSetupRequired: false, totpSetupData: null,
    };
  }

  return {
    user, loading,
    login: cognitoLogin,
    logout: cognitoLogout,
    register: cognitoRegister,
    confirm: cognitoConfirm,
    completeNewPassword,
    newPasswordRequired,
    totpRequired,
    totpSetupRequired,
    totpSetupData,
    submitTotp,
    setupTotp,
    verifyTotpSetup,
  };
}

function isAuthError(err: any): boolean {
  const AUTH_ERROR_CODES = [
    'NotAuthorizedException',
    'UserNotFoundException',
    'UserNotConfirmedException',
    'InvalidParameterException',
  ];
  if (err?.code && AUTH_ERROR_CODES.includes(err.code)) return true;
  // ローカルストレージからトークンが消えている等のローカルエラー
  if (!err?.code && typeof err?.message === 'string' &&
      err.message.toLowerCase().includes('authenticate')) return true;
  return false;
}

function parseCognitoSession(session: any): AuthUser {
  const payload = session.getIdToken().decodePayload();
  const groups = (payload['cognito:groups'] as string[]) ?? [];
  return {
    id: payload['sub'],
    email: payload['email'] ?? '',
    displayName: payload['name'] ?? payload['cognito:username'] ?? payload['email'] ?? '',
    isAdmin: groups.includes('Admins'),
    idToken: session.getIdToken().getJwtToken() as string,
  };
}
