
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { dbService } from '../services/dbService';

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const users = await dbService.getAdminUsers();
        setAllUsers(users);
      } catch (err) {
        console.error("Admin fetch failed", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, []);

  const filteredUsers = allUsers.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalStreaks = allUsers.reduce((sum, u) => sum + u.streakCount, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-12 md:w-16 h-12 md:h-16 border-b-2 border-red-600 rounded-full animate-spin"></div>
        <p className="text-red-600 font-black uppercase tracking-[0.3em] text-[9px] md:text-[10px] animate-pulse text-center">Aggregating Global Records</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-red-600/30">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/10 blur-[120px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-6">
          <button onClick={onBack} className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
            <i className="fa-solid fa-arrow-left text-sm"></i>
          </button>
          <div>
            <h1 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter">Command Center</h1>
            <p className="text-slate-600 text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] mt-1">Network Oversight</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        {/* Network Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mb-10 md:mb-16 animate-in fade-in slide-in-from-bottom-5 duration-700">
          <div className="bg-white/[0.03] p-8 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[8px] md:text-[9px] uppercase tracking-[0.3em] mb-3 md:mb-4">Total Users</p>
            <span className="text-4xl md:text-6xl font-black tracking-tighter italic">{allUsers.length}</span>
          </div>
          <div className="bg-white/[0.03] p-8 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[8px] md:text-[9px] uppercase tracking-[0.3em] mb-3 md:mb-4">Total Streaks</p>
            <span className="text-4xl md:text-6xl font-black tracking-tighter italic text-red-600">{totalStreaks}</span>
          </div>
          <div className="bg-white/[0.03] p-8 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[8px] md:text-[9px] uppercase tracking-[0.3em] mb-3 md:mb-4">Avg persistence</p>
            <span className="text-4xl md:text-6xl font-black tracking-tighter italic">
              {allUsers.length > 0 ? (totalStreaks / allUsers.length).toFixed(1) : 0}
            </span>
          </div>
        </div>

        {/* Search & List */}
        <div className="bg-white/[0.02] rounded-[2rem] md:rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <h2 className="text-xl md:text-2xl font-black italic uppercase">Persistence Ledger</h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search Identity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-auto bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-12 py-3 text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-sm"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-700"></i>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="text-slate-600 text-[8px] md:text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="px-6 md:px-10 py-4 md:py-6">User Identity</th>
                  <th className="px-6 md:px-10 py-4 md:py-6">Current Streak</th>
                  <th className="px-6 md:px-10 py-4 md:py-6">Join Date</th>
                  <th className="px-6 md:px-10 py-4 md:py-6">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 md:px-10 py-4 md:py-6">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br from-red-600/20 to-transparent flex items-center justify-center font-black text-red-500 uppercase text-xs md:text-sm">
                          {u.username.substring(0, 2)}
                        </div>
                        <span className="text-base md:text-lg font-black truncate">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-4 md:py-6">
                      <div className="flex items-center gap-2 md:gap-3">
                        <span className={`text-xl md:text-2xl font-black italic ${u.streakCount > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                          {u.streakCount}
                        </span>
                        {u.streakCount > 5 && <i className="fa-solid fa-bolt text-red-600 text-[9px] animate-pulse"></i>}
                      </div>
                    </td>
                    <td className="px-6 md:px-10 py-4 md:py-6">
                      <span className="text-slate-400 font-mono text-xs md:text-sm">{new Date(u.joinDate).toLocaleDateString()}</span>
                    </td>
                    <td className="px-6 md:px-10 py-4 md:py-6">
                      <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded md:rounded-lg border ${u.role === 'admin' ? 'border-red-600/40 text-red-500 bg-red-600/5' : 'border-slate-800 text-slate-500'}`}>
                        {u.role || 'user'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
