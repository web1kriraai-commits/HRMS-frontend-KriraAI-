import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Attendance, LeaveRequest, Role, LeaveStatus, Break, BreakType, AuthState, AuditLog, CompanyHoliday, Notification, LeaveCategory, SystemSettings } from '../types';
import { downloadCSV, getTodayStr } from '../services/utils';
import * as api from '../services/api';

interface AppContextType {
  auth: AuthState;
  login: (username: string, password?: string) => Promise<'success' | 'fail' | 'change_password'>;
  manualLogin: (user: any) => void;
  logout: () => void;
  changePassword: (newPass: string) => Promise<void>;

  // Data
  users: User[];
  attendanceRecords: Attendance[];
  leaveRequests: LeaveRequest[];
  auditLogs: AuditLog[];
  companyHolidays: CompanyHoliday[];
  notifications: Notification[];
  systemSettings: SystemSettings;

  // Loading states
  loading: boolean;
  checkingAuth: boolean;

  // Actions
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  startBreak: (type: BreakType, reason?: string) => Promise<void>;
  endBreak: () => Promise<void>;
  requestLeave: (req: Omit<LeaveRequest, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>) => Promise<void>;
  updateLeaveStatus: (id: string, status: LeaveStatus, comment?: string) => Promise<void>;
  createUser: (user: Omit<User, 'id' | 'password' | 'isFirstLogin'>) => Promise<void>;
  updateUser: (id: string, updates: { paidLeaveAllocation?: number | null; name?: string; email?: string; department?: string; joiningDate?: string; bonds?: any[]; aadhaarNumber?: string; guardianName?: string; mobileNumber?: string }) => Promise<void>;

  // Admin/HR Actions
  adminUpdateAttendance: (recordId: string, updates: Partial<Attendance>, breakDurationMinutes?: number) => Promise<void>;
  addCompanyHoliday: (date: string, description: string) => Promise<void>;
  exportReports: (filters?: { start?: string; end?: string; department?: string }) => Promise<void>;
  updateSystemSettings: (settings: Partial<SystemSettings>) => Promise<void>;

