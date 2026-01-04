
import { User, Task } from '../types';

/**
 * DATA SERVICE
 * Handles communication with the backend.
 */
let API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const setDatabaseUrl = (url: string) => {
  if (!url) return;
  let cleanUrl = url.replace(/\/+$/, "");
  if (!cleanUrl.toLowerCase().endsWith('/api')) {
    API_BASE_URL = `${cleanUrl}/api`;
  } else {
    API_BASE_URL = cleanUrl;
  }
  console.log(`Cloud endpoint updated: ${API_BASE_URL}`);
};

export const getDatabaseUrl = () => API_BASE_URL;

const getLocalTodayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const fetchOptions = (method: string, body?: any): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
  credentials: 'include',
});

export const dbService = {
  ping: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, { credentials: 'include' });
      return response.ok;
    } catch {
      return false;
    }
  },

  authenticate: async (username: string, plainPassword: string): Promise<User | null> => {
    const hashedPassword = await hashPassword(plainPassword);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, fetchOptions('POST', { username, password: hashedPassword }));
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  },

  saveUser: async (user: User, plainPassword?: string, isUpdate = false): Promise<User> => {
    if (isUpdate && !user.id) {
      throw new Error("Update blocked: User identity missing.");
    }
    const { _id, __v, ...userData } = user as any;
    const payload: any = { ...userData };
    if (plainPassword) payload.password = await hashPassword(plainPassword);
    const endpoint = isUpdate ? `/users/${encodeURIComponent(user.id)}` : `/users`;
    const url = `${API_BASE_URL}${endpoint}`;
    const method = isUpdate ? 'PUT' : 'POST';
    try {
      const response = await fetch(url, fetchOptions(method, payload));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      return await response.json();
    } catch (err: any) {
      throw new Error(err.message || 'Connection lost.');
    }
  },

  getTodaysTasks: async (userId: string): Promise<Task[]> => {
    const today = getLocalTodayStr();
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/today?userId=${userId}&date=${today}`, { credentials: 'include' });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  },

  getAllTasks: async (userId: string): Promise<Task[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks?userId=${userId}`, { credentials: 'include' });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  },

  saveTask: async (task: Task): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/tasks`, fetchOptions('POST', task));
    } catch (err) {
      console.warn("Task cloud sync failure", err);
    }
  },

  purgeTasksAfterDate: async (userId: string, afterDate: string): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/tasks/purge?userId=${userId}&afterDate=${afterDate}`, { method: 'DELETE', credentials: 'include' });
    } catch (err) {
      console.error("Purge failed", err);
    }
  },

  deleteTask: async (taskId: string, title?: string, isRecurring?: boolean): Promise<void> => {
    const query = isRecurring ? `?title=${encodeURIComponent(title || '')}&recurring=true` : `/${taskId}`;
    await fetch(`${API_BASE_URL}/tasks${query}`, { method: 'DELETE', credentials: 'include' });
  },

  getSession: async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/session`, { credentials: 'include' });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  },

  setSession: async (user: User | null): Promise<void> => {
    if (!user) {
      await fetch(`${API_BASE_URL}/logout`, fetchOptions('POST'));
    }
  },

  getUsers: async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/check`, { credentials: 'include' });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  },

  getAdminUsers: async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users`, { credentials: 'include' });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }
};
