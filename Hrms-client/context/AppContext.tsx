import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { User, Attendance, LeaveRequest, Role, LeaveStatus, Break, BreakType, AuthState, CompanyHoliday, Notification, LeaveCategory, SystemSettings } from '../types';
import { downloadCSV, formatDate, formatDuration, getTodayStr, convertToDDMMYYYY, convertToYYYYMMDD, calculateBondRemaining, parseDDMMYYYY, isLateCheckIn, isPenaltyEffective, calculateLatenessPenaltySeconds, resolveLatePenaltyStartTime, DEFAULT_LATE_PENALTY_START_TIME } from '../services/utils';
import * as api from '../services/api';
import { FULL_REFRESH_SCOPE, RefreshScope, getRefreshScopeForPath } from './routeRefreshScopes';

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
  updateUser: (id: string, updates: { 
    paidLeaveAllocation?: number | null; 
    paidLeaveAction?: 'set' | 'add'; 
    manualPaidLeaveAdjustment?: number;
    manualExtraTimeAdjustment?: number;
    manualUnpaidLeaveAdjustment?: number;
    manualHalfDayLeaveAdjustment?: number;
    name?: string; 
    email?: string; 
    department?: string; 
    joiningDate?: string; 
    bonds?: any[]; 
    aadhaarNumber?: string; 
    guardianName?: string; 
    mobileNumber?: string; 
    guardianMobileNumber?: string;
    lastForwardedMonth?: string;
    forwardedMonths?: Record<string, number>;
    forwardedInMonths?: Record<string, number>;
    defaultCheckInTime?: string | null;
    defaultCheckoutTime?: string | null;
    setCheckInOverride?: { date: string; time: string };
    removeCheckInOverrideDate?: string;
    setCheckoutOverride?: { date: string; time: string };
    removeCheckoutOverrideDate?: string;
    clearCheckInSchedule?: boolean;
    clearCheckoutSchedule?: boolean;
  }) => Promise<void>;

  // Admin/HR Actions
  adminUpdateAttendance: (recordId: string, updates: Partial<Attendance>, breakDurationMinutes?: number) => Promise<void>;
  addCompanyHoliday: (date: string, description: string) => Promise<void>;
  autoAddSundays: () => Promise<void>;
  exportReports: (filters?: { start?: string; end?: string; department?: string }) => Promise<void>;
  updateSystemSettings: (settings: Partial<SystemSettings> & {
    setCheckInOverride?: { date: string; time: string };
    removeCheckInOverrideDate?: string;
    setCheckoutOverride?: { date: string; time: string };
    removeCheckoutOverrideDate?: string;
  }) => Promise<void>;
  reviewEarlyCheckout: (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string) => Promise<void>;
  requestEarlyOvertime: (reason: string, durationMinutes: number, date?: string) => Promise<void>;
  requestManagementOvertime: (reason: string, date?: string) => Promise<void>;
  reviewManagementOvertime: (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string) => Promise<void>;
  requestEarlyOtRepayment: (reason: string, durationMinutes: number, date?: string) => Promise<void>;
  reviewEarlyOtRepayment: (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string) => Promise<void>;
  requestEarlyLeaveOvertime: (note?: string, date?: string) => Promise<void>;
  manageOvertimeRequest: (
    recordId: string,
    data: {
      allocationType: 'General' | 'Management' | 'EarlyRequest' | 'Custom';
      allocations?: {
        generalMinutes: number;
        managementMinutes: number;
        earlyRequestMinutes: number;
      };
      adminNote?: string;
    }
  ) => Promise<void>;
  
  // Refresh functions
  refreshData: (silent?: boolean, scope?: RefreshScope | 'full') => Promise<void>;
  refreshForRoute: (pathname: string, silent?: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to transform API user to frontend User type
export const transformUser = (apiUser: any): User => ({
  id: apiUser.id || apiUser._id,
  name: apiUser.name,
  username: apiUser.username,
  email: apiUser.email,
  role: apiUser.role as Role,
  department: apiUser.department,
  isActive: apiUser.isActive,
  isFirstLogin: apiUser.isFirstLogin,
  lastLogin: apiUser.lastLogin,
  paidLeaveAccess: apiUser.paidLeaveAccess !== false,
  paidLeaveAllocation: apiUser.paidLeaveAllocation !== undefined ? apiUser.paidLeaveAllocation : null,
  paidLeaveLastAllocatedDate: apiUser.paidLeaveLastAllocatedDate ? new Date(apiUser.paidLeaveLastAllocatedDate).toISOString() : undefined,
  manualPaidLeaveAdjustment: apiUser.manualPaidLeaveAdjustment || 0,
  manualExtraTimeAdjustment: apiUser.manualExtraTimeAdjustment || 0,
  manualUnpaidLeaveAdjustment: apiUser.manualUnpaidLeaveAdjustment || 0,
  manualHalfDayLeaveAdjustment: apiUser.manualHalfDayLeaveAdjustment || 0,
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
  guardianMobileNumber: apiUser.guardianMobileNumber || undefined,
  bankName: apiUser.bankName || undefined,
  bankAccountHolderName: apiUser.bankAccountHolderName || undefined,
  bankAccountNumber: apiUser.bankAccountNumber || undefined,
  bankIfscCode: apiUser.bankIfscCode || undefined,
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
  })) : undefined,
  salarySlips: apiUser.salarySlips && Array.isArray(apiUser.salarySlips) ? apiUser.salarySlips : undefined,
  lastForwardedMonth: apiUser.lastForwardedMonth,
  forwardedMonths: apiUser.forwardedMonths,
  forwardedInMonths: apiUser.forwardedInMonths,
  defaultCheckInTime: apiUser.defaultCheckInTime || null,
  checkInTimeOverrides: apiUser.checkInTimeOverrides
    ? (apiUser.checkInTimeOverrides instanceof Map
        ? Object.fromEntries(apiUser.checkInTimeOverrides.entries())
        : { ...apiUser.checkInTimeOverrides })
    : {},
  defaultCheckoutTime: apiUser.defaultCheckoutTime || null,
  checkoutTimeOverrides: apiUser.checkoutTimeOverrides
    ? (apiUser.checkoutTimeOverrides instanceof Map
        ? Object.fromEntries(apiUser.checkoutTimeOverrides.entries())
        : { ...apiUser.checkoutTimeOverrides })
    : {},
  createdAt: apiUser.createdAt,
  updatedAt: apiUser.updatedAt
});

