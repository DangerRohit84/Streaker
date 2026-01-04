
import React, { useState } from 'react';
import { dbService } from '../services/dbService';
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
          setError('Invalid credentials. Check your name and password.');
        }
      } else {
        const users = await dbService.getUsers();
        if (users.some(u => u.username === username)) {
          setError('Username already taken.');
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
    } catch (err: any) {
      setError(err.message || 'Identity verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020202] p-4 relative overflow-hidden font-sans">
      {/* Cinematic Background */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-red-900/10 blur-[150px] rounded-full"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-900/10 blur-[150px] rounded-full"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] contrast-150 pointer-events-none"></div>

      <div className="max-w-md w-full space-y-8 bg-white/[0.02] backdrop-blur-3xl p-8 md:p-14 rounded-[2.5rem] md:rounded-[3.5rem] border border-white/5 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] md:rounded-[2rem] bg-gradient-to-br from-red-600 to-red-800 shadow-[0_20px_50px_rgba(220,38,38,0.4)] mb-8 md:mb-10 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <i className="fa-solid fa-fire text-4xl md:text-5xl text-white"></i>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter italic uppercase leading-none">StrikeFlow</h2>
          <p className="mt-4 text-slate-500 text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] md:tracking-[0.5em]">
            {isLogin ? 'Establish Authentication' : 'Begin Your Ascent'}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-center">
              <i className="fa-solid fa-triangle-exclamation mr-2"></i> {error}
            </div>
          )}
          
          <div className="space-y-3 md:space-y-4">
            <div className="relative group">
              <input
                type="text"
                required
                disabled={isLoading}
                className="w-full px-6 md:px-8 py-4 md:py-5 bg-black/50 border border-white/10 rounded-xl md:rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-base md:text-lg"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <i className="fa-solid fa-user absolute right-5 md:right-6 top-1/2 -translate-y-1/2 text-slate-800 group-focus-within:text-red-600 transition-colors"></i>
            </div>
            
            {!isLogin && (
              <div className="relative group">
                <input
                  type="email"
                  required
                  disabled={isLoading}
                  className="w-full px-6 md:px-8 py-4 md:py-5 bg-black/50 border border-white/10 rounded-xl md:rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-base md:text-lg"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <i className="fa-solid fa-envelope absolute right-5 md:right-6 top-1/2 -translate-y-1/2 text-slate-800 group-focus-within:text-red-600 transition-colors"></i>
              </div>
            )}
            
            <div className="relative group">
              <input
                type="password"
                required
                disabled={isLoading}
                className="w-full px-6 md:px-8 py-4 md:py-5 bg-black/50 border border-white/10 rounded-xl md:rounded-2xl text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-base md:text-lg"
                placeholder="Access Token"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <i className="fa-solid fa-lock absolute right-5 md:right-6 top-1/2 -translate-y-1/2 text-slate-800 group-focus-within:text-red-600 transition-colors"></i>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-5 md:py-6 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[10px] md:text-[11px] rounded-xl md:rounded-[1.5rem] transition-all shadow-[0_20px_40px_rgba(220,38,38,0.3)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 group mt-4"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                {isLogin ? 'Authenticate' : 'Initiate Session'}
                <i className="fa-solid fa-arrow-right text-[10px] group-hover:translate-x-1 transition-transform"></i>
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-slate-600 hover:text-red-500 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b-2 border-transparent hover:border-red-600/30 pb-1"
          >
            {isLogin ? "Need new credentials?" : "Return to authentication"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
