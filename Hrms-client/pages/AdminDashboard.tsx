import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role, LeaveCategory, LeaveStatus, User } from '../types';
import { Download, FileText, Activity, Users, Calendar, Plus, PenTool, Globe, Clock, LogIn, LogOut, Coffee, TrendingUp, TrendingDown, CheckCircle, Timer, Bell, X, UserPlus, Trash2, AlertCircle, Mail, BookOpen, HelpCircle, ArrowRight } from 'lucide-react';
import { formatDate, getTodayStr, formatDuration, convertToDDMMYYYY, convertToYYYYMMDD, calculateBondRemaining, parseDDMMYYYY } from '../services/utils';
import { attendanceAPI, notificationAPI, userAPI, authAPI, holidayAPI } from '../services/api';

// Format hours to hours and minutes format (e.g., 8.25 hours = 8h 15m)
const formatHoursToHoursMinutes = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const AdminDashboard: React.FC = () => {
  const { auth, users, auditLogs, exportReports, companyHolidays, addCompanyHoliday, attendanceRecords, systemSettings, updateSystemSettings, refreshData, notifications, leaveRequests, updateUser } = useApp();
  const [activeTab, setActiveTab] = useState<'summary' | 'users' | 'audit' | 'reports' | 'settings' | 'guidance'>('summary');
  
  // User management states
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', department: '', role: 'Employee', joiningDate: '', bonds: [] as Array<{ type: string; periodMonths: string; startDate: string; salary: string }> });
  const [paidLeaveAllocation, setPaidLeaveAllocation] = useState({ userId: '', allocation: '' });
  const [forgetPassword, setForgetPassword] = useState({ email: '', username: '', otp: '', newPassword: '' });
  const [forgetPasswordOtpSent, setForgetPasswordOtpSent] = useState(false);
  const [forgetPasswordOtpEmail, setForgetPasswordOtpEmail] = useState('');
  
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });
  const [correction, setCorrection] = useState({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
  const [reportFilters, setReportFilters] = useState({ start: '', end: '', department: '' });
  
  // Summary states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const timezones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

  // Get monthly attendance for selected user
  const getMonthlyAttendance = () => {
    if (!selectedUserId || !selectedMonth) return [];
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    return attendanceRecords
      .filter(record => {
        if (record.userId !== selectedUserId) return false;
        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const monthlyAttendance = getMonthlyAttendance();
  const selectedUser = users.find(u => u.id === selectedUserId);

  // Get leaves for selected user in selected month
  const getMonthlyLeaves = () => {
    if (!selectedUserId || !selectedMonth) return [];
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    return leaveRequests
      .filter(leave => {
        if (leave.userId !== selectedUserId) return false;
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        // Check if leave overlaps with selected month
        return (leaveStart >= startDate && leaveStart <= endDate) ||
               (leaveEnd >= startDate && leaveEnd <= endDate) ||
               (leaveStart <= startDate && leaveEnd >= endDate);
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  };

  const monthlyLeaves = getMonthlyLeaves();
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Approved' | 'Rejected' | 'Pending'>('All');
  const [leaveFilterDate, setLeaveFilterDate] = useState('');
  const [leaveFilterMonth, setLeaveFilterMonth] = useState('');

  // Calculate working days (excluding Sundays and holidays) between two dates
  const calculateLeaveDays = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    // Ensure start <= end
    if (start > end) return 0;

    // Create a Set of holiday dates for quick lookup (format: YYYY-MM-DD)
    const holidayDates = new Set(
      companyHolidays.map(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate.toISOString().split('T')[0];
      })
    );

    let days = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sunday
      const dateStr = current.toISOString().split('T')[0];
      
      // Exclude Sundays and holidays
      if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) {
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

  // Calculate paid leave usage for all users
  const paidLeaveData = users
    .filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR)
    .map(user => {
      const userLeaves = leaveRequests.filter(l => l.userId === user.id);
      const usedPaidLeaves = userLeaves
        .filter(leave => {
          const status = (leave.status || '').trim();
          return (status === 'Approved' || status === LeaveStatus.APPROVED) && 
                 leave.category === LeaveCategory.PAID;
        })
        .reduce((sum, leave) => {
          return sum + calculateLeaveDays(leave.startDate, leave.endDate);
        }, 0);
      
      const totalAllocated = getTotalPaidLeaves(user);
      const remaining = totalAllocated - usedPaidLeaves;
      
      return {
        user,
        allocated: totalAllocated,
        used: usedPaidLeaves,
        remaining: Math.max(0, remaining)
      };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const filteredMonthlyLeaves = monthlyLeaves.filter(leave => {
    // Status filter
    if (leaveStatusFilter !== 'All') {
      const status = (leave.status || '').trim();
      if (status !== leaveStatusFilter) return false;
    }

    // Date filter - check if leave overlaps with the selected date
    if (leaveFilterDate) {
      const filterDate = new Date(leaveFilterDate);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      // Check if filter date falls within leave range
      if (filterDate < leaveStart || filterDate > leaveEnd) {
        return false;
      }
    }

    // Month filter - check if leave overlaps with the selected month
    if (leaveFilterMonth) {
      const [year, month] = leaveFilterMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      // Check if leave overlaps with selected month
      if (leaveEnd < monthStart || leaveStart > monthEnd) {
        return false;
      }
    }

    return true;
  });

  const totalLeaveDays = filteredMonthlyLeaves.reduce((sum, leave) => {
    return sum + calculateLeaveDays(leave.startDate, leave.endDate);
  }, 0);

  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [bondModalUser, setBondModalUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', department: '', joiningDate: '', bonds: [] as Array<{ type: string; periodMonths: string; startDate: string; salary: string }> });

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
  const calculateEmployeeBalance = (userId: string, monthRecords: any[], monthLeaves: any[]) => {
    // Calculate extra time leave hours taken
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
            
            // Calculate number of days (excluding Sundays and holidays)
            const numberOfDays = calculateLeaveDays(leave.startDate, leave.endDate);
            
            // Total hours = hours per day * number of days
            const totalHours = hoursPerDay * numberOfDays;
            
            if (totalHours > 0) {
              return sum + totalHours;
            }
          }
          // Fallback to old calculation if time not available
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return sum + (days * 8.25);
        } else if (leave.category === LeaveCategory.HALF_DAY) {
          return sum + 4;
        }
        return sum;
      }, 0);

    // Calculate low time and extra time from attendance
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    const MIN_NORMAL_SECONDS = 8 * 3600 + 15 * 60;
    const MAX_NORMAL_SECONDS = 8 * 3600 + 30 * 60;

    monthRecords.forEach(r => {
      if (r.checkIn && r.checkOut) {
        const checkIn = new Date(r.checkIn).getTime();
        const checkOut = new Date(r.checkOut).getTime();
        const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
        const breakSeconds = getBreakSeconds(r.breaks) || 0;
        const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
        
        if (netWorkedSeconds < MIN_NORMAL_SECONDS) {
          totalLowTimeSeconds += (MIN_NORMAL_SECONDS - netWorkedSeconds);
        } else if (netWorkedSeconds > MAX_NORMAL_SECONDS) {
          totalExtraTimeSeconds += (netWorkedSeconds - MAX_NORMAL_SECONDS);
        }
      }
    });

    // Calculate final time difference
    const finalTimeDifference = totalExtraTimeSeconds - totalLowTimeSeconds;
    const extraTimeWorkedHours = finalTimeDifference / 3600;

    // Remaining extra time leave balance
    const remainingExtraTimeLeaveHours = Math.max(0, extraTimeLeaveHours - Math.max(0, extraTimeWorkedHours));

    // Calculate carryover from previous month
    // At month end, if balance is not covered, it carries over to next month
    const now = new Date();
    const isMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Extra Time Leave Balance: If remaining > 0 at month end, it carries over
    const carryoverExtraTimeLeave = isMonthEnd && remainingExtraTimeLeaveHours > 0 ? remainingExtraTimeLeaveHours : 0;
    
    // Low Time: If there's low time that's not compensated by extra time, it carries over
    // Only carry over if final difference is negative (more low time than extra time)
    const carryoverLowTime = isMonthEnd && finalTimeDifference < 0 ? Math.abs(finalTimeDifference) : 0;

    return {
      extraTimeLeaveHours,
      totalLowTimeSeconds,
      totalExtraTimeSeconds,
      remainingExtraTimeLeaveHours,
      carryoverExtraTimeLeave,
      carryoverLowTime,
      finalTimeDifference
    };
  };

  // Calculate monthly stats
  const calculateMonthlyStats = () => {
    let totalWorkedSeconds = 0;
    let totalBreakSeconds = 0;
    let daysPresent = 0;
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    
    // Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
    const MIN_NORMAL_SECONDS = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
    const MAX_NORMAL_SECONDS = 8 * 3600 + 30 * 60; // 8h 30m = 30600 seconds

    monthlyAttendance.forEach(record => {
      if (record.checkIn && record.checkOut) {
        daysPresent++;
        const checkIn = new Date(record.checkIn).getTime();
        const checkOut = new Date(record.checkOut).getTime();
        const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
        
        // Get break time from breaks array or totalBreakDuration
        const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
        const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
        
        totalWorkedSeconds += netWorkedSeconds;
        totalBreakSeconds += breakSeconds;
        
        // Normal: 8:15 to 8:30, Low < 8:15, Extra > 8:30
        if (netWorkedSeconds < MIN_NORMAL_SECONDS) {
          totalLowTimeSeconds += MIN_NORMAL_SECONDS - netWorkedSeconds;
        } else if (netWorkedSeconds > MAX_NORMAL_SECONDS) {
          totalExtraTimeSeconds += netWorkedSeconds - MAX_NORMAL_SECONDS;
        }
        // If netWorkedSeconds is between 8:15 and 8:30, it's normal (no low/extra)
      }
    });

    // Calculate Extra Time Leave hours for selected month
    const approvedLeaves = filteredMonthlyLeaves.filter(l => {
      const status = (l.status || '').trim();
      return status === 'Approved' || status === LeaveStatus.APPROVED;
    });
    
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
            
            // Calculate number of days (excluding Sundays and holidays)
            const numberOfDays = calculateLeaveDays(leave.startDate, leave.endDate);
            
            // Total hours = hours per day * number of days
            const totalHours = hoursPerDay * numberOfDays;
            
            if (totalHours > 0) {
              return sum + totalHours;
            }
          }
          // Fallback to old calculation if time not available
          return sum + (calculateLeaveDays(leave.startDate, leave.endDate) * 8.25);
        } else if (leave.category === LeaveCategory.HALF_DAY) {
          return sum + 4;
        }
        return sum;
      }, 0);

    // Convert extra time leave hours to seconds
    const extraTimeLeaveSeconds = extraTimeLeaveHours * 3600;

    // Net Time Balance = Extra Time - (Extra Time Leave + Low Time)
    const finalDifference = totalExtraTimeSeconds - (extraTimeLeaveSeconds + totalLowTimeSeconds);

    return {
      totalWorkedSeconds,
      totalBreakSeconds,
      daysPresent,
      totalLowTimeSeconds,
      totalExtraTimeSeconds,
      extraTimeLeaveSeconds,
      finalDifference
    };
  };

  const stats = calculateMonthlyStats();
  
  // Calculate balance for selected user
  const selectedUserBalance = selectedUserId && selectedUser 
    ? calculateEmployeeBalance(selectedUserId, monthlyAttendance, filteredMonthlyLeaves)
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
      if(!correction.userId || !correction.date) return;
      
      if(!correction.checkIn && !correction.checkOut) {
        alert("Please provide at least Check In or Check Out time");
        return;
      }

      try {
        await attendanceAPI.adminCreateOrUpdate({
          userId: correction.userId,
          date: correction.date,
          checkIn: correction.checkIn || undefined,
          checkOut: correction.checkOut || undefined,
          breakDurationMinutes: correction.breakDuration ? parseInt(correction.breakDuration) : undefined,
          notes: correction.notes || undefined
        });
        alert("Attendance saved successfully.");
        setCorrection({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
        // Refresh data to show updated records
        await refreshData();
      } catch (error: any) {
        alert(error.message || "Failed to save attendance");
      }
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getMonthName = () => {
    if (!selectedMonth) return '';
    return new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
                          } catch (e) {}
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

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 overflow-x-auto">
          <button onClick={() => setActiveTab('summary')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'summary' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Clock size={16} className="mr-2"/> Monthly Summary
          </button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'users' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Users size={16} className="mr-2"/> User Management
          </button>
          <button onClick={() => setActiveTab('audit')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'audit' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Activity size={16} className="mr-2"/> Audit Logs
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'reports' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <FileText size={16} className="mr-2"/> System Management
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'settings' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Globe size={16} className="mr-2"/> Settings
          </button>
          <button onClick={() => setActiveTab('guidance')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'guidance' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <BookOpen size={16} className="mr-2"/> Guidance
          </button>
      </div>

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
                onClick={() => setSelectedUserId('')}
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-medium transition-colors mb-2"
              >
                <span className="text-lg">←</span> Back to All Employees
              </button>

              {/* User Profile Card */}
              <div className={`rounded-xl shadow-sm border p-5 flex flex-col md:flex-row items-center gap-5 ${
                selectedUser.role === Role.HR ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'
              }`}>
                <div className="relative">
                  <div className={`h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-bold ${
                    selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-700' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-xl font-bold text-gray-800">{selectedUser.name}</h2>
                  <p className="text-gray-500 text-sm">{selectedUser.email}</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-800' : 'bg-emerald-50 text-emerald-600'
                    }`}>{selectedUser.role}</span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">{selectedUser.department}</span>
                  </div>
                </div>
                <div className="text-center md:text-right bg-gray-50 rounded-xl px-5 py-3">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Viewing</p>
                  <p className="text-lg font-bold text-gray-700">{getMonthName()}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Days Present */}
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-blue-600 uppercase">Days</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{stats.daysPresent}</p>
                  <p className="text-gray-500 text-sm mt-1">Days Present</p>
                </div>

                {/* Total Worked */}
                <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Timer className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 uppercase">Hours</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalWorkedSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Total Worked</p>
                </div>

                {/* Low Time */}
                <div className="bg-rose-50 rounded-xl border border-rose-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-rose-600" />
                    </div>
                    <span className="text-xs font-semibold text-rose-600 uppercase">Deficit</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalLowTimeSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Low Time</p>
                </div>

                {/* Extra Time */}
                <div className="bg-violet-50 rounded-xl border border-violet-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-violet-600" />
                    </div>
                    <span className="text-xs font-semibold text-violet-600 uppercase">Bonus</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalExtraTimeSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Extra Time</p>
                </div>
              </div>

              {/* Net Time Balance Card */}
              <div className={`rounded-xl p-6 border ${
                stats.finalDifference >= 0 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${
                      stats.finalDifference >= 0 ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {stats.finalDifference >= 0 ? (
                        <TrendingUp className={`h-7 w-7 text-green-600`} />
                      ) : (
                        <TrendingDown className="h-7 w-7 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${stats.finalDifference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        Net Time Balance
                      </p>
                      <p className="text-gray-500 text-xs">Extra Time - (Extra Time Leave + Low Time)</p>
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <p className={`text-4xl font-bold ${stats.finalDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stats.finalDifference >= 0 ? '+' : '-'}{formatDuration(Math.abs(stats.finalDifference))}
                    </p>
                    <p className={`text-sm mt-1 ${stats.finalDifference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {stats.finalDifference >= 0 ? '✅ Good Performance' : '⚠️ Needs Improvement'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Balance & Carryover Card */}
              {selectedUserBalance && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl p-6 border bg-orange-50 border-orange-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Timer className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-orange-700">Extra Time Leave Balance</p>
                        <p className="text-xs text-orange-600">Remaining to be worked</p>
                      </div>
                    </div>
                    <p className={`text-3xl font-bold ${
                      selectedUserBalance.remainingExtraTimeLeaveHours > 0 ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {selectedUserBalance.remainingExtraTimeLeaveHours > 0 
                        ? formatHoursToHoursMinutes(selectedUserBalance.remainingExtraTimeLeaveHours)
                        : '0h'}
                    </p>
                    {(() => {
                      const now = new Date();
                      const isMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                      if (isMonthEnd && selectedUserBalance.carryoverExtraTimeLeave > 0) {
                        return (
                          <p className="text-xs text-orange-600 mt-2 font-semibold">
                            → {formatHoursToHoursMinutes(selectedUserBalance.carryoverExtraTimeLeave)} will carry over to next month
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="rounded-xl p-6 border bg-red-50 border-red-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <TrendingDown className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">Low Time</p>
                        <p className="text-xs text-red-600">Total deficit (auto-carries over if not covered)</p>
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-red-600">
                      {formatDuration(selectedUserBalance.totalLowTimeSeconds)}
                    </p>
                  </div>
                </div>
              )}

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
                                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                                    leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                    leave.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {leave.status}
                                  </span>
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
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-lg font-bold text-gray-800">Daily Attendance Log</h3>
                  <p className="text-gray-500 text-sm">{getMonthName()} • {monthlyAttendance.length} records</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogIn size={14} className="text-emerald-500"/> Check In</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogOut size={14} className="text-rose-500"/> Check Out</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><Coffee size={14} className="text-amber-500"/> Break</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Worked</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthlyAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-gray-400">
                            No attendance records found for this month
                          </td>
                        </tr>
                      ) : (
                        monthlyAttendance.map((record, idx) => {
                          // Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
                          const MIN_NORMAL_SECONDS_LOCAL = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
                          const MAX_NORMAL_SECONDS_LOCAL = 8 * 3600 + 30 * 60; // 8h 30m = 30600 seconds
                          
                          // Get break seconds from breaks array or totalBreakDuration
                          const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
                          
                          let netWorkedSeconds = 0;
                          if (record.checkIn && record.checkOut) {
                            const checkIn = new Date(record.checkIn).getTime();
                            const checkOut = new Date(record.checkOut).getTime();
                            const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
                            netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
                          }
                          
                          // Normal: 8:15 to 8:30, Low < 8:15, Extra > 8:30
                          const isLowTime = netWorkedSeconds > 0 && netWorkedSeconds < MIN_NORMAL_SECONDS_LOCAL;
                          const isExtraTime = netWorkedSeconds > MAX_NORMAL_SECONDS_LOCAL;

                          return (
                            <tr key={record.id} className={`hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                              <td className="px-6 py-4">
                                <div className="font-semibold text-gray-800">{formatDate(record.date)}</div>
                                <div className="text-xs text-gray-400">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-emerald-600 font-semibold">
                                  {formatTime(record.checkIn)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-rose-600 font-semibold">
                                  {formatTime(record.checkOut)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1">
                                  <span className="text-amber-600 font-medium">
                                    {breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
                                  </span>
                                  {record.breaks && record.breaks.length > 0 && (
                                    <div className="text-xs text-gray-500 space-y-0.5">
                                      {record.breaks
                                        .filter((b: any) => b.type === 'Extra' && b.reason)
                                        .map((b: any, idx: number) => (
                                          <div key={idx} className="text-purple-600">
                                            <span className="font-semibold">Extra:</span> {b.reason}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-bold text-gray-800">
                                  {netWorkedSeconds > 0 ? formatDuration(netWorkedSeconds) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {!record.checkIn ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">Absent</span>
                                ) : !record.checkOut ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700">In Progress</span>
                                ) : isLowTime ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">Low Time</span>
                                ) : isExtraTime ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">Extra Time</span>
                                ) : (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">On Time</span>
                                )}
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
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-800">All Employees Overview</h3>
                <p className="text-gray-500 text-sm">Select an employee above to view detailed monthly summary</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Department</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase">Total Days</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(emp => {
                      const empAttendance = attendanceRecords.filter(r => r.userId === emp.id);
                      const isHR = emp.role === Role.HR;
                      return (
                        <tr key={emp.id} className={isHR ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold ${
                                isHR ? 'bg-yellow-200 text-yellow-700' : 'bg-indigo-100 text-indigo-600'
                              }`}>
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-800">{emp.name}</p>
                                  {isHR && <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-bold rounded">HR</span>}
                                </div>
                                <p className="text-xs text-gray-400">@{emp.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{emp.department}</td>
                          <td className="px-6 py-4 text-gray-500 text-sm">{emp.email}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold ${isHR ? 'text-yellow-700' : 'text-indigo-600'}`}>{empAttendance.length}</span>
                            <span className="text-gray-400 text-sm ml-1">days</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setSelectedUserId(emp.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                isHR ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                          No employees found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USER MANAGEMENT TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Top Row: Create User Form and All Users Table */}
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
            {/* Create User Form */}
            <Card className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Create User</h3>
                <p className="text-xs text-gray-500">Add Admin, HR, or Employee</p>
              </div>
            </div>
            <form onSubmit={async (e) => {
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
                  joiningDate: newUser.joiningDate ? convertToDDMMYYYY(newUser.joiningDate) : undefined,
                bonds: newUser.bonds.filter(b => {
                  // Include bond if periodMonths is provided
                  return b.periodMonths && parseInt(b.periodMonths) > 0;
                }).map((b, bondIndex, filteredBonds) => {
                  const periodMonths = parseInt(b.periodMonths) || 0;
                  
                  // Calculate start date for each bond
                  let bondStartDate: string;
                  if (bondIndex === 0) {
                    // First bond starts from joining date
                    bondStartDate = newUser.joiningDate || '';
                  } else {
                    // Subsequent bonds start from previous bond's end date + 1 day
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
                      previousEndDate.setDate(previousEndDate.getDate() + 1); // Add 1 day
                      bondStartDate = convertToDDMMYYYY(previousEndDate.toISOString().split('T')[0]);
                    } else {
                      bondStartDate = newUser.joiningDate || '';
                    }
                  }
                  
                  return {
                    type: b.type || 'Job',
                    periodMonths: periodMonths,
                    startDate: bondStartDate,
                    salary: b.salary ? parseFloat(b.salary) : 0
                  };
                })
                });
                alert('User created successfully! Temporary password: tempPassword123');
                setNewUser({ name: '', username: '', email: '', department: '', role: 'Employee', joiningDate: '', bonds: [] });
                await refreshData();
              } catch (error: any) {
                alert(error.message || 'Failed to create user');
              }
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Name *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="Full Name" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Username *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="username" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Email *</label>
                <input type="email" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="email@example.com" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Department *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} placeholder="Engineering" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Role *</label>
                <select className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="Employee">Employee</option>
                  <option value="HR">HR</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Joining Date</label>
                <input type="date" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.joiningDate ? convertToYYYYMMDD(newUser.joiningDate) : ''} onChange={e => setNewUser({...newUser, joiningDate: e.target.value})} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-600 uppercase">Bond Periods</label>
                  <button
                    type="button"
                    onClick={() => setNewUser({
                      ...newUser,
                      bonds: [...newUser.bonds, { type: 'Internship', periodMonths: '', startDate: '', salary: '' }]
                    })}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Bond
                  </button>
                </div>
                {newUser.bonds.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No bonds added. Click "Add Bond" to add bond periods.</p>
                ) : (
                  <div className="space-y-2">
                    {newUser.bonds.map((bond, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-700">Bond {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => setNewUser({
                              ...newUser,
                              bonds: newUser.bonds.filter((_, i) => i !== index)
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
                            <label className="block text-xs text-gray-600 mb-1">Period (Months)</label>
                            <input
                              type="number"
                              min="1"
                              className="w-full p-2 border border-gray-200 rounded text-xs"
                              value={bond.periodMonths}
                              onChange={e => {
                                const updated = [...newUser.bonds];
                                updated[index].periodMonths = e.target.value;
                                setNewUser({ ...newUser, bonds: updated });
                              }}
                              placeholder="e.g., 6"
                            />
                          </div>
                        </div>
                        {newUser.joiningDate && (() => {
                          // Calculate start date for this bond
                          let bondStartDate: Date;
                          if (index === 0) {
                            // First bond starts from joining date
                            bondStartDate = parseDDMMYYYY(newUser.joiningDate) || new Date(newUser.joiningDate);
                          } else {
                            // Subsequent bonds start from previous bond's end date + 1 day
                            let previousEndDate: Date | null = null;
                            for (let i = 0; i < index; i++) {
                              const prevBond = newUser.bonds[i];
                              if (prevBond.periodMonths && parseInt(prevBond.periodMonths) > 0) {
                                const prevStart = i === 0 
                                  ? (parseDDMMYYYY(newUser.joiningDate) || new Date(newUser.joiningDate))
                                  : previousEndDate || new Date(newUser.joiningDate);
                                previousEndDate = new Date(prevStart);
                                previousEndDate.setMonth(previousEndDate.getMonth() + parseInt(prevBond.periodMonths));
                              }
                            }
                            if (previousEndDate) {
                              bondStartDate = new Date(previousEndDate);
                              bondStartDate.setDate(bondStartDate.getDate() + 1); // Add 1 day
                            } else {
                              bondStartDate = parseDDMMYYYY(newUser.joiningDate) || new Date(newUser.joiningDate);
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
                        {!newUser.joiningDate && (
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
                              const updated = [...newUser.bonds];
                              updated[index].salary = e.target.value;
                              setNewUser({ ...newUser, bonds: updated });
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
              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">User will receive temporary password: <span className="font-mono font-bold">tempPassword123</span></p>
              <Button type="submit" className="w-full">
                <UserPlus size={16} className="mr-2" /> Create User
              </Button>
              </form>
          </Card>

            {/* All Users Table */}
            <Card className="lg:col-span-1 overflow-hidden p-0">
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
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map(user => {
                        const bondInfo = calculateBondRemaining(user.bonds, user.joiningDate);
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                                  user.role === Role.ADMIN ? 'bg-purple-500' : 
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
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                user.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' :
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
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                                      }))
                                    });
                                  }}
                                  className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50"
                                  title="Edit User"
                                >
                                  <PenTool size={16} />
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
            </Card>
          </div>

          {/* Paid Leave Allocation Section */}
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
            {/* Add Paid Leave Form */}
            <Card className="h-fit">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Add Paid Leave</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Allocate paid leaves to employees</p>
                </div>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!paidLeaveAllocation.userId) {
                  alert("Please select a user");
                  return;
                }
                if (!paidLeaveAllocation.allocation || paidLeaveAllocation.allocation === '') {
                  alert("Please enter a number to add");
                  return;
                }
                try {
                  const allocation = parseInt(paidLeaveAllocation.allocation);
                  if (isNaN(allocation) || allocation < 0) {
                    alert("Please enter a valid positive number");
                    return;
                  }
                  await updateUser(paidLeaveAllocation.userId, { paidLeaveAllocation: allocation });
                  alert(`Added ${allocation} paid leave(s) successfully.`);
                  setPaidLeaveAllocation({ userId: '', allocation: '' });
                  await refreshData();
                } catch (error: any) {
                  alert(error.message || "Failed to update paid leave allocation");
                }
              }} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Employee *</label>
                  <select 
                    className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white" 
                    value={paidLeaveAllocation.userId} 
                    onChange={e => {
                      setPaidLeaveAllocation({
                        userId: e.target.value,
                        allocation: ''
                      });
                    }} 
                    required
                  >
                    <option value="">Choose an employee...</option>
                    {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} - {u.department}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Paid Leaves</label>
                  <input 
                    type="number" 
                    placeholder="e.g., 12" 
                    className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all" 
                    value={paidLeaveAllocation.allocation} 
                    onChange={e => setPaidLeaveAllocation({...paidLeaveAllocation, allocation: e.target.value})} 
                    min="1"
                    required
                  />
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-xs text-blue-700 leading-relaxed">
                      <span className="font-semibold">Note:</span> This will be added to the existing allocation. 
                      For example, if an employee has 5 remaining and you add 12, the total becomes 17.
                    </p>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-md">
                  <Calendar size={18} className="mr-2" /> Add Paid Leave Allocation
                </Button>
              </form>
              <div className="mt-6 pt-6 border-t border-gray-200">
                <Button 
                  type="button"
                  onClick={async () => {
                    if (!confirm('Are you sure you want to reset all employees\' paid leave allocation to 0? This will set all additional allocations to 0.')) {
                      return;
                    }
                    try {
                      await userAPI.resetAllPaidLeaveAllocation();
                      alert('All paid leave allocations have been reset to 0 successfully.');
                      await refreshData();
                    } catch (error: any) {
                      alert(error.message || "Failed to reset paid leave allocations");
                    }
                  }}
                  className="w-full bg-red-500 hover:bg-red-600 shadow-md"
                >
                  <Trash2 size={18} className="mr-2" /> Reset All Allocations to 0
                </Button>
              </div>
            </Card>

            {/* Yearly Paid Leave Summary Table */}
            <Card className="h-fit">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Yearly Summary</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Current year paid leave overview</p>
                </div>
              </div>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[200px]">Employee</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Allocated</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Used</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Remaining</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[120px]">Last Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paidLeaveData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center">
                          <div className="flex flex-col items-center justify-center text-gray-400">
                            <Users className="h-12 w-12 mb-2 opacity-50" />
                            <p className="text-sm">No employees found</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paidLeaveData.map(({ user, allocated, used, remaining }) => (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 w-[200px]">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm flex-shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate">{user.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5 truncate">{user.department}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center w-[100px]">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-bold text-sm whitespace-nowrap">
                              {allocated}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center w-[100px]">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-sm whitespace-nowrap">
                              {used}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center w-[100px]">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-bold text-sm whitespace-nowrap ${
                              remaining > 0 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {remaining}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center w-[120px]">
                            <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                              {user.paidLeaveLastAllocatedDate 
                                ? formatDate(user.paidLeaveLastAllocatedDate)
                                : <span className="text-gray-400 italic">Never</span>}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Forget Password Form - Bottom */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Forget Password</h3>
                <p className="text-xs text-gray-500">
                  {forgetPasswordOtpSent ? 'Enter OTP and new password' : 'Reset user password with OTP verification'}
                </p>
              </div>
            </div>
            
            {!forgetPasswordOtpSent ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!forgetPassword.email || !forgetPassword.username || !forgetPassword.newPassword) {
                  alert('Please fill all required fields');
                  return;
                }
                if (forgetPassword.newPassword.length < 4) {
                  alert('Password must be at least 4 characters');
                  return;
                }
                try {
                  const result = await authAPI.sendResetPasswordOTP(
                    forgetPassword.email.trim(), 
                    forgetPassword.username.trim(),
                    forgetPassword.newPassword
                  );
                  alert(result.message || 'OTP sent successfully!');
                  setForgetPasswordOtpSent(true);
                  setForgetPasswordOtpEmail(result.email || forgetPassword.email.trim());
                } catch (error: any) {
                  alert(error.message || 'Failed to send OTP');
                }
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Admin Email *</label>
                    <input 
                      type="email" 
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400" 
                      value={forgetPassword.email} 
                      onChange={e => setForgetPassword({...forgetPassword, email: e.target.value})} 
                      placeholder="admin@example.com" 
                      required 
                    />
                    <p className="text-xs text-gray-500 mt-1">Email must belong to an Admin account (OTP will be sent here)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Username *</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400" 
                      value={forgetPassword.username} 
                      onChange={e => setForgetPassword({...forgetPassword, username: e.target.value})} 
                      placeholder="username" 
                      required 
                    />
                    <p className="text-xs text-gray-500 mt-1">Username of the user whose password needs to be reset</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">New Password *</label>
                  <input 
                    type="password" 
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400" 
                    value={forgetPassword.newPassword} 
                    onChange={e => setForgetPassword({...forgetPassword, newPassword: e.target.value})} 
                    placeholder="Enter new password (min 4 characters)" 
                    minLength={4}
                    required 
                  />
                </div>
                <p className="text-xs text-gray-500 bg-orange-50 p-2 rounded-lg">Enter admin email, username, and new password. OTP will be sent to the admin email.</p>
                <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
                  <Mail size={16} className="mr-2" /> Send OTP
                </Button>
              </form>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!forgetPassword.otp) {
                  alert('Please enter OTP');
                  return;
                }
                try {
                  await authAPI.resetPassword(
                    forgetPasswordOtpEmail || forgetPassword.email.trim(), 
                    forgetPassword.otp.trim()
                  );
                  alert('Password reset successfully!');
                  setForgetPassword({ email: '', username: '', otp: '', newPassword: '' });
                  setForgetPasswordOtpSent(false);
                  setForgetPasswordOtpEmail('');
                  await refreshData();
                } catch (error: any) {
                  alert(error.message || 'Failed to reset password');
                }
              }} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>OTP sent to:</strong> {forgetPasswordOtpEmail}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Please check your email for the 6-digit OTP code</p>
                  <p className="text-xs text-blue-600 mt-1">
                    <strong>Resetting password for:</strong> {forgetPassword.username}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">OTP *</label>
                  <input 
                    type="text" 
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 text-center text-xl tracking-widest font-mono" 
                    value={forgetPassword.otp} 
                    onChange={e => setForgetPassword({...forgetPassword, otp: e.target.value.replace(/\D/g, '').slice(0, 6)})} 
                    placeholder="000000" 
                    maxLength={6}
                    required 
                  />
                </div>
                <p className="text-xs text-gray-500 bg-orange-50 p-2 rounded-lg">Enter the OTP received in your email to verify and reset the password.</p>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    onClick={() => {
                      setForgetPasswordOtpSent(false);
                      setForgetPassword({...forgetPassword, otp: ''});
                    }}
                    className="flex-1 bg-gray-500 hover:bg-gray-600"
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
                    <Mail size={16} className="mr-2" /> Verify OTP & Reset Password
                  </Button>
                </div>
              </form>
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
                              auditLogs.map(log => (
                                  <tr key={log.id} className="bg-white border-b">
                                      <td className="px-6 py-4 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-medium text-gray-900">{log.actorName}</td>
                                      <td className="px-6 py-4">
                                          <span className="text-xs font-bold text-gray-600 block">{log.targetType}</span>
                                          <span className="text-xs font-mono text-gray-400">{log.targetId}</span>
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
                              ))
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
                            <input type="date" className="w-full p-2 border rounded text-sm" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
                            <input type="text" placeholder="e.g. Independence Day" className="w-full p-2 border rounded text-sm" value={newHoliday.description} onChange={e => setNewHoliday({...newHoliday, description: e.target.value})} required />
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

                {/* Correction */}
                <Card title="Correct Attendance" className="lg:col-span-1 h-fit">
                  <form onSubmit={handleCorrection} className="space-y-3">
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee</label>
                          <select className="w-full p-2 border rounded text-sm" value={correction.userId} onChange={e => setCorrection({...correction, userId: e.target.value})} required>
                              <option value="">Select Employee</option>
                              {users.filter(u => u.role === Role.EMPLOYEE).map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                          <input type="date" className="w-full p-2 border rounded text-sm" value={correction.date} onChange={e => setCorrection({...correction, date: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check In</label>
                              <input type="time" className="w-full p-2 border rounded text-sm" value={correction.checkIn} onChange={e => setCorrection({...correction, checkIn: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check Out</label>
                              <input type="time" className="w-full p-2 border rounded text-sm" value={correction.checkOut} onChange={e => setCorrection({...correction, checkOut: e.target.value})} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Break Deduction (mins)</label>
                          <input type="number" placeholder="Override break time" className="w-full p-2 border rounded text-sm" value={correction.breakDuration} onChange={e => setCorrection({...correction, breakDuration: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Admin Notes</label>
                          <input type="text" placeholder="Reason for correction" className="w-full p-2 border rounded text-sm" value={correction.notes} onChange={e => setCorrection({...correction, notes: e.target.value})} />
                      </div>
                      <Button type="submit" className="w-full" variant="secondary">
                          <PenTool size={16} className="mr-2" /> Update Record
                      </Button>
                  </form>
                </Card>

                {/* List Holidays */}
                <Card title="Scheduled Holidays" className="lg:col-span-1">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {companyHolidays.length === 0 ? <p className="text-gray-400 text-sm p-2">No holidays scheduled.</p> : 
                            companyHolidays.map(holiday => (
                                <div key={holiday.id} className={`flex items-center justify-between p-3 rounded border ${
                                    holiday.status === 'past' 
                                        ? 'bg-gray-100 border-gray-200 opacity-60' 
                                        : 'bg-gray-50 border-gray-100'
                                }`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${
                                            holiday.status === 'past' 
                                                ? 'bg-gray-200 text-gray-500' 
                                                : 'bg-purple-100 text-purple-600'
                                        }`}>
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold ${
                                                holiday.status === 'past' ? 'text-gray-500' : 'text-gray-800'
                                            }`}>{holiday.description}</p>
                                            <p className="text-xs text-gray-500">{formatDate(holiday.date)}</p>
                                        </div>
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
      )}

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
      )}

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
                    <span><strong>Reset Password:</strong> Use the Forget Password form at the bottom. Enter username and new password (minimum 4 characters) to reset any user's password.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span><strong>Paid Leave Allocation:</strong> Add paid leaves to employees. The number you enter will be added to their existing allocation. Use "Reset All Allocations" to set all to 0.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span><strong>Yearly Summary:</strong> View yearly paid leave overview showing allocated, used, and remaining leaves for all employees.</span>
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

      {/* Bond Details Modal */}
      {bondModalUser && (() => {
        const bondInfo = calculateBondRemaining(bondModalUser.bonds, bondModalUser.joiningDate);
        if (!bondInfo.currentBond && bondInfo.totalRemaining.display === '-') {
          return null;
        }
        
        // Calculate total duration in months
        const totalMonths = bondInfo.allBonds.reduce((sum, bond) => sum + bond.periodMonths, 0);
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
                    <h3 className="text-2xl font-bold text-gray-900">Bond Details</h3>
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
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                bond.remaining.isExpired 
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

                  {/* Current Bond Remaining */}
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                      {bondInfo.currentBond ? `${bondInfo.currentBond.type} Bond Remaining` : 'Total Remaining'}
                    </p>
                    <p className="text-xl font-bold text-emerald-900">{bondInfo.currentBondRemaining?.display || bondInfo.totalRemaining.display}</p>
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
      })()}

      {/* Edit User Modal */}
      {editingUser && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setEditingUser(null);
              setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [] });
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Edit User: {editingUser.name}</h3>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [] });
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
                        salary: b.salary ? parseFloat(b.salary) : 0
                      };
                    });
                  }
                  
                  await userAPI.updateUser(editingUser.id, updates);
                  alert('User updated successfully!');
                  setEditingUser(null);
                  setEditUserForm({ name: '', email: '', department: '', joiningDate: '', bonds: [] });
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
      )}

    </div>
  );
};
