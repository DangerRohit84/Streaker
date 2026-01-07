
export interface User {
  id: string;
  username: string;
  password?: string;
  role?: 'admin' | 'user';
  email: string;
  streakCount: number;
  lastCompletedDate: string | null;
  lastActiveDate: string | null;
  persistenceLog: string[]; // Dates where ALL tasks were done
  taskDefinitions: TaskDefinition[];
  completedToday: string[]; // IDs of taskDefinitions completed today
  joinDate: string;
  notificationSettings?: NotificationSettings;
}

export interface TaskDefinition {
  id: string;
  title: string;
  reminderTime?: string;
  createdAt?: string;
}

export interface NotificationSettings {
  soundEnabled: boolean;
  selectedSound: 'ruby-chime' | 'obsidian-pulse' | 'fire-echo';
  snoozeDuration: number; // in minutes
}

// Keeping this for compatibility in UI components if needed
export interface Task {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  date: string;
  isRecurring: boolean;
  reminderTime?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}
