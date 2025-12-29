
import { User, Task } from '../types';

/**
 * DATA SERVICE
 * Handles communication with the backend.
 */
// The base URL must be clean and not have redundant slashes
let API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const setDatabaseUrl = (url: string) => {
  if (!url) return;
  // Remove trailing slashes and normalize /api suffix
  let cleanUrl = url.replace(/\/+$/, "");
  if (!cleanUrl.endsWith('/api')) {
    API_BASE_URL = `${cleanUrl}/api`;
  } else {
    API_BASE_URL = cleanUrl;
  }
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
      throw new Error("Cannot update user: Missing unique ID.");
    }

    // SANITIZATION: Remove MongoDB internals to avoid server-side immutable field errors
    const { _id, __v, ...userData } = user as any;
    const payload: any = { ...userData };
    
    if (plainPassword) {
      payload.password = await hashPassword(plainPassword);
    }
    
    // Build URL ensuring no double slashes before 'users'
    const endpoint = isUpdate ? `/users/${encodeURIComponent(user.id)}` : `/users`;
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, fetchOptions(isUpdate ? 'PUT' : 'POST', payload));
      
      if (!response.ok) {
        let errorMsg = `API Error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // Response was not JSON (likely a proxy 404)
        }
        throw new Error(errorMsg);
      }
      
      return await response.json();
    } catch (err: any) {
      console.error("Networking Failure:", err);
      throw new Error(err.message || 'Connection lost during data sync');
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
      console.warn("Task cloud sync failed", err);
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
  }
};
