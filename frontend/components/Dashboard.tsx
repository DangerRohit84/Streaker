
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

  const analyzeStreakAndFailures = useCallback((history: Task[]) => {
    if (!history || history.length === 0) return { streak: 0, failureDate: null };
    
    const tasksByDate: Record<string, Task[]> = {};
    history.forEach(t => {
      if (!t.date) return;
      if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
      tasksByDate[t.date].push(t);
    });

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

    if (todayIsPerfect) {
      streak = 1;
      checkDate = yesterday;
    } else if (yesterdayIsPerfect) {
      streak = 0; 
      checkDate = yesterday;
    } else {
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
      
      if (failureDate) {
        const tasksAfterFailure = history.filter(t => t.date > failureDate);
        if (tasksAfterFailure.length > 0) {
           triggerToast("SEQUENCE BREACH: PURGING POST-FAILURE DATA");
           await dbService.purgeTasksAfterDate(user.id, failureDate);
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
        <div className="w-12 md:w-16 h-12 md:h-16 border-t-2 border-red-600 rounded-full animate-spin"></div>
      </div>
    );
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
            <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.4em] mt-1">V9: Fluid Persistence</p>
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
                <p className="text-slate-500 font-black text-[10px] md:text-[12px] uppercase tracking-[0.4em] mb-6 md:mb-10">Persistence Streak</p>
                <div className="flex items-center justify-center gap-4">
                  <span className={`text-[90px] md:text-[160px] font-black leading-none tracking-tighter ${todayIsPerfect ? 'text-white drop-shadow-[0_0_20px_white]' : 'text-slate-300'}`}>
                    {user.streakCount}
                  </span>
                  <i className={`fa-solid fa-bolt text-3xl md:text-6xl ${todayIsPerfect ? 'text-red-500' : 'text-slate-800'}`}></i>
                </div>
                <p className={`mt-6 md:mt-10 text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] italic ${todayIsPerfect ? 'text-red-500' : 'text-slate-700'}`}>
                  {todayIsPerfect ? 'Sequence Satisfied' : 'Engagement Required'}
                </p>
              </div>

              <div className="bg-white/[0.03] p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 shadow-2xl">
                 <div className="flex justify-between items-end mb-6 md:mb-8">
                    <h3 className="text-3xl md:text-5xl font-black italic">{doneCount}<span className="text-slate-800 text-lg md:text-2xl not-italic ml-2">/ {tasks.length}</span></h3>
                    <span className="text-[10px] md:text-[12px] font-black uppercase tracking-widest text-slate-500">{tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0}%</span>
                 </div>
                 <div className="h-3 md:h-4 bg-black/40 rounded-full overflow-hidden p-1 border border-white/5">
                    <div className={`h-full rounded-full transition-all duration-1000 ${todayIsPerfect ? 'bg-white' : 'bg-red-600'}`} style={{ width: `${tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-8 md:space-y-10 animate-in fade-in slide-in-from-right-10 duration-700">
              <form onSubmit={addTask} className="bg-white/[0.02] p-6 md:p-10 rounded-[2.5rem] md:rounded-[4.5rem] border border-white/5 space-y-6 md:space-y-10 shadow-3xl backdrop-blur-3xl relative">
                <div className="flex flex-col gap-4 md:gap-8">
                  <input
                    type="text"
                    placeholder="Initiate Sequence..."
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
                <label className="flex items-center gap-4 cursor-pointer group/label w-fit">
                  <input type="checkbox" className="hidden" checked={isNewTaskRepeating} onChange={(e) => setIsNewTaskRepeating(e.target.checked)} />
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl border-2 flex items-center justify-center transition-all ${isNewTaskRepeating ? 'bg-red-600 border-red-600 shadow-lg' : 'border-slate-800'}`}>
                    {isNewTaskRepeating && <i className="fa-solid fa-repeat text-white text-sm md:text-base"></i>}
                  </div>
                  <span className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.1em] text-slate-500 group-hover/label:text-slate-300">Daily Ritual Loop</span>
                </label>
              </form>

              <div className="space-y-4 md:space-y-6">
                {tasks.map(task => (
                  <div key={task.id} className={`group flex items-center gap-4 md:gap-8 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border transition-all duration-700 ${task.completed ? 'bg-red-600/[0.02] border-red-600/20 opacity-40' : 'bg-white/[0.03] border-white/5 hover:border-white/10 shadow-2xl md:hover:translate-x-2'}`}>
                    <button onClick={() => toggleTask(task.id)} className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[2rem] border-2 flex items-center justify-center transition-all duration-500 ${task.completed ? 'bg-red-600 border-red-600' : 'border-slate-800 hover:border-red-600'}`}>
                      {task.completed && <i className="fa-solid fa-check text-white text-xl md:text-2xl"></i>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xl md:text-3xl font-black truncate ${task.completed ? 'line-through text-slate-700 italic' : 'text-slate-100'}`}>{task.title}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {task.isRecurring && <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] bg-red-600/10 text-red-500 px-2 py-0.5 rounded border border-red-600/20">Ritual</span>}
                        {task.reminderTime && <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.1em] text-slate-600"><i className="fa-regular fa-bell mr-1.5"></i>{task.reminderTime}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteTask(task)} className="text-slate-800 hover:text-red-500 p-2 md:p-4 transition-all opacity-100 md:opacity-0 group-hover:opacity-100">
                      <i className="fa-solid fa-trash-can text-lg md:text-2xl"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'progress' ? (
          <div className="max-w-4xl mx-auto space-y-10 md:space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-700">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">Persistence Log</h2>
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
                      const status = getDayStatus(date);
                      const isToday = getLocalDateStr(date) === getLocalDateStr();
                      return (
                        <div key={idx} className={`aspect-square rounded-[1rem] md:rounded-[2rem] flex items-center justify-center transition-all duration-500 group relative ${status === 'complete' ? 'bg-red-600 shadow-xl' : status === 'partial' ? 'bg-red-900/20 border border-red-900/40' : 'bg-white/5 border border-white/5'} ${isToday ? 'ring-2 ring-white ring-offset-4 ring-offset-black' : ''}`}>
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
                    <h3 className="text-2xl md:text-3xl font-black italic">Push Hub</h3>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Mobile Integration Active</p>
                  </div>
                  <button onClick={() => Notification.requestPermission()} className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-xl md:rounded-2xl text-[10px] md:text-[12px] font-black uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95">Link Device</button>
                </div>
                <div className="pt-10 md:pt-16 border-t border-white/5 text-center">
                  <p className="text-[10px] md:text-[12px] font-black text-slate-800 uppercase tracking-[0.4em] italic leading-loose">
                    Security: PURGE-HARD-V9 <br className="sm:hidden"/>
                    Persistence Model: OPERATIONAL
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
