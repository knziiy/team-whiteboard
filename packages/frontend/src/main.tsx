import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import './index.css';

function Root() {
  const auth = useAuthProvider();
  return (
    <AuthContext.Provider value={auth}>
      <App />
    </AuthContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
