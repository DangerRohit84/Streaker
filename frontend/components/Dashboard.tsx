
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Task, NotificationSettings } from '../types';
import { dbService, getDatabaseUrl } from '../services/dbService';

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

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const settings = useMemo<NotificationSettings>(() => user.notificationSettings || {
    soundEnabled: true,
    selectedSound: 'ruby-chime',
    snoozeDuration: 10
  }, [user.notificationSettings]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const todaysTasks = await dbService.getTodaysTasks(user.id);
    const history = await dbService.getAllTasks(user.id);
    setTasks(todaysTasks);
    setAllHistoryTasks(history);
    setIsLoading(false);
  }, [user.id]);

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
      date: new Date().toISOString().split('T')[0],
      isRecurring: isNewTaskRepeating,
      reminderTime: newTaskReminderTime || undefined
    };

    await dbService.saveTask(newTask);
    setTasks(prev => [...prev, newTask]);
    setAllHistoryTasks(prev => [...prev, newTask]);
    setNewTaskTitle('');
    setNewTaskReminderTime('');
    setIsNewTaskRepeating(false);
    triggerToast("Saved!");
  };

  const toggleTask = async (taskId: string) => {
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    setTasks(updatedTasks);
    
    const targetTask = updatedTasks.find(t => t.id === taskId);
    if (targetTask) {
      dbService.saveTask(targetTask);
    }

    const today = new Date().toISOString().split('T')[0];
    const allDoneToday = updatedTasks.length > 0 && updatedTasks.every(t => t.completed);
    
    if (allDoneToday && user.lastCompletedDate !== today) {
      const updatedUser = { 
        ...user, 
        streakCount: user.streakCount + 1, 
        lastCompletedDate: today 
      };
      onUpdateUser(updatedUser);
      dbService.saveUser(updatedUser);
      triggerToast("Strike Updated! 🔥");
    } else if (!allDoneToday && user.lastCompletedDate === today) {
      const updatedUser = { 
        ...user, 
        streakCount: Math.max(0, user.streakCount - 1), 
        lastCompletedDate: null 
      };
      onUpdateUser(updatedUser);
      dbService.saveUser(updatedUser);
    }
  };

  const deleteTask = async (task: Task) => {
    await dbService.deleteTask(task.id, task.title, task.isRecurring);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setAllHistoryTasks(prev => prev.filter(t => t.id !== task.id));
    triggerToast("Removed");
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
    const dateStr = date.toISOString().split('T')[0];
    const tasksForDay = allHistoryTasks.filter(t => t.date === dateStr);
    if (tasksForDay.length === 0) return 'none';
    const allDone = tasksForDay.every(t => t.completed);
    return allDone ? 'complete' : 'partial';
  };

  const habits = tasks.filter(t => t.isRecurring);
  const oneTime = tasks.filter(t => !t.isRecurring);
  const doneCount = tasks.filter(t => t.completed).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-red-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Establishing Connection</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600/30 font-sans">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-red-900/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-900/10 blur-[150px] rounded-full"></div>
      </div>

      <header className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5 group cursor-default">
          <div className="p-4 bg-gradient-to-br from-red-500 to-red-700 rounded-[1.5rem] shadow-[0_15px_40px_rgba(220,38,38,0.3)] transform transition-transform duration-500 group-hover:rotate-6">
            <i className="fa-solid fa-fire text-3xl text-white"></i>
          </div>
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">Strike Flow</h1>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Personal Mastery</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-white/[0.03] backdrop-blur-2xl rounded-[1.5rem] p-1 border border-white/10 shadow-2xl">
          {[
            { id: 'today', label: 'Today', icon: 'fa-calendar-day' },
            { id: 'progress', label: 'My Progress', icon: 'fa-chart-line' },
            { id: 'settings', label: 'Settings', icon: 'fa-cog' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${activeTab === tab.id ? 'bg-red-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'}`}
            >
              <i className={`fa-solid ${tab.icon} text-[10px]`}></i>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-2 hidden sm:block"></div>
          <button onClick={onLogout} className="px-6 py-2.5 text-slate-700 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all">Exit</button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-20">
        {activeTab === 'today' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-white/[0.03] backdrop-blur-3xl p-10 rounded-[3rem] border border-white/5 shadow-2xl text-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 transform group-hover:scale-110 transition-transform duration-700">
                  <i className="fa-solid fa-fire text-9xl text-red-600"></i>
                </div>
                <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.4em] mb-4">Current Strike</p>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-[120px] font-black text-white leading-none tracking-tighter drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">{user.streakCount}</span>
                  <i className="fa-solid fa-bolt text-red-500 text-3xl animate-pulse"></i>
                </div>
                <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.3em] mt-4">Days in a row</p>
              </div>

              <div className="bg-white/[0.03] backdrop-blur-3xl p-10 rounded-[3rem] border border-white/5 shadow-2xl">
                 <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.4em] mb-6">Today's Pulse</p>
                 <div className="flex items-end justify-between mb-4 px-2">
                    <div className="text-5xl font-black leading-none">{doneCount}<span className="text-slate-800 text-2xl font-black italic">/{tasks.length}</span></div>
                    <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0}%</div>
                 </div>
                 <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5 shadow-inner">
                    <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000 ease-out" style={{ width: `${tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0}%` }}></div>
                 </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-10">
              <div className="bg-white/[0.02] backdrop-blur-3xl p-8 md:p-12 rounded-[3rem] border border-white/5 shadow-2xl">
                <form onSubmit={addTask} className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <input
                      type="text"
                      placeholder="What needs to be done?"
                      className="flex-1 bg-black/40 border border-white/5 rounded-[1.5rem] px-8 py-5 text-white font-bold focus:ring-2 focus:ring-red-600 focus:outline-none transition-all placeholder:text-slate-800 text-xl"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="time"
                        className="bg-black/40 border border-white/5 rounded-[1.5rem] px-6 py-5 text-white font-black [color-scheme:dark] focus:ring-2 focus:ring-red-600 focus:outline-none transition-all text-sm"
                        value={newTaskReminderTime}
                        onChange={(e) => setNewTaskReminderTime(e.target.value)}
                      />
                      <button type="submit" className="bg-red-600 hover:bg-red-500 text-white h-full px-10 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.3em] transition-all shadow-2xl active:scale-[0.97]">
                        Create
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-4 cursor-pointer w-fit group">
                    <input type="checkbox" className="hidden" checked={isNewTaskRepeating} onChange={(e) => setIsNewTaskRepeating(e.target.checked)} />
                    <div className={`w-7 h-7 rounded-[0.75rem] border-2 flex items-center justify-center transition-all duration-300 ${isNewTaskRepeating ? 'bg-red-600 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'border-slate-800 group-hover:border-slate-600'}`}>
                      {isNewTaskRepeating && <i className="fa-solid fa-repeat text-xs text-white"></i>}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-slate-200 transition-colors">Daily Habit</span>
                  </label>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="space-y-6">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 flex items-center gap-3 px-4">
                    <span className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></span> Everyday Habits
                  </h2>
                  <div className="space-y-4">
                    {habits.length === 0 && (
                      <div className="p-10 border border-dashed border-white/5 rounded-[2.5rem] text-center">
                        <p className="text-slate-800 text-[9px] font-black uppercase tracking-widest">No recurring habits</p>
                      </div>
                    )}
                    {habits.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />)}
                  </div>
                </section>

                <section className="space-y-6">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 flex items-center gap-3 px-4">
                    <span className="w-2 h-2 rounded-full bg-slate-800"></span> Just for Today
                  </h2>
                  <div className="space-y-4">
                    {oneTime.length === 0 && (
                      <div className="p-10 border border-dashed border-white/5 rounded-[2.5rem] text-center">
                        <p className="text-slate-800 text-[9px] font-black uppercase tracking-widest">No unique tasks</p>
                      </div>
                    )}
                    {oneTime.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />)}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : activeTab === 'progress' ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-10 duration-700 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">My Progress</h2>
                <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.4em] mt-3">Monthly Performance Log</p>
              </div>
              <div className="flex items-center gap-4 bg-white/[0.03] backdrop-blur-2xl p-2 rounded-[1.25rem] border border-white/10 shadow-2xl">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all">
                  <i className="fa-solid fa-chevron-left text-[10px]"></i>
                </button>
                <div className="flex flex-col items-center min-w-[120px]">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">{currentMonth.toLocaleString('default', { month: 'long' })}</span>
                  <span className="text-[8px] font-black text-slate-700 tracking-widest">{currentMonth.getFullYear()}</span>
                </div>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all">
                  <i className="fa-solid fa-chevron-right text-[10px]"></i>
                </button>
              </div>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-3xl p-8 rounded-[3rem] border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="grid grid-cols-7 gap-3 mb-6">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                  <div key={d} className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-3">
                {calendarDays.map((date, idx) => {
                  if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                  const status = getDayStatus(date);
                  const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                  
                  return (
                    <div 
                      key={date.toISOString()} 
                      className={`aspect-square rounded-[1rem] flex items-center justify-center relative group transition-all duration-300 transform hover:scale-105 ${
                        status === 'complete' ? 'bg-gradient-to-br from-red-600 to-red-900 shadow-[0_10px_20px_rgba(220,38,38,0.2)]' : 
                        status === 'partial' ? 'bg-red-900/10 border border-red-900/20' : 
                        'bg-white/[0.01] border border-white/5'
                      } ${isToday ? 'ring-1 ring-white ring-offset-2 ring-offset-black' : ''}`}
                    >
                      <span className={`text-xs font-black ${status === 'complete' ? 'text-white' : 'text-slate-700'}`}>{date.getDate()}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-12 flex items-center justify-center gap-6 border-t border-white/5 pt-8">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-600"></div>
                  <span className="text-[8px] font-black uppercase text-slate-600 tracking-[0.2em]">Strike</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-900/10 border border-red-900/40"></div>
                  <span className="text-[8px] font-black uppercase text-slate-600 tracking-[0.2em]">Partial</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-12 animate-in slide-in-from-bottom-10 duration-700">
             <div className="text-center">
               <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">Settings</h2>
               <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.4em] mt-4">System Parameters</p>
             </div>
             
             <div className="bg-white/[0.02] backdrop-blur-3xl p-12 rounded-[3.5rem] border border-white/5 space-y-12 shadow-2xl relative overflow-hidden">
                <div className="absolute bottom-0 right-0 w-[60%] h-[60%] bg-red-900/5 blur-[120px] -z-10"></div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="font-black text-2xl tracking-tighter uppercase">Sound Alerts</h3>
                    <p className="text-slate-500 text-[11px] font-black uppercase tracking-widest">Active notification cues</p>
                  </div>
                  <button className="w-16 h-8 bg-red-600 rounded-full flex items-center justify-end px-1.5 shadow-2xl border border-white/10 transition-transform active:scale-90">
                    <div className="w-5 h-5 bg-white rounded-full shadow-lg"></div>
                  </button>
                </div>

                <div className="pt-6 text-center border-t border-white/5">
                   <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] italic">Precision in every habit, excellence in every day.</p>
                </div>
             </div>
          </div>
        )}
      </main>

      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 transition-all duration-700 z-50 ${toast.visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95 pointer-events-none'}`}>
        <div className="bg-white text-black px-10 py-4 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.6)] font-black text-[10px] uppercase tracking-[0.3em] flex items-center gap-5">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-600 animate-ping"></div>
          </div>
          {toast.message}
        </div>
      </div>
    </div>
  );
};

