import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, LeaveCategory, LeaveStatus, User, Attendance } from '../types';
import { Download, FileText, Activity, Users, Calendar, Plus, PenTool, Globe, Clock, LogIn, LogOut, Coffee, TrendingUp, TrendingDown, CheckCircle, Timer, Bell, X, UserPlus, Trash2, Edit2, AlertCircle, Mail, BookOpen, HelpCircle, ArrowRight, DollarSign, Key, RotateCcw, LayoutDashboard, ChevronLeft, ChevronRight, Scroll, History, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { formatDate, getTodayStr, getLocalISOString, formatDuration, convertToDDMMYYYY, convertToYYYYMMDD, calculateBondRemaining, parseDDMMYYYY, isPenaltyEffective, calculateLatenessPenaltySeconds, calculateDailyTimeStats, ABSENCE_PENALTY_EFFECTIVE_DATE, downloadCSV, getAbsenceStartDate } from '../services/utils';
import { calculateSalaryBreakdown, SalaryBreakdownRow } from '../services/salaryBreakdownUtils';
import { attendanceAPI, notificationAPI, userAPI, authAPI, holidayAPI } from '../services/api';

// Format hours to hours and minutes format (e.g., 8.25 hours = 8h 15m)
const formatHoursToHoursMinutes = (hours: number) => {
  const isNegative = hours < 0;
  const absHours = Math.abs(hours);
  const h = Math.floor(absHours);
  const m = Math.round((absHours - h) * 60);

  let result = '';
  if (h === 0 && m === 0) return '0m';
  if (h > 0 && m > 0) result = `${h}h ${m}m`;
  else if (h > 0) result = `${h}h`;
  else result = `${m}m`;

  return isNegative ? `-${result}` : result;
};

export const AdminDashboard: React.FC = () => {
  const { auth, users, auditLogs, exportReports, companyHolidays, addCompanyHoliday, attendanceRecords, systemSettings, updateSystemSettings, refreshData, notifications, leaveRequests, updateUser, updateLeaveStatus, deleteAttendance, updateLeaveRequest, deleteLeaveRequest, updateHoliday, deleteHoliday, adminUpdateAttendance, pendingOvertimeRequests, reviewOvertime } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'consolidated' | 'summary' | 'users' | 'audit' | 'reports' | 'settings' | 'guidance' | 'bonds' | 'overtime'>(
    location.pathname === '/admin-dashboard' ? 'consolidated' : 
    location.pathname === '/admin-overtime' ? 'overtime' : 'summary'
  );

  useEffect(() => {
    const path = location.pathname;
    if (path === '/admin-dashboard' || path === '/') setActiveTab('consolidated');
    else if (path === '/admin-summary') setActiveTab('summary');
    else if (path === '/admin-users') setActiveTab('users');
    else if (path === '/admin-audit') setActiveTab('audit');
    else if (path === '/admin-system') setActiveTab('reports');
    else if (path === '/admin-settings') setActiveTab('settings');
    else if (path === '/admin-guidance') setActiveTab('guidance');
    else if (path === '/admin-bonds') setActiveTab('bonds');

    if (location.state?.openAddUserModal) {
      setIsCreateUserModalOpen(true);
      // Clear the state to prevent re-opening on manual refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  // Pagination for Users table
  const USERS_PER_PAGE = 10;
  const [userPage, setUserPage] = useState(1);

  // Bond Management states
  const [bondSearchTerm, setBondSearchTerm] = useState('');
  const [bondStatusFilter, setBondStatusFilter] = useState<'All' | 'Completed' | 'Expiring Soon' | 'Active' | "This Month's Shifts">('All');

  // User management states
  const [newUser, setNewUser] = useState({
    name: '',
    username: '',
    email: '',
    department: '',
    role: 'Employee',
    joiningDate: '',
    bonds: [] as Array<{ type: string; periodMonths: string; startDate: string }>,
    aadhaarNumber: '',
    guardianName: '',
    mobileNumber: '',
    guardianMobileNumber: ''
  });
  const [salaryBreakdownRows, setSalaryBreakdownRows] = useState<SalaryBreakdownRow[]>([]);
  const [salaryBreakdownData, setSalaryBreakdownData] = useState<{ [key: string]: number }>({});

  const [editingAttendance, setEditingAttendance] = useState<any>(null);

  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });
  const [correction, setCorrection] = useState({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '', isPenaltyDisabled: false });
  const [reportFilters, setReportFilters] = useState({ start: '', end: '', department: '' });
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<User | null>(null);
  const [newEmployeePassword, setNewEmployeePassword] = useState('');

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset || !newEmployeePassword) return;

    if (newEmployeePassword.length < 4) {
      alert('Password must be at least 4 characters');
      return;
    }

    try {
      await userAPI.updateUser(selectedUserForReset.id, {
        password: newEmployeePassword
      });

      setResetPasswordModalOpen(false);
      setNewEmployeePassword('');
      setSelectedUserForReset(null);
      alert('Password reset successfully');
      refreshData();
    } catch (error: any) {
      console.error('Failed to reset password:', error);
      alert(error.message || 'Failed to reset password');
    }
  };

  // Summary states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Summary Tab Filtering & Pagination
  const [summarySearchTerm, setSummarySearchTerm] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const SUMMARY_USERS_PER_PAGE = 8;
  
  // Forward Overtime Modal states
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardingUser, setForwardingUser] = useState<User | null>(null);
  const [forwardingMonthStr, setForwardingMonthStr] = useState("");
  const [manualForwardHours, setManualForwardHours] = useState("");
  const [manualForwardMinutes, setManualForwardMinutes] = useState("");
  const [systemSuggestedSeconds, setSystemSuggestedSeconds] = useState(0);

  const timezones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

  // Memoized holiday date Set — shared across all computations, rebuilt only when holidays list changes
  const holidayDateSet = useMemo(() => new Set(
    companyHolidays.map(h => typeof h.date === 'string' && !h.date.includes('T') ? h.date : getLocalISOString(new Date(h.date)))
  ), [companyHolidays]);
  const selectedUser = users.find(u => u.id === selectedUserId);
  
  // Get monthly attendance for selected user
  const monthlyAttendance = useMemo(() => {
    if (!selectedUserId || !selectedMonth) return [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    // Get existing records
    const existingRecords = attendanceRecords
      .filter(record => {
        if (record.userId !== selectedUserId) return false;
        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
      });

    // Create a map of existing records by date (YYYY-MM-DD)
    const recordsMap = new Map();
    existingRecords.forEach(r => {
      const dateStr = typeof r.date === 'string' && !r.date.includes('T') ? r.date : getLocalISOString(new Date(r.date));
      recordsMap.set(dateStr, r);
    });

    const todayStr = getTodayStr();

    // Get leaves for this month (already available in monthlyLeaves)
    // We'll use a set of dates covered by approved leaves
    const leaveDates = new Set();
    leaveRequests.filter(l => l.userId === selectedUserId && l.status === LeaveStatus.APPROVED).forEach(l => {
      let curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        leaveDates.add(getLocalISOString(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });

    // Final records list
    const finalRecords = [...existingRecords];

    // Find gaps for "Absent" injection (only for working days until today)
    const now = new Date();
    const iter = new Date(startDate);
    const endRange = endDate < now ? endDate : now;

    while (iter <= endRange) {
      const dateStr = getLocalISOString(iter);
      const dayOfWeek = iter.getDay(); // 0 = Sunday

      // If no attendance, no leave, not Sunday, and not holiday -> inject Absent
      // ONLY inject if on or after the rule-based absence start date
      // AND strictly before today (don't mark today as absent before it's over)
      const firstCheckIn = attendanceRecords
        .filter(r => r.userId === selectedUserId && r.checkIn)
        .sort((a, b) => {
          const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
          const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
          return d1.localeCompare(d2);
        })[0]?.date;
      const absenceStart = getAbsenceStartDate(selectedUser, firstCheckIn);
      if (!recordsMap.has(dateStr) && !leaveDates.has(dateStr) && dayOfWeek !== 0 && !holidayDateSet.has(dateStr) && dateStr >= absenceStart && dateStr < todayStr) {
        finalRecords.push({
          id: `virtual-absent-${dateStr}`,
          userId: selectedUserId,
          date: dateStr,
          status: 'Absent',
          totalWorkedSeconds: 0,
          isVirtual: true,
          isPenaltyDisabled: false
        });
      }
      iter.setDate(iter.getDate() + 1);
    }

    return finalRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [attendanceRecords, selectedUserId, selectedMonth, leaveRequests, holidayDateSet, selectedUser]);

  // Pagination logic for All Users table
  const totalUserPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * USERS_PER_PAGE;
    return users.slice(start, start + USERS_PER_PAGE);
  }, [users, userPage]);

  // Reset user page if users count changes significantly
  useEffect(() => {
    if (userPage > totalUserPages) setUserPage(Math.max(1, totalUserPages));
  }, [users.length, totalUserPages, userPage]);

  // Get leaves for selected user in selected month
  const monthlyLeaves = useMemo(() => {
    if (!selectedUserId || !selectedMonth) return [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    return leaveRequests
      .filter(leave => {
        if (leave.userId !== selectedUserId) return false;
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        return (leaveStart >= startDate && leaveStart <= endDate) ||
          (leaveEnd >= startDate && leaveEnd <= endDate) ||
          (leaveStart <= startDate && leaveEnd >= endDate);
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [leaveRequests, selectedUserId, selectedMonth]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Approved' | 'Rejected' | 'Pending'>('All');
  const [leaveFilterDate, setLeaveFilterDate] = useState('');
  const [leaveFilterMonth, setLeaveFilterMonth] = useState('');

  // Calculate working days (excluding Sundays and holidays) between two dates
  const calculateLeaveDays = (startDateStr: string, endDateStr: string, limitStart?: Date, limitEnd?: Date) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    // Ensure start <= end
    if (start > end) return 0;

    let days = 0;
    let current = new Date(start);
    
    // Apply bounds if provided
    if (limitStart && current < limitStart) {
      current = new Date(limitStart);
      current.setHours(0, 0, 0, 0);
    }
    
    let stopDate = new Date(end);
    if (limitEnd && stopDate > limitEnd) {
      stopDate = new Date(limitEnd);
      stopDate.setHours(23, 59, 59, 999);
    }

    while (current <= stopDate) {
      const dayOfWeek = current.getDay(); // 0 = Sunday
      const dateStr = current.toISOString().split('T')[0];

      // Exclude Sundays and holidays using the memoized holidayDateSet
      if (dayOfWeek !== 0 && !holidayDateSet.has(dateStr)) {
        days += 1;
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  // Get total paid leaves for a user (only admin allocated)
  const getTotalPaidLeaves = (user: User) => {
    // Only show admin allocated paid leaves (no default)
    return user.paidLeaveAllocation || 0;
  };

  // Calculate paid leave usage for all users — memoized to avoid recalc on every render
  const paidLeaveData = useMemo(() => users
    .filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR)
    .map(user => {
      const userLeaves = leaveRequests.filter(l => l.userId === user.id);
      const usedPaidLeaves = userLeaves
        .filter(leave => {
          const status = (leave.status || '').trim();
          return (status === 'Approved' || status === LeaveStatus.APPROVED) &&
            (leave.category === LeaveCategory.PAID ||
              (leave.category === LeaveCategory.HALF_DAY && (leave.reason || '').includes('[Paid Leave]')));
        })
        .reduce((sum, leave) => {
          if (leave.category === LeaveCategory.HALF_DAY) return sum + 0.5;
          return sum + calculateLeaveDays(leave.startDate, leave.endDate);
        }, 0);
      const totalAllocated = getTotalPaidLeaves(user);
      const manualPaidAdjustment = user.manualPaidLeaveAdjustment || 0;
      const manualHalfDayAdjustment = user.manualHalfDayLeaveAdjustment || 0;
      const totalUsedPaid = usedPaidLeaves + manualPaidAdjustment + manualHalfDayAdjustment;
      const remaining = totalAllocated - totalUsedPaid;
      return {
        user,
        allocated: totalAllocated,
        used: totalUsedPaid,
        remaining: Math.max(0, remaining)
      };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [users, leaveRequests, companyHolidays]);

  // Performance optimized attendance counting for Summary Table
  const userAttendanceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    attendanceRecords.forEach(r => {
      const uid = typeof r.userId === 'string' ? r.userId : (r.userId?.id || r.userId?._id || r.userId);
      if (uid) counts[uid] = (counts[uid] || 0) + 1;
    });
    return counts;
  }, [attendanceRecords]);

  // Filtered and Paginated users for Summary Tab
  const filteredSummaryUsers = useMemo(() => {
    return users.filter(u => {
      if (u.role === Role.ADMIN) return false;
      const matchesSearch =
        u.name.toLowerCase().includes(summarySearchTerm.toLowerCase()) ||
        u.department.toLowerCase().includes(summarySearchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [users, summarySearchTerm]);

  const totalSummaryPages = Math.ceil(filteredSummaryUsers.length / SUMMARY_USERS_PER_PAGE);

  const paginatedSummaryUsers = useMemo(() => {
    const start = (summaryPage - 1) * SUMMARY_USERS_PER_PAGE;
    return filteredSummaryUsers.slice(start, start + SUMMARY_USERS_PER_PAGE);
  }, [filteredSummaryUsers, summaryPage]);

  // Reset summary page if user search results change
  useEffect(() => {
    if (summaryPage > totalSummaryPages && totalSummaryPages > 0) {
      setSummaryPage(totalSummaryPages);
    }
  }, [totalSummaryPages, summaryPage]);

  const filteredMonthlyLeaves = useMemo(() => monthlyLeaves.filter(leave => {
    if (leaveStatusFilter !== 'All') {
      const status = (leave.status || '').trim();
      if (status !== leaveStatusFilter) return false;
    }
    if (leaveFilterDate) {
      const filterDate = new Date(leaveFilterDate);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      if (filterDate < leaveStart || filterDate > leaveEnd) return false;
    }
    if (leaveFilterMonth) {
      const [year, month] = leaveFilterMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      if (leaveEnd < monthStart || leaveStart > monthEnd) return false;
    }
    return true;
  }), [monthlyLeaves, leaveStatusFilter, leaveFilterDate, leaveFilterMonth]);

  const totalLeaveDays = useMemo(() => filteredMonthlyLeaves.reduce((sum, leave) => {
    return sum + calculateLeaveDays(leave.startDate, leave.endDate);
  }, 0), [filteredMonthlyLeaves, companyHolidays]);

  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [bondModalUser, setBondModalUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<{
    name: string;
    email: string;
    department: string;
    joiningDate: string;
    bonds: Array<{ type: string; periodMonths: string; startDate: string; salary: string }>;
    aadhaarNumber?: string;
    guardianName?: string;
    mobileNumber?: string;
    guardianMobileNumber?: string;
    paidLeaveAllocation?: string;
  }>({
    name: '',
    email: '',
    department: '',
    paidLeaveAllocation: '',
    joiningDate: '',
    bonds: [],
    aadhaarNumber: '',
    guardianName: '',
    mobileNumber: '',
    guardianMobileNumber: ''
  });
  const [deductSalaryUser, setDeductSalaryUser] = useState<User | null>(null);
  const [deductSalaryMonth, setDeductSalaryMonth] = useState(new Date().getMonth() + 1);
  const [deductSalaryYear, setDeductSalaryYear] = useState(new Date().getFullYear());
  const [deductionAmount, setDeductionAmount] = useState('');

  const [editSalaryBreakdownRows, setEditSalaryBreakdownRows] = useState<SalaryBreakdownRow[]>([]);
  const [editSalaryBreakdownData, setEditSalaryBreakdownData] = useState<{ [key: string]: number }>({});
  
  // Pagination for Monthly Performance Table
  const [performancePage, setPerformancePage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Show notifications popup only once per admin user per latest notification batch
  useEffect(() => {
    const currentUser = auth.user;
    if (!currentUser || notifications.length === 0) return;

    const storageKey = `admin_notif_popup_last_seen_${currentUser.id}`;
    const lastSeenStr = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    const lastSeen = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;

    const latestCreatedAt = notifications.reduce((max, n: any) => {
      if (!n.createdAt) return max;
      const t = new Date(n.createdAt).getTime();
      return t > max ? t : max;
    }, 0);

    if (latestCreatedAt > lastSeen) {
      setShowNotificationsPopup(true);
    }
  }, [notifications, auth.user?.id]);

  const handleCloseNotificationsPopup = () => {
    const currentUser = auth.user;
    if (currentUser && notifications.length > 0 && typeof window !== 'undefined') {
      const latestCreatedAt = notifications.reduce((max, n: any) => {
        if (!n.createdAt) return max;
        const t = new Date(n.createdAt).getTime();
        return t > max ? t : max;
      }, 0);
      if (latestCreatedAt > 0) {
        window.localStorage.setItem(`admin_notif_popup_last_seen_${currentUser.id}`, new Date(latestCreatedAt).toISOString());
      }
    }
    setShowNotificationsPopup(false);
  };

  // Calculate salary breakdown when joining date or bonds change
  useEffect(() => {
    if (newUser.joiningDate && newUser.bonds.length > 0) {
      const bonds = newUser.bonds
        .filter(b => b.periodMonths && parseInt(b.periodMonths) > 0)
        .map(b => ({
          type: b.type,
          periodMonths: parseInt(b.periodMonths),
          salary: parseFloat(b.salary) || 0
        }));

      if (bonds.length > 0) {
        const rows = calculateSalaryBreakdown(newUser.joiningDate, bonds);
        setSalaryBreakdownRows(rows);

        // Preserve existing custom salary values, only initialize new months
        setSalaryBreakdownData(prev => {
          const updatedData: { [key: string]: number } = { ...prev };
          rows.forEach((row) => {
            const key = `${row.month}-${row.year}`;
            // Only set default value if this month doesn't exist yet
            if (updatedData[key] === undefined) {
              updatedData[key] = row.salary;
            }
          });
          return updatedData;
        });
      } else {
        setSalaryBreakdownRows([]);
        setSalaryBreakdownData({});
      }
    } else {
      setSalaryBreakdownRows([]);
      setSalaryBreakdownData({});
    }
  }, [newUser.joiningDate, newUser.bonds]);

  // Calculate salary breakdown for edit form
  useEffect(() => {
    if (editUserForm.joiningDate && editUserForm.bonds.length > 0) {
      const bonds = editUserForm.bonds
        .filter(b => b.periodMonths && parseInt(b.periodMonths) > 0)
        .map(b => ({
          type: b.type,
          periodMonths: parseInt(b.periodMonths),
          salary: parseFloat(b.salary) || 0
        }));

      if (bonds.length > 0) {
        const rows = calculateSalaryBreakdown(editUserForm.joiningDate, bonds);
        setEditSalaryBreakdownRows(rows);

        // Load existing salary data from editingUser if available
        if (editingUser && editingUser.salaryBreakdown && editingUser.salaryBreakdown.length > 0) {
          const existingData: { [key: string]: number } = {};
          editingUser.salaryBreakdown.forEach((item: any) => {
            existingData[`${item.month}-${item.year}`] = item.amount || 0;
          });
          setEditSalaryBreakdownData(existingData);
        } else {
          // Preserve existing custom values, only initialize new months
          setEditSalaryBreakdownData(prev => {
            const updatedData: { [key: string]: number } = { ...prev };
            rows.forEach((row) => {
              const key = `${row.month}-${row.year}`;
              // Only set default value if this month doesn't exist yet
              if (updatedData[key] === undefined) {
                updatedData[key] = row.salary;
              }
            });
            return updatedData;
          });
        }
      } else {
        setEditSalaryBreakdownRows([]);
        setEditSalaryBreakdownData({});
      }
    } else {
      setEditSalaryBreakdownRows([]);
      setEditSalaryBreakdownData({});
    }
  }, [editUserForm.joiningDate, editUserForm.bonds, editingUser]);

  // Helper to calculate break seconds from breaks array
  const getBreakSeconds = (breaks: any[]) => {
    if (!breaks || !Array.isArray(breaks)) return 0;
    return breaks.reduce((acc, b) => {
      if (b.durationSeconds) return acc + b.durationSeconds;
      if (b.start && b.end) {
        return acc + Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
      }
      return acc;
    }, 0);
  };

  // Helper function to calculate hours per day from start and end time
  const calculateHoursPerDay = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime || startTime.trim() === '' || endTime.trim() === '') {
      return 0;
    }

    // Parse time strings (expecting HH:mm format)
    const parseTime = (timeStr: string): { hours: number; minutes: number } | null => {
      const trimmed = timeStr.trim();
      const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
          return { hours, minutes };
        }
      }
      return null;
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (!start || !end) {
      return 0;
    }

    const startMinutes = start.hours * 60 + start.minutes;
    const endMinutes = end.hours * 60 + end.minutes;

    // Calculate difference: end time - start time
    let diffMinutes = endMinutes - startMinutes;
    // Handle case where end time is next day (e.g., 22:00 to 02:00)
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // Add 24 hours
    }

    return diffMinutes / 60; // Convert to hours
  };

  // Helper function to calculate extra time leave balance and carryover
  const calculateEmployeeBalance = (user: User | null | undefined, monthRecords: any[], monthLeaves: any[], manualExtraAdjustment: number = 0, rangeStart?: Date, rangeEnd?: Date, forceIncludePool: boolean = false) => {
    const extraTimeLeaveHours = monthLeaves
      .filter(leave => {
        const status = (leave.status || '').trim();
        if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;

        if (leave.category === LeaveCategory.EXTRA_TIME) return true;

        if (leave.category === LeaveCategory.HALF_DAY) {
          const reason = leave.reason || '';
          return reason.includes('[Extra Time Leave]');
        }

        return false;
      })
      .reduce((sum, leave) => {
        if (leave.category === LeaveCategory.EXTRA_TIME) {
          // For extra time leave: (end time - start time) * number of days
          const hasTimeFields = leave.startTime && leave.endTime &&
            leave.startTime.trim() !== '' && leave.endTime.trim() !== '';

          if (hasTimeFields) {
            // Calculate hours per day: (end time - start time)
            const hoursPerDay = calculateHoursPerDay(leave.startTime, leave.endTime);

            // Calculate number of days (excluding Sundays and holidays) within the range
            const numberOfDays = calculateLeaveDays(leave.startDate, leave.endDate, rangeStart, rangeEnd);
            
            // Total hours = hours per day * number of days
            const totalHours = hoursPerDay * numberOfDays;

            if (totalHours > 0) {
              return sum + totalHours;
            }
          }
          // Fallback to old calculation if time not available
          return sum + (calculateLeaveDays(leave.startDate, leave.endDate, rangeStart, rangeEnd) * 8.25);
        } else if (leave.category === LeaveCategory.HALF_DAY) {
          return sum + 4;
        }
        return sum;
      }, 0);

    // Calculate low time, extra time, and penalties from attendance
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    let totalPenaltySeconds = 0;
    let penaltyCount = 0;

    // Build a map of existing records for efficient lookup
    const recordsMap = new Map();
    monthRecords.forEach(r => {
      const dStr = typeof r.date === 'string' && !r.date.includes('T') ? r.date : getLocalISOString(new Date(r.date));
      recordsMap.set(dStr, r);
    });

    // Build a set of leave dates within the range
    const leaveDates = new Set();
    monthLeaves.forEach(l => {
      let curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        leaveDates.add(getLocalISOString(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });

    // Determine calculation range
    const start = rangeStart || (monthRecords.length > 0 ? new Date(Math.min(...monthRecords.map(r => new Date(r.date).getTime()))) : new Date());
    const end = rangeEnd || (monthRecords.length > 0 ? new Date(Math.max(...monthRecords.map(r => new Date(r.date).getTime()))) : new Date());
    
    // Safety check for end date (don't calculate beyond today for virtual records)
    const today = new Date();
    const effectiveEnd = end > today ? today : end;

    // SAFETY: Get today's date to avoid marking today as absent before it's over
    const todayStr = getTodayStr();

    const firstCheckInDate = (user && typeof user !== 'string') 
      ? attendanceRecords
          .filter(r => r.userId === user.id && r.checkIn)
          .sort((a, b) => {
            const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
            const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
            return d1.localeCompare(d2);
          })[0]?.date
      : undefined;

    const iter = new Date(start);
    while (iter <= effectiveEnd) {
      const dateStr = getLocalISOString(iter);
      const dayOfWeek = iter.getDay(); // 0 = Sunday
      const isHolidayDay = holidayDateSet.has(dateStr);
      
      const record = recordsMap.get(dateStr);
      let netWorkedSeconds = record ? (record.totalWorkedSeconds || 0) : 0;
      
      // If it's a real record or it's a working day (or holiday) that should be counted
      if (record || (!leaveDates.has(dateStr) && dayOfWeek !== 0)) {
        // Holiday rule: all worked time is overtime, never low time
        if (isHolidayDay) {
          if (netWorkedSeconds > 0) totalExtraTimeSeconds += netWorkedSeconds;
        } else {
          // Check for approved Extra Time Leave to add to net worked time
          const extraTimeLeaveForDate = monthLeaves.find(leave => {
            const status = (leave.status || '').trim();
            if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
            if (leave.category !== LeaveCategory.EXTRA_TIME) return false;
            const start = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : leave.startDate;
            const end = typeof leave.endDate === 'string' ? leave.endDate.split('T')[0] : leave.endDate;
            return dateStr >= start && dateStr <= end;
          });

          if (extraTimeLeaveForDate) {
             const leaveHours = extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime 
               ? calculateHoursPerDay(extraTimeLeaveForDate.startTime, extraTimeLeaveForDate.endTime)
               : 8.25;
             netWorkedSeconds += leaveHours * 3600;
          }

          // Check for Half Day Leave
          const hasHalfDay = leaveDates.has(dateStr) && monthLeaves.some(l => 
            l.category === LeaveCategory.HALF_DAY && 
            (l.startDate === dateStr || l.endDate === dateStr || (new Date(dateStr) >= new Date(l.startDate) && new Date(dateStr) <= new Date(l.endDate)))
          );

          const approvedOT = (record?.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
          const { lowTimeSeconds, extraTimeSeconds } = calculateDailyTimeStats(netWorkedSeconds, hasHalfDay, isHolidayDay, approvedOT, dateStr);
          
          // Count late penalties and absence penalties
          if (!isHolidayDay && !record?.isPenaltyDisabled) {
              if (record?.lateCheckIn && record.penaltySeconds) {
                  totalPenaltySeconds += record.penaltySeconds;
                  penaltyCount++;
              }
              // Absence penalty for unexcused absence
              // Sync: Include today in deficit calculation if record exists or if it's past day
              const absenceStart = typeof user === 'string' ? ABSENCE_PENALTY_EFFECTIVE_DATE : getAbsenceStartDate(user, firstCheckInDate);
              if ((!record || netWorkedSeconds === 0) && !leaveDates.has(dateStr) && dayOfWeek !== 0 && dateStr >= absenceStart && dateStr < todayStr) {
                  totalPenaltySeconds += 29700; // 8h 15m penalty
                  penaltyCount++;
              }
          }

          if (!record || netWorkedSeconds === 0) {
            // Absence Deficit: only apply if on or after effective date
            // AND strictly before today (don't mark today as absent before it's over)
            // If it's a real record but missing checkOut, treat as IN PROGRESS and ignore
            const isNoRecord = !record;
            const absenceStart = typeof user === 'string' ? ABSENCE_PENALTY_EFFECTIVE_DATE : getAbsenceStartDate(user);
            if (dateStr >= absenceStart && dateStr < todayStr && (isNoRecord || (record && record.checkOut))) {
              totalLowTimeSeconds += lowTimeSeconds;
            }
          } else {
            // Only count low time if finalized (has checkOut).
            // This prevents "In Progress" sessions (today or past missed checkouts) 
            // from showing a full deficit.
            if (record.checkOut) {
              totalLowTimeSeconds += lowTimeSeconds;
            }
            totalExtraTimeSeconds += extraTimeSeconds;
          }
        }
      }
      iter.setDate(iter.getDate() + 1);
    }

    // Calculate final time difference
    const finalTimeDifference = totalExtraTimeSeconds - totalLowTimeSeconds;
    const workingNetHours = finalTimeDifference / 3600;

    // Refined Forwarding Logic:
    // Display Net = (Working Net) - (Forwarded Out) + (Forwarded In) - (ETL taken)
    const monthStr = rangeStart ? `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}` : "";
    const forwardedOutSeconds = (user?.forwardedMonths?.[monthStr] || 0);
    const forwardedOutHours = forwardedOutSeconds / 3600;
    
    // Get forwarded IN time for this month (from previous month's forward)
    const forwardedInSeconds = (user?.forwardedInMonths?.[monthStr] || 0);
    const forwardedInHours = forwardedInSeconds / 3600;

    // Remaining extra time balance for display
    // Net = (Extra - Low) - ETL taken - Forwarded Out + Forwarded In
    let remainingExtraTimeLeaveHours = workingNetHours - extraTimeLeaveHours - forwardedOutHours + forwardedInHours;

    // Calculate carryover (for legacy support or other views)
    const carryRelativeDate = new Date();
    const isMonthEnd = carryRelativeDate.getDate() === new Date(carryRelativeDate.getFullYear(), carryRelativeDate.getMonth() + 1, 0).getDate();
    const carryoverExtraTimeLeave = isMonthEnd && remainingExtraTimeLeaveHours > 0 ? remainingExtraTimeLeaveHours : 0;
    const carryoverLowTime = isMonthEnd && finalTimeDifference < 0 ? Math.abs(finalTimeDifference) : 0;

    return {
      extraTimeLeavePoolHours: forwardedInHours,
      extraTimeLeaveHoursTaken: extraTimeLeaveHours,
      totalLowTimeSeconds,
      totalExtraTimeSeconds,
      remainingExtraTimeLeaveHours,
      carryoverExtraTimeLeave,
      carryoverLowTime,
      finalTimeDifference,
      totalPenaltySeconds,
      penaltyCount,
      forwardedInHours,
      forwardedOutHours,
      workingNetSeconds: finalTimeDifference - forwardedOutSeconds + forwardedInSeconds
    };
  };

  const [isForwarding, setIsForwarding] = useState(false);

  const handleForwardOvertime = async (user: User, monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const monthRecords = attendanceRecords.filter(r => {
      const d = new Date(r.date);
      return r.userId === user.id && d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    const monthLeaves = leaveRequests.filter(l => {
      if (l.userId !== user.id) return false;
      const status = (l.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      const startDate = new Date(l.startDate);
      const endDate = new Date(l.endDate);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      return (startDate <= monthEnd && endDate >= monthStart);
    });

    const balance = calculateEmployeeBalance(user, monthRecords, monthLeaves, user.manualExtraTimeAdjustment || 0, new Date(year, month - 1, 1), new Date(year, month, 0));
    
    // We want to forward the ENTIRE net balance of the month (Working Net - Extra Time Leaves taken)
    const secondsToForward = balance.totalExtraTimeSeconds - balance.totalLowTimeSeconds - (balance.extraTimeLeaveHoursTaken * 3600);
    
    setForwardingUser(user);
    setForwardingMonthStr(monthStr);
    setSystemSuggestedSeconds(secondsToForward);
    
    const absSeconds = Math.abs(secondsToForward);
    const h = Math.floor(absSeconds / 3600);
    const m = Math.round((absSeconds % 3600) / 60);

    setManualForwardHours(h.toString());
    setManualForwardMinutes(m.toString());
    setIsForwardModalOpen(true);
  };

  const confirmManualForward = async () => {
    if (!forwardingUser || !forwardingMonthStr) return;
    
    const h = parseInt(manualForwardHours) || 0;
    const m = parseInt(manualForwardMinutes) || 0;
    let totalSeconds = (h * 3600) + (m * 60);
    
    // sign determined by system suggestion
    if (systemSuggestedSeconds < 0) totalSeconds = -totalSeconds;

    // Calculate next month string (target month for forwarding)
    const [fwdYear, fwdMonth] = forwardingMonthStr.split('-').map(Number);
    const nextMonthDate = new Date(fwdYear, fwdMonth, 1); // fwdMonth is 1-based, so this gives next month
    const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Source month: increment how much was forwarded OUT
    const updatedForwardedMonths = { ...(forwardingUser.forwardedMonths || {}) };
    updatedForwardedMonths[forwardingMonthStr] = (updatedForwardedMonths[forwardingMonthStr] || 0) + totalSeconds;

    // Target month: increment how much was forwarded IN
    const updatedForwardedInMonths = { ...(forwardingUser.forwardedInMonths || {}) };
    updatedForwardedInMonths[nextMonthStr] = (updatedForwardedInMonths[nextMonthStr] || 0) + totalSeconds;

    setIsForwarding(true);
    try {
      await userAPI.updateUser(forwardingUser.id, {
        lastForwardedMonth: forwardingMonthStr,
        forwardedMonths: updatedForwardedMonths,
        forwardedInMonths: updatedForwardedInMonths
      });
      const dispH = Math.floor(Math.abs(totalSeconds) / 3600);
      const dispM = Math.floor((Math.abs(totalSeconds) % 3600) / 60);
      alert(`Successfully processed balance forwarding for ${forwardingUser.name}.\nForwarded ${totalSeconds < 0 ? '-' : ''}${dispH}h ${dispM}m from ${forwardingMonthStr} → ${nextMonthStr}.`);
      setIsForwardModalOpen(false);
      await refreshData();
    } catch (error: any) {
      console.error("Failed to forward overtime:", error);
      alert(error.message || "Failed to forward overtime.");
    } finally {
      setIsForwarding(false);
    }
  };





  // Helper to calculate stats for salary deduction specific to a user and month
  const getStatsForDeduction = (userId: string, month: number, year: number) => {
    // 1. Filter attendance for user and month
    const userAttendance = attendanceRecords.filter(r => {
      const d = new Date(r.date);
      return r.userId === userId && d.getMonth() + 1 === month && d.getFullYear() === year;
    });

    // 2. Filter leaves for user and month
    const userLeaves = leaveRequests.filter(l => {
      const d = new Date(l.startDate);
      // Check if leave overlaps with the month (simplification: checking start date month)
      const inMonth = d.getMonth() + 1 === month && d.getFullYear() === year;
      const isApproved = (l.status || '').trim() === 'Approved' || (l.status || '').trim() === LeaveStatus.APPROVED;
      return l.userId === userId && inMonth && isApproved;
    });

    // 3. Calculate Low Time
    let totalLowTimeSeconds = 0;
    const MIN_NORMAL_SECONDS = 8 * 3600 + 15 * 60; // 8h 15m

    // Use the shared memoized holidayDateSet (from outer scope)
    const deductHolidaySet = holidayDateSet;

    userAttendance.forEach(record => {
      if (record.checkIn && record.checkOut) {
        const checkInDate = new Date(record.checkIn);
        const checkOut = new Date(record.checkOut).getTime();
        const totalSessionSeconds = Math.floor((checkOut - checkInDate.getTime()) / 1000);
        const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
        const netWorkedRaw = Math.max(0, totalSessionSeconds - breakSeconds);
        const recordDateISO = typeof record.date === 'string' ? record.date.split('T')[0] : record.date;
        const isHolidayDay = deductHolidaySet.has(recordDateISO);

        // Late check-in penalty: use centralized utility (skip if admin disabled penalty)
        const penaltySeconds = !isHolidayDay && !record.isPenaltyDisabled && isPenaltyEffective(recordDateISO as string)
          ? calculateLatenessPenaltySeconds(record.checkIn)
          : 0;
        const netWorkedSeconds = Math.max(0, netWorkedRaw - penaltySeconds);

        // Never count holiday days as low time in this view
        if (isHolidayDay) return;

        // Check for Half Day Leave
        const hasHalfDay = userLeaves.some(leave => {
          const status = (leave.status || '').trim();
          const isApproved = status === 'Approved' || status === LeaveStatus.APPROVED;
          if (!isApproved || leave.category !== LeaveCategory.HALF_DAY) return false;
          const leaveDate = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : leave.startDate;
          return leaveDate === recordDateISO;
        });

        // Use unified calculation utility
        const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
        const { lowTimeSeconds } = calculateDailyTimeStats(netWorkedSeconds, hasHalfDay, isHolidayDay, approvedOT, recordDateISO);
        totalLowTimeSeconds += lowTimeSeconds;
      }
    });

    // 4. Calculate Unpaid Leaves
    const unpaidLeaveDays = userLeaves
      .filter(l => l.category === 'Unpaid Leave' || l.category === 'Loss Of Pay' || (l.category === LeaveCategory.HALF_DAY && (l.reason || '').includes('[Unpaid Leave]')))
      .reduce((sum, leave) => {
        if (leave.category === LeaveCategory.HALF_DAY) return sum + 0.5;
        return sum + calculateLeaveDays(leave.startDate, leave.endDate);
      }, 0);

    // Also check for Half Day leaves that are unpaid? Assuming Half Day is paid/partial. 
    // If strict unpaid check is needed:
    // const unpaidHalfDays = userLeaves.filter(l => l.category === LeaveCategory.HALF_DAY && /* some unpaid flag? */ false);

    return {
      lowTimeSeconds: totalLowTimeSeconds,
      lowTimeDisplay: formatDuration(totalLowTimeSeconds),
      unpaidLeaveDays
    };
  };

  // Calculate monthly stats
  const calculateMonthlyStats = () => {
    let totalWorkedSeconds = 0;
    let totalBreakSeconds = 0;
    let daysPresent = 0;
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    const todayStr = getTodayStr();

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    const MIN_NORMAL_SECONDS = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
    const MAX_NORMAL_SECONDS = 8 * 3600 + 22 * 60; // 8h 22m = 30120 seconds

    // Compute approvedLeaves up front so it can be referenced inside the forEach
    const approvedLeaves = filteredMonthlyLeaves.filter(l => {
      const status = (l.status || '').trim();
      return status === 'Approved' || status === LeaveStatus.APPROVED;
    });

    // Use same rule as employee dashboard: stored totalWorkedSeconds and same leave-matching (date-in-range)
    monthlyAttendance.forEach(record => {
      // Changed to >= 0 to include virtual absent records and zero-work days
      if ((record.totalWorkedSeconds || 0) >= 0 || (record.checkIn && !record.checkOut)) {
        if (!record.isVirtual) daysPresent++;
        const netWorkedRaw = record.totalWorkedSeconds || 0;
        totalWorkedSeconds += netWorkedRaw;

        const recordDateISO = typeof record.date === 'string' ? record.date.split('T')[0] : new Date(record.date).toISOString().split('T')[0];
        const isHolidayDay = holidayDateSet.has(recordDateISO as string);

        if (isHolidayDay) {
          if (netWorkedRaw > 0) totalExtraTimeSeconds += netWorkedRaw;
          return;
        }

        // Match extra time leave when record date is within leave range (same as employee dashboard)
        const extraTimeLeaveForDate = approvedLeaves.find(leave => {
          if (leave.userId !== record.userId) return false;
          if (leave.category !== LeaveCategory.EXTRA_TIME && !(leave.category === LeaveCategory.HALF_DAY && leave.reason?.includes('[Extra Time Leave]'))) return false;
          const leaveStart = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : new Date(leave.startDate).toISOString().split('T')[0];
          const leaveEnd = typeof leave.endDate === 'string' ? leave.endDate.split('T')[0] : new Date(leave.endDate).toISOString().split('T')[0];
          return recordDateISO >= leaveStart && recordDateISO <= leaveEnd;
        });
        let netWorkedSeconds = netWorkedRaw;
        if (extraTimeLeaveForDate) {
          if (extraTimeLeaveForDate.category === LeaveCategory.HALF_DAY) {
            netWorkedSeconds += 4 * 3600; // half-day extra time leave = 4 hours (same as employee)
          } else if (extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime) {
            const leaveHours = calculateHoursPerDay(extraTimeLeaveForDate.startTime, extraTimeLeaveForDate.endTime);
            netWorkedSeconds += leaveHours * 3600;
          } else {
            netWorkedSeconds += 8.25 * 3600;
          }
        }

        // Half-day: match by exact date (same as employee dashboard)
        const hasHalfDay = approvedLeaves.some(leave => {
          if (leave.userId !== record.userId || leave.category !== LeaveCategory.HALF_DAY) return false;
          if (leave.reason?.includes('[Extra Time Leave]')) return false;
          const leaveDate = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : new Date(leave.startDate).toISOString().split('T')[0];
          return leaveDate === recordDateISO;
        });

        const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
        const { lowTimeSeconds, extraTimeSeconds } = calculateDailyTimeStats(netWorkedSeconds, hasHalfDay, isHolidayDay, approvedOT, recordDateISO);
        
        // ONLY apply low time deficit for absences if on or after effective date
        if (record.isVirtual || netWorkedSeconds === 0) {
          // Only apply low time deficit for absences if on or after effective date 
          // AND strictly before today.
          // If it's a real record but missing checkOut, treat as IN PROGRESS and ignore.
          const firstCheckIn = selectedUser ? attendanceRecords
            .filter(r => r.userId === selectedUser.id && r.checkIn)
            .sort((a, b) => {
              const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
              const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
              return d1.localeCompare(d2);
            })[0]?.date : undefined;
          const absenceStart = selectedUser ? getAbsenceStartDate(selectedUser, firstCheckIn) : ABSENCE_PENALTY_EFFECTIVE_DATE;
          if (recordDateISO >= absenceStart && recordDateISO < todayStr && (record.isVirtual || record.checkOut)) {
            totalLowTimeSeconds += lowTimeSeconds;
          }
        } else {
          // Only count low time if finalized (has checkOut).
          // This prevents "In Progress" sessions (today or past missed checkouts) 
          // from showing a full deficit in the monthly summary.
          if (record.checkOut) {
            totalLowTimeSeconds += lowTimeSeconds;
          }
          totalExtraTimeSeconds += extraTimeSeconds;
        }
      }
    });

    // Calculate Extra Time Leave hours for selected month

    const extraTimeLeaveHours = approvedLeaves
      .filter(leave => {
        if (leave.category === LeaveCategory.EXTRA_TIME) return true;
        if (leave.category === LeaveCategory.HALF_DAY) {
          const reason = leave.reason || '';
          return reason.includes('[Extra Time Leave]');
        }
        return false;
      })
      .reduce((sum, leave) => {
        if (leave.category === LeaveCategory.EXTRA_TIME) {
          // For extra time leave: (end time - start time) * number of days
          const hasTimeFields = leave.startTime && leave.endTime &&
            leave.startTime.trim() !== '' && leave.endTime.trim() !== '';

          if (hasTimeFields) {
            // Calculate hours per day: (end time - start time)
            const hoursPerDay = calculateHoursPerDay(leave.startTime, leave.endTime);

            // Calculate number of days (excluding Sundays and holidays) within the month boundary
            const numberOfDays = calculateLeaveDays(leave.startDate, leave.endDate, monthStart, monthEnd);

            // Total hours = hours per day * number of days
            const totalHours = hoursPerDay * numberOfDays;

            if (totalHours > 0) {
              return sum + totalHours;
            }
          }
          // Fallback to old calculation if time not available
          return sum + (calculateLeaveDays(leave.startDate, leave.endDate, monthStart, monthEnd) * 8.25);
        } else if (leave.category === LeaveCategory.HALF_DAY) {
          return sum + 4;
        }
        return sum;
      }, 0);

    // Convert extra time leave hours to seconds
    const extraTimeLeaveSeconds = extraTimeLeaveHours * 3600;

    // Forwarding logic for the selected month
    const monthStr = selectedMonth; // "YYYY-MM"
    const forwardedOutSeconds = (selectedUser?.forwardedMonths?.[monthStr] || 0);
    const forwardedInSeconds = (selectedUser?.forwardedInMonths?.[monthStr] || 0);

    // Net Time Balance = (Extra Time - Extra Time Leave - Low Time - Forwarded Out + Forwarded In)
    const monthlyNetSeconds = totalExtraTimeSeconds - extraTimeLeaveSeconds - totalLowTimeSeconds - forwardedOutSeconds + forwardedInSeconds;
    const finalDifference = monthlyNetSeconds;

    return {
      totalWorkedSeconds,
      totalBreakSeconds,
      daysPresent,
      totalLowTimeSeconds,
      totalExtraTimeSeconds,
      extraTimeLeaveSeconds,
      forwardedInSeconds,
      forwardedOutSeconds,
      finalDifference
    };
  };

  const stats = calculateMonthlyStats();

  // Calculate balance for selected user
  const selectedUserBalance = selectedUserId && selectedUser
    ? calculateEmployeeBalance(selectedUser, monthlyAttendance, monthlyLeaves, selectedUser.manualExtraTimeAdjustment || 0)
    : null;

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHoliday.date && newHoliday.description) {
      addCompanyHoliday(newHoliday.date, newHoliday.description);
      setNewHoliday({ date: '', description: '' });
    }
  };

  const handleCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correction.userId || !correction.date) return;

    if (!correction.checkIn && !correction.checkOut && !correction.isPenaltyDisabled) {
      alert("Please provide at least Check In time, Check Out time, or Disable Late Penalty");
      return;
    }

    try {
      await attendanceAPI.adminCreateOrUpdate({
        userId: correction.userId,
        date: correction.date,
        checkIn: correction.checkIn || undefined,
        checkOut: correction.checkOut || undefined,
        breakDurationMinutes: correction.breakDuration ? parseInt(correction.breakDuration) : undefined,
        notes: correction.notes || undefined,
        isPenaltyDisabled: correction.isPenaltyDisabled
      });
      alert("Attendance saved successfully.");
      setCorrection({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '', isPenaltyDisabled: false });
      // Refresh data to show updated records
      await refreshData();
    } catch (error: any) {
      alert(error.message || "Failed to save attendance");
    }
  };

  const getMonthName = () => {
    if (!selectedMonth) return '';
    return new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };


  const handleDirectStatusToggle = async (record: any) => {
    if (!record.checkIn || !record.checkOut) return;

    let nextManualFlag = true;
    let nextLowTime = false;
    let nextExtraTime = false;

    if (!record.isManualFlag) {
      // Automatic -> Manual Low Time
      nextLowTime = true;
    } else if (record.lowTimeFlag) {
      // Low Time -> Extra Time
      nextExtraTime = true;
    } else if (record.extraTimeFlag) {
      // Extra Time -> Automatic (Reset)
      nextManualFlag = false;
    } else {
      // Manual On Time -> Low Time
      nextLowTime = true;
    }

    try {
      await adminUpdateAttendance(record.id, {
        isManualFlag: nextManualFlag,
        lowTimeFlag: nextLowTime,
        extraTimeFlag: nextExtraTime
      });
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle status');
    }
  };

  // Format duration with small text for units
  const formatDurationStyled = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    if (h === 0 && m === 0) return <><span>0</span><span className="text-sm font-normal ml-1">minutes</span></>;
    if (h === 0) return <><span>{m}</span><span className="text-sm font-normal ml-1">minutes</span></>;
    if (m === 0) return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span></>;
    return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span> <span>{m}</span><span className="text-sm font-normal ml-1">min</span></>;
  };

  // Format notification time
  const formatNotificationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(dateStr);
  };

  // Flatten all employee bonds into a searchable list
  const allBondsData = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const flattened: any[] = [];
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).forEach(user => {
      const bonds = user.bonds || [];
      const bondResults = calculateBondRemaining(bonds, user.joiningDate);
      
      bondResults.allBonds.forEach((bondInfo: any, bondIdx: number) => {
        // Use the remaining days calculation logic safely
        const endD = new Date(bondInfo.endDate);
        const startD = new Date(bondInfo.startDate);
        const diffTime = endD.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const isExp = bondInfo.remaining.isExpired;
        const completesThisMonth = endD.getMonth() === currentMonth && endD.getFullYear() === currentYear;
        const startsThisMonth = startD.getMonth() === currentMonth && startD.getFullYear() === currentYear;
        const isShiftingThisMonth = completesThisMonth || startsThisMonth;
        
        // Detect if there is another bond after this one
        const hasNextStage = bondIdx < bondResults.allBonds.length - 1;

        let status = isExp ? 'Completed' : 'Active';
        if (!isExp && diffDays > 0 && diffDays <= 30) {
          status = hasNextStage ? 'Shifting Soon' : 'Expiring Soon';
        }

        flattened.push({
          userName: user.name,
          department: user.department,
          email: user.email,
          userId: user.id,
          type: bondInfo.type,
          periodMonths: bondInfo.periodMonths,
          startDate: bondInfo.startDate,
          endDate: bondInfo.endDate,
          status,
          isShiftingThisMonth,
          hasNextStage,
          remainingDisplay: bondInfo.remaining.display,
          totalRemainingDisplay: bondResults.totalRemaining.display,
          diffDays,
          isExp
        });
      });
    });

    return flattened
      .filter(item => {
        const matchesSearch = 
           item.userName.toLowerCase().includes(bondSearchTerm.toLowerCase()) ||
           item.department.toLowerCase().includes(bondSearchTerm.toLowerCase()) ||
           item.type.toLowerCase().includes(bondSearchTerm.toLowerCase());
        
        if (!matchesSearch) return false;
        if (bondStatusFilter === 'All') return true;
        if (bondStatusFilter === "This Month's Shifts") return item.isShiftingThisMonth;
        return item.status === bondStatusFilter;
      })
      .sort((a, b) => {
        // Sort active/expiring soon by end date ascending, then completed descending
        if (a.isExp && !b.isExp) return 1;
        if (!a.isExp && b.isExp) return -1;
        if (!a.isExp && !b.isExp) return a.endDate.getTime() - b.endDate.getTime();
        return b.endDate.getTime() - a.endDate.getTime();
      });
  }, [users, bondSearchTerm, bondStatusFilter]);

  const exportBondReport = () => {
    const rows = allBondsData.map(b => ({
      Employee: b.userName,
      Department: b.department,
      Type: b.type,
      Months: b.periodMonths,
      'Start Date': convertToDDMMYYYY(b.startDate),
      'End Date': convertToDDMMYYYY(b.endDate),
      Status: b.status,
      'Shifting This Month': b.isShiftingThisMonth ? 'Yes' : 'No',
      'Remaining Time': b.remainingDisplay
    }));
    downloadCSV(`Bond_Status_Report_${new Date().toISOString().split('T')[0]}.csv`, rows);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Notifications Popup */}
      {showNotificationsPopup && notifications.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={handleCloseNotificationsPopup}
          />

          {/* Popup Panel */}
          <div className="fixed inset-0 z-50 flex items-start justify-end px-4 pt-20 sm:pt-24 pointer-events-none">
            <div className="w-full max-w-md ml-auto pointer-events-auto">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Notifications</h3>
                    <p className="text-xs text-gray-500">Auto-removed after 24 hours</p>
                  </div>
                  <span className="ml-auto mr-2 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    {notifications.length}
                  </span>
                  <button
                    onClick={handleCloseNotificationsPopup}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {notifications.map(n => (
                    <div key={n.id} className="bg-white rounded-xl p-3 border border-amber-100 flex items-start gap-3">
                      <div className={`h-2 w-2 rounded-full mt-2 ${n.read ? 'bg-gray-300' : 'bg-amber-500'}`}></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatNotificationTime(n.createdAt)}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await notificationAPI.deleteNotification(n.id);
                            await refreshData();
                          } catch (e) { }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Dismiss"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}


      {/* CONSOLIDATED DASHBOARD TAB */}
      {activeTab === 'consolidated' && (
        <div className="space-y-8">
          {/* Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users size={28} />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Employees</p>
                <h3 className="text-2xl font-bold text-gray-800">{users.filter(u => u.role !== Role.ADMIN).length}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle size={28} />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Today's Presence</p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {attendanceRecords.filter(r => {
                    const today = getTodayStr();
                    return (typeof r.date === 'string' ? r.date.split('T')[0] : r.date) === today && r.checkIn;
                  }).length}
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock size={28} />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Today's On Time</p>
                <h3 className="text-2xl font-bold text-gray-800">
                  {attendanceRecords.filter(r => {
                    const today = getTodayStr();
                    return (typeof r.date === 'string' ? r.date.split('T')[0] : r.date) === today && r.checkIn && !r.lateCheckIn;
                  }).length}
                </h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="h-14 w-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
                <AlertCircle size={28} />
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Pending Leaves</p>
                <h3 className="text-2xl font-bold text-gray-800">{leaveRequests.filter(l => l.status === 'Pending').length}</h3>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => navigate('/admin-users', { state: { openAddUserModal: true } })}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-all gap-3"
              >
                <UserPlus size={24} />
                <span className="font-bold text-sm">Add User</span>
              </button>

              <button
                onClick={() => navigate('/holidays', { state: { openAddModal: true } })}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-purple-50 border border-purple-100 text-purple-700 hover:bg-purple-100 transition-all gap-3"
              >
                <Calendar size={24} />
                <span className="font-bold text-sm">Add Holiday</span>
              </button>

              <button
                onClick={() => navigate('/admin-leaves', { state: { openAllocationModal: true } })}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition-all gap-3"
              >
                <DollarSign size={24} />
                <span className="font-bold text-sm">Allocate Paid Leave</span>
              </button>

              <button
                onClick={() => setIsCorrectionModalOpen(true)}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 transition-all gap-3"
              >
                <PenTool size={24} />
                <span className="font-bold text-sm">Correct Attendance</span>
              </button>
            </div>
          </div>

          {/* Pending Leave Requests */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Pending Leave Requests</h3>
                <p className="text-gray-500 text-sm">{leaveRequests.filter(l => l.status === 'Pending').length} requests needing approval</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 uppercase text-xs font-bold">
                    <th className="px-6 py-4 text-left">Employee</th>
                    <th className="px-6 py-4 text-left">Period</th>
                    <th className="px-6 py-4 text-left">Type</th>
                    <th className="px-6 py-4 text-left">Reason</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaveRequests.filter(l => l.status === 'Pending').length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No pending leave requests</td>
                    </tr>
                  ) : (
                    leaveRequests.filter(l => l.status === 'Pending').slice(0, 5).map(leave => (
                      <tr key={leave.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-800">{leave.userName}</p>
                          <p className="text-xs text-gray-400">{users.find(u => u.id === leave.userId)?.department}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-700">{formatDate(leave.startDate)}</div>
                          {leave.startDate !== leave.endDate && <div className="text-[10px] text-gray-400 uppercase font-bold">to {formatDate(leave.endDate)}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-[10px]">{leave.category}</span>
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate text-gray-600">{leave.reason}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => updateLeaveStatus(leave.id, LeaveStatus.APPROVED)}
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                              title="Approve"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => updateLeaveStatus(leave.id, LeaveStatus.REJECTED)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                              title="Reject"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {leaveRequests.filter(l => l.status === 'Pending').length > 5 && (
                <div className="px-6 py-3 bg-gray-50 text-center">
                  <span className="text-xs text-gray-400">And {leaveRequests.filter(l => l.status === 'Pending').length - 5} more pending requests</span>
                </div>
              )}
            </div>

          {/* Pending Overtime Requests */}
          <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden mb-6">
            <div className="px-6 py-5 border-b border-indigo-50 bg-indigo-50/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Pending Overtime Requests</h3>
                  <p className="text-indigo-600/70 text-xs font-bold uppercase tracking-wider">
                    {pendingOvertimeRequests.length} requests needing verification
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-400 uppercase text-[10px] font-black tracking-widest">
                    <th className="px-6 py-4 text-left">Employee</th>
                    <th className="px-6 py-4 text-left">Date</th>
                    <th className="px-6 py-4 text-left">Duration</th>
                    <th className="px-6 py-4 text-left">Reason</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingOvertimeRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 opacity-30">
                          <CheckCircle2 size={40} className="text-gray-400" />
                          <p className="font-bold text-gray-500 uppercase tracking-widest text-xs">All caught up! No pending requests.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pendingOvertimeRequests.map(record => (
                      <tr key={record.id} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">
                              {users.find(u => u.id === (typeof record.userId === 'string' ? record.userId : record.userId?.id))?.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{users.find(u => u.id === (typeof record.userId === 'string' ? record.userId : record.userId?.id))?.name || 'Unknown'}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">{users.find(u => u.id === (typeof record.userId === 'string' ? record.userId : record.userId?.id))?.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-700">{formatDate(record.date)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 font-black text-xs border border-emerald-100">
                            {record.overtimeRequest?.durationMinutes} MIN
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-600 text-xs font-medium max-w-xs">{record.overtimeRequest?.reason}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              onClick={() => {
                                if (window.confirm('Approve this overtime request? The duration will be added as extra time.')) {
                                  reviewOvertime(record.id, 'Approved');
                                }
                              }}
                              className="h-9 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-sm font-bold text-xs flex items-center gap-1.5"
                            >
                              <CheckCircle size={14} /> Approve
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                if (window.confirm('Reject this overtime request?')) {
                                  reviewOvertime(record.id, 'Rejected');
                                }
                              }}
                              className="h-9 px-3 border-rose-100 text-rose-500 hover:bg-rose-50 rounded-lg font-bold text-xs"
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>

          {/* Monthly Performance Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-indigo-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Monthly Performance Overview</h3>
                <p className="text-gray-500 text-sm">Key attendance metrics for the selected month</p>
              </div>
              <input
                type="month"
                className="bg-white border border-indigo-200 text-indigo-700 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 font-bold"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                    <th className="px-3 py-3 text-left">Employee</th>
                    <th className="px-2 py-3 text-center">Joined</th>
                    <th className="px-2 py-3 text-center">Worked</th>
                    <th className="px-1 py-3 text-center">Pres.</th>
                    <th className="px-2 py-3 text-center text-rose-600">Low</th>
                    <th className="px-2 py-3 text-center text-emerald-600">Extra</th>
                    <th className="px-2 py-3 text-center text-blue-600">L(ET)</th>
                    <th className="px-2 py-3 text-center text-purple-600">Prev</th>
                    <th className="px-2 py-3 text-center text-amber-600">Sent</th>
                    <th className="px-2 py-3 text-center bg-indigo-100">Net</th>
                    <th className="px-2 py-3 text-center text-orange-700 bg-orange-100">Cumul.</th>
                    <th className="px-2 py-3 text-center text-blue-600">Leave</th>
                    <th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users
                    .filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR)
                    .slice((performancePage - 1) * ITEMS_PER_PAGE, performancePage * ITEMS_PER_PAGE)
                    .map(emp => {
                    // Calculate stats for each employee for the selected month
                    const [year, month] = selectedMonth.split('-').map(Number);
                    const empAttendance = attendanceRecords.filter(r => {
                      const recDate = new Date(r.date);
                      return r.userId === emp.id && recDate.getMonth() + 1 === month && recDate.getFullYear() === year;
                    });

                    // Filter approved leaves for this specific month ONLY
                    const empLeavesInMonth = leaveRequests.filter(l => {
                      if (l.userId !== emp.id) return false;
                      const status = (l.status || '').trim();
                      if (status !== 'Approved' && status !== LeaveStatus.APPROVED) return false;

                      const startDate = new Date(l.startDate);
                      const endDate = new Date(l.endDate);
                      const monthStart = new Date(year, month - 1, 1);
                      const monthEnd = new Date(year, month, 0);

                      // Check if leave overlaps with the month
                      return (startDate <= monthEnd && endDate >= monthStart);
                    });

                    const monthStart = new Date(year, month - 1, 1);
                    const monthEnd = new Date(year, month, 0);

                    const totalLeavesCount = empLeavesInMonth.reduce((sum, l) => sum + calculateLeaveDays(l.startDate, l.endDate), 0);
                    const balance = calculateEmployeeBalance(
                      emp, 
                      empAttendance, 
                      empLeavesInMonth, 
                      emp.manualExtraTimeAdjustment || 0,
                      monthStart,
                      monthEnd,
                      selectedMonth === getTodayStr().substring(0, 7)
                    );

                    // Calculate cumulative balance (from joining date to now)
                    // NOTE: Pass manualExtraAdjustment=0 and forceIncludePool=false so the cumulative
                    // column shows PURE net (Extra Time - Low Time - ETL taken), completely unaffected
                    // by the forward extra time / pool feature.
                    const joinDate = emp.joiningDate ? (parseDDMMYYYY(emp.joiningDate) || new Date(2026, 0, 1)) : new Date(2026, 0, 1);
                    const cumulativeBalance = calculateEmployeeBalance(
                      emp,
                      attendanceRecords.filter(r => r.userId === emp.id),
                      leaveRequests.filter(l => l.userId === emp.id && ((l.status || '').trim() === 'Approved' || (l.status || '').trim() === LeaveStatus.APPROVED)),
                      0,         // No pool — cumulative is pure, not affected by forwarding
                      joinDate,
                      new Date(),
                      false      // forceIncludePool = false — pool must NOT affect cumulative total
                    );

                    return (
                      <tr key={emp.id} className="even:bg-gray-50/30 hover:bg-gray-50/50 transition-colors text-[11px]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-[10px]">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 truncate max-w-[80px]">{emp.name}</p>
                              <p className="text-[9px] text-gray-400 uppercase font-medium">{emp.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center font-medium text-gray-400 whitespace-nowrap">
                          {emp.joiningDate ? convertToDDMMYYYY(emp.joiningDate).replace(/-/g, ' ') : '-'}
                        </td>
                        <td className="px-2 py-3 text-center font-medium whitespace-nowrap">
                          {formatHoursToHoursMinutes(empAttendance.reduce((sum, r) => sum + (r.totalWorkedSeconds || 0), 0) / 3600)}
                        </td>
                        <td className="px-1 py-3 text-center">
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold text-[9px] whitespace-nowrap">
                            {empAttendance.filter(r => (r.totalWorkedSeconds || 0) > 0 || (r.checkIn && r.checkOut)).length}D
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center text-rose-600 font-bold whitespace-nowrap">
                          {formatDuration(balance.totalLowTimeSeconds)}
                        </td>
                        <td className="px-2 py-3 text-center text-emerald-600 font-bold whitespace-nowrap">
                          {formatDuration(balance.totalExtraTimeSeconds)}
                        </td>
                        <td className="px-2 py-3 text-center text-blue-600 font-bold whitespace-nowrap" title="Extra Time Leave taken">
                          {formatHoursToHoursMinutes(balance.extraTimeLeaveHoursTaken)}
                        </td>
                        <td className="px-2 py-3 text-center text-purple-600 font-bold whitespace-nowrap" title="Forwarded from previous month">
                          {formatHoursToHoursMinutes(balance.forwardedInHours)}
                        </td>
                        <td className="px-2 py-3 text-center text-amber-600 font-bold whitespace-nowrap" title="Forwarded to next month">
                          {formatHoursToHoursMinutes(balance.forwardedOutHours)}
                        </td>
                        <td className={`px-2 py-3 text-center font-bold whitespace-nowrap bg-indigo-50/60 ${balance.remainingExtraTimeLeaveHours > 0 ? 'text-emerald-600' :
                          balance.remainingExtraTimeLeaveHours < 0 ? 'text-rose-600' : 'text-gray-400'
                          }`}>
                          {formatHoursToHoursMinutes(balance.remainingExtraTimeLeaveHours)}
                        </td>
                        <td className={`px-2 py-3 text-center font-bold whitespace-nowrap bg-orange-50/70 ${cumulativeBalance.remainingExtraTimeLeaveHours > 0 ? 'text-emerald-600' :
                          cumulativeBalance.remainingExtraTimeLeaveHours < 0 ? 'text-rose-600' : 'text-gray-400'
                          }`}>
                          {formatHoursToHoursMinutes(cumulativeBalance.remainingExtraTimeLeaveHours)}
                        </td>
                        <td className="px-2 py-3 text-center text-blue-600 font-bold whitespace-nowrap">
                          {totalLeavesCount}D
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedUserId(emp.id);
                                setActiveTab('summary');
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all font-bold text-[10px]"
                            >
                              View
                            </button>
                            {emp.lastForwardedMonth === selectedMonth ? (
                                <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 font-bold text-[9px] flex items-center gap-1">
                                    <CheckCircle size={10} /> Done
                                </span>
                            ) : (
                                <button
                                    onClick={() => handleForwardOvertime(emp, selectedMonth)}
                                    disabled={isForwarding || balance.remainingExtraTimeLeaveHours === 0}
                                    className={`px-2 py-1 rounded-lg font-bold text-[10px] transition-all ${
                                        balance.remainingExtraTimeLeaveHours === 0 
                                            ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                    }`}
                                    title={balance.remainingExtraTimeLeaveHours > 0 ? `Forward ${Math.round(balance.remainingExtraTimeLeaveHours * 100) / 100}h to next month` : 'Net deficit will be deducted if forwarded'}
                                >
                                    {isForwarding ? '...' : 'Forward'}
                                </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing <span className="font-bold text-gray-700">{Math.min((performancePage - 1) * ITEMS_PER_PAGE + 1, users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length)}</span> to <span className="font-bold text-gray-700">{Math.min(performancePage * ITEMS_PER_PAGE, users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length)}</span> of <span className="font-bold text-gray-700">{users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length}</span> employees
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPerformancePage(p => Math.max(1, p - 1))}
                  disabled={performancePage === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPerformancePage(p => p + 1)}
                  disabled={performancePage * ITEMS_PER_PAGE >= users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* MONTHLY SUMMARY TAB */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Header Card with Filters */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-indigo-600" />
                  </div>
                  Monthly Attendance Summary
                </h1>
                <p className="text-gray-500 mt-1 ml-13">Track individual employee performance & attendance</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <select
                  className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-[220px] font-medium"
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                >
                  <option value="">👤 Select Employee</option>
                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <input
                  type="month"
                  className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 font-medium"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          {selectedUserId && selectedUser ? (
            <>
              {/* Back Button */}
              <button
                onClick={() => {
                  setSelectedUserId('');
                  setActiveTab('consolidated');
                  navigate('/admin-dashboard');
                }}
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-medium transition-colors mb-2"
              >
                <span className="text-lg">←</span> Back to All Employees
              </button>

              {/* User Profile Card */}
              <div className={`rounded-xl shadow-sm border p-5 flex flex-col md:flex-row items-center gap-5 ${selectedUser.role === Role.HR ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'
                }`}>
                <div className="relative">
                  <div className={`h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-bold ${selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-700' : 'bg-indigo-100 text-indigo-600'
                    }`}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-xl font-bold text-gray-800">{selectedUser.name}</h2>
                  <p className="text-gray-500 text-sm">{selectedUser.email}</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-800' : 'bg-emerald-50 text-emerald-600'
                      }`}>{selectedUser.role}</span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">{selectedUser.department}</span>
                  </div>
                </div>
                <div className="text-center md:text-right bg-gray-50 rounded-xl px-5 py-3">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Viewing</p>
                  <p className="text-lg font-bold text-gray-700">{getMonthName()}</p>
                </div>
              </div>

              {/* Salary Breakdown Card */}
              {selectedUser.salaryBreakdown && selectedUser.salaryBreakdown.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                          Monthly Salary Breakdown
                        </h3>
                        <p className="text-gray-500 text-sm mt-1">
                          {selectedUser.salaryBreakdown.length} month{selectedUser.salaryBreakdown.length > 1 ? 's' : ''} •
                          {selectedUser.salaryBreakdown.filter((item: any) => item.isPartialMonth).length > 0 && (
                            <span className="text-orange-600 font-semibold ml-1">
                              Includes partial month (not counted in bond)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-gray-600">#</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-600">Period</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-600">Type</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-600">Salary (₹)</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-600">Payment Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedUser.salaryBreakdown.map((item: any, index: number) => {
                          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                          const monthName = monthNames[item.month - 1] || '';
                          const displayLabel = item.isPartialMonth
                            ? `${monthName} ${item.startDate.split('-')[0]}-${item.endDate.split('-')[0]}, ${item.year}`
                            : `${monthName} ${item.year}`;

                          return (
                            <tr key={index} className={`${item.isPartialMonth ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3 text-gray-700 font-semibold">{index + 1}</td>
                              <td className="px-4 py-3">
                                <div className="text-gray-800 font-medium">{displayLabel}</div>
                                <div className="text-gray-500 text-xs">{item.startDate} to {item.endDate}</div>
                                {item.isPartialMonth && (
                                  <div className="text-orange-600 text-xs font-semibold mt-1">
                                    Partial month (not in bond count)
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${item.bondType === 'Internship' ? 'bg-blue-100 text-blue-700' :
                                  item.bondType === 'Job' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                  {item.bondType}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-gray-800 font-semibold">
                                  ₹{item.amount.toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={item.isPaid || false}
                                    onChange={async (e) => {
                                      try {
                                        const isPaid = e.target.checked;
                                        await userAPI.markSalaryAsPaid(selectedUser.id, item.month, item.year, isPaid);
                                        await refreshData();
                                        alert(`Salary ${isPaid ? 'marked as paid' : 'unmarked'} successfully for ${selectedUser.name}`);
                                      } catch (error: any) {
                                        alert(error.message || 'Failed to update payment status');
                                      }
                                    }}
                                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2 cursor-pointer"
                                  />
                                  {item.isPaid && (
                                    <div className="flex flex-col">
                                      <span className="text-green-600 font-semibold text-xs">✓ Paid</span>
                                      {item.paidAt && (
                                        <span className="text-gray-500 text-xs">
                                          {new Date(item.paidAt).toLocaleDateString('en-IN', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                      )}
                                      {item.paidBy && (
                                        <span className="text-gray-500 text-xs">by {item.paidBy}</span>
                                      )}
                                    </div>
                                  )}
                                  {!item.isPaid && (
                                    <span className="text-gray-400 text-xs">Not paid</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Stats Grid - Matching Image 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Days Present */}
                <div className="bg-[#f0f7ff] rounded-2xl border border-blue-100 p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Days</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-800">{stats.daysPresent}</h3>
                    <p className="text-gray-500 text-sm font-medium mt-1">Days Present</p>
                  </div>
                </div>

                {/* Total Worked */}
                <div className="bg-[#f2fdf6] rounded-2xl border border-emerald-100 p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Timer className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Hours</span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-gray-800">{Math.floor(stats.totalWorkedSeconds / 3600)}</span>
                      <span className="text-sm font-bold text-gray-500">hours</span>
                      <span className="text-2xl font-black text-gray-800 ml-2">{Math.floor((stats.totalWorkedSeconds % 3600) / 60)}</span>
                      <span className="text-sm font-bold text-gray-500">min</span>
                    </div>
                    <p className="text-gray-500 text-sm font-medium mt-1">Total Worked</p>
                  </div>
                </div>

                {/* Low Time */}
                <div className="bg-[#fff5f5] rounded-2xl border border-rose-100 p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-rose-600" />
                    </div>
                    <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Deficit</span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-gray-800">{Math.floor((stats.totalLowTimeSeconds + Math.max(0, -stats.forwardedInSeconds)) / 3600)}</span>
                      <span className="text-sm font-bold text-gray-500">hours</span>
                      <span className="text-2xl font-black text-gray-800 ml-2">{Math.floor(((stats.totalLowTimeSeconds + Math.max(0, -stats.forwardedInSeconds)) % 3600) / 60)}</span>
                      <span className="text-sm font-bold text-gray-500">min</span>
                    </div>
                    <p className="text-gray-500 text-sm font-medium mt-1">Low Time</p>
                    {stats.forwardedInSeconds < 0 && (
                      <p className="text-[10px] text-rose-500 font-bold italic mt-1">
                        (Incl. {formatHoursToHoursMinutes(Math.abs(stats.forwardedInSeconds) / 3600)} forwarded)
                      </p>
                    )}
                  </div>
                </div>

                {/* Extra Time */}
                <div className="bg-[#f8f7ff] rounded-2xl border border-indigo-100 p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-indigo-600" />
                    </div>
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Bonus</span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-gray-800">{Math.floor((stats.totalExtraTimeSeconds + Math.max(0, stats.forwardedInSeconds)) / 3600)}</span>
                      <span className="text-sm font-bold text-gray-500">hours</span>
                      <span className="text-2xl font-black text-gray-800 ml-2">{Math.floor(((stats.totalExtraTimeSeconds + Math.max(0, stats.forwardedInSeconds)) % 3600) / 60)}</span>
                      <span className="text-sm font-bold text-gray-500">min</span>
                    </div>
                    <p className="text-gray-500 text-sm font-medium mt-1">Extra Time</p>
                    {stats.forwardedInSeconds > 0 && (
                      <p className="text-[10px] text-indigo-500 font-bold italic mt-1">
                        (Incl. {formatHoursToHoursMinutes(stats.forwardedInSeconds / 3600)} forwarded)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Net Time Balance Banner - Matching Image 2 */}
              <div className={`rounded-2xl p-8 border-2 shadow-sm transition-all ${stats.finalDifference >= 0
                ? 'bg-[#f0fdf4] border-emerald-100'
                : 'bg-[#fff5f5] border-rose-100'
                }`}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shadow-sm ${stats.finalDifference >= 0 ? 'bg-emerald-100' : 'bg-rose-100'
                      }`}>
                      {stats.finalDifference >= 0 ? (
                        <TrendingUp className={`h-8 w-8 text-emerald-600`} />
                      ) : (
                        <TrendingDown className="h-8 w-8 text-rose-600" />
                      )}
                    </div>
                    <div>
                      <h4 className={`text-xl font-bold ${stats.finalDifference >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                        Net Time Balance
                      </h4>
                      <p className="text-gray-500 text-xs font-medium">Extra - (ETL + Low) - Sent + Prev</p>
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <div className={`text-4xl font-black tracking-tighter ${stats.finalDifference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {stats.finalDifference >= 0 ? '+' : '-'}{formatDuration(Math.abs(stats.finalDifference))}
                    </div>
                    <div className={`flex items-center justify-center md:justify-end gap-2 mt-2 font-bold ${stats.finalDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {stats.finalDifference >= 0 ? (
                        <CheckCircle size={18} />
                      ) : (
                        <AlertCircle size={18} />
                      )}
                      <span>{stats.finalDifference >= 0 ? 'Good Performance' : 'Needs Improvement'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Cards Row - Matching Image 2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Extra Time Leave Balance Card */}
                <div className="bg-[#fff9f2] rounded-2xl p-8 border border-orange-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                      <Timer className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-orange-800">Extra Time Balance</h4>
                      <p className="text-sm text-orange-600/70 font-medium">
                        {selectedUserBalance?.remainingExtraTimeLeaveHours && selectedUserBalance.remainingExtraTimeLeaveHours >= 0
                          ? 'Available for leaves'
                          : 'Deficit to be worked'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-black ${selectedUserBalance?.remainingExtraTimeLeaveHours && selectedUserBalance.remainingExtraTimeLeaveHours > 0 ? 'text-emerald-600' :
                      selectedUserBalance?.remainingExtraTimeLeaveHours && selectedUserBalance.remainingExtraTimeLeaveHours < 0 ? 'text-rose-600' : 'text-gray-400'
                      }`}>
                      {selectedUserBalance?.remainingExtraTimeLeaveHours ? formatHoursToHoursMinutes(selectedUserBalance.remainingExtraTimeLeaveHours) : '0m'}
                    </span>
                  </div>
                  {(() => {
                    const now = new Date();
                    const isMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                    if (isMonthEnd && selectedUserBalance?.carryoverExtraTimeLeave && selectedUserBalance.carryoverExtraTimeLeave > 0) {
                      return (
                        <div className="mt-4 flex items-center gap-2 text-sm text-orange-600 font-bold bg-orange-100/50 py-2 px-3 rounded-lg w-fit">
                          <ArrowRight size={14} />
                          <span>{formatHoursToHoursMinutes(selectedUserBalance.carryoverExtraTimeLeave)} carries to next month</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Low Time Card */}
                <div className="bg-[#fff5f5] rounded-2xl p-8 border border-rose-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-rose-800">Low Time</h4>
                      <p className="text-sm text-rose-600/70 font-medium">Total deficit (auto-carries over if not covered)</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-rose-600">
                    {formatDuration(stats.totalLowTimeSeconds)}
                  </div>
                </div>
              </div>

              {/* Leave Records */}
              {monthlyLeaves.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-purple-50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-purple-600" /> Leave Records
                        </h3>
                        <p className="text-gray-500 text-sm">
                          {getMonthName()} • {filteredMonthlyLeaves.length} leave request(s) •{' '}
                          <span className="font-semibold text-purple-700">
                            Total Leave: {totalLeaveDays} {totalLeaveDays === 1 ? 'day' : 'days'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500 uppercase font-semibold">Filters:</span>
                      <select
                        className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                        value={leaveStatusFilter}
                        onChange={e => setLeaveStatusFilter(e.target.value as any)}
                      >
                        <option value="All">All Status</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Pending">Pending</option>
                      </select>
                      <input
                        type="date"
                        className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                        value={leaveFilterDate}
                        onChange={e => setLeaveFilterDate(e.target.value)}
                        placeholder="Filter by date"
                      />
                      <input
                        type="month"
                        className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                        value={leaveFilterMonth}
                        onChange={e => setLeaveFilterMonth(e.target.value)}
                        placeholder="Filter by month"
                      />
                      {(leaveFilterDate || leaveFilterMonth) && (
                        <button
                          onClick={() => {
                            setLeaveFilterDate('');
                            setLeaveFilterMonth('');
                          }}
                          className="text-xs text-purple-600 hover:text-purple-800 underline"
                        >
                          Clear Date/Month
                        </button>
                      )}
                    </div>
                  </div>
                  {filteredMonthlyLeaves.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-400 text-sm">
                      No leaves match the selected filters.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-purple-50/50">
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Days</th>
                            <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredMonthlyLeaves.map(leave => {
                            const days = calculateLeaveDays(leave.startDate, leave.endDate);
                            const isHalfDay = leave.category === LeaveCategory.HALF_DAY;
                            const isExtraTime = leave.category === LeaveCategory.EXTRA_TIME;
                            const showTime = (isHalfDay || isExtraTime) && leave.startTime;
                            return (
                              <tr key={leave.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                  <div className="font-semibold text-gray-800">{formatDate(leave.startDate)}</div>
                                  {leave.startDate !== leave.endDate && (
                                    <div className="text-xs text-gray-400">to {formatDate(leave.endDate)}</div>
                                  )}
                                  {showTime && (
                                    <div className="text-xs text-purple-600 mt-1 font-semibold">
                                      Start: {leave.startTime}
                                      {leave.endTime && ` - End: ${leave.endTime}`}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                                    {leave.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-gray-600 text-sm max-w-xs truncate">{leave.reason}</td>
                                <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                                  {days} {days === 1 ? 'day' : 'days'}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                    leave.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                    {leave.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {(leave.status === 'Approved' || leave.status === 'Rejected') && (
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Are you sure you want to revert this ${leave.status.toLowerCase()} leave?`)) return;
                                          try {
                                            await updateLeaveStatus(leave.id, 'Pending', `Reverted from ${leave.status} by Admin`);
                                            alert('Leave reverted to Pending status successfully');
                                            await refreshData();
                                          } catch (error: any) {
                                            alert(error.message || 'Failed to revert leave');
                                          }
                                        }}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Revert to Pending"
                                      >
                                        <RotateCcw size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={async () => {
                                        if (!confirm('Are you sure you want to delete this leave request?')) return;
                                        try {
                                          await deleteLeaveRequest(leave.id);
                                          alert('Leave request deleted successfully');
                                          await refreshData();
                                        } catch (error: any) {
                                          alert(error.message || 'Failed to delete leave request');
                                        }
                                      }}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Delete Leave"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Attendance Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-gray-800">Daily Attendance Log</h3>
                    <p className="text-gray-500 text-sm font-medium">{getMonthName()} • {monthlyAttendance.length} records</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogIn size={14} className="text-emerald-500" /> Check In</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogOut size={14} className="text-rose-500" /> Check Out</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Break</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">OT Approved</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">OT Done</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Worked</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthlyAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-gray-400">
                            No attendance records found for this month
                          </td>
                        </tr>
                      ) : (
                        monthlyAttendance.map((record, idx) => {
                          const recordDateISO = typeof record.date === 'string' ? record.date.split('T')[0] : new Date(record.date).toISOString().split('T')[0];
                          const dateStr = recordDateISO;
                          
                          // Find if there's an approved half day leave for this date
                          const halfDayLeave = monthlyLeaves.find(l => {
                            const status = String(l.status || '').trim();
                            const isApproved = status === 'Approved' || status === LeaveStatus.APPROVED;
                            if (!isApproved || l.category !== LeaveCategory.HALF_DAY) return false;
                            const leaveDate = typeof l.startDate === 'string' ? l.startDate.split('T')[0] : new Date(l.startDate).toISOString().split('T')[0];
                            return leaveDate === recordDateISO;
                          });

                          // Case: Approved Extra Time Leave for this date
                          const extraTimeLeaveForDate = monthlyLeaves.find(leave => {
                             const status = (leave.status || '').trim();
                             if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
                             if (leave.category !== LeaveCategory.EXTRA_TIME) return false;
                             const start = new Date(leave.startDate);
                             const end = new Date(leave.endDate);
                             const current = new Date(dateStr);
                             return current >= start && current <= end;
                          });

                          // Normal time: 8:15 to 8:22, Low < 8:15, Extra > 8:22
                          const adjustmentSeconds = halfDayLeave ? 4 * 3600 : 0;
                          const MIN_NORMAL_SECONDS_LOCAL = (8 * 3600 + 15 * 60) - adjustmentSeconds;
                          const MAX_NORMAL_SECONDS_LOCAL = (8 * 3600 + 22 * 60) - adjustmentSeconds;

                          const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
                          const storedWorked = record.totalWorkedSeconds ?? 0;
                          let netWorkedSeconds = storedWorked;
                          
                          if (extraTimeLeaveForDate) {
                             const leaveHours = extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime 
                               ? calculateHoursPerDay(extraTimeLeaveForDate.startTime, extraTimeLeaveForDate.endTime)
                               : 8.25;
                             netWorkedSeconds += leaveHours * 3600;
                          }

                          let isLateCheckIn = false;
                          let isHolidayDay = false;
                          let isLowTime = false;
                          let isExtraTime = false;

                          isHolidayDay = companyHolidays.some(h => {
                            const hDate = typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0];
                            return hDate === recordDateISO;
                          });

                          if (record.checkIn && record.checkOut) {
                            isLateCheckIn = !!record.lateCheckIn;
                            if (record.isManualFlag) {
                              isLowTime = !!record.lowTimeFlag;
                              isExtraTime = !!record.extraTimeFlag;
                            } else {
                              isLowTime = !isHolidayDay && netWorkedSeconds > 0 && netWorkedSeconds < MIN_NORMAL_SECONDS_LOCAL;
                              isExtraTime = isHolidayDay ? (storedWorked > 0) : (netWorkedSeconds > MAX_NORMAL_SECONDS_LOCAL);
                            }
                          } else if (storedWorked > 0) {
                            isLowTime = !isHolidayDay && netWorkedSeconds > 0 && netWorkedSeconds < MIN_NORMAL_SECONDS_LOCAL;
                            isExtraTime = isHolidayDay ? (storedWorked > 0) : (netWorkedSeconds > MAX_NORMAL_SECONDS_LOCAL);
                          }

                          const lowSeconds = isLowTime ? (MIN_NORMAL_SECONDS_LOCAL - netWorkedSeconds) : 0;
                          const surplusSeconds = isExtraTime ? (isHolidayDay ? storedWorked : netWorkedSeconds - MAX_NORMAL_SECONDS_LOCAL) : 0;

                          return (
                            <tr key={record.id} className={`hover:bg-slate-50/80 transition-colors border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-700 text-xs">{formatDate(record.date)}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-emerald-600 font-black text-xs tabular-nums">
                                  {formatTime(record.checkIn)}
                                </span>
                                {isLateCheckIn && record.penaltySeconds > 0 && isPenaltyEffective(record.date) && (
                                  <div className="text-[9px] text-rose-500 font-black mt-1 flex items-center gap-1 uppercase italic tracking-tight">
                                    <AlertCircle size={10} /> Late Penalty
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-rose-600 font-black text-xs tabular-nums">
                                  {formatTime(record.checkOut)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="text-amber-600 font-bold text-xs tabular-nums">
                                    {breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
                                  </span>
                                  {record.breaks && record.breaks.length > 0 && (
                                    <div className="text-[9px] text-slate-400 space-y-0.5 font-medium italic">
                                      {record.breaks
                                        .filter((b: any) => b.type === 'Extra' && b.reason)
                                        .map((b: any, bIdx: number) => (
                                          <div key={bIdx}>
                                            <span className="text-purple-500 font-bold">Extra:</span> {b.reason}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`font-black text-xs tabular-nums ${record.overtimeRequest?.status === 'Approved' ? 'text-indigo-600' : 'text-slate-300'}`}>
                                  {record.overtimeRequest?.status === 'Approved' ? `${record.overtimeRequest.durationMinutes}m` : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`font-black text-xs tabular-nums ${record.overtimeRequest?.completedMinutes ? 'text-emerald-600' : 'text-slate-300'}`}>
                                  {record.overtimeRequest?.completedMinutes ? `${record.overtimeRequest.completedMinutes}m` : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-black text-slate-800 text-xs tabular-nums">
                                  {storedWorked > 0 ? formatDuration(storedWorked) : '-'}
                                </span>
                                {isLateCheckIn && (record.penaltySeconds || 0) > 0 && isPenaltyEffective(record.date) && (
                                  <div className="text-[9px] text-slate-400 font-bold italic">
                                    ( penalty applied )
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleDirectStatusToggle(record)}
                                  className="hover:opacity-80 transition-all focus:outline-none flex flex-col items-start gap-1"
                                  title="Click to toggle status manually"
                                >
                                  {!record.checkIn && !(record.totalWorkedSeconds > 0) ? (
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${recordDateISO >= ABSENCE_PENALTY_EFFECTIVE_DATE ? 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' : 'text-slate-200'}`}>
                                      {recordDateISO >= ABSENCE_PENALTY_EFFECTIVE_DATE ? 'Unexcused Absence' : '-'}
                                    </span>
                                  ) : !record.checkIn && (record.totalWorkedSeconds || 0) > 0 ? (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md font-black uppercase tracking-wider ring-1 ring-emerald-100 italic">Manual Log</span>
                                  ) : !record.checkOut ? (
                                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-amber-100 animate-pulse">In Progress</span>
                                  ) : isHolidayDay && storedWorked > 0 ? (
                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black uppercase ring-1 ring-emerald-200">
                                      <TrendingUp size={10} />
                                      <span>+{formatDuration(storedWorked)}</span>
                                    </div>
                                  ) : isLowTime ? (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-md text-[10px] font-black uppercase ring-1 ring-rose-200">
                                        <TrendingDown size={10} />
                                        <span>-{formatDuration(lowSeconds)}</span>
                                      </div>
                                    </div>
                                  ) : isExtraTime ? (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black uppercase ring-1 ring-emerald-200">
                                        <TrendingUp size={10} />
                                        <span>+{formatDuration(surplusSeconds)}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-black uppercase ring-1 ring-indigo-200">
                                      <CheckCircle size={10} />
                                      <span>Normal</span>
                                    </div>
                                  )}

                                  {extraTimeLeaveForDate && (
                                    <span className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1 italic tracking-tight">
                                      <Calendar size={10} /> Extra Time Leave Applied
                                    </span>
                                  )}
                                  
                                  {record.isManualFlag && (
                                    <div className="text-[8px] text-slate-400 font-black flex items-center gap-0.5 uppercase tracking-tighter">
                                      <Globe size={8} /> Manual Override
                                    </div>
                                  )}
                                </button>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setEditingAttendance(record)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                    title="Edit Record"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to delete the attendance record for ${formatDate(record.date)}?`)) return;
                                      try {
                                        await deleteAttendance(record.id);
                                        alert('Attendance record deleted successfully');
                                        await refreshData();
                                      } catch (error: any) {
                                        alert(error.message || 'Failed to delete record');
                                      }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                    title="Delete Record"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">All Employees Overview</h3>
                  <p className="text-gray-500 text-sm font-medium">Select an employee to view detailed monthly summary</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Users className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search employee..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl text-sm leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all shadow-sm"
                        value={summarySearchTerm}
                        onChange={(e) => {
                            setSummarySearchTerm(e.target.value);
                            setSummaryPage(1); // Reset to first page on search
                        }}
                    />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Employee</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Department</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-400 uppercase tracking-wider">Total Days</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedSummaryUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                          {summarySearchTerm ? `No employees found matching "${summarySearchTerm}"` : 'No employees found'}
                        </td>
                      </tr>
                    )}
                    {paginatedSummaryUsers.map(emp => {
                      const empAttendanceCount = userAttendanceCounts[emp.id] || 0;
                      const isHR = emp.role === Role.HR;
                      return (
                        <tr key={emp.id} className={isHR ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-slate-50 transition-colors'}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold shadow-sm ${isHR ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                                }`}>
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-800">{emp.name}</p>
                                  {isHR && <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded uppercase tracking-tighter">HR</span>}
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold tracking-tight">@{emp.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-medium text-sm">{emp.department}</td>
                          <td className="px-6 py-4 text-slate-400 text-xs font-medium">{emp.email}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-black text-sm tabular-nums ${isHR ? 'text-amber-600' : 'text-indigo-600'}`}>{empAttendanceCount}</span>
                            <span className="text-slate-400 text-[10px] font-bold ml-1 uppercase">days</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setSelectedUserId(emp.id)}
                              className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all shadow-sm ${isHR ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                }`}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination for Summary Tab */}
              {totalSummaryPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Page <span className="text-indigo-600 font-black">{summaryPage}</span> of {totalSummaryPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSummaryPage(p => Math.max(1, p - 1))}
                      disabled={summaryPage === 1}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${summaryPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 shadow-sm underline decoration-2 underline-offset-4'}`}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setSummaryPage(p => Math.min(totalSummaryPages, p + 1))}
                      disabled={summaryPage === totalSummaryPages}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${summaryPage === totalSummaryPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 shadow-sm underline decoration-2 underline-offset-4'}`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edit Attendance Modal */}
          {editingAttendance && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <Edit2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">Edit Attendance</h3>
                      <p className="text-xs text-gray-500">Manual override for {formatDate(editingAttendance.date)}</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingAttendance(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const workedHoursInput = parseInt((form.elements.namedItem('workedHours') as HTMLInputElement)?.value || '0', 10) || 0;
                  const workedMinutesInput = parseInt((form.elements.namedItem('workedMinutes') as HTMLInputElement)?.value || '0', 10) || 0;
                  const totalWorkedSecondsFromForm = workedHoursInput * 3600 + workedMinutesInput * 60;
                  const updates: Record<string, unknown> = {
                    checkIn: (form.elements.namedItem('checkIn') as HTMLInputElement).value,
                    checkOut: (form.elements.namedItem('checkOut') as HTMLInputElement).value,
                    notes: (form.elements.namedItem('notes') as HTMLInputElement).value,
                    isManualFlag: (form.elements.namedItem('isManualFlag') as HTMLInputElement).checked,
                    lowTimeFlag: (form.elements.namedItem('lowTimeFlag') as HTMLInputElement).checked,
                    extraTimeFlag: (form.elements.namedItem('extraTimeFlag') as HTMLInputElement).checked,
                    isPenaltyDisabled: (form.elements.namedItem('isPenaltyDisabled') as HTMLInputElement).checked,
                  };
                  if (totalWorkedSecondsFromForm >= 0) {
                    updates.totalWorkedSeconds = totalWorkedSecondsFromForm;
                  }
                  const breakMinutes = parseInt((form.elements.namedItem('breakDuration') as HTMLInputElement).value);

                  try {
                    await adminUpdateAttendance(editingAttendance.id, updates as Partial<Attendance>, isNaN(breakMinutes) ? undefined : breakMinutes);
                    alert('Attendance record updated successfully');
                    setEditingAttendance(null);
                    await refreshData();
                  } catch (error: any) {
                    alert(error.message || 'Failed to update attendance');
                  }
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Check In</label>
                      <input type="time" name="checkIn" defaultValue={editingAttendance.checkIn ? new Date(editingAttendance.checkIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Check Out</label>
                      <input type="time" name="checkOut" defaultValue={editingAttendance.checkOut ? new Date(editingAttendance.checkOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''} className="w-full p-2 border rounded-lg" />
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <label className="block text-xs font-bold text-amber-800 uppercase mb-2">Worked hours (for manual entries or override)</label>
                    <p className="text-[10px] text-amber-600 mb-2">When there is no check-in/check-out, this is used as total worked time and counts in &quot;Total Worked&quot;.</p>
                    <div className="flex gap-2 items-center">
                      <input type="number" name="workedHours" min={0} max={24} defaultValue={Math.floor((editingAttendance.totalWorkedSeconds || 0) / 3600)} className="w-20 p-2 border rounded-lg" placeholder="H" />
                      <span className="text-gray-500 font-medium">h</span>
                      <input type="number" name="workedMinutes" min={0} max={59} defaultValue={Math.floor(((editingAttendance.totalWorkedSeconds || 0) % 3600) / 60)} className="w-20 p-2 border rounded-lg" placeholder="M" />
                      <span className="text-gray-500 font-medium">m</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Break Duration (mins)</label>
                    <input type="number" name="breakDuration" defaultValue={editingAttendance.breakDurationMinutes || 0} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Admin Notes</label>
                    <input type="text" name="notes" defaultValue={editingAttendance.notes || ''} className="w-full p-2 border rounded-lg" />
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="isManualFlag" name="isManualFlag" defaultChecked={editingAttendance.isManualFlag} className="rounded text-indigo-600" />
                      <label htmlFor="isManualFlag" className="text-sm font-semibold text-gray-800">Manual Status Selection</label>
                    </div>
                    <p className="text-[10px] text-gray-400 -mt-1 ml-6">If enabled, automatic low/extra time calculation will be bypassed.</p>

                    <div className="grid grid-cols-2 gap-4 ml-6">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="lowTimeFlag" name="lowTimeFlag" defaultChecked={editingAttendance.lowTimeFlag} className="rounded text-indigo-600" />
                        <label htmlFor="lowTimeFlag" className="text-xs text-gray-600">Low Time</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="extraTimeFlag" name="extraTimeFlag" defaultChecked={editingAttendance.extraTimeFlag} className="rounded text-indigo-600" />
                        <label htmlFor="extraTimeFlag" className="text-xs text-gray-600">Extra Time</label>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                      <input type="checkbox" id="isPenaltyDisabled" name="isPenaltyDisabled" defaultChecked={editingAttendance.isPenaltyDisabled} className="rounded text-rose-600" />
                      <label htmlFor="isPenaltyDisabled" className="text-sm font-semibold text-rose-700">Disable Late Penalty</label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button type="button" onClick={() => setEditingAttendance(null)} className="flex-1 bg-gray-100 text-gray-800 hover:bg-gray-200">Cancel</Button>
                    <Button type="submit" className="flex-1">Save Changes</Button>
                  </div>
                </form>
              </Card>
            </div>
          )}

        </div>
      )}

      {/* USER MANAGEMENT TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* All Users Table */}
          <Card className="overflow-hidden p-0">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">All Users</h3>
                  <p className="text-xs text-gray-500">{users.length} users</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateUserModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl shadow-md shadow-indigo-100 hover:shadow-indigo-200 transition-all active:scale-95 group"
              >
                <UserPlus size={18} className="group-hover:rotate-12 transition-transform" />
                <span className="font-bold text-sm">Add New User</span>
              </button>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left">User</th>
                    <th className="px-5 py-3 text-left">Role</th>
                    <th className="px-5 py-3 text-left">Department</th>
                    <th className="px-5 py-3 text-left">Joining Date</th>
                    <th className="px-5 py-3 text-left">Bond Period</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map(user => {
                      const bondInfo = calculateBondRemaining(user.bonds, user.joiningDate);
                      return (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${user.role === Role.ADMIN ? 'bg-purple-500' :
                                user.role === Role.HR ? 'bg-blue-500' : 'bg-emerald-500'
                                }`}>
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800">{user.name}</p>
                                <p className="text-xs text-gray-400">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${user.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' :
                              user.role === Role.HR ? 'bg-blue-100 text-blue-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{user.department}</td>
                          <td className="px-5 py-4 text-gray-600 text-xs">
                            {user.joiningDate || '-'}
                          </td>
                          <td className="px-5 py-4 text-xs">
                            {bondInfo.currentBond || bondInfo.totalRemaining.display !== '-' ? (
                              <button
                                onClick={() => setBondModalUser(user)}
                                className="text-blue-600 hover:text-blue-800 font-semibold text-xs underline"
                              >
                                View Bond Details
                              </button>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingUser(user);
                                  setEditUserForm({
                                    name: user.name,
                                    email: user.email,
                                    department: user.department,
                                    joiningDate: user.joiningDate ? convertToYYYYMMDD(user.joiningDate) : '',
                                    bonds: (user.bonds || []).map(b => ({
                                      type: b.type,
                                      periodMonths: b.periodMonths.toString(),
                                      startDate: b.startDate,
                                      endDate: '',
                                      salary: (b.salary || 0).toString()
                                    })),
                                    aadhaarNumber: user.aadhaarNumber || '',
                                    guardianName: user.guardianName || '',
                                    mobileNumber: user.mobileNumber || '',
                                    guardianMobileNumber: user.guardianMobileNumber || '',
                                    paidLeaveAllocation: (user.paidLeaveAllocation || 0).toString()
                                  });
                                }}
                                className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50"
                                title="Edit User"
                              >
                                <PenTool size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedUserForReset(user);
                                  setResetPasswordModalOpen(true);
                                  setNewEmployeePassword('');
                                }}
                                className="text-gray-400 hover:text-purple-500 transition-colors p-2 rounded-lg hover:bg-purple-50"
                                title="Reset Password"
                              >
                                <Key size={16} />
                              </button>
                              {user.id !== auth.user?.id && (
                                <button
                                  onClick={async () => {
                                    if (confirm(`Are you sure you want to delete ${user.name}?`)) {
                                      try {
                                        await userAPI.deleteUser(user.id);
                                        alert(`User ${user.name} deleted successfully`);
                                        await refreshData();
                                      } catch (error: any) {
                                        alert(error.message || 'Failed to delete user');
                                      }
                                    }
                                  }}
                                  className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                                  title="Delete User"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination for Users */}
            {users.length > 0 && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        Showing <span className="font-bold text-gray-800">{(userPage - 1) * USERS_PER_PAGE + 1}</span> to <span className="font-bold text-gray-800">{Math.min(userPage * USERS_PER_PAGE, users.length)}</span> of <span className="font-bold text-gray-800">{users.length}</span> users
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setUserPage(p => Math.max(1, p - 1))}
                            disabled={userPage === 1}
                            className={`p-1.5 rounded-lg border transition-all ${userPage === 1 ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <div className="flex items-center gap-1 text-xs font-bold text-gray-700 mx-2">
                            <span className="text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded border border-indigo-100">{userPage}</span>
                            <span className="text-gray-400">/</span>
                            <span>{totalUserPages}</span>
                        </div>
                        <button
                            onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                            disabled={userPage === totalUserPages}
                            className={`p-1.5 rounded-lg border transition-all ${userPage === totalUserPages ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
          </Card>
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <Card title="System Audit Logs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Actor</th>
                  <th className="px-6 py-3">Target</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-4 text-gray-400">No audit logs found</td></tr>
                ) : (
                  auditLogs.map(log => {
                    const actor = users.find(u => u.id === log.actorId);
                    return (
                      <tr key={log.id} className="bg-white border-b">
                        <td className="px-6 py-4 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {log.actorName}
                          {actor && (
                            <span className="inline-block ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase tracking-tight">
                              {actor.role}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-gray-600 block">{log.targetType}</span>
                        </td>
                        <td className="px-6 py-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-mono">{log.action}</span></td>
                        <td className="px-6 py-4">
                          <p className="text-gray-600 text-sm">{log.details}</p>
                          {log.beforeData && (
                            <details className="mt-1 text-xs text-gray-400 cursor-pointer">
                              <summary>View Diff</summary>
                              <div className="p-2 bg-gray-50 rounded mt-1 font-mono">
                                <p className="text-red-500 line-through">{log.beforeData}</p>
                                <p className="text-green-600">{log.afterData}</p>
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* REPORTS & MANAGEMENT TAB */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Add Holiday */}
            <Card title="Add Company Holiday" className="lg:col-span-1 h-fit">
              <form onSubmit={handleAddHoliday} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Holiday Date</label>
                  <input type="date" className="w-full p-2 border rounded text-sm" value={newHoliday.date} onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
                  <input type="text" placeholder="e.g. Independence Day" className="w-full p-2 border rounded text-sm" value={newHoliday.description} onChange={e => setNewHoliday({ ...newHoliday, description: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full">
                  <Plus size={16} className="mr-2" /> Post Holiday
                </Button>
              </form>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={async () => {
                    if (!confirm('This will add all Sundays for the current month as holidays. Continue?')) {
                      return;
                    }
                    try {
                      const result: any = await holidayAPI.autoAddSundays();
                      alert(result.message || `Successfully added ${result.added || 0} Sunday(s) as holidays`);
                      await refreshData();
                    } catch (error: any) {
                      alert(error.message || 'Failed to add Sundays');
                    }
                  }}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                >
                  <Calendar size={16} className="mr-2" /> Auto Add All Sundays (Current Month)
                </Button>
                <p className="text-xs text-gray-500 mt-2 text-center">Adds all Sundays of the current month as holidays</p>
              </div>
            </Card>


            {/* List Holidays */}
            <Card title="Scheduled Holidays" className="lg:col-span-1">
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {companyHolidays.length === 0 ? <p className="text-gray-400 text-sm p-2">No holidays scheduled.</p> :
                  companyHolidays.map(holiday => (
                    <div key={holiday.id} className={`flex items-center justify-between p-3 rounded border ${holiday.status === 'past'
                      ? 'bg-gray-100 border-gray-200 opacity-60'
                      : 'bg-gray-50 border-gray-100'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${holiday.status === 'past'
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-purple-100 text-purple-600'
                          }`}>
                          <Calendar size={18} />
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${holiday.status === 'past' ? 'text-gray-500' : 'text-gray-800'
                            }`}>{holiday.description}</p>
                          <p className="text-xs text-gray-500">{formatDate(holiday.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const newDesc = prompt('Enter new holiday description:', holiday.description);
                            const newDate = prompt('Enter new holiday date (YYYY-MM-DD):', typeof holiday.date === 'string' ? holiday.date.split('T')[0] : new Date(holiday.date).toISOString().split('T')[0]);
                            if (newDesc && newDate) {
                              updateHoliday(holiday.id, { description: newDesc, date: newDate })
                                .then(() => {
                                  alert('Holiday updated');
                                  refreshData();
                                })
                                .catch((err: any) => alert(err.message || 'Update failed'));
                            }
                          }}
                          className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete holiday "${holiday.description}"?`)) return;
                            try {
                              await deleteHoliday(holiday.id);
                              alert('Holiday deleted');
                              await refreshData();
                            } catch (err: any) {
                              alert(err.message || 'Delete failed');
                            }
                          }}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {holiday.status === 'past' && (
                        <span className="text-xs bg-gray-300 text-gray-600 px-2 py-1 rounded-full font-semibold">
                          Past
                        </span>
                      )}
                    </div>
                  ))
                }
              </div>
            </Card>
          </div>

          {/* Paid Leave Allocation Table */}
          <div className="lg:col-span-3 mt-6">
            <Card>
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Paid Leave Allocation Summary</h3>
                    <p className="text-xs text-gray-500">View all employees' paid leave allocation, usage, and remaining</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 text-left">Employee</th>
                      <th className="px-5 py-3 text-left">Department</th>
                      <th className="px-5 py-3 text-center">Allocated</th>
                      <th className="px-5 py-3 text-center">Used</th>
                      <th className="px-5 py-3 text-center">Remaining</th>
                      <th className="px-5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paidLeaveData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                          No employees found
                        </td>
                      </tr>
                    ) : (
                      paidLeaveData.map(({ user, allocated, used, remaining }) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-emerald-500">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800">{user.name}</p>
                                <p className="text-xs text-gray-400">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{user.department}</td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-gray-800">{allocated}</span>
                            <p className="text-xs text-gray-500 mt-1">
                              Admin Allocated
                            </p>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-semibold text-orange-600">{used}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={`font-bold ${remaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {remaining}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {remaining > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
                                Available
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700">
                                Exhausted
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {paidLeaveData.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={2} className="px-5 py-3 text-right font-bold text-gray-800">
                          Total:
                        </td>
                        <td className="px-5 py-3 text-center font-bold text-gray-800">
                          {paidLeaveData.reduce((sum, d) => sum + d.allocated, 0)}
                        </td>
                        <td className="px-5 py-3 text-center font-bold text-orange-600">
                          {paidLeaveData.reduce((sum, d) => sum + d.used, 0)}
                        </td>
                        <td className="px-5 py-3 text-center font-bold text-green-600">
                          {paidLeaveData.reduce((sum, d) => sum + d.remaining, 0)}
                        </td>
                        <td className="px-5 py-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          </div>
        </div>
      )
      }

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <Card title="Global System Settings">
          <div className="max-w-md">
            <label className="block text-sm font-bold text-gray-700 mb-2">Company Timezone</label>
            <p className="text-xs text-gray-500 mb-2">This timezone affects how timestamps are displayed to all users.</p>
            <select
              className="w-full p-2 border rounded-lg"
              value={systemSettings.timezone}
              onChange={(e) => updateSystemSettings({ timezone: e.target.value })}
            >
              {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm font-mono">Current Time in Zone: {new Date().toLocaleTimeString('en-US', { timeZone: systemSettings.timezone })}</p>
            </div>
          </div>
        </Card>
      )
      }

      {/* GUIDANCE TAB */}
      {activeTab === 'guidance' && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">HRMS System Guide</h2>
                <p className="text-sm text-gray-500">Complete guide to using the HRMS system</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* Monthly Summary Section */}
              <section className="border-l-4 border-indigo-500 pl-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-xl font-bold text-gray-800">Monthly Summary</h3>
                </div>
                <div className="space-y-3 text-gray-700">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                    <span><strong>View Attendance:</strong> Select an employee and month to view their attendance summary, including present days, worked hours, and leave statistics.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                    <span><strong>Performance Metrics:</strong> Track low time flags (less than 8h 15m) and extra time flags (more than 8h 30m) for each employee.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                    <span><strong>Leave Breakdown:</strong> View paid leaves, unpaid leaves, half-day leaves, and extra time leaves used by each employee.</span>
                  </p>
                </div>
              </section>

              {/* User Management Section */}
              <section className="border-l-4 border-purple-500 pl-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-5 w-5 text-purple-600" />
                  <h3 className="text-xl font-bold text-gray-800">User Management</h3>
                </div>
                <div className="space-y-3 text-gray-700">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span><strong>Create Users:</strong> Add new Admin, HR, or Employee accounts. Fill in name, username, email, department, role, and optional joining date. Users receive temporary password: <code className="bg-gray-100 px-1 rounded">tempPassword123</code></span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span><strong>View All Users:</strong> See all active users with their roles, departments, joining dates, and status. Delete inactive users if needed.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span><strong>User Actions:</strong> Edit user details, reset passwords, or delete accounts directly from the users table.</span>
                  </p>
                </div>
              </section>

              {/* Audit Logs Section */}
              <section className="border-l-4 border-green-500 pl-6">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="h-5 w-5 text-green-600" />
                  <h3 className="text-xl font-bold text-gray-800">Audit Logs</h3>
                </div>
                <div className="space-y-3 text-gray-700">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                    <span><strong>Track Activities:</strong> Monitor all system activities including user creation, password changes, attendance updates, leave approvals, and more.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                    <span><strong>View Details:</strong> See who performed what action, when, and what changes were made (before/after data).</span>
                  </p>
                </div>
              </section>

              {/* System Management Section */}
              <section className="border-l-4 border-orange-500 pl-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="h-5 w-5 text-orange-600" />
                  <h3 className="text-xl font-bold text-gray-800">System Management</h3>
                </div>
                <div className="space-y-3 text-gray-700">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-orange-500 mt-1 flex-shrink-0" />
                    <span><strong>Company Holidays:</strong> Add company holidays that will be automatically marked for all employees. Holidays are shown in the attendance calendar.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-orange-500 mt-1 flex-shrink-0" />
                    <span><strong>Attendance Correction:</strong> Manually create or update attendance records for any employee. Enter check-in, check-out times, break duration, and notes.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-orange-500 mt-1 flex-shrink-0" />
                    <span><strong>Export Reports:</strong> Generate and download attendance reports in CSV format. Filter by date range and department.</span>
                  </p>
                </div>
              </section>

              {/* Settings Section */}
              <section className="border-l-4 border-blue-500 pl-6">
                <div className="flex items-center gap-3 mb-4">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <h3 className="text-xl font-bold text-gray-800">Settings</h3>
                </div>
                <div className="space-y-3 text-gray-700">
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-blue-500 mt-1 flex-shrink-0" />
                    <span><strong>Company Timezone:</strong> Set the global timezone for the organization. This affects how all timestamps are displayed across the system.</span>
                  </p>
                </div>
              </section>

              {/* Quick Tips */}
              <section className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-3 mb-4">
                  <HelpCircle className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-xl font-bold text-gray-800">Quick Tips</h3>
                </div>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>All users created without a password will receive <code className="bg-white px-1 rounded">tempPassword123</code> and must change it on first login.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>Attendance records are automatically created when employees clock in/out.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>Low time flag: Less than 8 hours 15 minutes worked. Extra time flag: More than 8 hours 30 minutes worked.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>Paid leave allocation is cumulative - adding 5 to an employee with 10 remaining gives them 15 total.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>You can delete users (soft delete - sets isActive to false) but cannot delete your own account.</span>
                  </li>
                </ul>
              </section>
            </div>
          </Card>
        </div>
      )}

      {/* BOND STATUS TAB */}
      {activeTab === 'bonds' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm shadow-blue-100/50">
                <Scroll size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Active Bond Stages</p>
                <h3 className="text-2xl font-black text-slate-800">{allBondsData.filter(b => b.status !== 'Completed').length}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm shadow-emerald-100/50">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Completed Stages</p>
                <h3 className="text-2xl font-black text-slate-800">{allBondsData.filter(b => b.status === 'Completed').length}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 focus-within:ring-2 focus-within:ring-amber-100 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-sm shadow-amber-100/50">
                <Timer size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Finishing in 30 Days</p>
                <h3 className="text-2xl font-black text-slate-800">{allBondsData.filter(b => b.status === 'Expiring Soon').length}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm shadow-orange-100/50">
                <History size={28} />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Shifts This Month</p>
                <h3 className="text-2xl font-black text-slate-800">{allBondsData.filter(b => b.isShiftingThisMonth).length}</h3>
              </div>
            </div>
          </div>

          {/* Table Card */}
          <Card className="overflow-hidden border-slate-100 p-0 shadow-lg shadow-slate-100/50">
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                  <History className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">Bond Milestone Tracker</h3>
                  <p className="text-sm text-slate-500 font-medium">Monitoring individual contract stages and expirations</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative group">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search employee or dept..."
                    className="pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all font-bold text-slate-700 min-w-[280px]"
                    value={bondSearchTerm}
                    onChange={(e) => setBondSearchTerm(e.target.value)}
                  />
                </div>
                
                <select
                  className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-black focus:outline-none focus:ring-4 focus:ring-blue-50"
                  value={bondStatusFilter}
                  onChange={(e) => setBondStatusFilter(e.target.value as any)}
                >
                  <option value="All">All Statuses</option>
                  <option value="This Month's Shifts">This Month's Shifts</option>
                  <option value="Active">Active Only</option>
                  <option value="Expiring Soon">Finishing Soon</option>
                  <option value="Completed">Completed Only</option>
                </select>

                <Button 
                   variant="secondary" 
                   onClick={exportBondReport}
                   className="h-[42px] px-6 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  <Download size={14} className="mr-2" /> Export Report
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-100">
                    <th className="px-6 py-4 text-left">Employee & Dept</th>
                    <th className="px-6 py-4 text-center">Bond Type</th>
                    <th className="px-6 py-4 text-center">Period</th>
                    <th className="px-6 py-4 text-center">Timeline</th>
                    <th className="px-6 py-4 text-right pr-12">Status & Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allBondsData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                          <Scroll size={48} />
                          <p className="font-bold text-slate-400">No matching bond stages found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    allBondsData.map((bond, idx) => (
                      <tr key={`${bond.email}-${idx}`} className={`hover:bg-blue-50/30 transition-colors ${bond.status === 'Expiring Soon' ? 'bg-amber-50/20' : ''}`}>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-sm ${
                              ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500'][idx % 4]
                            }`}>
                              {bond.userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-slate-800">{bond.userName}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{bond.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            bond.type === 'Internship' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {bond.type}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="font-black text-slate-700 text-xs">{bond.totalRemainingDisplay}</p>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                              <span className="text-slate-400">FROM</span> 
                              <span>{convertToDDMMYYYY(bond.startDate)}</span>
                              <ArrowRight size={10} className="text-slate-300" />
                              <span className="text-slate-400">TO</span> 
                              <span>{convertToDDMMYYYY(bond.endDate)}</span>
                            </div>
                          </div>
                        </td>
                         <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex flex-col items-end gap-1.5">
                              {bond.status === 'Completed' ? (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase italic ring-1 ring-slate-200">
                                  <CheckCircle2 size={12} />
                                  <span>Completed</span>
                                </div>
                              ) : bond.isShiftingThisMonth ? (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 rounded-lg text-[10px] font-black uppercase ring-1 ring-orange-200">
                                  <ArrowRightLeft size={12} />
                                  <span>Shifting This Month</span>
                                </div>
                              ) : bond.status === 'Shifting Soon' ? (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase ring-1 ring-blue-200">
                                  <ArrowRightLeft size={12} />
                                  <span>Shifting Soon</span>
                                </div>
                              ) : bond.status === 'Expiring Soon' ? (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase ring-1 ring-amber-200 animate-pulse">
                                  <AlertCircle size={12} />
                                  <span>Expiring Soon</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase ring-1 ring-emerald-100">
                                  <Activity size={12} />
                                  <span>Active Stage</span>
                                </div>
                              )}
                              <p className={`text-[10px] font-black italic ${
                                bond.status === 'Expiring Soon' ? 'text-amber-600' : 
                                (bond.isShiftingThisMonth || bond.status === 'Shifting Soon') ? 'text-orange-600' : 'text-slate-400'
                              }`}>
                                {bond.remainingDisplay}
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-10 h-10 p-0 rounded-xl flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                              onClick={() => {
                                const user = users.find(u => u.id === bond.userId);
                                if (user) setBondModalUser(user);
                              }}
                              title="View Bond Details"
                            >
                              <BookOpen size={18} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Correction Modal */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <PenTool className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Correct Attendance</h3>
                  <p className="text-xs text-gray-500">Manual update for employee records</p>
                </div>
              </div>
              <button onClick={() => setIsCorrectionModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={async (e) => {
              await handleCorrection(e);
              setIsCorrectionModalOpen(false);
            }} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee</label>
                <select className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.userId} onChange={e => setCorrection({ ...correction, userId: e.target.value })} required>
                  <option value="">Select Employee</option>
                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                <input type="date" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.date} onChange={e => setCorrection({ ...correction, date: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check In</label>
                  <input type="time" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.checkIn} onChange={e => setCorrection({ ...correction, checkIn: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check Out</label>
                  <input type="time" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.checkOut} onChange={e => setCorrection({ ...correction, checkOut: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Break Deduction (mins)</label>
                <input type="number" placeholder="Override break time" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.breakDuration} onChange={e => setCorrection({ ...correction, breakDuration: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Admin Notes</label>
                <input type="text" placeholder="Reason for correction" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-200" value={correction.notes} onChange={e => setCorrection({ ...correction, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-lg border border-rose-100">
                <input
                  type="checkbox"
                  id="correctIsPenaltyDisabled"
                  className="rounded text-rose-600 focus:ring-rose-200"
                  checked={correction.isPenaltyDisabled}
                  onChange={e => setCorrection({ ...correction, isPenaltyDisabled: e.target.checked })}
                />
                <label htmlFor="correctIsPenaltyDisabled" className="text-sm font-bold text-rose-700">Disable Late Check-in Penalty</label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={() => setIsCorrectionModalOpen(false)} className="flex-1 bg-gray-100 text-gray-800 hover:bg-gray-200">Cancel</Button>
                <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700">Update Record</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Forward Overtime Modal */}
      {isForwardModalOpen && forwardingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Forward Balance</h3>
                  <p className="text-xs text-gray-500">{forwardingUser.name} - {forwardingMonthStr}</p>
                </div>
              </div>
              <button onClick={() => setIsForwardModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-bold text-blue-700 uppercase mb-1">System Suggested</p>
                <p className="text-lg font-mono font-bold text-blue-900">
                  {systemSuggestedSeconds >= 0 ? '+' : '-'}{formatDuration(Math.abs(systemSuggestedSeconds))}
                </p>
                <p className="text-[10px] text-blue-600 mt-1 italic">
                  {systemSuggestedSeconds >= 0 ? 'Extra time will be added to carryover' : 'Low time deficit will be deducted from carryover'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Hours</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200" 
                    value={manualForwardHours} 
                    onChange={e => setManualForwardHours(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Minutes</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="59"
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200" 
                    value={manualForwardMinutes} 
                    onChange={e => setManualForwardMinutes(e.target.value)} 
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  type="button" 
                  onClick={() => setIsForwardModalOpen(false)} 
                  className="flex-1 bg-gray-100 text-gray-800 hover:bg-gray-200"
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={confirmManualForward} 
                  disabled={isForwarding}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {isForwarding ? 'Processing...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}


      {/* Create User Modal - Replaced Sidebar Form */}
      {isCreateUserModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsCreateUserModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto animate-scale-in">
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Create New User</h3>
                    <p className="text-sm text-gray-500">Add a new employee, HR, or admin to the system</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateUserModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-5 overflow-y-auto custom-scrollbar">
                <form id="createUserForm" onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newUser.name || !newUser.username || !newUser.email || !newUser.department) {
                    alert('Please fill all required fields');
                    return;
                  }
                  try {
                    await userAPI.createUser({
                      name: newUser.name,
                      username: newUser.username,
                      email: newUser.email,
                      department: newUser.department,
                      role: newUser.role,
                      aadhaarNumber: newUser.aadhaarNumber,
                      guardianName: newUser.guardianName,
                      mobileNumber: newUser.mobileNumber,
                      guardianMobileNumber: newUser.guardianMobileNumber,
                      joiningDate: newUser.joiningDate ? convertToDDMMYYYY(newUser.joiningDate) : undefined,
                      bonds: newUser.bonds.filter(b => {
                        return b.periodMonths && parseInt(b.periodMonths) > 0;
                      }).map((b, bondIndex, filteredBonds) => {
                        const periodMonths = parseInt(b.periodMonths) || 0;
                        let bondStartDate: string;
                        if (bondIndex === 0) {
                          bondStartDate = newUser.joiningDate || '';
                        } else {
                          let previousEndDate: Date | null = null;
                          for (let i = 0; i < bondIndex; i++) {
                            const prevBond = filteredBonds[i];
                            const prevPeriodMonths = parseInt(prevBond.periodMonths) || 0;
                            const prevStart = i === 0
                              ? (parseDDMMYYYY(newUser.joiningDate) || new Date())
                              : (previousEndDate || new Date());
                            previousEndDate = new Date(prevStart);
                            previousEndDate.setMonth(previousEndDate.getMonth() + prevPeriodMonths);
                          }
                          if (previousEndDate) {
                            previousEndDate.setDate(previousEndDate.getDate() + 1);
                            bondStartDate = convertToDDMMYYYY(previousEndDate.toISOString().split('T')[0]);
                          } else {
                            bondStartDate = newUser.joiningDate || '';
                          }
                        }
                        return {
                          type: b.type || 'Job',
                          periodMonths: periodMonths,
                          startDate: bondStartDate,
                          salary: parseFloat(b.salary) || 0
                        };
                      }),
                      salaryBreakdown: salaryBreakdownRows.map(row => ({
                        month: row.month,
                        year: row.year,
                        amount: salaryBreakdownData[`${row.month}-${row.year}`] || 0,
                        bondType: row.bondType,
                        startDate: row.startDate,
                        endDate: row.endDate,
                        isPartialMonth: row.isPartialMonth
                      }))
                    });
                    alert('User created successfully! Temporary password: tempPassword123');
                    setNewUser({
                      name: '',
                      username: '',
                      email: '',
                      department: '',
                      role: 'Employee',
                      joiningDate: '',
                      bonds: [],
                      aadhaarNumber: '',
                      guardianName: '',
                      mobileNumber: '',
                      guardianMobileNumber: ''
                    });
                    setSalaryBreakdownRows([]);
                    setSalaryBreakdownData({});
                    setIsCreateUserModalOpen(false); // Close modal on success
                    await refreshData();
                  } catch (error: any) {
                    alert(error.message || 'Failed to create user');
                  }
                }} className="space-y-8">

                  {/* Section 1: Basic Information */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2 pb-2 border-b border-gray-100">
                      <Users size={16} className="text-indigo-500" /> Personal & Account Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Full Name *</label>
                        <input type="text" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. John Doe" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address *</label>
                        <input type="email" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="john@example.com" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Username *</label>
                        <input type="text" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder="johndoe" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department *</label>
                        <input type="text" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.department} onChange={e => setNewUser({ ...newUser, department: e.target.value })} placeholder="e.g. Engineering" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Role *</label>
                        <select className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                          <option value="Employee">Employee</option>
                          <option value="HR">HR</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Joining Date</label>
                        <input type="date" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.joiningDate ? convertToYYYYMMDD(newUser.joiningDate) : ''} onChange={e => setNewUser({ ...newUser, joiningDate: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mobile Number</label>
                        <input type="tel" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.mobileNumber} onChange={e => setNewUser({ ...newUser, mobileNumber: e.target.value })} placeholder="Optional" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Aadhaar Number</label>
                        <input type="text" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.aadhaarNumber} onChange={e => setNewUser({ ...newUser, aadhaarNumber: e.target.value })} placeholder="Optional" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Guardian Name</label>
                        <input type="text" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.guardianName} onChange={e => setNewUser({ ...newUser, guardianName: e.target.value })} placeholder="Optional" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Guardian Mobile Number</label>
                        <input type="tel" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all bg-gray-50 focus:bg-white" value={newUser.guardianMobileNumber} onChange={e => setNewUser({ ...newUser, guardianMobileNumber: e.target.value })} placeholder="Optional" />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Bond Configuration with improved UI */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                          <FileText size={16} className="text-indigo-500" /> Bond & Salary Structure
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">Define employment bonds and base salaries</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewUser({
                          ...newUser,
                          bonds: [...newUser.bonds, { type: 'Internship', periodMonths: '', startDate: '', salary: '' }]
                        })}
                        className="bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
                      >
                        <Plus size={14} /> Add Bond Period
                      </button>
                    </div>

                    {newUser.bonds.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                        <p className="text-gray-400 text-sm">No bonds configured yet.</p>
                        <button
                          type="button"
                          onClick={() => setNewUser({
                            ...newUser,
                            bonds: [...newUser.bonds, { type: 'Internship', periodMonths: '', startDate: '', salary: '' }]
                          })}
                          className="text-indigo-500 text-xs font-semibold mt-2 hover:underline"
                        >
                          Click to add first bond
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {newUser.bonds.map((bond, index) => (
                          <div key={index} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm relative group hover:border-indigo-200 transition-all">
                            <div className="absolute top-4 right-4">
                              <button
                                type="button"
                                onClick={() => setNewUser({
                                  ...newUser,
                                  bonds: newUser.bonds.filter((_, i) => i !== index)
                                })}
                                className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                                title="Remove Bond"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded">
                                Bond {index + 1}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs text-gray-500 uppercase font-semibold mb-1">Bond Type</label>
                                <select
                                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                  value={bond.type}
                                  onChange={e => {
                                    const updated = [...newUser.bonds];
                                    updated[index].type = e.target.value;
                                    setNewUser({ ...newUser, bonds: updated });
                                  }}
                                >
                                  <option value="Internship">Internship</option>
                                  <option value="Job">Job</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 uppercase font-semibold mb-1">Duration (Months)</label>
                                <input
                                  type="number"
                                  min="1"
                                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                                  value={bond.periodMonths}
                                  onChange={e => {
                                    const updated = [...newUser.bonds];
                                    updated[index].periodMonths = e.target.value;
                                    setNewUser({ ...newUser, bonds: updated });
                                  }}
                                  placeholder="e.g. 6"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 uppercase font-semibold mb-1">
                                  {bond.type === 'Internship' ? 'Monthly Stipend' : 'Monthly Salary'} (₹)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all font-semibold text-gray-700"
                                  value={bond.salary || ''}
                                  onChange={e => {
                                    const updated = [...newUser.bonds];
                                    updated[index].salary = e.target.value;
                                    setNewUser({ ...newUser, bonds: updated });
                                  }}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Salary Breakdown */}
                  {salaryBreakdownRows.length > 0 && (
                    <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                            <TrendingUp size={16} className="text-emerald-600" /> Projected Monthly Salary
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">Review and adjust salary for each month individually if needed</p>
                        </div>
                        <div className="bg-white px-3 py-1 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 shadow-sm">
                          {salaryBreakdownRows.length} Month Projection
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-h-[400px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0 z-10">
                            <tr>
                              <th className="px-5 py-3 text-left">Period</th>
                              <th className="px-5 py-3 text-center">Type</th>
                              <th className="px-5 py-3 text-left">Monthly Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {salaryBreakdownRows.map((row, index) => {
                              const key = `${row.month}-${row.year}`;
                              return (
                                <tr key={index} className={`hover:bg-gray-50 transition-colors ${row.isPartialMonth ? 'bg-orange-50/30' : ''}`}>
                                  <td className="px-5 py-3">
                                    <div className="font-bold text-gray-800">{row.displayLabel}</div>
                                    <div className="text-xs text-gray-400 font-mono mt-0.5">{row.startDate} → {row.endDate}</div>
                                    {row.isPartialMonth && (
                                      <span className="inline-block mt-1 text-[10px] uppercase font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">Partial Month</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${row.bondType === 'Internship' ? 'bg-indigo-100 text-indigo-700' :
                                      row.bondType === 'Job' ? 'bg-emerald-100 text-emerald-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                      {row.bondType}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3">
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₹</span>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 transition-all font-medium text-gray-800"
                                        value={salaryBreakdownData[key] || ''}
                                        onChange={e => {
                                          const value = parseFloat(e.target.value) || 0;
                                          setSalaryBreakdownData(prev => ({
                                            ...prev,
                                            [key]: value
                                          }));
                                        }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </form>
              </div>

              {/* Modal Footer - Fixed */}
              <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                <div className="text-xs text-gray-500">
                  <span className="font-bold text-gray-700">Note:</span> User will receive temporary password <code className="bg-gray-200 px-1 py-0.5 rounded font-mono text-gray-800">tempPassword123</code>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateUserModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="createUserForm"
                    className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200 transform hover:scale-[1.02] transition-all"
                  >
                    Create User
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )
      }

      {/* Bond Details Modal (Existing) */}
      {
        bondModalUser && (() => {
          const bondInfo = calculateBondRemaining(bondModalUser.bonds, bondModalUser.joiningDate);
          if (!bondInfo.currentBond && bondInfo.totalRemaining.display === '-') {
            return null;
          }

          // Calculate total duration in months
          const totalMonths = bondInfo.allBonds.map(b => b.periodMonths).reduce((sum, months) => sum + months, 0);
          const totalYears = Math.floor(totalMonths / 12);
          const remainingMonths = totalMonths % 12;
          const totalDurationDisplay = totalYears > 0
            ? `${totalYears} year${totalYears > 1 ? 's' : ''} ${remainingMonths > 0 ? `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`
            : `${totalMonths} month${totalMonths > 1 ? 's' : ''}`;

          return (
            <>
              <div
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => setBondModalUser(null)}
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Bond Details</h3>
                      <p className="text-sm text-gray-500 mt-1">{bondModalUser.name}</p>
                    </div>
                    <button
                      onClick={() => setBondModalUser(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* Joining Date */}
                    {bondModalUser.joiningDate && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Joining Date</p>
                        <p className="text-lg font-bold text-blue-900">{bondModalUser.joiningDate}</p>
                      </div>
                    )}

                    {/* Total Duration */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Total Bond Duration</p>
                      <p className="text-xl font-bold text-gray-900">{totalDurationDisplay}</p>
                    </div>

                    {/* All Bonds */}
                    {bondInfo.allBonds.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
                          All Bonds ({bondInfo.allBonds.length})
                        </p>
                        <div className="space-y-3">
                          {bondInfo.allBonds.map((bond, index) => (
                            <div key={index} className="bg-white border-2 border-gray-200 rounded-lg p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <p className="font-bold text-gray-900 text-lg">{bond.type}</p>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Period: {bond.periodMonths} month{bond.periodMonths > 1 ? 's' : ''}
                                  </p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${bond.remaining.isExpired
                                  ? 'bg-red-100 text-red-700'
                                  : bond.remaining.isActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                  }`}>
                                  {bond.remaining.isExpired ? 'Expired' : bond.remaining.isActive ? 'Active' : 'Future'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                                <div>
                                  <p className="text-xs text-gray-500">Start Date</p>
                                  <p className="font-semibold text-gray-800">{bond.startDate || bondModalUser.joiningDate || '-'}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">End Date</p>
                                  <p className="font-semibold text-gray-800">
                                    {bond.endDate ? convertToDDMMYYYY(bond.endDate.toISOString().split('T')[0]) : '-'}
                                  </p>
                                </div>
                              </div>
                              {bond.salary && bond.salary > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-500">{bond.type === 'Internship' ? 'Stipend' : 'Salary'}</p>
                                  <p className="font-semibold text-green-600">₹{bond.salary.toLocaleString('en-IN')}</p>
                                </div>
                              )}
                              {bond.remaining.isActive && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-500">Remaining</p>
                                  <p className="font-semibold text-blue-600">{bond.remaining.display}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* First Completion Date */}
                    {bondInfo.firstCompletionDate && (
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
                          {bondInfo.firstCompletionBondType} Bond Completion Date
                        </p>
                        <p className="text-xl font-bold text-purple-900">
                          {convertToDDMMYYYY(bondInfo.firstCompletionDate.toISOString().split('T')[0])}
                        </p>
                      </div>
                    )}

                    {/* Total Remaining Time */}
                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                        Total Bond Remaining
                      </p>
                      <p className="text-xl font-bold text-emerald-900">{bondInfo.totalRemaining.display}</p>
                    </div>

                    {/* Current Salary/Stipend */}
                    {bondInfo.currentSalary > 0 && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                          Current {bondInfo.currentBond?.type === 'Internship' ? 'Stipend' : 'Salary'}
                        </p>
                        <p className="text-xl font-bold text-green-900">₹{bondInfo.currentSalary.toLocaleString('en-IN')}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      variant="primary"
                      onClick={() => setBondModalUser(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </>
          );
        })()
      }

      {/* Edit User Modal */}
      {editingUser && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setEditingUser(null);
              setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [], aadhaarNumber: '', guardianName: '', mobileNumber: '', guardianMobileNumber: '' });
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">Edit User: {editingUser.name}</h3>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [], aadhaarNumber: '', guardianName: '', mobileNumber: '', guardianMobileNumber: '' });
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const updates: any = {
                    name: editUserForm.name,
                    email: editUserForm.email,
                    department: editUserForm.department,
                    aadhaarNumber: editUserForm.aadhaarNumber,
                    guardianName: editUserForm.guardianName,
                    mobileNumber: editUserForm.mobileNumber,
                    guardianMobileNumber: editUserForm.guardianMobileNumber,
                    paidLeaveAllocation: editUserForm.paidLeaveAllocation,
                    paidLeaveAction: 'set'
                  };

                  if (editUserForm.joiningDate) {
                    updates.joiningDate = convertToDDMMYYYY(editUserForm.joiningDate);
                  }

                  if (editUserForm.bonds.length > 0) {
                    updates.bonds = editUserForm.bonds.filter(b => {
                      return b.periodMonths && parseInt(b.periodMonths) > 0;
                    }).map((b, bondIndex, filteredBonds) => {
                      const periodMonths = parseInt(b.periodMonths) || 0;

                      // Calculate start date for each bond
                      let bondStartDate: string;
                      if (bondIndex === 0) {
                        // First bond starts from joining date
                        bondStartDate = editUserForm.joiningDate || '';
                      } else {
                        // Subsequent bonds start from previous bond's end date + 1 day
                        let previousEndDate: Date | null = null;
                        for (let i = 0; i < bondIndex; i++) {
                          const prevBond = filteredBonds[i];
                          const prevPeriodMonths = parseInt(prevBond.periodMonths) || 0;
                          const prevStart = i === 0
                            ? (parseDDMMYYYY(editUserForm.joiningDate) || new Date())
                            : (previousEndDate || new Date());
                          previousEndDate = new Date(prevStart);
                          previousEndDate.setMonth(previousEndDate.getMonth() + prevPeriodMonths);
                        }
                        if (previousEndDate) {
                          previousEndDate.setDate(previousEndDate.getDate() + 1); // Add 1 day
                          bondStartDate = convertToDDMMYYYY(previousEndDate.toISOString().split('T')[0]);
                        } else {
                          bondStartDate = editUserForm.joiningDate || '';
                        }
                      }

                      return {
                        type: b.type || 'Job',
                        periodMonths: periodMonths,
                        startDate: bondStartDate,
                        salary: parseFloat(b.salary) || 0
                      };
                    });
                  }

                  // Add salary breakdown if available
                  if (editSalaryBreakdownRows.length > 0) {
                    updates.salaryBreakdown = editSalaryBreakdownRows.map(row => ({
                      month: row.month,
                      year: row.year,
                      amount: editSalaryBreakdownData[`${row.month}-${row.year}`] || 0,
                      bondType: row.bondType,
                      startDate: row.startDate,
                      endDate: row.endDate,
                      isPartialMonth: row.isPartialMonth
                    }));
                  }

                  await userAPI.updateUser(editingUser.id, updates);
                  alert('User updated successfully!');
                  setEditingUser(null);
                  setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [], aadhaarNumber: '', guardianName: '', mobileNumber: '', guardianMobileNumber: '' });
                  await refreshData();
                } catch (error: any) {
                  alert(error.message || 'Failed to update user');
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Name</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.name}
                    onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.email}
                    onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Aadhaar Number</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.aadhaarNumber}
                    onChange={e => setEditUserForm({ ...editUserForm, aadhaarNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Guardian Name</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.guardianName}
                    onChange={e => setEditUserForm({ ...editUserForm, guardianName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mobile Number</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.mobileNumber}
                    onChange={e => setEditUserForm({ ...editUserForm, mobileNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Guardian Mobile Number</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.guardianMobileNumber}
                    onChange={e => setEditUserForm({ ...editUserForm, guardianMobileNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Paid Leave Allocation (Total)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.paidLeaveAllocation}
                    onChange={e => setEditUserForm({ ...editUserForm, paidLeaveAllocation: e.target.value })}
                    placeholder="Total days/year"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.department}
                    onChange={e => setEditUserForm({ ...editUserForm, department: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Joining Date</label>
                  <input
                    type="date"
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm"
                    value={editUserForm.joiningDate}
                    onChange={e => setEditUserForm({ ...editUserForm, joiningDate: e.target.value })}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-gray-600 uppercase">Bond Periods</label>
                    <button
                      type="button"
                      onClick={() => setEditUserForm({
                        ...editUserForm,
                        bonds: [...editUserForm.bonds, { type: 'Internship', periodMonths: '', startDate: '', salary: '' }]
                      })}
                      className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Plus size={14} /> Add Bond
                    </button>
                  </div>
                  {editUserForm.bonds.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No bonds added. Click "Add Bond" to add bond periods.</p>
                  ) : (
                    <div className="space-y-2">
                      {editUserForm.bonds.map((bond, index) => (
                        <div key={index} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">Bond {index + 1}</span>
                            <button
                              type="button"
                              onClick={() => setEditUserForm({
                                ...editUserForm,
                                bonds: editUserForm.bonds.filter((_, i) => i !== index)
                              })}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Type</label>
                              <select
                                className="w-full p-2 border border-gray-200 rounded text-xs"
                                value={bond.type}
                                onChange={e => {
                                  const updated = [...editUserForm.bonds];
                                  updated[index].type = e.target.value;
                                  setEditUserForm({ ...editUserForm, bonds: updated });
                                }}
                              >
                                <option value="Internship">Internship</option>
                                <option value="Job">Job</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Period (Months)</label>
                              <input
                                type="number"
                                min="1"
                                className="w-full p-2 border border-gray-200 rounded text-xs"
                                value={bond.periodMonths}
                                onChange={e => {
                                  const updated = [...editUserForm.bonds];
                                  updated[index].periodMonths = e.target.value;
                                  setEditUserForm({ ...editUserForm, bonds: updated });
                                }}
                                placeholder="e.g., 6"
                              />
                            </div>
                          </div>
                          {editUserForm.joiningDate && (() => {
                            // Calculate start date for this bond
                            let bondStartDate: Date;
                            if (index === 0) {
                              // First bond starts from joining date
                              bondStartDate = parseDDMMYYYY(editUserForm.joiningDate) || new Date(editUserForm.joiningDate);
                            } else {
                              // Subsequent bonds start from previous bond's end date + 1 day
                              let previousEndDate: Date | null = null;
                              for (let i = 0; i < index; i++) {
                                const prevBond = editUserForm.bonds[i];
                                if (prevBond.periodMonths && parseInt(prevBond.periodMonths) > 0) {
                                  const prevStart = i === 0
                                    ? (parseDDMMYYYY(editUserForm.joiningDate) || new Date(editUserForm.joiningDate))
                                    : previousEndDate || new Date(editUserForm.joiningDate);
                                  previousEndDate = new Date(prevStart);
                                  previousEndDate.setMonth(previousEndDate.getMonth() + parseInt(prevBond.periodMonths));
                                }
                              }
                              if (previousEndDate) {
                                bondStartDate = new Date(previousEndDate);
                                bondStartDate.setDate(bondStartDate.getDate() + 1); // Add 1 day
                              } else {
                                bondStartDate = parseDDMMYYYY(editUserForm.joiningDate) || new Date(editUserForm.joiningDate);
                              }
                            }

                            return (
                              <div>
                                <p className="text-xs text-gray-500 mb-1">
                                  Start Date: {convertToDDMMYYYY(bondStartDate.toISOString().split('T')[0])}
                                  {index === 0 && ' (Joining Date)'}
                                  {index > 0 && ' (Previous bond end + 1 day)'}
                                </p>
                                {bond.periodMonths && parseInt(bond.periodMonths) > 0 && (() => {
                                  const periodMonths = parseInt(bond.periodMonths);
                                  const endDate = new Date(bondStartDate);
                                  endDate.setMonth(endDate.getMonth() + periodMonths);

                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  endDate.setHours(0, 0, 0, 0);

                                  if (endDate >= today) {
                                    const diffTime = endDate.getTime() - today.getTime();
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    const months = Math.floor(diffDays / 30);
                                    const days = diffDays % 30;

                                    let display = '';
                                    if (months > 0 && days > 0) {
                                      display = `${months} month${months > 1 ? 's' : ''} ${days} day${days > 1 ? 's' : ''}`;
                                    } else if (months > 0) {
                                      display = `${months} month${months > 1 ? 's' : ''}`;
                                    } else {
                                      display = `${days} day${days > 1 ? 's' : ''}`;
                                    }

                                    return (
                                      <div className="mt-2">
                                        <p className="text-xs text-gray-500 mb-1">End Date: {convertToDDMMYYYY(endDate.toISOString().split('T')[0])}</p>
                                        <p className="text-xs text-blue-600 font-semibold">
                                          Remaining: {display}
                                        </p>
                                      </div>
                                    );
                                  } else {
                                    const diffTime = today.getTime() - endDate.getTime();
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    return (
                                      <div className="mt-2">
                                        <p className="text-xs text-gray-500 mb-1">End Date: {convertToDDMMYYYY(endDate.toISOString().split('T')[0])}</p>
                                        <p className="text-xs text-red-600 font-semibold">
                                          Expired {diffDays} day{diffDays > 1 ? 's' : ''} ago
                                        </p>
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            );
                          })()}
                          {!editUserForm.joiningDate && (
                            <p className="text-xs text-gray-500 mb-1">Start Date: Set joining date first</p>
                          )}
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              {bond.type === 'Internship' ? 'Stipend' : bond.type === 'Job' ? 'Salary' : 'Amount'} (₹)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full p-2 border border-gray-200 rounded text-xs"
                              value={bond.salary || ''}
                              onChange={e => {
                                const updated = [...editUserForm.bonds];
                                updated[index].salary = e.target.value;
                                setEditUserForm({ ...editUserForm, bonds: updated });
                              }}
                              placeholder={bond.type === 'Internship' ? 'e.g., 10000' : 'e.g., 25000'}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">Add multiple bonds (e.g., 6 months internship + 1 year job)</p>
                </div>

                {/* Salary Breakdown Section for Edit Form */}
                {editSalaryBreakdownRows.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase">Monthly Salary Breakdown</label>
                        <p className="text-xs text-gray-500 mt-1">
                          {editSalaryBreakdownRows.length} month{editSalaryBreakdownRows.length > 1 ? 's' : ''} •
                          {editSalaryBreakdownRows.filter(r => r.isPartialMonth).length > 0 && (
                            <span className="text-orange-600 font-semibold ml-1">
                              Includes partial month (not counted in bond)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">Period</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">Type</th>
                            <th className="px-3 py-2 text-left font-bold text-gray-600">Salary (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {editSalaryBreakdownRows.map((row, index) => {
                            const key = `${row.month}-${row.year}`;
                            return (
                              <tr key={index} className={`${row.isPartialMonth ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2 text-gray-700 font-semibold">{index + 1}</td>
                                <td className="px-3 py-2">
                                  <div className="text-gray-800 font-medium">{row.displayLabel}</div>
                                  <div className="text-gray-500 text-xs">{row.startDate} to {row.endDate}</div>
                                  {row.isPartialMonth && (
                                    <div className="text-orange-600 text-xs font-semibold mt-1">
                                      Partial month (not in bond count)
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${row.bondType === 'Internship' ? 'bg-blue-100 text-blue-700' :
                                    row.bondType === 'Job' ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                    {row.bondType}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full p-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                                    value={editSalaryBreakdownData[key] || ''}
                                    onChange={e => {
                                      const value = parseFloat(e.target.value) || 0;
                                      setEditSalaryBreakdownData(prev => ({
                                        ...prev,
                                        [key]: value
                                      }));
                                    }}
                                    placeholder={row.bondType === 'Internship' ? 'Stipend' : 'Salary'}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tip: You can edit individual month salaries. Changes will be saved when you update the user.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 justify-end mt-6">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingUser(null);
                      setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [] });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    Update User
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )
      }

      {/* Deduct Salary Modal */}
      {
        deductSalaryUser && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setDeductSalaryUser(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Deduct Salary</h3>
                    <p className="text-sm text-gray-500">for {deductSalaryUser.name}</p>
                  </div>
                  <button onClick={() => setDeductSalaryUser(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Month</label>
                      <select
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                        value={deductSalaryMonth}
                        onChange={e => setDeductSalaryMonth(parseInt(e.target.value))}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Year</label>
                      <select
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                        value={deductSalaryYear}
                        onChange={e => setDeductSalaryYear(parseInt(e.target.value))}
                      >
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const stats = getStatsForDeduction(deductSalaryUser.id, deductSalaryMonth, deductSalaryYear);
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                          <p className="text-xs text-orange-600 font-semibold uppercase">Low Time</p>
                          <p className="text-lg font-bold text-orange-800">{stats.lowTimeDisplay}</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                          <p className="text-xs text-red-600 font-semibold uppercase">Unpaid Leaves</p>
                          <p className="text-lg font-bold text-red-800">{stats.unpaidLeaveDays} days</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Deduction Amount (₹)</label>
                    <div className="mb-2 text-sm text-gray-600">
                      Current Salary: <span className="font-bold text-gray-900">
                        ₹{(() => {
                          const breakdown = deductSalaryUser.salaryBreakdown || [];
                          const entry = breakdown.find(b => b.month === deductSalaryMonth && b.year === deductSalaryYear);
                          return (entry?.amount || 0).toLocaleString('en-IN');
                        })()}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400"
                      value={deductionAmount}
                      onChange={e => setDeductionAmount(e.target.value)}
                      placeholder="Enter amount to deduct"
                    />
                    <p className="text-xs text-gray-400 mt-1">This amount will be subtracted from the salary breakdown for {new Date(2000, deductSalaryMonth - 1, 1).toLocaleString('default', { month: 'long' })} {deductSalaryYear}.</p>
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setDeductSalaryUser(null)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!deductionAmount || parseFloat(deductionAmount) <= 0) {
                          alert('Please enter a valid deduction amount');
                          return;
                        }

                        try {
                          const currentBreakdown = deductSalaryUser.salaryBreakdown || [];
                          const existingIndex = currentBreakdown.findIndex(
                            b => b.month === deductSalaryMonth && b.year === deductSalaryYear
                          );

                          let updatedBreakdown = [...currentBreakdown];
                          if (existingIndex >= 0) {
                            const existingSalary = updatedBreakdown[existingIndex].amount;
                            const newSalary = Math.max(0, existingSalary - parseFloat(deductionAmount));
                            updatedBreakdown[existingIndex] = {
                              ...updatedBreakdown[existingIndex],
                              amount: newSalary
                            };

                            await userAPI.updateUser(deductSalaryUser.id, {
                              salaryBreakdown: updatedBreakdown
                            });

                            alert(`Successfully deducted ₹${deductionAmount}. New salary: ₹${newSalary}`);
                            setDeductSalaryUser(null);
                            await refreshData();
                          } else {
                            alert(`No salary record found for ${new Date(2000, deductSalaryMonth - 1, 1).toLocaleString('default', { month: 'long' })} ${deductSalaryYear}. Please ensure salary breakdown exists before deducting.`);
                          }
                        } catch (error: any) {
                          alert(error.message || 'Failed to deduct salary');
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 shadow-md"
                    >
                      Confirm Deduction
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      }

      {/* Reset Password Modal */}
      {resetPasswordModalOpen && selectedUserForReset && (
        <>
          <div className="fixed inset-0 bg-black/50 bg-opacity-50 backdrop-blur-sm z-40 transition-opacity" onClick={() => setResetPasswordModalOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
                  <p className="text-sm text-gray-500 mt-1">Set a new password for {selectedUserForReset.name}</p>
                </div>
                <button
                  onClick={() => setResetPasswordModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <form onSubmit={handleResetPasswordSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                      value={newEmployeePassword}
                      onChange={(e) => setNewEmployeePassword(e.target.value)}
                      placeholder="Enter new password (min 4 chars)"
                      autoFocus
                      required
                      minLength={4}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setResetPasswordModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newEmployeePassword || newEmployeePassword.length < 4}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200 hover:shadow-purple-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reset Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )
      }

    </div >
  );
};
