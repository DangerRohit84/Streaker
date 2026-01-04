
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Task } from '../types';
import { dbService } from '../services/dbService';
import AdminDashboard from './AdminDashboard';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser: (user: User) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'progress' | 'settings' | 'admin'>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allHistoryTasks, setAllHistoryTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReminderTime, setNewTaskReminderTime] = useState('');
  const [isNewTaskRepeating, setIsNewTaskRepeating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const lastCheckedDate = useRef<string>(new Date().toLocaleDateString('en-CA'));

  const getLocalDateStr = useCallback((date: Date = new Date()) => {
    return date.toLocaleDateString('en-CA');
  }, []);

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://cdn-icons-png.flaticon.com/512/599/599305.png'
      });
    }
  };

  /**
   * STREAK ENGINE 9.0 (Hard Reset + Future Purge)
   * Streak resets to 0 if any day with tasks was left incomplete.
   * If a failure occurred in the past, all tasks after that date are deleted.
   */
  const analyzeStreakAndFailures = useCallback((history: Task[]) => {
    if (!history || history.length === 0) return { streak: 0, failureDate: null };
    
    const tasksByDate: Record<string, Task[]> = {};
    history.forEach(t => {
      if (!t.date) return;
      if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
      tasksByDate[t.date].push(t);
    });

    const sortedDates = Object.keys(tasksByDate).sort((a, b) => b.localeCompare(a));
    const todayStr = getLocalDateStr();
    const joinDateStr = user.joinDate.split('T')[0];

    const isDayPerfect = (dateStr: string) => {
      const dayTasks = tasksByDate[dateStr] || [];
      if (dayTasks.length === 0) return false;
      return dayTasks.every(t => t.completed);
    };

    let streak = 0;
    let failureDate: string | null = null;
    let checkDate = new Date();
    
    const todayIsPerfect = isDayPerfect(todayStr);
    
    let yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIsPerfect = isDayPerfect(getLocalDateStr(yesterday));

    // Determine current streak state
    if (todayIsPerfect) {
      streak = 1;
      checkDate = yesterday;
    } else if (yesterdayIsPerfect) {
      streak = 0; 
      checkDate = yesterday;
    } else {
      // If today is not perfect AND yesterday was not perfect,
      // the failure happened yesterday or earlier.
      streak = 0;
      failureDate = getLocalDateStr(yesterday);
    }

    if (streak > 0 || yesterdayIsPerfect) {
      let safety = 0;
      while (safety < 3650) {
        const dStr = getLocalDateStr(checkDate);
        if (isDayPerfect(dStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          if (dStr < joinDateStr) break;
          // Found the failure gap!
          failureDate = dStr;
          break;
        }
        safety++;
      }
    }

    return { streak, failureDate };
  }, [user.joinDate, getLocalDateStr]);

  const syncStreakToCloud = useCallback(async (newCount: number) => {
    if (newCount !== user.streakCount) {
      const updatedUser = { 
        ...user, 
        streakCount: newCount,
        lastCompletedDate: newCount > 0 ? getLocalDateStr() : user.lastCompletedDate
      };
      onUpdateUser(updatedUser);
      try {
        await dbService.saveUser(updatedUser, undefined, true);
      } catch (err) {
        console.warn("Sync deferred");
      }
    }
  }, [user, onUpdateUser, getLocalDateStr]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let history = await dbService.getAllTasks(user.id);
      const { streak, failureDate } = analyzeStreakAndFailures(history);
      
      // HARD RESET LOGIC: If a failure occurred before today, purge all "remaining" tasks after it
      if (failureDate) {
        const today = getLocalDateStr();
        // If the failure date is in the past, and there is history after it, purge.
        const tasksAfterFailure = history.filter(t => t.date > failureDate);
        if (tasksAfterFailure.length > 0) {
           triggerToast("SEQUENCE BREACH: PURGING POST-FAILURE DATA");
           await dbService.purgeTasksAfterDate(user.id, failureDate);
           // Refresh history after purge
           history = await dbService.getAllTasks(user.id);
        }
      }

      const today = getLocalDateStr();
      const todaysActual = history.filter(t => t.date === today);
      const recurringTemplates = history.filter(t => t.isRecurring);
      
      const ritualMap = new Map<string, Task>();
      recurringTemplates.forEach(t => {
        if (!ritualMap.has(t.title) || t.date > ritualMap.get(t.title)!.date) {
          ritualMap.set(t.title, t);
        }
      });

      const existingTitles = new Set(todaysActual.map(t => t.title));
      const virtualRituals: Task[] = [];
      
      ritualMap.forEach((template, title) => {
        if (!existingTitles.has(title)) {
          const { _id, __v, ...cleanTemplate } = template as any;
          virtualRituals.push({
            ...cleanTemplate,
            id: `virtual-${template.id}-${today}`,
            date: today,
            completed: false 
          });
        }
      });

      const currentTasks = [...todaysActual, ...virtualRituals];
      setTasks(currentTasks);
      setAllHistoryTasks(history);
      syncStreakToCloud(streak);
    } catch (err) {
      triggerToast("Sync Error");
    } finally {
      setIsLoading(false);
    }
  }, [user.id, analyzeStreakAndFailures, syncStreakToCloud, getLocalDateStr]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = getLocalDateStr();
      if (now !== lastCheckedDate.current) {
        lastCheckedDate.current = now;
        loadData();
        triggerToast("New Day: Sequence Reset 🌑");
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData, getLocalDateStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      date: getLocalDateStr(),
      isRecurring: isNewTaskRepeating,
      reminderTime: newTaskReminderTime || undefined
    };

    try {
      await dbService.saveTask(newTask);
      const updatedHistory = [...allHistoryTasks, newTask];
      setTasks(prev => [...prev, newTask]);
      setAllHistoryTasks(updatedHistory);
      
      const { streak } = analyzeStreakAndFailures(updatedHistory);
      syncStreakToCloud(streak);
      
      setNewTaskTitle('');
      setNewTaskReminderTime('');
      setIsNewTaskRepeating(false);
      triggerToast("Objective Locked 🔥");
    } catch (err) {
      triggerToast("Deployment Error");
    }
  };

  const toggleTask = async (taskId: string) => {
    const target = tasks.find(t => t.id === taskId);
    if (!target) return;

    const isVirtual = taskId.startsWith('virtual-');
    const { _id, __v, ...cleanTarget } = target as any;
    let updated = { ...cleanTarget, completed: !target.completed };
    
    if (isVirtual) {
      updated.id = crypto.randomUUID();
    }

    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    
    try {
      await dbService.saveTask(updated);
      const updatedHistory = isVirtual 
        ? [...allHistoryTasks, updated]
        : allHistoryTasks.map(t => t.id === taskId ? updated : t);
      
      setAllHistoryTasks(updatedHistory);
      const { streak } = analyzeStreakAndFailures(updatedHistory);
      syncStreakToCloud(streak);
      
      if (updated.completed) {
        triggerToast("Validated ⚡");
        sendNotification("Objective Secured", `You've completed: ${updated.title}`);
      }
    } catch (err) {
      triggerToast("Sync Node Failure");
      setTasks(prev => prev.map(t => t.id === updated.id ? target : t));
    }
  };

  const deleteTask = async (task: Task) => {
    try {
      if (!task.id.startsWith('virtual-')) {
        await dbService.deleteTask(task.id, task.title, task.isRecurring);
      }
      const remainingTasks = tasks.filter(t => t.id !== task.id);
      const remainingHistory = allHistoryTasks.filter(t => t.id !== task.id);
      setTasks(remainingTasks);
      setAllHistoryTasks(remainingHistory);
      const { streak } = analyzeStreakAndFailures(remainingHistory);
      syncStreakToCloud(streak);
      triggerToast("Purged");
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

  const getDayStatus = (date: Date) => {
    const dStr = getLocalDateStr(date);
    const dayTasks = allHistoryTasks.filter(t => t.date === dStr);
    if (dayTasks.length === 0) return 'none';
    return dayTasks.every(t => t.completed) ? 'complete' : 'partial';
  };

  const doneCount = tasks.filter(t => t.completed).length;
  const todayIsPerfect = tasks.length > 0 && doneCount === tasks.length;

  if (activeTab === 'admin') {
    return <AdminDashboard onBack={() => setActiveTab('today')} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center">
        <div className="w-16 h-16 border-t-2 border-red-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-red-600/30 pb-10">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[50%] bg-red-900/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[80%] h-[50%] bg-red-900/10 blur-[150px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-6 py-12 flex flex-col xl:flex-row items-center justify-between gap-10">
        <div className="flex items-center gap-6 group">
          <div className="p-5 bg-red-600 rounded-[2rem] shadow-[0_20px_50px_rgba(220,38,38,0.5)] transition-all group-hover:scale-105">
            <i className="fa-solid fa-fire-glow text-3xl"></i>
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">StrikeFlow</h1>
            <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.5em] mt-1">V9: Hard Sequence Reset</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-2 bg-white/[0.03] backdrop-blur-3xl p-2.5 rounded-[2.5rem] border border-white/5 shadow-2xl">
          {['today', 'progress', 'settings'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-10 py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-red-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-200'}`}
            >
              {tab}
            </button>
          ))}
          {user.role === 'admin' && (
            <button onClick={() => setActiveTab('admin')} className="px-10 py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all text-red-500 border border-red-500/20 hover:bg-red-500/10">Admin Access</button>
          )}
          <button onClick={onLogout} className="px-6 py-4 text-slate-700 hover:text-red-500 text-[12px] font-black uppercase tracking-widest transition-all">Sign Out</button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6">
        {activeTab === 'today' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4 space-y-8 animate-in fade-in slide-in-from-left-5 duration-700">
              <div className={`p-14 rounded-[4rem] border transition-all duration-700 text-center relative overflow-hidden group shadow-3xl ${todayIsPerfect ? 'bg-red-600/10 border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.2)]' : 'bg-white/[0.03] border-white/5'}`}>
                <p className="text-slate-500 font-black text-[12px] uppercase tracking-[0.5em] mb-10">Current Persistence Streak</p>
                <div className="flex items-center justify-center gap-4">
                  <span className={`text-[120px] md:text-[160px] font-black leading-none tracking-tighter ${todayIsPerfect ? 'text-white drop-shadow-[0_0_20px_white]' : 'text-slate-300'}`}>
                    {user.streakCount}
                  </span>
                  <i className={`fa-solid fa-bolt text-4xl md:text-6xl ${todayIsPerfect ? 'text-red-500' : 'text-slate-800'}`}></i>
                </div>
                <p className={`mt-10 text-[11px] font-black uppercase tracking-[0.4em] italic ${todayIsPerfect ? 'text-red-500' : 'text-slate-700'}`}>
                  {todayIsPerfect ? 'Sequence Satisfied' : 'Engagement Required'}
                </p>
              </div>

              <div className="bg-white/[0.03] p-10 rounded-[3rem] border border-white/5 shadow-2xl">
                 <div className="flex justify-between items-end mb-8">
                    <h3 className="text-5xl font-black italic">{doneCount}<span className="text-slate-800 text-2xl not-italic ml-3">/ {tasks.length}</span></h3>
                    <span className="text-[12px] font-black uppercase tracking-widest text-slate-500">{tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0}%</span>
                 </div>
                 <div className="h-4 bg-black/40 rounded-full overflow-hidden p-1 border border-white/5">
                    <div className={`h-full rounded-full transition-all duration-1000 ${todayIsPerfect ? 'bg-white' : 'bg-red-600'}`} style={{ width: `${tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-10 animate-in fade-in slide-in-from-right-10 duration-700">
              <form onSubmit={addTask} className="bg-white/[0.02] p-10 rounded-[4.5rem] border border-white/5 space-y-10 shadow-3xl backdrop-blur-3xl relative">
                <div className="flex flex-col gap-8">
                  <input
                    type="text"
                    placeholder="Initiate Daily Sequence..."
                    className="w-full bg-black/60 border border-white/10 rounded-[2.5rem] px-10 py-6 text-white font-black focus:ring-4 focus:ring-red-600/20 focus:outline-none transition-all placeholder:text-slate-800 text-3xl"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                  <div className="flex flex-col sm:flex-row gap-6">
                    <input
                      type="time"
                      className="flex-1 bg-black/60 border border-white/10 rounded-[2rem] px-8 py-5 text-white font-black [color-scheme:dark]"
                      value={newTaskReminderTime}
                      onChange={(e) => setNewTaskReminderTime(e.target.value)}
                    />
                    <button type="submit" className="px-16 py-5 bg-red-600 hover:bg-red-500 text-white rounded-[2rem] font-black uppercase text-[14px] tracking-[0.3em] transition-all active:scale-95 shadow-2xl">Deploy</button>
                  </div>
                </div>
                <label className="flex items-center gap-5 cursor-pointer group/label w-fit">
                  <input type="checkbox" className="hidden" checked={isNewTaskRepeating} onChange={(e) => setIsNewTaskRepeating(e.target.checked)} />
                  <div className={`w-10 h-10 rounded-2xl border-2 flex items-center justify-center transition-all ${isNewTaskRepeating ? 'bg-red-600 border-red-600 shadow-lg' : 'border-slate-800'}`}>
                    {isNewTaskRepeating && <i className="fa-solid fa-repeat text-white"></i>}
                  </div>
                  <span className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover/label:text-slate-300">Daily Ritual Loop</span>
                </label>
              </form>

              <div className="space-y-6">
                {tasks.map(task => (
                  <div key={task.id} className={`group flex items-center gap-8 p-10 rounded-[3rem] border transition-all duration-700 ${task.completed ? 'bg-red-600/[0.02] border-red-600/20 opacity-40' : 'bg-white/[0.03] border-white/5 hover:border-white/10 shadow-2xl hover:translate-x-2'}`}>
                    <button onClick={() => toggleTask(task.id)} className={`w-16 h-16 rounded-[2rem] border-2 flex items-center justify-center transition-all duration-500 ${task.completed ? 'bg-red-600 border-red-600' : 'border-slate-800 hover:border-red-600'}`}>
                      {task.completed && <i className="fa-solid fa-check text-white text-2xl"></i>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-3xl font-black truncate ${task.completed ? 'line-through text-slate-700 italic' : 'text-slate-100'}`}>{task.title}</p>
                      <div className="flex items-center gap-4 mt-2">
                        {task.isRecurring && <span className="text-[10px] font-black uppercase tracking-[0.3em] bg-red-600/10 text-red-500 px-3 py-1 rounded-lg border border-red-600/20">Ritual</span>}
                        {task.reminderTime && <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600"><i className="fa-regular fa-bell mr-2"></i>{task.reminderTime}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteTask(task)} className="text-slate-800 hover:text-red-500 p-4 transition-all opacity-0 group-hover:opacity-100">
                      <i className="fa-solid fa-trash-can text-2xl"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'progress' ? (
          <div className="max-w-4xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
             <div className="flex items-center justify-between gap-8">
                <h2 className="text-5xl font-black italic uppercase tracking-tighter">Persistence Log</h2>
                <div className="flex items-center gap-4 bg-white/5 p-3 rounded-[1.5rem] border border-white/10 shadow-2xl">
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-4 hover:text-red-500"><i className="fa-solid fa-chevron-left"></i></button>
                   <span className="text-[13px] font-black uppercase tracking-[0.3em] min-w-[200px] text-center">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                   <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-4 hover:text-red-500"><i className="fa-solid fa-chevron-right"></i></button>
                </div>
             </div>
             <div className="bg-white/[0.02] p-16 rounded-[4rem] border border-white/5 shadow-3xl backdrop-blur-2xl overflow-x-auto">
                <div className="min-w-[400px]">
                  <div className="grid grid-cols-7 gap-6 mb-12 text-center">
                    {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-[12px] font-black text-slate-800 uppercase tracking-widest">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-6">
                    {calendarDays.map((date, idx) => {
                      if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                      const status = getDayStatus(date);
                      const isToday = getLocalDateStr(date) === getLocalDateStr();
                      return (
                        <div key={idx} className={`aspect-square rounded-[2rem] flex items-center justify-center transition-all duration-500 group relative ${status === 'complete' ? 'bg-red-600 shadow-2xl' : status === 'partial' ? 'bg-red-900/20 border border-red-900/40' : 'bg-white/5 border border-white/5'} ${isToday ? 'ring-2 ring-white ring-offset-8 ring-offset-black' : ''}`}>
                          <span className={`text-[18px] font-black ${status === 'complete' ? 'text-white' : 'text-slate-800'}`}>{date.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
             </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
             <h2 className="text-5xl font-black italic uppercase text-center tracking-tighter">System Configuration</h2>
             <div className="bg-white/[0.02] p-20 rounded-[5rem] border border-white/5 shadow-3xl space-y-16 backdrop-blur-3xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-8 text-center sm:text-left">
                  <div>
                    <h3 className="text-3xl font-black italic">Push Hub</h3>
                    <p className="text-slate-500 text-[12px] font-black uppercase tracking-[0.4em] mt-2">Mobile Integration Active</p>
                  </div>
                  <button onClick={() => Notification.requestPermission()} className="w-full sm:w-auto px-12 py-5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-2xl text-[12px] font-black uppercase tracking-[0.5em] transition-all shadow-xl active:scale-95">Link Device</button>
                </div>
                <div className="pt-16 border-t border-white/5 text-center">
                  <p className="text-[12px] font-black text-slate-800 uppercase tracking-[0.6em] italic leading-loose">
                    Security: PURGE-HARD-V9 <br/>
                    Persistence Model: OPERATIONAL
                  </p>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Alert Overlay */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 transition-all duration-700 z-50 w-[90%] sm:w-auto ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20 pointer-events-none'}`}>
        <div className="bg-white text-black px-16 py-8 rounded-full shadow-4xl font-black text-[14px] uppercase tracking-[0.4em] flex items-center justify-center gap-8 border-b-8 border-red-600">
          <i className="fa-solid fa-bolt-lightning text-red-600 animate-pulse text-2xl"></i>
          {toast.message}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