const TaskRow: React.FC<{ task: Task; onToggle: (id: string) => void; onDelete: (t: Task) => void }> = ({ task, onToggle, onDelete }) => (
  <div className={`group flex items-center gap-5 p-6 rounded-[2.25rem] border transition-all duration-500 relative overflow-hidden ${task.completed ? 'bg-red-600/[0.03] border-red-600/10 opacity-60' : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'}`}>
    {task.completed && (
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600/40"></div>
    )}
    
    <button 
      onClick={() => onToggle(task.id)} 
      className={`w-10 h-10 rounded-[1.1rem] border-2 flex items-center justify-center transition-all duration-500 flex-shrink-0 ${task.completed ? 'bg-gradient-to-br from-red-600 to-red-800 border-red-600 shadow-2xl' : 'border-slate-800 hover:border-red-600 group-hover:scale-110'}`}
    >
      {task.completed && <i className="fa-solid fa-check text-base text-white"></i>}
    </button>

    <div className="flex-1 min-w-0">
      <p className={`text-base font-black truncate tracking-tight transition-all duration-500 ${task.completed ? 'line-through text-slate-600 italic' : 'text-slate-100'}`}>{task.title}</p>
      {task.reminderTime && (
        <div className="flex items-center gap-2 mt-2">
          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
            <i className="fa-regular fa-clock opacity-50"></i> {task.reminderTime}
          </p>
        </div>
      )}
    </div>

    <button 
      onClick={() => onDelete(task)} 
      className="text-slate-800 hover:text-red-500 p-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0"
    >
      <i className="fa-solid fa-trash-can text-sm"></i>
    </button>
  </div>
);

export default Dashboard;
