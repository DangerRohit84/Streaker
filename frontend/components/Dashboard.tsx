
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, TaskDefinition, Task } from '../types';
import { dbService } from '../services/dbService';
import AdminDashboard from './AdminDashboard';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser: (user: User) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'progress' | 'settings' | 'admin'>('today');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReminderTime, setNewTaskReminderTime] = useState('');
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const getLocalDateStr = useCallback((date: Date = new Date()) => {
    return date.toLocaleDateString('en-CA');
  }, []);

  const triggerToast = (msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4500);
  };

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/599/599305.png'
      });
    }
  };

  /**
   * SEQUENCE VALIDATOR (NUCLEAR ENGINE)
   * Ensures the persistence log is a strictly contiguous sequence.
   * If it breaks, it purges EVERYTHING.
   */
  const performSequenceValidation = useCallback(async (currentUser: User) => {
    const todayStr = getLocalDateStr();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterdayDate);
    
    const safeLog = [...(currentUser.persistenceLog || [])].sort();
    const safeTaskDefs = currentUser.taskDefinitions || [];
    const lastActive = currentUser.lastActiveDate;

    let needsUpdate = false;
    let updatedUser = { ...currentUser };

    // 1. Day Transition: If we've moved to a new calendar day
    if (lastActive !== todayStr) {
      updatedUser.lastActiveDate = todayStr;
      updatedUser.completedToday = []; // Reset completions for the fresh day
      needsUpdate = true;
    }

    // 2. Strict Sequence Check
    // If the user has tasks and a history, we check for a breach
    if (safeTaskDefs.length > 0 && safeLog.length > 0) {
      const lastEntry = safeLog[safeLog.length - 1];
      
      // BREACH CONDITION A: Gap in activity
      // If the last success wasn't today or yesterday, the streak is dead.
      const streakIsBroken = lastEntry !== todayStr && lastEntry !== yesterdayStr;

      // BREACH CONDITION B: Incomplete "Yesterday"
      // If the user was active yesterday (lastActive === yesterdayStr) 
      // but didn't make it into the persistenceLog (wasLastActivePerfect === false)
      const wasActiveYesterday = lastActive === yesterdayStr;
      const finishedYesterday = safeLog.includes(yesterdayStr);
      const failedToFinishYesterday = wasActiveYesterday && !finishedYesterday;

      if (streakIsBroken || failedToFinishYesterday) {
        updatedUser.persistenceLog = [];
        updatedUser.streakCount = 0;
        needsUpdate = true;
        triggerToast("SEQUENCE BREACH: RELOAD WIPE ACTIVATED ☢️");
        sendNotification("StrikeFlow Alert", "The sequence was broken. Records have been purged.");
      }
    }

    if (needsUpdate) {
      try {
        const saved = await dbService.saveUser(updatedUser, undefined, true);
        onUpdateUser(saved);
      } catch (err) {
        console.warn("Validation sync failed");
        onUpdateUser(updatedUser);
      }
    }
  }, [getLocalDateStr, onUpdateUser]);

  // Mandatory checks on mount and visibility
  useEffect(() => {
    performSequenceValidation(user);
    
    const onFocus = () => performSequenceValidation(user);
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') performSequenceValidation(user);
    });

    const timer = setInterval(() => performSequenceValidation(user), 60000);
    
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [user.id]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newDef: TaskDefinition = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      reminderTime: newTaskReminderTime || undefined,
      createdAt: new Date().toISOString()
    };

    const updatedUser = {
      ...user,
      taskDefinitions: [...(user.taskDefinitions || []), newDef],
      persistenceLog: user.persistenceLog || [],
      completedToday: user.completedToday || []
    };
    
    try {
      const saved = await dbService.saveUser(updatedUser, undefined, true);
      onUpdateUser(saved);
      setNewTaskTitle('');
      setNewTaskReminderTime('');
      triggerToast("Sequence Element Locked 🔥");
    } catch (err) {
      triggerToast("Protocol Error");
    }
  };

  const toggleTask = async (taskId: string) => {
    const safeCompletedToday = user.completedToday || [];
    const safeTaskDefinitions = user.taskDefinitions || [];
    const safePersistenceLog = user.persistenceLog || [];

    const isCompleted = safeCompletedToday.includes(taskId);
    let newCompletedToday = isCompleted 
      ? safeCompletedToday.filter(id => id !== taskId)
      : [...safeCompletedToday, taskId];

    let updatedUser = { 
      ...user, 
      completedToday: newCompletedToday,
      taskDefinitions: safeTaskDefinitions,
      persistenceLog: safePersistenceLog
    };
    const today = getLocalDateStr();

    // Check for "Perfect Day"
    const allDone = safeTaskDefinitions.length > 0 && 
                    safeTaskDefinitions.every(def => newCompletedToday.includes(def.id));
    
    if (allDone) {
      if (!safePersistenceLog.includes(today)) {
        updatedUser.persistenceLog = [...safePersistenceLog, today].sort();
        updatedUser.streakCount = updatedUser.persistenceLog.length;
        triggerToast("DAY VALIDATED: YES LOGGED ⚡");
        sendNotification("StrikeFlow: Perfect Day!", `Sequence: ${updatedUser.streakCount} days.`);
      }
    } else {
      if (safePersistenceLog.includes(today)) {
        updatedUser.persistenceLog = safePersistenceLog.filter(d => d !== today);
        updatedUser.streakCount = updatedUser.persistenceLog.length;
        triggerToast("VALIDATION REMOVED");
      }
    }

    try {
      const saved = await dbService.saveUser(updatedUser, undefined, true);
      onUpdateUser(saved);
    } catch (err) {
      triggerToast("Sync Node Failure");
      onUpdateUser(updatedUser);
    }
  };

  const deleteTask = async (taskId: string) => {
    const safeTaskDefinitions = user.taskDefinitions || [];
    const safeCompletedToday = user.completedToday || [];
    const safePersistenceLog = user.persistenceLog || [];

    const updatedUser = {
      ...user,
      taskDefinitions: safeTaskDefinitions.filter(d => d.id !== taskId),
      completedToday: safeCompletedToday.filter(id => id !== taskId),
      persistenceLog: safePersistenceLog
    };

    const today = getLocalDateStr();
    const allDone = updatedUser.taskDefinitions.length > 0 && 
                    updatedUser.taskDefinitions.every(def => updatedUser.completedToday.includes(def.id));
    
    if (allDone && !updatedUser.persistenceLog.includes(today)) {
      updatedUser.persistenceLog = [...updatedUser.persistenceLog, today].sort();
    } else if (!allDone && updatedUser.persistenceLog.includes(today)) {
      updatedUser.persistenceLog = updatedUser.persistenceLog.filter(d => d !== today);
    }
    
    updatedUser.streakCount = updatedUser.persistenceLog.length;

    try {
      const saved = await dbService.saveUser(updatedUser, undefined, true);
      onUpdateUser(saved);
      triggerToast("Element Purged");
    } catch (err) {
      triggerToast("Purge Error");
    }
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentMonth]);

  const doneCount = (user.completedToday || []).length;
  const totalCount = (user.taskDefinitions || []).length;
  const todayIsPerfect = totalCount > 0 && doneCount === totalCount;

  if (activeTab === 'admin') {
    return <AdminDashboard onBack={() => setActiveTab('today')} />;
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-red-600/30 pb-10">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[50%] bg-red-900/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[80%] h-[50%] bg-red-900/10 blur-[150px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col xl:flex-row items-center justify-between gap-8 md:gap-10">
        <div className="flex items-center gap-4 md:gap-6 group">
          <div className="p-4 md:p-5 bg-red-600 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_15px_40px_rgba(220,38,38,0.4)] transition-all group-hover:scale-105">
            <i className="fa-solid fa-fire text-2xl md:text-3xl"></i>
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter">StrikeFlow</h1>
            <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.4em] mt-1">V13: Zero-Gap Permadeath</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2 bg-white/[0.03] backdrop-blur-3xl p-2 rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 shadow-2xl">
          {['today', 'progress', 'settings'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 md:px-10 py-2.5 md:py-4 rounded-xl md:rounded-2xl text-[10px] md:text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-red-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-200'}`}
            >
              {tab}
            </button>
          ))}
          {user.role === 'admin' && (
            <button onClick={() => setActiveTab('admin')} className="px-6 md:px-10 py-2.5 md:py-4 rounded-xl md:rounded-2xl text-[10px] md:text-[12px] font-black uppercase tracking-widest transition-all text-red-500 border border-red-500/20 hover:bg-red-500/10">Admin</button>
          )}
          <button onClick={onLogout} className="px-4 md:px-6 py-2.5 md:py-4 text-slate-700 hover:text-red-500 text-[10px] md:text-[12px] font-black uppercase tracking-widest transition-all">Sign Out</button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {activeTab === 'today' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
            <div className="lg:col-span-4 space-y-6 md:space-y-8 animate-in fade-in slide-in-from-left-5 duration-700">
              <div className={`p-8 md:p-14 rounded-[2.5rem] md:rounded-[4rem] border transition-all duration-700 text-center relative overflow-hidden group shadow-3xl ${todayIsPerfect ? 'bg-red-600/10 border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.2)]' : 'bg-white/[0.03] border-white/5'}`}>
                <p className="text-slate-500 font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-6 md:mb-10">Consecutive Successes</p>
                <div className="flex items-center justify-center gap-4">
                  <span className={`text-[90px] md:text-[160px] font-black leading-none tracking-tighter ${todayIsPerfect ? 'text-white drop-shadow-[0_0_20px_white]' : 'text-slate-300'}`}>
                    {(user.persistenceLog || []).length}
                  </span>
                  <i className={`fa-solid fa-bolt text-3xl md:text-6xl ${todayIsPerfect ? 'text-red-500' : 'text-slate-800'}`}></i>
                </div>
                <p className={`mt-6 md:mt-10 text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] italic ${todayIsPerfect ? 'text-red-500' : 'text-slate-700'}`}>
                  {todayIsPerfect ? 'Active Node Secured' : 'Sequence Validation Pending'}
                </p>
              </div>

              <div className="bg-white/[0.03] p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 shadow-2xl">
                 <div className="flex justify-between items-end mb-6 md:mb-8">
                    <h3 className="text-3xl md:text-5xl font-black italic">{doneCount}<span className="text-slate-800 text-lg md:text-2xl not-italic ml-2">/ {totalCount}</span></h3>
                    <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-slate-500">{totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%</span>
                 </div>
                 <div className="h-3 md:h-4 bg-black/40 rounded-full overflow-hidden p-1 border border-white/5">
                    <div className={`h-full rounded-full transition-all duration-1000 ${todayIsPerfect ? 'bg-white' : 'bg-red-600'}`} style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8 md:space-y-10 animate-in fade-in slide-in-from-right-10 duration-700">
              <form onSubmit={addTask} className="bg-white/[0.02] p-6 md:p-10 rounded-[2.5rem] md:rounded-[4.5rem] border border-white/5 space-y-6 md:space-y-10 shadow-3xl backdrop-blur-3xl relative">
                <div className="flex flex-col gap-4 md:gap-8">
                  <input
                    type="text"
                    placeholder="New Persistence Element..."
                    className="w-full bg-black/60 border border-white/10 rounded-2xl md:rounded-[2.5rem] px-6 md:px-10 py-4 md:py-6 text-white font-black focus:ring-4 focus:ring-red-600/20 focus:outline-none transition-all placeholder:text-slate-800 text-xl md:text-3xl"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                  <div className="flex flex-col sm:flex-row gap-4 md:gap-6">
                    <input
                      type="time"
                      className="flex-1 bg-black/60 border border-white/10 rounded-xl md:rounded-[2rem] px-6 md:px-8 py-3.5 md:py-5 text-white font-black [color-scheme:dark]"
                      value={newTaskReminderTime}
                      onChange={(e) => setNewTaskReminderTime(e.target.value)}
                    />
                    <button type="submit" className="px-10 md:px-16 py-3.5 md:py-5 bg-red-600 hover:bg-red-500 text-white rounded-xl md:rounded-[2rem] font-black uppercase text-[12px] md:text-[14px] tracking-[0.2em] transition-all active:scale-95 shadow-2xl">Deploy</button>
                  </div>
                </div>
              </form>

              <div className="space-y-4 md:space-y-6">
                {(user.taskDefinitions || []).map(def => {
                  const completed = (user.completedToday || []).includes(def.id);
                  return (
                    <div key={def.id} className={`group flex items-center gap-4 md:gap-8 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border transition-all duration-700 ${completed ? 'bg-red-600/[0.02] border-red-600/20 opacity-40' : 'bg-white/[0.03] border-white/5 hover:border-white/10 shadow-2xl md:hover:translate-x-2'}`}>
                      <button onClick={() => toggleTask(def.id)} className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[2rem] border-2 flex items-center justify-center transition-all duration-500 ${completed ? 'bg-red-600 border-red-600' : 'border-slate-800 hover:border-red-600'}`}>
                        {completed && <i className="fa-solid fa-check text-white text-xl md:text-2xl"></i>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xl md:text-3xl font-black truncate ${completed ? 'line-through text-slate-700 italic' : 'text-slate-100'}`}>{def.title}</p>
                        {def.reminderTime && (
                           <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 block mt-1"><i className="fa-regular fa-bell mr-1.5"></i>{def.reminderTime}</span>
                        )}
                      </div>
                      <button onClick={() => deleteTask(def.id)} className="text-slate-800 hover:text-red-500 p-2 md:p-4 transition-all opacity-100 md:opacity-0 group-hover:opacity-100">
                        <i className="fa-solid fa-trash-can text-lg md:text-2xl"></i>
                      </button>
                    </div>
                  );
                })}
                {totalCount === 0 && (
                  <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[3rem]">
                    <p className="text-slate-800 font-black uppercase tracking-[0.4em] text-xs">Awaiting Initial Definition</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'progress' ? (
          <div className="max-w-4xl mx-auto space-y-10 md:space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">Persistence History</h2>
                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10 shadow-2xl w-fit">
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 hover:text-red-500 transition-colors"><i className="fa-solid fa-chevron-left text-sm"></i></button>
                   <span className="text-[11px] md:text-[13px] font-black uppercase tracking-[0.2em] min-w-[140px] md:min-w-[180px] text-center">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 hover:text-red-500 transition-colors"><i className="fa-solid fa-chevron-right text-sm"></i></button>
                </div>
             </div>
             <div className="bg-white/[0.02] p-6 sm:p-10 md:p-16 rounded-[2.5rem] md:rounded-[4rem] border border-white/5 shadow-3xl backdrop-blur-2xl overflow-x-auto">
                <div className="min-w-[320px]">
                  <div className="grid grid-cols-7 gap-2 md:gap-6 mb-8 md:mb-12 text-center">
                    {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-[10px] md:text-[12px] font-black text-slate-800 uppercase tracking-widest">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-2 md:gap-6">
                    {calendarDays.map((date, idx) => {
                      if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                      const dStr = getLocalDateStr(date);
                      const status = (user.persistenceLog || []).includes(dStr) ? 'complete' : 'none';
                      const isToday = dStr === getLocalDateStr();
                      return (
                        <div key={idx} className={`aspect-square rounded-[1rem] md:rounded-[2rem] flex items-center justify-center transition-all duration-500 group relative ${status === 'complete' ? 'bg-red-600 shadow-xl' : 'bg-white/5 border border-white/5'} ${isToday ? 'ring-2 ring-white ring-offset-4 ring-offset-black' : ''}`}>
                          <span className={`text-base md:text-lg font-black ${status === 'complete' ? 'text-white' : 'text-slate-800'}`}>{date.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
             </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-10 md:space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
             <h2 className="text-4xl md:text-5xl font-black italic uppercase text-center tracking-tighter">Configuration</h2>
             <div className="bg-white/[0.02] p-10 md:p-20 rounded-[3rem] md:rounded-[5rem] border border-white/5 shadow-3xl space-y-10 md:space-y-16 backdrop-blur-3xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-8 text-center sm:text-left">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black italic">Push Core</h3>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Persistence Pulse Enabled</p>
                  </div>
                  <button onClick={() => Notification.requestPermission()} className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-xl md:rounded-2xl text-[10px] md:text-[12px] font-black uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95">Link Device</button>
                </div>
                <div className="pt-10 md:pt-16 border-t border-white/5 text-center">
                  <p className="text-[10px] md:text-[12px] font-black text-slate-800 uppercase tracking-[0.4em] italic leading-loose">
                    Storage Engine: INTERNAL-ARRAY-V13 <br className="sm:hidden"/>
                    Validation: CONTIGUITY-PROTOCOL
                  </p>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Alert Overlay */}
      <div className={`fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 transition-all duration-700 z-50 w-[92%] sm:w-auto ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20 pointer-events-none'}`}>
        <div className="bg-white text-black px-8 md:px-16 py-5 md:py-8 rounded-2xl md:rounded-full shadow-4xl font-black text-[12px] md:text-[14px] uppercase tracking-[0.3em] flex items-center justify-center gap-4 md:gap-8 border-b-4 md:border-b-8 border-red-600">
          <i className="fa-solid fa-bolt-lightning text-red-600 animate-pulse text-xl md:text-2xl"></i>
          <span className="truncate">{toast.message}</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
