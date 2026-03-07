import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { api } from '../api/client';

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

// ─── Context ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (...args: any[]) => any;
  logout: () => void;
  register?: (email: string, password: string, displayName: string, company?: string) => Promise<void>;
  confirm?: (email: string, code: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (LOCAL_MODE) {
      setUser(readLocalUser());
      setLoading(false);
      return;
    }

    import('amazon-cognito-identity-js').then(({ CognitoUserPool }) => {
      const pool = new CognitoUserPool({
        UserPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] as string,
        ClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] as string,
      });
      const cognitoUser = pool.getCurrentUser();
      if (!cognitoUser) { setLoading(false); return; }
      cognitoUser.getSession((err: Error | null, session: any) => {
        if (!err && session?.isValid()) setUser(parseCognitoSession(session));
        setLoading(false);
      });
    });
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
    const { CognitoUserPool, CognitoUser, AuthenticationDetails } = await import('amazon-cognito-identity-js');
    const pool = new CognitoUserPool({
      UserPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] as string,
      ClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] as string,
    });
    return new Promise((resolve, reject) => {
      new CognitoUser({ Username: email, Pool: pool }).authenticateUser(
        new AuthenticationDetails({ Username: email, Password: password }),
        {
          onSuccess: (session) => {
            const u = parseCognitoSession(session);
            setUser(u);
            // DynamoDB にユーザー情報を登録
            api.users.upsertMe(u.idToken).catch(() => {});
            resolve(u);
          },
          onFailure: reject,
          newPasswordRequired: () => reject(new Error('New password required. Please contact admin.')),
        },
      );
    });
  }, []);

  const cognitoRegister = useCallback(async (email: string, password: string, displayName: string, company?: string): Promise<void> => {
    const { CognitoUserPool, CognitoUserAttribute } = await import('amazon-cognito-identity-js');
    const pool = new CognitoUserPool({
      UserPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] as string,
      ClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] as string,
    });
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
    const { CognitoUserPool, CognitoUser } = await import('amazon-cognito-identity-js');
    const pool = new CognitoUserPool({
      UserPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] as string,
      ClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] as string,
    });
    return new Promise((resolve, reject) => {
      new CognitoUser({ Username: email, Pool: pool }).confirmRegistration(
        code, true, (err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const cognitoLogout = useCallback(async () => {
    const { CognitoUserPool } = await import('amazon-cognito-identity-js');
    const pool = new CognitoUserPool({
      UserPoolId: import.meta.env['VITE_COGNITO_USER_POOL_ID'] as string,
      ClientId: import.meta.env['VITE_COGNITO_CLIENT_ID'] as string,
    });
    pool.getCurrentUser()?.signOut();
    setUser(null);
  }, []);

  if (LOCAL_MODE) {
    return { user, loading, login: localLogin, logout: localLogout };
  }

  return {
    user, loading,
    login: cognitoLogin,
    logout: cognitoLogout,
    register: cognitoRegister,
    confirm: cognitoConfirm,
  };
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
