
export interface User {
  id: string;
  username: string;
  password?: string;
  role?: 'admin' | 'user';
  email: string;
  streakCount: number;
  lastCompletedDate: string | null;
  joinDate: string;
  notificationSettings?: NotificationSettings;
}

export interface NotificationSettings {
  soundEnabled: boolean;
  selectedSound: 'ruby-chime' | 'obsidian-pulse' | 'fire-echo';
  snoozeDuration: number; // in minutes
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  date: string; // ISO string YYYY-MM-DD
  isRecurring: boolean; // True if it's a daily ritual
  templateId?: string; // Links daily instances of the same ritual
  reminderTime?: string; // Time string in HH:mm format
  snoozedUntil?: string; // ISO string for snooze handling
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}
