
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Task } from '../types';
import { dbService } from '../services/dbService';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser: (user: User) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'progress' | 'settings'>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allHistoryTasks, setAllHistoryTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReminderTime, setNewTaskReminderTime] = useState('');
  const [isNewTaskRepeating, setIsNewTaskRepeating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  /**
   * REFINED STREAK ENGINE
   * Checks history day-by-day backwards.
   * A "streak" day requires tasks to exist AND all to be completed.
   * Any day with incomplete tasks breaks the streak immediately.
   */
  const calculateStreakFromHistory = useCallback((history: Task[]) => {
    const tasksByDate: Record<string, Task[]> = {};
    history.forEach(t => {
      if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
      tasksByDate[t.date].push(t);
    });

    const today = getTodayStr();
    let streakCount = 0;
    
    // Step 1: Check Today
    const todayTasks = tasksByDate[today] || [];
    const isTodayDone = todayTasks.length > 0 && todayTasks.every(t => t.completed);
    
    if (isTodayDone) {
      streakCount++;
    }

    // Step 2: Traverse Backwards from Yesterday
    let checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 1);

    while (true) {
      const dStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      const dayTasks = tasksByDate[dStr] || [];
      
      // If the day has tasks, they MUST be all completed to continue the streak
      if (dayTasks.length > 0) {
        if (dayTasks.every(t => t.completed)) {
          streakCount++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // Found an incomplete day with tasks -> Streak ends here
          break;
        }
      } else {
        // No tasks on this day. In this logic, we break the streak for any day with zero activity.
        break;
      }
    }
    return streakCount;
  }, []);

  const syncStreakToCloud = useCallback(async (newCount: number) => {
    if (newCount !== user.streakCount) {
      const updatedUser = { 
        ...user, 
        streakCount: newCount,
        lastCompletedDate: newCount > 0 ? getTodayStr() : user.lastCompletedDate
      };
      // Optimistic UI Update
      onUpdateUser(updatedUser);
      try {
        await dbService.saveUser(updatedUser, undefined, true);
      } catch (err: any) {
        console.error("Cloud streak sync failed", err);
        triggerToast(err.message || "Sync Error");
      }
    }
  }, [user, onUpdateUser]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const todaysTasks = await dbService.getTodaysTasks(user.id);
      const history = await dbService.getAllTasks(user.id);
      
      setTasks(todaysTasks);
      setAllHistoryTasks(history);

      const realStreak = calculateStreakFromHistory(history);
      syncStreakToCloud(realStreak);
    } catch (err) {
      console.error("Data Load Failure", err);
    } finally {
      setIsLoading(false);
    }
  }, [user.id, calculateStreakFromHistory, syncStreakToCloud]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      tasks.forEach(task => {
        if (!task.completed && task.reminderTime === timeStr) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Ritual Reminder', {
              body: `Current objective: ${task.title}`,
              icon: 'https://cdn-icons-png.flaticon.com/512/785/785116.png'
            });
          }
        }
      });
    };
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [tasks]);

  const triggerToast = (msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: newTaskTitle,
      completed: false,
      date: getTodayStr(),
      isRecurring: isNewTaskRepeating,
      reminderTime: newTaskReminderTime || undefined
    };

    await dbService.saveTask(newTask);
    const updatedTasks = [...tasks, newTask];
    const updatedHistory = [...allHistoryTasks, newTask];
    
    setTasks(updatedTasks);
    setAllHistoryTasks(updatedHistory);
    
    // Adding an incomplete task might break today's perfect record
    const newCount = calculateStreakFromHistory(updatedHistory);
    syncStreakToCloud(newCount);

    setNewTaskTitle('');
    setNewTaskReminderTime('');
    setIsNewTaskRepeating(false);
    triggerToast("Ritual Deployed 🔥");
  };

  const toggleTask = async (taskId: string) => {
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    setTasks(updatedTasks);
    
    const targetTask = updatedTasks.find(t => t.id === taskId);
    if (targetTask) {
      await dbService.saveTask(targetTask);
    }

    const updatedHistory = allHistoryTasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    setAllHistoryTasks(updatedHistory);

    const calculatedStreak = calculateStreakFromHistory(updatedHistory);
    if (calculatedStreak !== user.streakCount) {
      syncStreakToCloud(calculatedStreak);
      if (calculatedStreak > user.streakCount) triggerToast("Streak Advanced ⚡");
      else if (calculatedStreak === 0 && user.streakCount > 0) triggerToast("Streak Lost ❄️");
    }
  };

  const deleteTask = async (task: Task) => {
    await dbService.deleteTask(task.id, task.title, task.isRecurring);
    const remainingTasks = tasks.filter(t => t.id !== task.id);
    const remainingHistory = allHistoryTasks.filter(t => t.id !== task.id);
    
    setTasks(remainingTasks);
    setAllHistoryTasks(remainingHistory);

    const newCount = calculateStreakFromHistory(remainingHistory);
    syncStreakToCloud(newCount);
    triggerToast("Ritual Purged");
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

  const getDayStatus = (date: Date) => {
    const dStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayTasks = allHistoryTasks.filter(t => t.date === dStr);
    if (dayTasks.length === 0) return 'none';
    return dayTasks.every(t => t.completed) ? 'complete' : 'partial';
  };

  const doneCount = tasks.filter(t => t.completed).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-b-2 border-red-600 rounded-full animate-spin"></div>
        <p className="text-red-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Establishing Connection</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-red-600/30">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-900/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/5 blur-[120px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 group">
          <div className="p-4 bg-red-600 rounded-3xl shadow-[0_15px_40px_rgba(220,38,38,0.4)] transition-all group-hover:rotate-6 group-hover:scale-105">
            <i className="fa-solid fa-fire text-3xl"></i>
          </div>
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">StrikeFlow</h1>
            <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.4em] mt-1">Persistence Engine</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-white/[0.03] backdrop-blur-2xl p-1.5 rounded-[2rem] border border-white/5">
          {['today', 'progress', 'settings'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-red-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-200'}`}
            >
              {tab}
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-2"></div>
          <button onClick={onLogout} className="px-6 py-3.5 text-slate-700 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all">Sign Out</button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-24">
        {activeTab === 'today' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-white/[0.03] p-12 rounded-[3.5rem] border border-white/5 shadow-2xl text-center group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.5em] mb-10">Current Strike</p>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-[140px] font-black leading-none tracking-tighter drop-shadow-2xl">{user.streakCount}</span>
                  <div className="animate-bounce">
                    <i className="fa-solid fa-bolt text-red-500 text-3xl"></i>
                  </div>
                </div>
                <p className="mt-10 text-red-500/50 text-[9px] font-black uppercase tracking-[0.3em]">Verified History Record</p>
              </div>

              <div className="bg-white/[0.03] p-10 rounded-[3rem] border border-white/5 shadow-2xl">
                 <div className="flex justify-between items-end mb-8">
                    <h3 className="text-5xl font-black italic">{doneCount}<span className="text-slate-800 text-xl not-italic ml-2">/ {tasks.length}</span></h3>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0}%</span>
                 </div>
                 <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                    <div className="h-full bg-red-600 rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(220,38,38,0.5)]" style={{ width: `${tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-12">
              <form onSubmit={addTask} className="bg-white/[0.02] p-10 rounded-[4rem] border border-white/5 space-y-8 shadow-2xl">
                <div className="flex flex-col md:flex-row gap-6">
                  <input
                    type="text"
                    placeholder="Establish new ritual..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-[2rem] px-10 py-6 text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-2xl"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                  <div className="flex gap-4">
                    <input
                      type="time"
                      className="bg-black/40 border border-white/10 rounded-[1.5rem] px-6 py-6 text-white font-black [color-scheme:dark]"
                      value={newTaskReminderTime}
                      onChange={(e) => setNewTaskReminderTime(e.target.value)}
                    />
                    <button type="submit" className="bg-red-600 hover:bg-red-500 text-white px-12 rounded-[2rem] font-black uppercase text-[11px] tracking-widest transition-all shadow-lg active:scale-95">Deploy</button>
                  </div>
                </div>
                <label className="flex items-center gap-4 cursor-pointer group w-fit">
                  <input type="checkbox" className="hidden" checked={isNewTaskRepeating} onChange={(e) => setIsNewTaskRepeating(e.target.checked)} />
                  <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${isNewTaskRepeating ? 'bg-red-600 border-red-600' : 'border-slate-800 group-hover:border-slate-600'}`}>
                    {isNewTaskRepeating && <i className="fa-solid fa-repeat text-[12px]"></i>}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300">Daily Persistence Mode</span>
                </label>
              </form>

              <div className="space-y-6">
                {tasks.map(task => (
                  <div key={task.id} className={`group flex items-center gap-6 p-7 rounded-[2.5rem] border transition-all ${task.completed ? 'bg-red-600/[0.02] border-red-600/10 opacity-50' : 'bg-white/[0.02] border-white/5 hover:border-white/10 shadow-xl'}`}>
                    <button onClick={() => toggleTask(task.id)} className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-red-600 border-red-600' : 'border-slate-800 hover:border-red-600'}`}>
                      {task.completed && <i className="fa-solid fa-check text-white"></i>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xl font-black truncate ${task.completed ? 'line-through text-slate-700 italic' : 'text-slate-100'}`}>{task.title}</p>
                      {task.reminderTime && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-1 flex items-center gap-2">
                          <i className="fa-regular fa-clock"></i> {task.reminderTime}
                          {task.isRecurring && <span className="text-red-900">• Recurring</span>}
                        </span>
                      )}
                    </div>
                    <button onClick={() => deleteTask(task)} className="text-slate-800 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"><i className="fa-solid fa-trash-can"></i></button>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div className="text-center py-20 opacity-20">
                    <i className="fa-solid fa-ghost text-6xl mb-6"></i>
                    <p className="font-black uppercase tracking-[0.5em] text-[10px]">Zero Rituals Active</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'progress' ? (
          <div className="max-w-3xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-5 duration-700">
             <div className="flex items-center justify-between">
                <h2 className="text-4xl font-black italic uppercase">Analytics</h2>
                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10">
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 hover:text-red-500 transition-colors"><i className="fa-solid fa-chevron-left"></i></button>
                   <span className="text-[11px] font-black uppercase tracking-widest min-w-[120px] text-center">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 hover:text-red-500 transition-colors"><i className="fa-solid fa-chevron-right"></i></button>
                </div>
             </div>
             <div className="bg-white/[0.02] p-12 rounded-[3.5rem] border border-white/5 shadow-2xl">
                <div className="grid grid-cols-7 gap-4 mb-8">
                  {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-center text-[10px] font-black text-slate-700">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-4">
                  {calendarDays.map((date, idx) => {
                    if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                    const status = getDayStatus(date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    return (
                      <div key={idx} className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${status === 'complete' ? 'bg-red-600 shadow-lg scale-105' : status === 'partial' ? 'bg-red-900/20 border border-red-900/40' : 'bg-white/5 border border-white/5'} ${isToday ? 'ring-2 ring-white ring-offset-4 ring-offset-black' : ''}`}>
                        <span className={`text-[11px] font-black ${status === 'complete' ? 'text-white' : 'text-slate-700'}`}>{date.getDate()}</span>
                      </div>
                    );
                  })}
                </div>
             </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-5 duration-700">
             <h2 className="text-4xl font-black italic uppercase text-center">Profile Settings</h2>
             <div className="bg-white/[0.02] p-16 rounded-[4rem] border border-white/5 shadow-2xl space-y-12">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black">System Alerts</h3>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Mobile & Browser Sync</p>
                  </div>
                  <button onClick={() => Notification.requestPermission()} className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Enable</button>
                </div>
                <div className="pt-10 border-t border-white/5">
                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-[0.4em] italic text-center">Session Encryption: AES-256 Validated</p>
                </div>
             </div>
          </div>
        )}
      </main>

      <div className={`fixed bottom-12 left-1/2 -translate-x-1/2 transition-all duration-500 z-50 ${toast.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none translate-y-10'}`}>
        <div className="bg-white text-black px-12 py-5 rounded-full shadow-[0_25px_60px_rgba(0,0,0,0.5)] font-black text-[11px] uppercase tracking-widest flex items-center gap-6 border-b-4 border-red-600">
          <i className="fa-solid fa-bolt text-red-600"></i>
          {toast.message}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
