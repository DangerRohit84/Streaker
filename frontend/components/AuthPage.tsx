
import React, { useState } from 'react';
import { dbService, setDatabaseUrl, getDatabaseUrl } from '../services/dbService';
import { User } from '../types';

interface AuthPageProps {
  onLogin: (user: User) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Database setup state
  const [showDbLink, setShowDbLink] = useState(false);
  const [dbUrl, setDbUrl] = useState(getDatabaseUrl());
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');

  const testConnection = async () => {
    setConnectionStatus('testing');
    setDatabaseUrl(dbUrl);
    const ok = await dbService.ping();
    setConnectionStatus(ok ? 'connected' : 'error');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        const user = await dbService.authenticate(username, password);
        if (user) {
          onLogin(user);
        } else {
          setError('Wrong name or password. Please try again.');
        }
      } else {
        const users = await dbService.getUsers();
        if (users.some(u => u.username === username)) {
          setError('That name is already taken. Try another one!');
          return;
        }
        
        const newUser: User = {
          id: crypto.randomUUID(),
          username,
          email,
          streakCount: 0,
          lastCompletedDate: null,
          joinDate: new Date().toISOString()
        };
        
        const savedUser = await dbService.saveUser(newUser, password);
        onLogin(savedUser);
      }
    } catch (err) {
      setError('Cannot connect to your data. Make sure the link is correct.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full"></div>
      </div>

      {/* <div className="max-w-md w-full space-y-8 bg-[#0a0a0a] p-10 rounded-[40px] border border-white/5 shadow-2xl relative z-10 overflow-hidden">
        {/* Connection toggle */}
        <button 
          onClick={() => setShowDbLink(!showDbLink)}
          className={`absolute top-8 right-8 w-10 h-10 rounded-full flex items-center justify-center transition-all ${showDbLink ? 'bg-blue-600 text-white rotate-90' : 'bg-white/5 text-slate-500 hover:text-white'}`}
          title="Connection Settings"
        >
          <i className="fa-solid fa-link text-sm"></i>
        </button>

        {showDbLink ? (
          <div className="py-4 animate-in fade-in zoom-in-95 duration-300">
            {/* <h3 className="text-xl font-black italic uppercase tracking-tighter mb-2">Data Connection</h3> */}
            {/* <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-8">Where we save your habits</p> */}
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] block mb-2 ml-1">Server Address</label>
                <input 
                  type="text" 
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                  placeholder="https://your-server.com/api"
                  className="w-full px-5 py-4 bg-black border border-slate-800 rounded-2xl text-white font-mono text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
              </div>

              <button 
                onClick={testConnection}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 ${
                  connectionStatus === 'connected' ? 'bg-green-600' : 
                  connectionStatus === 'error' ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {connectionStatus === 'testing' ? 'Checking...' : connectionStatus === 'idle' ? 'Link & Test' : connectionStatus === 'connected' ? 'Connected!' : 'Connection Failed'}
              </button> */}

              <button 
                onClick={() => setShowDbLink(false)}
                className="w-full text-slate-500 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.3)] mb-8">
                <i className="fa-solid fa-fire text-4xl text-white"></i>
              </div>
              <h2 className="text-4xl font-black text-white tracking-tighter italic uppercase">StreakFlow</h2>
              <p className="mt-2 text-slate-500 text-sm font-medium">
                {isLogin ? 'Welcome back! Sign in to continue.' : 'Start tracking your habits today.'}
              </p>
            </div>

            <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs font-bold text-center">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] block mb-2 ml-1">Your Name</label>
                  <input
                    type="text"
                    required
                    disabled={isLoading}
                    className="w-full px-5 py-4 bg-black border border-slate-800 rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800"
                    placeholder="Enter your name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                {!isLogin && (
                  <div>
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] block mb-2 ml-1">Email Address</label>
                    <input
                      type="email"
                      required
                      disabled={isLoading}
                      className="w-full px-5 py-4 bg-black border border-slate-800 rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] block mb-2 ml-1">Password</label>
                  <input
                    type="password"
                    required
                    disabled={isLoading}
                    className="w-full px-5 py-4 bg-black border border-slate-800 rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl active:scale-95 mt-6 disabled:opacity-50"
              >
                {isLoading ? 'Please Wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="text-center pt-4">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-slate-600 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
              >
                {isLogin ? "Need a new account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
