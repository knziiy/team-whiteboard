import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import Admin from './pages/Admin';

type View = { page: 'dashboard' } | { page: 'board'; boardId: string } | { page: 'admin' };

export default function App() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ page: 'dashboard' });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (view.page === 'board') {
    return (
      <Board
        boardId={view.boardId}
        user={user}
        onBack={() => setView({ page: 'dashboard' })}
      />
    );
  }

  if (view.page === 'admin' && user.isAdmin) {
    return <Admin user={user} onBack={() => setView({ page: 'dashboard' })} />;
  }

  return (
    <Dashboard
      user={user}
      onSelectBoard={(boardId) => setView({ page: 'board', boardId })}
      onAdmin={() => setView({ page: 'admin' })}
      onLogout={logout}
    />
  );
}
