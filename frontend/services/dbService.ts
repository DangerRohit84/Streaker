import { User, Task } from '../types';

/**
 * DATA SERVICE (THE MESSENGER)
 * This file helps the app talk to your server to save your progress.
 */
let API_BASE_URL = import.meta.env.VITE_API_BASE_URL; 

// Set the link to your server
export const setDatabaseUrl = (url: string) => {
  API_BASE_URL = url.endsWith('/') ? url.slice(0, -1) : url;
};

export const getDatabaseUrl = () => API_BASE_URL;

// Make the password secure before sending it
async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const dbService = {
  // Check if the server is awake
  ping: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },

  // Check login details
  authenticate: async (username: string, plainPassword: string): Promise<User | null> => {
    const hashedPassword = await hashPassword(plainPassword);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: hashedPassword }),
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  },

  // Save a new account
  saveUser: async (user: User, plainPassword?: string): Promise<User> => {
    const payload: any = { ...user };
    if (plainPassword) {
      payload.password = await hashPassword(plainPassword);
    }
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Could not save account');
    return await response.json();
  },

  // Get tasks for today
  getTodaysTasks: async (userId: string): Promise<Task[]> => {
    const response = await fetch(`${API_BASE_URL}/tasks/today?userId=${userId}`);
    return response.ok ? await response.json() : [];
  },

  // Get everything ever saved
  getAllTasks: async (userId: string): Promise<Task[]> => {
    const response = await fetch(`${API_BASE_URL}/tasks?userId=${userId}`);
    return response.ok ? await response.json() : [];
  },

  // Add or update a habit/task
  saveTask: async (task: Task): Promise<void> => {
    await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
  },

  // Delete something
  deleteTask: async (taskId: string, title?: string, isRecurring?: boolean): Promise<void> => {
    const query = isRecurring ? `?title=${encodeURIComponent(title || '')}&recurring=true` : `/${taskId}`;
    await fetch(`${API_BASE_URL}/tasks${query}`, { method: 'DELETE' });
  },

  // Check if you are still logged in
  getSession: async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/session`);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  },

  // Sign out
  setSession: async (user: User | null): Promise<void> => {
    if (!user) {
      await fetch(`${API_BASE_URL}/logout`, { method: 'POST' });
    }
  },

  // Get list of existing names
  getUsers: async (): Promise<User[]> => {
    const response = await fetch(`${API_BASE_URL}/users/check`);
    return response.ok ? await response.json() : [];
  }
};