// Helper to transform API attendance to frontend Attendance type
const transformAttendance = (
  apiAttendance: any,
  options?: { latePenaltyStartTime?: string; timeZone?: string }
): Attendance => {
  const timeZone = options?.timeZone || 'Asia/Kolkata';
  const recordDate = apiAttendance.date?.split('T')[0] || apiAttendance.date;
  const penaltyCutoff = resolveLatePenaltyStartTime(
    { latePenaltyStartTime: options?.latePenaltyStartTime, timezone: timeZone },
    recordDate
  );
  const penaltyDisabled = !!apiAttendance.isPenaltyDisabled;
  const penaltyEffective = isPenaltyEffective(apiAttendance.date);
  const late = isLateCheckIn(apiAttendance.checkIn, penaltyCutoff, timeZone);

  // Prefer server-calculated penalty (includes per-employee schedule + buffer rules).
  const penaltySeconds =
    penaltyDisabled || !penaltyEffective
      ? 0
      : typeof apiAttendance.penaltySeconds === 'number'
        ? apiAttendance.penaltySeconds
        : !late
          ? 0
          : calculateLatenessPenaltySeconds(apiAttendance.checkIn, penaltyCutoff, timeZone);

  return {
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
    totalWorkedSeconds: apiAttendance.totalWorkedSeconds ?? 0,
    lowTimeFlag: apiAttendance.lowTimeFlag || false,
    extraTimeFlag: apiAttendance.extraTimeFlag || false,
    penaltySeconds,
    lateCheckIn: late,
    isManualFlag: apiAttendance.isManualFlag || false,
    isPenaltyDisabled: penaltyDisabled,
    isCompulsoryBreakDisabled: !!apiAttendance.isCompulsoryBreakDisabled,
    notes: apiAttendance.notes,
    manualHours: apiAttendance.manualHours || [],
    earlyLogoutRequest: apiAttendance.earlyLogoutRequest || 'None',
    earlyLogoutRequestNote: apiAttendance.earlyLogoutRequestNote,
    generalOvertimeMinutes: (() => {
      const stored = apiAttendance.generalOvertimeMinutes;
      if (typeof stored === 'number' && stored > 0) return stored;
      const ot = apiAttendance.overtimeRequest;
      if (ot?.completedMinutes > 0) return ot.completedMinutes;
      if (ot?.status === 'Approved' && ot?.durationMinutes > 0) return ot.durationMinutes;
      return stored ?? 0;
    })(),
    managementOvertime: apiAttendance.managementOvertime ?? {
      reason: '',
      durationMinutes: 0,
      status: 'None',
      completedMinutes: 0
    },
    earlyOvertime: (() => {
      const eo = apiAttendance.earlyOvertime ?? {};
      const earlyReq = apiAttendance.earlyLogoutRequest;
      let requestStatus: 'None' | 'Pending' | 'Approved' | 'Rejected' = eo.requestStatus || 'None';
      if (requestStatus === 'None' && earlyReq && earlyReq !== 'None') {
        requestStatus = earlyReq as 'Pending' | 'Approved' | 'Rejected';
      }
      return {
        reason: eo.reason || apiAttendance.earlyLogoutRequestNote || '',
        durationMinutes: eo.durationMinutes || 0,
        requestStatus,
        requestedAt: eo.requestedAt,
        approvedBy: eo.approvedBy,
        approvedAt: eo.approvedAt,
        deficitMinutes: eo.deficitMinutes || 0,
        coveredMinutes: eo.coveredMinutes || 0,
        completedMinutes: eo.completedMinutes || 0,
        status: eo.status || 'None'
      };
    })(),
    overtimeRequest: apiAttendance.overtimeRequest,
    earlyOvertimeRepayment: apiAttendance.earlyOvertimeRepayment ?? {
      requestedMinutes: 0,
      reason: '',
      status: 'None',
      appliedMinutes: 0
    },
    overtimeManageRequest: apiAttendance.overtimeManageRequest ?? {
      status: 'None',
      note: '',
      extraMinutes: 0,
      allocationType: 'None',
      allocations: {
        generalMinutes: 0,
        managementMinutes: 0,
        earlyRequestMinutes: 0
      }
    }
  };
};

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
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    timezone: 'Asia/Kolkata',
    defaultCheckInTime: '08:30',
    checkInTimeOverrides: {},
    defaultCheckoutTime: '17:30',
    checkoutTimeOverrides: {},
    latePenaltyStartTime: '09:15'
  });
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const refreshData = React.useCallback(async (silent: boolean = false, scopeInput?: RefreshScope | 'full') => {
    if (!auth.isAuthenticated) return;

    const isHRorAdmin = auth.user?.role === Role.HR || auth.user?.role === Role.ADMIN;
    const scope: RefreshScope =
      scopeInput === undefined || scopeInput === 'full'
        ? { ...FULL_REFRESH_SCOPE }
        : { ...scopeInput };

    if (!Object.values(scope).some(Boolean)) return;

    try {
      if (!silent) setLoading(true);

      let todayAttendance: any = null;

      if (scope.today) {
        todayAttendance = await api.attendanceAPI.getToday().catch(() => null);
        if (todayAttendance) {
          const todayTransformed = transformAttendance(todayAttendance);
          setAttendanceRecords(prev => {
            const filtered = prev.filter(
              a => !(a.date === todayTransformed.date && a.userId === todayTransformed.userId)
            );
            return [todayTransformed, ...filtered];
          });
        }
      }

      const parallelTasks: Promise<void>[] = [];

      if (scope.users) {
        parallelTasks.push(
          api.userAPI
            .getAllUsers()
            .catch(() => [])
            .then((usersData: any) => {
              const transformedUsers = (Array.isArray(usersData) ? usersData : []).map(transformUser);
              setUsers(transformedUsers);
              if (auth.user) {
                const updatedCurrentUser = transformedUsers.find(u => u.id === auth.user?.id);
                if (updatedCurrentUser) {
                  setAuth(prev => ({ ...prev, user: updatedCurrentUser }));
                }
              }
            })
        );
      }

      if (scope.attendance) {
        parallelTasks.push(
          (isHRorAdmin
            ? api.attendanceAPI.getAll()
            : auth.user?.id
              ? api.attendanceAPI.getHistory()
              : Promise.resolve([])
          )
            .catch(() => [])
            .then((attendanceHistory: any) => {
              const allAttendance = (Array.isArray(attendanceHistory) ? attendanceHistory : []).map(
                transformAttendance
              );

              if (todayAttendance) {
                const todayTransformed = transformAttendance(todayAttendance);
                const todayExists = allAttendance.find(
                  a => a.date === todayTransformed.date && a.userId === todayTransformed.userId
                );
                if (todayExists) {
                  const index = allAttendance.findIndex(a => a.id === todayExists.id);
                  allAttendance[index] = todayTransformed;
                } else {
                  allAttendance.unshift(todayTransformed);
                }
              }

              setAttendanceRecords(allAttendance);
            })
        );
      }

      if (scope.leaves) {
        parallelTasks.push(
          (isHRorAdmin
            ? api.leaveAPI.getAllLeaves()
            : auth.user?.id
              ? api.leaveAPI.getLeavesByUserId(auth.user.id)
              : Promise.resolve([])
          )
            .catch(() => [])
            .then((leavesData: any) => {
              setLeaveRequests((Array.isArray(leavesData) ? leavesData : []).map(transformLeave));
            })
        );
      }

      if (scope.holidays) {
        parallelTasks.push(
          api.holidayAPI
            .getHolidays()
            .catch(() => [])
            .then((holidaysData: any) => {
              setCompanyHolidays((Array.isArray(holidaysData) ? holidaysData : []).map(transformHoliday));
            })
        );
      }

      if (scope.notifications) {
        parallelTasks.push(
          api.notificationAPI
            .getMyNotifications()
            .catch(() => [])
            .then((notifsData: any) => {
              setNotifications((Array.isArray(notifsData) ? notifsData : []).map(transformNotification));
            })
        );
      }

      if (scope.settings) {
        parallelTasks.push(
          api.settingsAPI
            .getSettings()
            .catch(() => ({ timezone: 'Asia/Kolkata' }))
            .then((settingsData: any) => {
              setSystemSettings({
                timezone: settingsData?.timezone || 'Asia/Kolkata',
                defaultCheckInTime: settingsData?.defaultCheckInTime || '08:30',
                checkInTimeOverrides: settingsData?.checkInTimeOverrides || {},
                defaultCheckoutTime: settingsData?.defaultCheckoutTime || '17:30',
                checkoutTimeOverrides: settingsData?.checkoutTimeOverrides || {},
                latePenaltyStartTime: settingsData?.latePenaltyStartTime || '09:15'
              });
            })
        );
      }

      await Promise.all(parallelTasks);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [auth.isAuthenticated, auth.user?.id, auth.user?.role]);

  const refreshForRoute = React.useCallback(
    async (pathname: string, silent: boolean = false) => {
      if (!auth.user?.role) return;
      const scope = getRefreshScopeForPath(pathname, auth.user.role);
      return refreshData(silent, scope);
    },
    [auth.user?.role, refreshData]
  );

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
        await refreshForRoute('/');
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
    setTimeout(() => refreshForRoute('/'), 100);
  };

  const logout = () => {
    api.authAPI.logout();
    setAuth({ user: null, isAuthenticated: false, requiresPasswordChange: false });
    setUsers([]);
    setAttendanceRecords([]);
    setLeaveRequests([]);
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

  const updateUser = async (id: string, updates: { 
    paidLeaveAllocation?: number | null; 
    paidLeaveAction?: 'set' | 'add';
    paidLeaveAccess?: boolean;
    manualPaidLeaveAdjustment?: number;
    manualExtraTimeAdjustment?: number;
    manualUnpaidLeaveAdjustment?: number;
    manualHalfDayLeaveAdjustment?: number;
    name?: string; 
    email?: string; 
    department?: string; 
    joiningDate?: string; 
    bonds?: any[]; 
    aadhaarNumber?: string; 
    guardianName?: string; 
    mobileNumber?: string; 
    guardianMobileNumber?: string;
    defaultCheckInTime?: string | null;
    defaultCheckoutTime?: string | null;
    setCheckInOverride?: { date: string; time: string };
    removeCheckInOverrideDate?: string;
    setCheckoutOverride?: { date: string; time: string };
    removeCheckoutOverrideDate?: string;
    clearCheckInSchedule?: boolean;
    clearCheckoutSchedule?: boolean;
  }): Promise<void> => {
    try {
      console.log('Context updateUser called with:', updates);
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

  const deleteAttendance = async (recordId: string): Promise<void> => {
    try {
      await api.attendanceAPI.deleteAttendance(recordId);
      setAttendanceRecords(prev => prev.filter(r => r.id !== recordId));
    } catch (error) {
      console.error('Delete attendance error:', error);
      throw error;
    }
  };

  const updateLeaveRequest = async (id: string, leaveData: any): Promise<void> => {
    try {
      const data = await api.leaveAPI.updateLeaveRequest(id, leaveData) as any;
      setLeaveRequests(prev => prev.map(l => l.id === id ? transformLeave(data) : l));
    } catch (error) {
      console.error('Update leave request error:', error);
      throw error;
    }
  };

  const deleteLeaveRequest = async (id: string): Promise<void> => {
    try {
      await api.leaveAPI.deleteLeaveRequest(id);
      setLeaveRequests(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error('Delete leave request error:', error);
      throw error;
    }
  };

  const addHoliday = async (date: string, description: string): Promise<void> => {
    try {
      await api.holidayAPI.addHoliday(date, description);
      await refreshData();
    } catch (error) {
      console.error('Add holiday error:', error);
      throw error;
    }
  };

  const updateHoliday = async (id: string, holidayData: any): Promise<void> => {
    try {
      await api.holidayAPI.updateHoliday(id, holidayData);
      await refreshData();
    } catch (error) {
      console.error('Update holiday error:', error);
      throw error;
    }
  };

  const deleteHoliday = async (id: string): Promise<void> => {
    try {
      await api.holidayAPI.deleteHoliday(id);
      await refreshData();
    } catch (error) {
      console.error('Delete holiday error:', error);
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
      await refreshData(true); // Refresh silently to get notifications
    } catch (error) {
      console.error('Add holiday error:', error);
      throw error;
    }
  };

  const updateSystemSettings = async (settings: Partial<SystemSettings>): Promise<void> => {
    try {
      const data = await api.settingsAPI.updateSettings(settings) as any;
      setSystemSettings({
        timezone: data.timezone || 'Asia/Kolkata',
        defaultCheckInTime: data.defaultCheckInTime || '08:30',
        checkInTimeOverrides: data.checkInTimeOverrides || {},
        defaultCheckoutTime: data.defaultCheckoutTime || '17:30',
        checkoutTimeOverrides: data.checkoutTimeOverrides || {},
        latePenaltyStartTime: data.latePenaltyStartTime || '09:15'
      });
      await refreshData(); // Refresh audit logs
    } catch (error) {
      console.error('Update settings error:', error);
      throw error;
    }
  };

  const reviewEarlyCheckout = async (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.reviewEarlyCheckout(recordId, status, adminNote);
      setAttendanceRecords(prev => prev.map(r =>
        r.id === recordId ? transformAttendance(data) : r
      ));
      await refreshData(true);
    } catch (error) {
      console.error('Review early checkout error:', error);
      throw error;
    }
  };

  const requestEarlyOvertime = async (reason: string, durationMinutes: number, date?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.requestEarlyOvertime(reason, durationMinutes, date);
      const transformed = transformAttendance(data);
      setAttendanceRecords(prev => {
        const idx = prev.findIndex(r => r.id === transformed.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = transformed;
          return next;
        }
        return [transformed, ...prev];
      });
    } catch (error) {
      console.error('Request early overtime error:', error);
      throw error;
    }
  };

  const requestManagementOvertime = async (reason: string, date?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.requestOvertime(reason, date);
      const transformed = transformAttendance(data);
      setAttendanceRecords(prev => {
        const idx = prev.findIndex(r => r.id === transformed.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = transformed;
          return next;
        }
        return [transformed, ...prev];
      });
    } catch (error) {
      console.error('Request management overtime error:', error);
      throw error;
    }
  };

  const reviewManagementOvertime = async (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.reviewOvertime(recordId, status, adminNote);
      setAttendanceRecords(prev => prev.map(r =>
        r.id === recordId ? transformAttendance(data) : r
      ));
      await refreshData(true);
    } catch (error) {
      console.error('Review management overtime error:', error);
      throw error;
    }
  };

  const requestEarlyOtRepayment = async (reason: string, durationMinutes: number, date?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.requestEarlyOtRepayment(reason, durationMinutes, date);
      const transformed = transformAttendance(data);
      setAttendanceRecords(prev => {
        const idx = prev.findIndex(r => r.id === transformed.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = transformed;
          return next;
        }
        return [transformed, ...prev];
      });
    } catch (error) {
      console.error('Request early OT repayment error:', error);
      throw error;
    }
  };

  const reviewEarlyOtRepayment = async (recordId: string, status: 'Approved' | 'Rejected', adminNote?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.reviewEarlyOtRepayment(recordId, status, adminNote);
      setAttendanceRecords(prev => prev.map(r =>
        r.id === recordId ? transformAttendance(data) : r
      ));
      await refreshData(true);
    } catch (error) {
      console.error('Review early OT repayment error:', error);
      throw error;
    }
  };

  const requestEarlyLeaveOvertime = async (note?: string, date?: string): Promise<void> => {
    try {
      const data = await api.attendanceAPI.requestEarlyLeaveOvertime(note, date);
      const transformed = transformAttendance(data);
      setAttendanceRecords(prev => {
        const idx = prev.findIndex(r => r.id === transformed.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = transformed;
          return next;
        }
        return [transformed, ...prev];
      });
    } catch (error) {
      console.error('Request early leave overtime error:', error);
      throw error;
    }
  };

  const manageOvertimeRequestFn = async (
    recordId: string,
    data: {
      allocationType: 'General' | 'Management' | 'EarlyRequest' | 'Custom';
      allocations?: {
        generalMinutes: number;
        managementMinutes: number;
        earlyRequestMinutes: number;
      };
      adminNote?: string;
    }
  ): Promise<void> => {
    try {
      const result = await api.attendanceAPI.manageOvertime(recordId, data);
      setAttendanceRecords(prev => prev.map(r =>
        r.id === recordId ? transformAttendance(result) : r
      ));
      await refreshData(true);
    } catch (error) {
      console.error('Manage overtime request error:', error);
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
      deleteAttendance,
      updateLeaveRequest,
      deleteLeaveRequest,
      addHoliday,
      updateHoliday,
      deleteHoliday,
      addCompanyHoliday,
      autoAddSundays: async () => {
        try {
          await api.holidayAPI.autoAddSundays();
          await refreshData();
        } catch (error) {
          console.error('Auto add Sundays error:', error);
          throw error;
        }
      },
      exportReports,
      updateSystemSettings,
      reviewEarlyCheckout,
      requestEarlyOvertime,
      requestManagementOvertime,
      reviewManagementOvertime,
      requestEarlyOtRepayment,
      reviewEarlyOtRepayment,
      requestEarlyLeaveOvertime,
      manageOvertimeRequest: manageOvertimeRequestFn,
      refreshData,
      refreshForRoute
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
