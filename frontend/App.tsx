
import React, { useState, useEffect } from 'react';
import { User } from './types';
import { dbService } from './services/dbService';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const sessionUser = await dbService.getSession();
      if (sessionUser) {
        setUser(sessionUser);
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const handleLogin = async (loggedInUser: User) => {
    setUser(loggedInUser);
    // Session persistence is handled by the server (Cookies/DB)
  };

  const handleLogout = async () => {
    setUser(null);
    await dbService.setSession(null);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-red-500 font-bold uppercase tracking-widest text-xs">Connecting to Database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="selection:bg-red-600/40">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} onUpdateUser={handleUpdateUser} />
      ) : (
        <AuthPage onLogin={handleLogin} />
      )}
    </div>
  );
};

export default App;
