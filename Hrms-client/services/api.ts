const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://hrms-kriraai.onrender.com/api';

// Helper to get auth token
const getToken = (): string | null => {
  return localStorage.getItem('token');
};

// Helper to set auth token
const setToken = (token: string): void => {
  localStorage.setItem('token', token);
};

// Helper to remove auth token
const removeToken = (): void => {
  localStorage.removeItem('token');
};

// Generic fetch wrapper
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

// Auth API
export const authAPI = {
  login: async (username: string, password?: string) => {
    const data = await apiRequest<{
      token: string;
      user: any;
      requiresPasswordChange: boolean;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },

  logout: () => {
    removeToken();
  },

  changePassword: async (newPassword: string) => {
    return apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  getCurrentUser: async () => {
    return apiRequest<{ user: any }>('/auth/me');
  },

  resetPassword: async (email: string, newPassword: string) => {
    return apiRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword }),
    });
  },
};

// Attendance API
export const attendanceAPI = {
  clockIn: async (location?: string) => {
    return apiRequest('/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify({ location }),
    });
  },

  clockOut: async () => {
    return apiRequest('/attendance/clock-out', {
      method: 'POST',
    });
  },

  startBreak: async (type: string) => {
    return apiRequest('/attendance/break/start', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  },

  endBreak: async () => {
    return apiRequest('/attendance/break/end', {
      method: 'POST',
    });
  },

  getToday: async () => {
    return apiRequest('/attendance/today');
  },

  getHistory: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest(`/attendance/history?${params.toString()}`);
  },

  getAll: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest(`/attendance/all?${params.toString()}`);
  },

  getTodayAll: async () => {
    return apiRequest('/attendance/today/all');
  },

  updateAttendance: async (recordId: string, updates: any) => {
    return apiRequest(`/attendance/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  adminCreateOrUpdate: async (data: { userId: string; date: string; checkIn?: string; checkOut?: string; breakDurationMinutes?: number; notes?: string }) => {
    return apiRequest('/attendance/admin-create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Leave API
export const leaveAPI = {
  requestLeave: async (leaveData: any) => {
    return apiRequest('/leaves/request', {
      method: 'POST',
      body: JSON.stringify(leaveData),
    });
  },

  getMyLeaves: async () => {
    return apiRequest('/leaves/my-leaves');
  },

  getLeavesByUserId: async (userId: string) => {
    return apiRequest(`/leaves/user/${userId}`);
  },

  getAllLeaves: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return apiRequest(`/leaves/all${params}`);
  },

  getPendingLeaves: async () => {
    return apiRequest('/leaves/pending');
  },

  updateLeaveStatus: async (id: string, status: string, hrComment?: string) => {
    return apiRequest(`/leaves/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, hrComment }),
    });
  },
};

// User API
export const userAPI = {
  getAllUsers: async () => {
    return apiRequest('/users');
  },

  getUsersByRole: async (role: string) => {
    return apiRequest(`/users/role/${role}`);
  },

  createUser: async (userData: any) => {
    return apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  updateUser: async (id: string, updates: { paidLeaveAllocation?: number | null }) => {
    return apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  resetAllPaidLeaveAllocation: async () => {
    return apiRequest('/users/reset-paid-leave', {
      method: 'POST',
    });
  },

  deleteUser: async (id: string) => {
    return apiRequest(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  getEmployeeStats: async () => {
    return apiRequest('/users/stats/employees');
  },
};

// Holiday API
export const holidayAPI = {
  getHolidays: async () => {
    return apiRequest('/holidays');
  },

  addHoliday: async (date: string, description: string) => {
    return apiRequest('/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, description }),
    });
  },

  deleteHoliday: async (id: string) => {
    return apiRequest(`/holidays/${id}`, {
      method: 'DELETE',
    });
  },
};

// Notification API
export const notificationAPI = {
  getMyNotifications: async () => {
    return apiRequest('/notifications');
  },

  markAsRead: async (id: string) => {
    return apiRequest(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  },

  markAllAsRead: async () => {
    return apiRequest('/notifications/read-all', {
      method: 'PUT',
    });
  },

  deleteNotification: async (id: string) => {
    return apiRequest(`/notifications/${id}`, {
      method: 'DELETE',
    });
  },
};

// Settings API
export const settingsAPI = {
  getSettings: async () => {
    return apiRequest('/settings');
  },

  updateSettings: async (settings: any) => {
    return apiRequest('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};

// Report API
export const reportAPI = {
  exportAttendanceReport: async (filters?: {
    startDate?: string;
    endDate?: string;
    department?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.department) params.append('department', filters.department);
    return apiRequest(`/reports/attendance?${params.toString()}`);
  },
};

// Audit API
export const auditAPI = {
  getAuditLogs: async (limit?: number) => {
    const params = limit ? `?limit=${limit}` : '';
    return apiRequest(`/audit${params}`);
  },
};

// Export token management functions
export { getToken, setToken, removeToken };