  // Refresh functions
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to transform API user to frontend User type
const transformUser = (apiUser: any): User => ({
  id: apiUser.id || apiUser._id,
  name: apiUser.name,
  username: apiUser.username,
  email: apiUser.email,
  role: apiUser.role as Role,
  department: apiUser.department,
  isActive: apiUser.isActive,
  isFirstLogin: apiUser.isFirstLogin,
  lastLogin: apiUser.lastLogin,
  paidLeaveAllocation: apiUser.paidLeaveAllocation !== undefined ? apiUser.paidLeaveAllocation : null,
  paidLeaveLastAllocatedDate: apiUser.paidLeaveLastAllocatedDate ? new Date(apiUser.paidLeaveLastAllocatedDate).toISOString() : undefined,
  joiningDate: apiUser.joiningDate || undefined, // Keep in dd-mm-yyyy format as stored
  bonds: apiUser.bonds && Array.isArray(apiUser.bonds) ? apiUser.bonds.map((b: any) => ({
    type: b.type || 'Job',
    periodMonths: b.periodMonths || 0,
    startDate: b.startDate || '',
    order: b.order || 1,
    salary: b.salary || 0
  })) : undefined,
  aadhaarNumber: apiUser.aadhaarNumber || undefined,
  guardianName: apiUser.guardianName || undefined,
  mobileNumber: apiUser.mobileNumber || undefined,
  salaryBreakdown: apiUser.salaryBreakdown && Array.isArray(apiUser.salaryBreakdown) ? apiUser.salaryBreakdown.map((s: any) => ({
    month: s.month,
    year: s.year,
    amount: s.amount || 0,
    bondType: s.bondType,
    startDate: s.startDate,
    endDate: s.endDate,
    isPartialMonth: s.isPartialMonth || false,
    isPaid: s.isPaid || false,
    paidAt: s.paidAt,
    paidBy: s.paidBy
  })) : undefined
});

// Helper to transform API attendance to frontend Attendance type
const transformAttendance = (apiAttendance: any): Attendance => ({
  id: apiAttendance.id || apiAttendance._id,
  userId: apiAttendance.userId?.id || apiAttendance.userId?._id || apiAttendance.userId,
  date: apiAttendance.date,
  checkIn: apiAttendance.checkIn,
  checkOut: apiAttendance.checkOut,
  location: apiAttendance.location,
  breaks: (apiAttendance.breaks || []).map((b: any) => ({
    id: b.id || b._id,
    attendanceId: apiAttendance.id || apiAttendance._id,
    start: b.start,
    end: b.end,
    type: b.type,
    durationSeconds: b.durationSeconds,
    reason: b.reason
  })),
  totalWorkedSeconds: apiAttendance.totalWorkedSeconds || 0,
  lowTimeFlag: apiAttendance.lowTimeFlag || false,
  extraTimeFlag: apiAttendance.extraTimeFlag || false,
  notes: apiAttendance.notes
});

// Helper to transform API leave to frontend LeaveRequest type
const transformLeave = (apiLeave: any): LeaveRequest => ({
  id: apiLeave.id || apiLeave._id,
  userId: apiLeave.userId?.id || apiLeave.userId?._id || apiLeave.userId,
  userName: apiLeave.userName,
  startDate: apiLeave.startDate,
  endDate: apiLeave.endDate,
  category: apiLeave.category as LeaveCategory,
  reason: apiLeave.reason,
  attachmentUrl: apiLeave.attachmentUrl,
  status: apiLeave.status as LeaveStatus,
  hrComment: apiLeave.hrComment,
  startTime: apiLeave.startTime,
  endTime: apiLeave.endTime,
  createdAt: apiLeave.createdAt || apiLeave.created_at
});

// Helper to transform API audit log
const transformAuditLog = (apiLog: any): AuditLog => ({
  id: apiLog.id || apiLog._id,
  actorId: apiLog.actorId?.id || apiLog.actorId?._id || apiLog.actorId,
  actorName: apiLog.actorName,
  action: apiLog.action,
  targetType: apiLog.targetType,
  targetId: apiLog.targetId,
  beforeData: apiLog.beforeData,
  afterData: apiLog.afterData,
  details: apiLog.details,
  timestamp: apiLog.timestamp || apiLog.createdAt || apiLog.created_at
});

// Helper to transform API holiday
const transformHoliday = (apiHoliday: any): CompanyHoliday => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const holidayDate = new Date(apiHoliday.date);
  holidayDate.setHours(0, 0, 0, 0);

  const status = holidayDate < today ? 'past' : 'upcoming';

  return {
    id: apiHoliday.id || apiHoliday._id,
    date: apiHoliday.date,
    description: apiHoliday.description,
    createdBy: apiHoliday.createdBy?.id || apiHoliday.createdBy?._id || apiHoliday.createdBy,
    createdByName: apiHoliday.createdByName || apiHoliday.createdBy?.name,
    createdByRole: apiHoliday.createdByRole || apiHoliday.createdBy?.role,
    status
  };
};

