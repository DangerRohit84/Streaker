
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
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStreaks = allUsers.reduce((sum, u) => sum + u.streakCount, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-b-2 border-red-600 rounded-full animate-spin"></div>
        <p className="text-red-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Aggregating Global Records</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-red-600/30">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/10 blur-[120px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">Command Center</h1>
            <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Network Oversight</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-24">
        {/* Network Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 animate-in fade-in slide-in-from-bottom-5 duration-700">
          <div className="bg-white/[0.03] p-10 rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[9px] uppercase tracking-[0.4em] mb-4">Total Users</p>
            <span className="text-6xl font-black tracking-tighter italic">{allUsers.length}</span>
          </div>
          <div className="bg-white/[0.03] p-10 rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[9px] uppercase tracking-[0.4em] mb-4">Total Streak Points</p>
            <span className="text-6xl font-black tracking-tighter italic text-red-600">{totalStreaks}</span>
          </div>
          <div className="bg-white/[0.03] p-10 rounded-[2.5rem] border border-white/5 text-center shadow-xl">
            <p className="text-slate-500 font-black text-[9px] uppercase tracking-[0.4em] mb-4">Avg persistence</p>
            <span className="text-6xl font-black tracking-tighter italic">
              {allUsers.length > 0 ? (totalStreaks / allUsers.length).toFixed(1) : 0}
            </span>
          </div>
        </div>

        {/* Search & List */}
        <div className="bg-white/[0.02] rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
          <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <h2 className="text-2xl font-black italic uppercase">Persistence Ledger</h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search Identity..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-2xl px-12 py-3.5 text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-700"></i>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-600 text-[9px] font-black uppercase tracking-widest border-b border-white/5">
                  <th className="px-10 py-6">User Identity</th>
                  <th className="px-10 py-6">Current Streak</th>
                  <th className="px-10 py-6">Join Date</th>
                  <th className="px-10 py-6">Email</th>
                  <th className="px-10 py-6">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-transparent flex items-center justify-center font-black text-red-500 uppercase">
                          {u.username.substring(0, 2)}
                        </div>
                        <span className="text-lg font-black">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-black italic ${u.streakCount > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                          {u.streakCount}
                        </span>
                        {u.streakCount > 5 && <i className="fa-solid fa-bolt text-red-600 text-[10px] animate-pulse"></i>}
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <span className="text-slate-400 font-mono text-sm">{new Date(u.joinDate).toLocaleDateString()}</span>
                    </td>
                    <td className="px-10 py-6">
                      <span className="text-slate-500 text-sm">{u.email}</span>
                    </td>
                    <td className="px-10 py-6">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${u.role === 'admin' ? 'border-red-600/40 text-red-500 bg-red-600/5' : 'border-slate-800 text-slate-500'}`}>
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