// Helper to transform API notification
const transformNotification = (apiNotif: any): Notification => ({
  id: apiNotif.id || apiNotif._id,
  userId: apiNotif.userId?.id || apiNotif.userId?._id || apiNotif.userId,
  message: apiNotif.message,
  read: apiNotif.read || false,
  createdAt: apiNotif.createdAt || apiNotif.created_at
});

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>({ user: null, isAuthenticated: false, requiresPasswordChange: false });
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ timezone: 'Asia/Kolkata' });
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Refresh all data
  const refreshData = async () => {
    if (!auth.isAuthenticated) return;

    try {
      setLoading(true);
      // For HR/Admin, get all attendance records; for employees, get only their own
      const isHRorAdmin = auth.user?.role === Role.HR || auth.user?.role === Role.ADMIN;
      const attendancePromise = isHRorAdmin
        ? api.attendanceAPI.getAll().catch(() => [])
        : api.attendanceAPI.getHistory().catch(() => []);

      // For employees, get leaves by userId; for HR/Admin, get all leaves
      const leavesPromise = isHRorAdmin
        ? api.leaveAPI.getAllLeaves().catch(() => [])
        : (auth.user?.id ? api.leaveAPI.getLeavesByUserId(auth.user.id).catch(() => []) : Promise.resolve([]));

      const [usersData, attendanceHistory, todayAttendance, leavesData, holidaysData, notifsData, settingsData] = await Promise.all([
        api.userAPI.getAllUsers().catch(() => []),
        attendancePromise,
        api.attendanceAPI.getToday().catch(() => null),
        leavesPromise,
        api.holidayAPI.getHolidays().catch(() => []),
        api.notificationAPI.getMyNotifications().catch(() => []),
        api.settingsAPI.getSettings().catch(() => ({ timezone: 'Asia/Kolkata' }))
      ]) as [any[], any[], any, any[], any[], any[], any];

      const transformedUsers = (Array.isArray(usersData) ? usersData : []).map(transformUser);
      setUsers(transformedUsers);

      // Update current user from the refreshed users list
      if (auth.user) {
        const updatedCurrentUser = transformedUsers.find(u => u.id === auth.user?.id);
        if (updatedCurrentUser) {
          setAuth(prev => ({
            ...prev,
            user: updatedCurrentUser
          }));
        }
      }

      // Merge today's attendance with history
      const allAttendance = (Array.isArray(attendanceHistory) ? attendanceHistory : []).map(transformAttendance);
      if (todayAttendance) {
        const todayTransformed = transformAttendance(todayAttendance);
        const todayExists = allAttendance.find(a => a.date === todayTransformed.date && a.userId === todayTransformed.userId);
        if (todayExists) {
          // Update existing today's record
          const index = allAttendance.findIndex(a => a.id === todayExists.id);
          allAttendance[index] = todayTransformed;
        } else {
          // Add today's record
          allAttendance.unshift(todayTransformed);
        }
      }
      setAttendanceRecords(allAttendance);

      setLeaveRequests((Array.isArray(leavesData) ? leavesData : []).map(transformLeave));
      setCompanyHolidays((Array.isArray(holidaysData) ? holidaysData : []).map(transformHoliday));
      setNotifications((Array.isArray(notifsData) ? notifsData : []).map(transformNotification));
      setSystemSettings({ timezone: (settingsData as any)?.timezone || 'Asia/Kolkata' });

      // Load audit logs if admin
      if (auth.user?.role === Role.ADMIN) {
        api.auditAPI.getAuditLogs(100)
          .then((logs: any) => setAuditLogs(Array.isArray(logs) ? logs.map(transformAuditLog) : []))
          .catch(() => { });
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check for existing token on mount
  useEffect(() => {
    const token = api.getToken();
    const cachedUser = api.authAPI.getCachedUser();

    if (token) {
      if (cachedUser) {
        // Immediately set auth state from cache to prevent flickering
        setAuth({
          user: transformUser(cachedUser),
          isAuthenticated: true,
          requiresPasswordChange: cachedUser.isFirstLogin || false
        });
      }

      // Verify token and refresh user data in background
      api.authAPI.getCurrentUser()
        .then(({ user }) => {
          const transformedUser = transformUser(user);
          setAuth({
            user: transformedUser,
            isAuthenticated: true,
            requiresPasswordChange: user.isFirstLogin || false
          });
          setCheckingAuth(false);
        })
        .catch((error) => {
          console.error('Auth check error:', error);
          // ONLY log out if the server explicitly says the token is invalid (401)
          if (error.status === 401) {
            console.log('Token expired or invalid, logging out...');
            api.authAPI.logout();
            setAuth({ user: null, isAuthenticated: false, requiresPasswordChange: false });
          } else {
            // For network errors or server issues, we keep the existing (potentially valid) auth state
            // but we should still stop the checking state
            console.log('Network error during auth check, keeping local session.');
            if (!cachedUser) {
              setAuth({ user: null, isAuthenticated: false, requiresPasswordChange: false });
            }
          }
          setCheckingAuth(false);
        });
    } else {
      setCheckingAuth(false);
    }
  }, []);

  // Auto-refresh when authenticated
  useEffect(() => {
    if (auth.isAuthenticated) {
      refreshData();
      // Set up periodic refresh every 30 seconds
      const interval = setInterval(refreshData, 30000);
      return () => clearInterval(interval);
    }
  }, [auth.isAuthenticated]);

  const login = async (username: string, password?: string): Promise<'success' | 'fail' | 'change_password'> => {
    try {
      const data = await api.authAPI.login(username, password);
      const requiresPasswordChange = data.requiresPasswordChange || data.user?.isFirstLogin || false;
      setAuth({
        user: transformUser(data.user),
        isAuthenticated: true,
        requiresPasswordChange: requiresPasswordChange
      });

      // Don't refresh data if password change is required
      if (!requiresPasswordChange) {
        await refreshData();
      }

      return requiresPasswordChange ? 'change_password' : 'success';
    } catch (error: any) {
      console.error('Login error:', error);
      return 'fail';
    }
  };

  const manualLogin = (userData: any) => {
    const transformed = transformUser(userData);
    setAuth({
      user: transformed,
      isAuthenticated: true,
      requiresPasswordChange: false
    });
    // Trigger refresh to load all data
    setTimeout(refreshData, 100);
  };

  const logout = () => {
    api.authAPI.logout();
    setAuth({ user: null, isAuthenticated: false, requiresPasswordChange: false });
    setUsers([]);
    setAttendanceRecords([]);
    setLeaveRequests([]);
    setAuditLogs([]);
    setCompanyHolidays([]);
    setNotifications([]);
  };

  const changePassword = async (newPass: string): Promise<void> => {
    try {
      await api.authAPI.changePassword(newPass);
      if (auth.user) {
        setAuth({
          user: { ...auth.user, isFirstLogin: false },
          isAuthenticated: true,
          requiresPasswordChange: false
        });
      }
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  };

  const clockIn = async (): Promise<void> => {
    try {
      const data = await api.attendanceAPI.clockIn() as any;
      setAttendanceRecords(prev => [...prev, transformAttendance(data)]);
    } catch (error) {
      console.error('Clock in error:', error);
      throw error;
    }
  };

  const clockOut = async (): Promise<void> => {
    try {
      const data = await api.attendanceAPI.clockOut() as any;
      setAttendanceRecords(prev => prev.map(r =>
        r.id === data.id || r.id === data._id ? transformAttendance(data) : r
      ));
    } catch (error) {
      console.error('Clock out error:', error);
      throw error;
    }
  };

  const startBreak = async (type: BreakType, reason?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.startBreak(type, reason) as any;
      setAttendanceRecords(prev => prev.map(r =>
        r.id === data.id || r.id === data._id ? transformAttendance(data) : r
      ));
    } catch (error) {
      console.error('Start break error:', error);
      throw error;
    }
  };

  const endBreak = async (): Promise<void> => {
    try {
      const data = await api.attendanceAPI.endBreak() as any;
      setAttendanceRecords(prev => prev.map(r =>
        r.id === data.id || r.id === data._id ? transformAttendance(data) : r
      ));
    } catch (error) {
      console.error('End break error:', error);
      throw error;
    }
  };

  const requestLeave = async (req: Omit<LeaveRequest, 'id' | 'userId' | 'userName' | 'status' | 'createdAt'>): Promise<void> => {
    try {
      const data = await api.leaveAPI.requestLeave(req);
      setLeaveRequests(prev => [transformLeave(data), ...prev]);
      await refreshData(); // Refresh to get notifications
    } catch (error) {
      console.error('Request leave error:', error);
      throw error;
    }
  };

  const updateLeaveStatus = async (id: string, status: LeaveStatus, comment?: string): Promise<void> => {
    try {
      const data = await api.leaveAPI.updateLeaveStatus(id, status, comment) as any;
      setLeaveRequests(prev => prev.map(l =>
        l.id === id ? transformLeave(data) : l
      ));
      await refreshData(); // Refresh to get notifications
    } catch (error) {
      console.error('Update leave status error:', error);
      throw error;
    }
  };

  const createUser = async (userData: Omit<User, 'id' | 'password' | 'isFirstLogin'>): Promise<void> => {
    try {
      // Use authenticated endpoint - password is optional (will use tempPassword123)
      const { user } = await api.userAPI.createUser(userData) as any;
      setUsers(prev => [...prev, transformUser(user)]);
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  };

  const updateUser = async (id: string, updates: { paidLeaveAllocation?: number | null; name?: string; email?: string; department?: string; joiningDate?: string; bonds?: any[]; aadhaarNumber?: string; guardianName?: string; mobileNumber?: string }): Promise<void> => {
    try {
      const { user } = await api.userAPI.updateUser(id, updates) as any;
      const transformedUser = transformUser(user);

      // Update users list
      setUsers(prev => prev.map(u => u.id === id ? transformedUser : u));

      // If the updated user is the currently logged-in user, update auth.user as well
      if (auth.user && auth.user.id === id) {
        setAuth(prev => ({
          ...prev,
          user: transformedUser
        }));
      }

      await refreshData(); // Refresh to get updated data
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  };

  const adminUpdateAttendance = async (recordId: string, updates: Partial<Attendance>, breakDurationMinutes?: number): Promise<void> => {
    try {
      const updateData: any = { ...updates };
      if (breakDurationMinutes !== undefined) {
        updateData.breakDurationMinutes = breakDurationMinutes;
      }
      const data = await api.attendanceAPI.updateAttendance(recordId, updateData);
      setAttendanceRecords(prev => prev.map(r =>
        r.id === recordId ? transformAttendance(data) : r
      ));
      await refreshData(); // Refresh audit logs
    } catch (error) {
      console.error('Admin update attendance error:', error);
      throw error;
    }
  };

  const addCompanyHoliday = async (date: string, description: string): Promise<void> => {
    try {
      const data = await api.holidayAPI.addHoliday(date, description);
      setCompanyHolidays(prev => [...prev, transformHoliday(data)].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ));
      await refreshData(); // Refresh to get notifications
    } catch (error) {
      console.error('Add holiday error:', error);
      throw error;
    }
  };

  const updateSystemSettings = async (settings: Partial<SystemSettings>): Promise<void> => {
    try {
      const data = await api.settingsAPI.updateSettings(settings) as any;
      setSystemSettings({ timezone: data.timezone || 'Asia/Kolkata' });
      await refreshData(); // Refresh audit logs
    } catch (error) {
      console.error('Update settings error:', error);
      throw error;
    }
  };

  const exportReports = async (filters?: { start?: string; end?: string; department?: string }): Promise<void> => {
    try {
      const data = await api.reportAPI.exportAttendanceReport({
        startDate: filters?.start,
        endDate: filters?.end,
        department: filters?.department
      }) as any;
      downloadCSV(`attendance_report_${getTodayStr()}.csv`, data);
    } catch (error) {
      console.error('Export report error:', error);
      throw error;
    }
  };

  return (
    <AppContext.Provider value={{
      auth,
      login,
      manualLogin,
      logout,
      changePassword,
      users,
      attendanceRecords,
      leaveRequests,
      auditLogs,
      companyHolidays,
      notifications,
      systemSettings,
      loading,
      checkingAuth,
      clockIn,
      clockOut,
      startBreak,
      endBreak,
      requestLeave,
      updateLeaveStatus,
      createUser,
      updateUser,
      adminUpdateAttendance,
      addCompanyHoliday,
      exportReports,
      updateSystemSettings,
      refreshData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
