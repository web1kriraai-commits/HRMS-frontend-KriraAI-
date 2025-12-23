import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BreakType, LeaveCategory, LeaveStatus, User } from '../types';
import { getTodayStr, formatDuration, formatTime, formatDate, calculateBondRemaining, convertToDDMMYYYY } from '../services/utils';
import { Clock, Coffee, AlertCircle, Bell, Calendar, X, FileText } from 'lucide-react';
import { notificationAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Format duration with small text for units
const formatDurationStyled = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  
  if (h === 0 && m === 0) return <><span>0</span><span className="text-sm font-normal ml-1">minutes</span></>;
  if (h === 0) return <><span>{m}</span><span className="text-sm font-normal ml-1">minutes</span></>;
  if (m === 0) return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span></>;
  return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span> <span>{m}</span><span className="text-sm font-normal ml-1">min</span></>;
};

// Format hours to hours and minutes format (e.g., 8.25 hours = 8h 15m)
const formatHoursToHoursMinutes = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// Get total paid leaves for a user (only admin allocated)
const getTotalPaidLeaves = (user?: User | null) => {
  // Only show admin allocated paid leaves (no default)
  return user?.paidLeaveAllocation || 0;
};

export const EmployeeDashboard: React.FC = () => {
  const { auth, attendanceRecords, clockIn, clockOut, startBreak, endBreak, requestLeave, leaveRequests, notifications, companyHolidays, systemSettings, refreshData } = useApp();
  const user = auth.user;
  
  // Real-time timer
  const [elapsed, setElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0); // Break duration timer
  const [todayRecord, setTodayRecord] = useState(attendanceRecords.find(r => r.userId === user?.id && r.date === getTodayStr()));
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  // Local state to track check-in time immediately when clicked
  const [localCheckInTime, setLocalCheckInTime] = useState<Date | null>(null);
  // Local state to track if break is active (to stop timer immediately)
  const [localBreakStartTime, setLocalBreakStartTime] = useState<Date | null>(null);
  // Confirmation popup state
  const [confirmationPopup, setConfirmationPopup] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  // Bond details modal state
  const [showBondModal, setShowBondModal] = useState(false);
  // Extra break reason state
  const [extraBreakReason, setExtraBreakReason] = useState('');
  const [showExtraBreakReasonInput, setShowExtraBreakReasonInput] = useState(false);

  useEffect(() => {
    const record = attendanceRecords.find(r => r.userId === user?.id && r.date === getTodayStr());
    setTodayRecord(record);
    // Sync local check-in time with record if it exists and we don't have a local one
    if (record?.checkIn) {
      const recordCheckIn = new Date(record.checkIn);
      if (!localCheckInTime || Math.abs(recordCheckIn.getTime() - localCheckInTime.getTime()) > 2000) {
        // Only update if local time is not set or differs significantly (more than 2 seconds)
        setLocalCheckInTime(recordCheckIn);
      }
    }
    // Sync local break state with record
    const activeBreak = record?.breaks.find(b => !b.end);
    if (activeBreak) {
      const breakStart = new Date(activeBreak.start);
      if (!localBreakStartTime || Math.abs(breakStart.getTime() - localBreakStartTime.getTime()) > 2000) {
        setLocalBreakStartTime(breakStart);
      }
    } else if (!activeBreak && localBreakStartTime) {
      // Only clear if break was actually ended (not just missing from record)
      const endedBreak = record?.breaks.find(b => b.end && new Date(b.end).getTime() > localBreakStartTime.getTime() - 1000);
      if (endedBreak || !record) {
        setLocalBreakStartTime(null);
      }
    }
  }, [attendanceRecords, user?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Use local check-in time if available, otherwise use record
      const checkInTime = localCheckInTime || (todayRecord?.checkIn ? new Date(todayRecord.checkIn) : null);
      
      if (checkInTime && !todayRecord?.checkOut) {
        const now = new Date().getTime();
        const start = checkInTime.getTime();
        
        // If break is active, show break timer
        if (localBreakStartTime) {
          const breakStart = localBreakStartTime.getTime();
          // Calculate break duration
          const breakDuration = Math.max(0, (now - breakStart) / 1000);
          setBreakElapsed(breakDuration);
          
          // Calculate elapsed work time up to break start
          const elapsedBeforeBreak = Math.max(0, (breakStart - start) / 1000);
          // Subtract completed breaks before this break
          let completedBreakTime = (todayRecord?.breaks || []).reduce((acc, b) => {
            if (b.end && new Date(b.end).getTime() < breakStart) {
              return acc + (new Date(b.end).getTime() - new Date(b.start).getTime());
            }
            return acc;
          }, 0);
          setElapsed(Math.max(0, elapsedBeforeBreak - (completedBreakTime / 1000)));
        } else {
          // Not on break - show work timer
          setBreakElapsed(0);
          
          // Calculate break time from completed breaks
          let breakTime = (todayRecord?.breaks || []).reduce((acc, b) => {
            if (b.end) {
              return acc + (new Date(b.end).getTime() - new Date(b.start).getTime());
            }
            return acc;
          }, 0);
          
          // If there's an active break in the record but not in local state, use it
          const activeBreak = todayRecord?.breaks.find(b => !b.end);
          if (activeBreak && !localBreakStartTime) {
            breakTime += (now - new Date(activeBreak.start).getTime());
          }
          
          setElapsed(Math.max(0, (now - start - breakTime) / 1000));
        }
      } else {
        setElapsed(todayRecord?.totalWorkedSeconds || 0);
        setBreakElapsed(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [todayRecord, localCheckInTime, localBreakStartTime]);

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({ 
    start: '', 
    end: '', 
    type: LeaveCategory.PAID, 
    reason: '', 
    halfDayTime: 'morning', 
    halfDayLeaveType: 'paid',
    startTime: '', // For extra time leave and half day leave
    endTime: '' // For extra time leave
  });

  const isOnBreak = localBreakStartTime !== null || todayRecord?.breaks.some(b => !b.end);
  const isCheckedIn = !!localCheckInTime || !!todayRecord?.checkIn;
  const isCheckedOut = !!todayRecord?.checkOut;
  
  // Check if standard break already taken today
  const hasStandardBreak = todayRecord?.breaks.some(b => b.type === 'Standard' && b.end) || false;
  const activeBreak = todayRecord?.breaks.find(b => !b.end);
  const activeBreakStartTime = localBreakStartTime ? localBreakStartTime : (activeBreak ? new Date(activeBreak.start) : null);

  const myLeaves = leaveRequests.filter(l => l.userId === user?.id);
  
  // Check if user is on approved leave today
  const today = getTodayStr();
  const todayLeave = myLeaves.find(l => {
    const status = String(l.status || '').trim();
    const isApproved = status === 'Approved' || status === LeaveStatus.APPROVED;
    if (!isApproved) return false;
    const startDate = new Date(l.startDate);
    const endDate = new Date(l.endDate);
    const todayDate = new Date(today);
    return todayDate >= startDate && todayDate <= endDate;
  });
  const isOnLeaveToday = !!todayLeave;
  // Filter out pending leaves from display - only show approved/rejected in history
  const myLeavesHistory = myLeaves.filter(l => {
    const status = String(l.status || '').trim();
    // Show only approved or rejected leaves (exclude pending)
    return status === 'Approved' || status === LeaveStatus.APPROVED || 
           status === 'Rejected' || status === LeaveStatus.REJECTED;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || a.startDate).getTime();
    const dateB = new Date(b.createdAt || b.startDate).getTime();
    return dateB - dateA; // Most recent first
  });
  
  // Get current month leaves (all statuses - pending, approved, rejected)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
  
  const currentMonthLeaves = myLeaves.filter(l => {
    const startDate = new Date(l.startDate);
    const endDate = new Date(l.endDate);
    // Check if leave overlaps with current month (start or end date falls within current month)
    return (startDate >= monthStart && startDate <= monthEnd) ||
           (endDate >= monthStart && endDate <= monthEnd) ||
           (startDate <= monthStart && endDate >= monthEnd);
  }).sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    return dateA - dateB; // Earliest first
  });

  // Leave filters & helpers
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Approved' | 'Rejected' | 'Pending'>('All');
  const [leaveFilterDate, setLeaveFilterDate] = useState('');
  const [leaveFilterMonth, setLeaveFilterMonth] = useState('');

  // Calculate working days (excluding Sundays and holidays) between two dates
  const calculateLeaveDays = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

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

  // Compute leaves to show based on date/month filters
  const leavesForPeriod = (() => {
    // If month filter selected, show leaves overlapping that month (any year)
    if (leaveFilterMonth) {
      const [yearStr, monthStr] = leaveFilterMonth.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        const mStart = new Date(y, m, 1);
        const mEnd = new Date(y, m + 1, 0, 23, 59, 59);
        return myLeaves.filter(l => {
          const s = new Date(l.startDate);
          const e = new Date(l.endDate);
          return (s >= mStart && s <= mEnd) ||
                 (e >= mStart && e <= mEnd) ||
                 (s <= mStart && e >= mEnd);
        }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      }
    }

    // If specific date selected, show leaves active on that date
    if (leaveFilterDate) {
      const d = new Date(leaveFilterDate);
      if (!isNaN(d.getTime())) {
        return myLeaves.filter(l => {
          const s = new Date(l.startDate);
          const e = new Date(l.endDate);
          return d >= s && d <= e;
        }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      }
    }

    // Default: current month leaves
    return currentMonthLeaves;
  })();

  const statusFilteredLeaves = leavesForPeriod.filter(leave => {
    if (leaveStatusFilter === 'All') return true;
    const status = (leave.status || '').trim();
    return status === leaveStatusFilter;
  });

  const totalLeaveDays = statusFilteredLeaves.reduce((sum, leave) => {
    return sum + calculateLeaveDays(leave.startDate, leave.endDate);
  }, 0);

  // Calculate used paid leaves (only approved ones)
  // Includes full paid leaves and half-day leaves marked as paid
  const usedPaidLeaves = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      
      // Full paid leaves
      if (leave.category === LeaveCategory.PAID) return true;
      
      // Half-day leaves marked as paid leave
      if (leave.category === LeaveCategory.HALF_DAY) {
        const reason = leave.reason || '';
        return reason.includes('[Paid Leave]');
      }
      
      return false;
    })
    .reduce((sum, leave) => {
      if (leave.category === LeaveCategory.PAID) {
        return sum + calculateLeaveDays(leave.startDate, leave.endDate);
      } else if (leave.category === LeaveCategory.HALF_DAY) {
        // Half-day leaves count as 0.5 days
        return sum + 0.5;
      }
      return sum;
    }, 0);

  // Get total paid leaves allocation (custom or default)
  const TOTAL_PAID_LEAVES = getTotalPaidLeaves(user);
  const availablePaidLeaves = TOTAL_PAID_LEAVES - usedPaidLeaves;
  const isPaidLeaveExhausted = availablePaidLeaves <= 0;
  
  const myNotifications = notifications.filter(n => n.userId === user?.id);
  const myAttendanceHistory = attendanceRecords.filter(r => r.userId === user?.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Show notifications popup only once per user per latest notification batch
  useEffect(() => {
    if (!user || myNotifications.length === 0) return;

    const storageKey = `notif_popup_last_seen_${user.id}`;
    const lastSeenStr = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    const lastSeen = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;

    const latestCreatedAt = myNotifications.reduce((max, n: any) => {
      if (!n.createdAt) return max;
      const t = new Date(n.createdAt).getTime();
      return t > max ? t : max;
    }, 0);

    // If there is any notification newer than what user has seen, open popup
    if (latestCreatedAt > lastSeen) {
      setShowNotificationsPopup(true);
    }
  }, [myNotifications, user?.id]);

  const handleCloseNotificationsPopup = () => {
    if (user && myNotifications.length > 0 && typeof window !== 'undefined') {
      const latestCreatedAt = myNotifications.reduce((max, n: any) => {
        if (!n.createdAt) return max;
        const t = new Date(n.createdAt).getTime();
        return t > max ? t : max;
      }, 0);
      if (latestCreatedAt > 0) {
        window.localStorage.setItem(`notif_popup_last_seen_${user.id}`, new Date(latestCreatedAt).toISOString());
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

  // Calculate current month time statistics
  // Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
  const MIN_NORMAL_SECONDS = (8 * 3600) + (15 * 60); // 8 hours 15 minutes = 29700 seconds
  const MAX_NORMAL_SECONDS = (8 * 3600) + (30 * 60); // 8 hours 30 minutes = 30600 seconds
  const currentMonthAttendance = myAttendanceHistory.filter(r => {
    const recordDate = new Date(r.date);
    return recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear;
  });
  
  let totalLowTimeSeconds = 0;
  let totalExtraTimeSeconds = 0;
  
  currentMonthAttendance.forEach(record => {
    if (record.checkIn && record.checkOut) {
      const checkIn = new Date(record.checkIn).getTime();
      const checkOut = new Date(record.checkOut).getTime();
      const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
      const breakSeconds = getBreakSeconds(record.breaks) || 0;
      const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
      
      if (netWorkedSeconds < MIN_NORMAL_SECONDS) {
        // Low time: less than 8:15
        totalLowTimeSeconds += (MIN_NORMAL_SECONDS - netWorkedSeconds);
      } else if (netWorkedSeconds > MAX_NORMAL_SECONDS) {
        // Extra time: more than 8:30
        totalExtraTimeSeconds += (netWorkedSeconds - MAX_NORMAL_SECONDS);
      }
      // If netWorkedSeconds is between 8:15 and 8:30, it's normal (no low/extra)
    }
  });
  
  // Calculate Extra Time Leave tracking
  // Calculate approved Extra Time Leave days (only approved ones)
  // Includes full extra time leaves and half-day leaves marked as extra time
  const extraTimeLeaveDays = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      
      // Full extra time leaves
      if (leave.category === LeaveCategory.EXTRA_TIME) return true;
      
      // Half-day leaves marked as extra time leave
      if (leave.category === LeaveCategory.HALF_DAY) {
        const reason = leave.reason || '';
        return reason.includes('[Extra Time Leave]');
      }
      
      return false;
    })
    .reduce((sum, leave) => {
      if (leave.category === LeaveCategory.EXTRA_TIME) {
        return sum + calculateLeaveDays(leave.startDate, leave.endDate);
      } else if (leave.category === LeaveCategory.HALF_DAY) {
        // Half-day leaves count as 0.5 days for calculation
        return sum + 0.5;
      }
      return sum;
    }, 0);

  // Helper function to calculate hours per day from start and end time
  const calculateHoursPerDay = (startTime: string, endTime: string): number => {
    // Validate inputs
    if (!startTime || !endTime || startTime.trim() === '' || endTime.trim() === '') {
      return 0;
    }
    
    // Parse time strings (expecting HH:mm format)
    const parseTime = (timeStr: string): { hours: number; minutes: number } | null => {
      const trimmed = timeStr.trim();
      // Handle HH:mm format
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

  // Convert Extra Time Leave to hours
  // For extra time leave: calculate actual hours from start and end time
  // Half-days: 0.5 day = 4 hours (as per requirement)
  const extraTimeLeaveHours = myLeaves
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
        // Fallback to old calculation only if time fields are missing or invalid
        return sum + (calculateLeaveDays(leave.startDate, leave.endDate) * 8.25);
      } else if (leave.category === LeaveCategory.HALF_DAY) {
        // Half-day extra time leave: 4 hours
        return sum + 4;
      }
      return sum;
    }, 0);
  
  // Calculate Final Time (net difference between extra time and low time)
  const finalTimeDifference = totalExtraTimeSeconds - totalLowTimeSeconds;
  
  // Extra Time Worked = Final Time (convert from seconds to hours)
  // Final Time is the net difference: Extra Time - Low Time
  const extraTimeWorkedHours = finalTimeDifference / 3600;
  
  // Remaining extra time leave balance (in hours)
  // Balance = Extra Time Leave Taken - Extra Time Worked
  // If Extra Time Worked is negative (more low time than extra time), balance = full leave taken
  const remainingExtraTimeLeaveHours = Math.max(0, extraTimeLeaveHours - Math.max(0, extraTimeWorkedHours));
  
  // At month end, if there's remaining balance, it should be added to low time
  const isMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingExtraTimeLeaveSeconds = remainingExtraTimeLeaveHours * 3600;
  
  // Add uncompleted extra time leave to low time at month end
  const adjustedLowTimeSeconds = isMonthEnd && remainingExtraTimeLeaveHours > 0
    ? totalLowTimeSeconds + remainingExtraTimeLeaveSeconds
    : totalLowTimeSeconds;
  
  // Final time difference with adjusted low time
  const finalTimeDifferenceAdjusted = totalExtraTimeSeconds - adjustedLowTimeSeconds;

  // Chart Data: Last 7 days worked hours
  const chartData = myAttendanceHistory
    .slice(0, 7)
    .reverse()
    .map(r => ({
      date: r.date.slice(5), // MM-DD
      hours: +(r.totalWorkedSeconds / 3600).toFixed(1),
      isLow: r.lowTimeFlag,
      isExtra: r.extraTimeFlag
    }));

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Notifications Popup */}
      {showNotificationsPopup && myNotifications.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={handleCloseNotificationsPopup}
          />

          {/* Popup Panel */}
          <div className="fixed inset-0 z-50 flex items-start justify-end px-4 pt-20 sm:pt-24 pointer-events-none">
            <div className="w-full max-w-md ml-auto pointer-events-auto">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 shadow-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Bell className="text-amber-600" size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">Notifications</p>
                    <p className="text-xs text-gray-500">Auto-removed after 24 hours</p>
                  </div>
                  <span className="ml-auto mr-2 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    {myNotifications.length}
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
                  {myNotifications.map(n => (
                    <div key={n.id} className="bg-white rounded-lg p-3 border border-amber-100 flex items-start gap-3">
                      <div className={`h-2 w-2 rounded-full mt-2 ${n.read ? 'bg-gray-300' : 'bg-amber-500'}`}></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{n.message}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Attendance Card */}
        <Card className="col-span-1 lg:col-span-2" title="Today's Attendance">
          {isOnLeaveToday ? (
            <div className="text-center py-8">
              <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold text-purple-700">On Leave Today</h3>
              <p className="text-gray-500 mt-2">{todayLeave?.category}</p>
              <p className="text-sm text-gray-400 mt-1">{todayLeave?.reason}</p>
              <div className="mt-4 inline-block px-4 py-2 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-600 font-semibold">Approved Leave</p>
              </div>
            </div>
          ) : (
          <>
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center md:text-left">
              <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">
                {isOnBreak ? 'Break Timer' : 'Work Timer'}
              </p>
              <div className={`mt-2 ${isOnBreak ? 'text-amber-500' : 'text-blue-600'}`}>
                <div className="flex items-center justify-center md:justify-start gap-1">
                  {(() => {
                    // Show break timer when on break, work timer when not
                    const displayTime = isOnBreak ? breakElapsed : elapsed;
                    const h = Math.floor(displayTime / 3600);
                    const m = Math.floor((displayTime % 3600) / 60);
                    const s = Math.floor(displayTime % 60);
                    return (
                      <>
                        <div className="text-center">
                          <span className="text-5xl font-bold font-mono">{h.toString().padStart(2, '0')}</span>
                          <p className="text-xs text-gray-400 mt-1">hours</p>
                        </div>
                        <span className="text-5xl font-bold font-mono">:</span>
                        <div className="text-center">
                          <span className="text-5xl font-bold font-mono">{m.toString().padStart(2, '0')}</span>
                          <p className="text-xs text-gray-400 mt-1">minutes</p>
                        </div>
                        <span className="text-5xl font-bold font-mono">:</span>
                        <div className="text-center">
                          <span className="text-5xl font-bold font-mono">{s.toString().padStart(2, '0')}</span>
                          <p className="text-xs text-gray-400 mt-1">seconds</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              {isOnBreak && (
                <div className="mt-2 space-y-1">
                  <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold animate-pulse">ON BREAK</span>
                  {activeBreakStartTime && (
                    <p className="text-xs text-gray-500 mt-1">
                      Break started at: {formatTime(activeBreakStartTime.toISOString(), systemSettings.timezone)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 w-full md:w-auto">
              {!isCheckedIn && !isCheckedOut && (
                <Button size="lg" onClick={() => {
                  setConfirmationPopup({
                    show: true,
                    title: 'Confirm Check In',
                    message: 'Are you sure you want to check in?',
                    onConfirm: async () => {
                      const checkInTime = new Date();
                      setLocalCheckInTime(checkInTime);
                      try {
                        await clockIn();
                        setConfirmationPopup(null);
                      } catch (error) {
                        // Reset on error
                        setLocalCheckInTime(null);
                        setConfirmationPopup(null);
                        throw error;
                      }
                    },
                    onCancel: () => setConfirmationPopup(null)
                  });
                }} className="w-full md:w-48 h-14 text-lg shadow-lg shadow-blue-200">
                  <Clock className="mr-2" /> Check In
                </Button>
              )}
              
              {isCheckedIn && !isCheckedOut && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="secondary" 
                      disabled={isOnBreak || hasStandardBreak} 
                      onClick={() => {
                        setConfirmationPopup({
                          show: true,
                          title: 'Confirm Break',
                          message: 'Are you sure you want to start your break?',
                          onConfirm: async () => {
                            const breakStartTime = new Date();
                            setLocalBreakStartTime(breakStartTime);
                            try {
                              await startBreak(BreakType.STANDARD);
                              setConfirmationPopup(null);
                            } catch (error) {
                              // Reset on error
                              setLocalBreakStartTime(null);
                              setConfirmationPopup(null);
                              throw error;
                            }
                          },
                          onCancel: () => setConfirmationPopup(null)
                        });
                      }}
                      className="w-full"
                      title={hasStandardBreak ? "Standard break already taken. Use Extra Break for additional breaks." : ""}
                    >
                      <Coffee className="mr-2 h-4 w-4" /> Break
                      {hasStandardBreak && <span className="ml-1 text-xs">(Used)</span>}
                    </Button>
                    <Button 
                      variant="secondary" 
                      disabled={isOnBreak} 
                      onClick={() => {
                        setShowExtraBreakReasonInput(true);
                      }}
                      className="w-full"
                    >
                      <AlertCircle className="mr-2 h-4 w-4" /> Extra Break
                    </Button>
                  </div>
                  
                  {isOnBreak ? (
                     <Button variant="success" onClick={async () => {
                       setLocalBreakStartTime(null);
                       try {
                         await endBreak();
                       } catch (error) {
                         // Restore break state on error
                         if (activeBreakStartTime) {
                           setLocalBreakStartTime(activeBreakStartTime);
                         }
                         throw error;
                       }
                     }} className="w-full animate-pulse">End Break</Button>
                  ) : (
                     <Button variant="danger" onClick={() => {
                       setConfirmationPopup({
                         show: true,
                         title: 'Confirm Check Out',
                         message: 'Are you sure you want to check out?',
                         onConfirm: async () => {
                           try {
                             await clockOut();
                             setConfirmationPopup(null);
                           } catch (error) {
                             setConfirmationPopup(null);
                             throw error;
                           }
                         },
                         onCancel: () => setConfirmationPopup(null)
                       });
                     }} className="w-full">Check Out</Button>
                  )}
                  
                  {/* Extra Break Reason Input Modal */}
                  {showExtraBreakReasonInput && (
                    <>
                      <div
                        className="fixed inset-0 bg-black/50 z-50"
                        onClick={() => {
                          setShowExtraBreakReasonInput(false);
                          setExtraBreakReason('');
                        }}
                      />
                      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                          <h3 className="text-xl font-bold text-gray-900 mb-2">Extra Break Reason</h3>
                          <p className="text-gray-600 mb-4 text-sm">Please provide a reason for taking an extra break (required)</p>
                          <textarea
                            value={extraBreakReason}
                            onChange={(e) => setExtraBreakReason(e.target.value)}
                            placeholder="Enter reason for extra break..."
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            rows={4}
                            required
                          />
                          <div className="flex gap-3 justify-end mt-4">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setShowExtraBreakReasonInput(false);
                                setExtraBreakReason('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="primary"
                              onClick={async () => {
                                if (!extraBreakReason.trim()) {
                                  alert('Please provide a reason for the extra break');
                                  return;
                                }
                                const breakStartTime = new Date();
                                setLocalBreakStartTime(breakStartTime);
                                try {
                                  await startBreak(BreakType.EXTRA, extraBreakReason.trim());
                                  setShowExtraBreakReasonInput(false);
                                  setExtraBreakReason('');
                                } catch (error) {
                                  // Reset on error
                                  setLocalBreakStartTime(null);
                                  setShowExtraBreakReasonInput(false);
                                  setExtraBreakReason('');
                                  throw error;
                                }
                              }}
                              disabled={!extraBreakReason.trim()}
                            >
                              Start Extra Break
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {isCheckedOut && (
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-600 font-medium">Day Completed</p>
                  <p className="text-sm text-gray-400">Checked out at {formatTime(todayRecord?.checkOut, systemSettings.timezone)}</p>
                  {todayRecord?.lowTimeFlag && <span className="text-xs text-red-500 font-bold block mt-1">Low Time Detected</span>}
                  {todayRecord?.extraTimeFlag && <span className="text-xs text-green-600 font-bold block mt-1">Extra Time (Overtime)</span>}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-gray-100">
             <div>
                <p className="text-xs text-gray-400">Check In</p>
                <p className="font-semibold text-gray-800">{formatTime(todayRecord?.checkIn, systemSettings.timezone)}</p>
             </div>
             <div>
                <p className="text-xs text-gray-400">Check Out</p>
                <p className="font-semibold text-gray-800">{formatTime(todayRecord?.checkOut, systemSettings.timezone)}</p>
             </div>
             <div>
                <p className="text-xs text-gray-400">Break Time</p>
                <p className="font-semibold text-gray-800">
                    {todayRecord ? formatDuration(todayRecord.breaks.reduce((acc, b) => {
                       return acc + (b.end ? (new Date(b.end).getTime() - new Date(b.start).getTime())/1000 : 0)
                    }, 0)) : '--:--:--'}
                </p>
             </div>
             <div>
                <p className="text-xs text-gray-400">Status</p>
                <p className="font-semibold text-gray-800">
                    {isCheckedOut ? 'Finished' : isCheckedIn ? 'Active' : 'Not Started'}
                </p>
             </div>
          </div>
          </>
          )}
        </Card>

        {/* Weekly Stats */}
        <Card title="Weekly Hours">
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{fontSize: 10}} />
                <YAxis tick={{fontSize: 10}} />
                <Tooltip />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isLow ? '#ef4444' : entry.isExtra ? '#16a34a' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2 px-2">
            <span className="flex items-center"><div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div> Low</span>
            <span className="flex items-center"><div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div> Normal</span>
            <span className="flex items-center"><div className="w-2 h-2 bg-green-600 rounded-full mr-1"></div> Extra</span>
          </div>
        </Card>

        {/* Bond Period & Salary Card */}
        <Card title="Bond Period" className="h-fit">
          {(() => {
            const bondInfo = calculateBondRemaining(user?.bonds, user?.joiningDate);
            if (!bondInfo.currentBond && bondInfo.totalRemaining.display === '-') {
              return (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm">No bond information available</p>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {bondInfo.currentSalary > 0 && (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                      Current {bondInfo.currentBond?.type === 'Internship' ? 'Stipend' : 'Salary'}
                    </p>
                    <p className="text-lg font-bold text-green-900">₹{bondInfo.currentSalary.toLocaleString('en-IN')}</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowBondModal(true)}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <FileText size={18} />
                  View Bond Details
                </Button>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Confirmation Popup */}
      {confirmationPopup && confirmationPopup.show && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={confirmationPopup.onCancel}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">{confirmationPopup.title}</h3>
              <p className="text-gray-600 mb-6">{confirmationPopup.message}</p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="secondary"
                  onClick={confirmationPopup.onCancel}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmationPopup.onConfirm}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bond Details Modal */}
      {showBondModal && (() => {
        const bondInfo = calculateBondRemaining(user?.bonds, user?.joiningDate);
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
              onClick={() => setShowBondModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-gray-900">Bond Details</h3>
                  <button
                    onClick={() => setShowBondModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* Joining Date */}
                  {user?.joiningDate && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Joining Date</p>
                      <p className="text-lg font-bold text-blue-900">{user.joiningDate}</p>
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
                                <p className="font-semibold text-gray-800">{bond.startDate || user?.joiningDate || '-'}</p>
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
                    onClick={() => setShowBondModal(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Leave Request Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Request Leave" className="h-full">
            <form onSubmit={(e) => {
                e.preventDefault();
                if(!leaveForm.start || !leaveForm.reason) return;
                // For non-half-day leaves, end date is required
                if(leaveForm.type !== LeaveCategory.HALF_DAY && !leaveForm.end) return;
                
                // Prevent submitting Paid Leave if exhausted
                if (leaveForm.type === LeaveCategory.PAID && isPaidLeaveExhausted) {
                    alert(`All ${TOTAL_PAID_LEAVES} paid leaves have been used. Please select another leave type.`);
                    return;
                }

                // Check if requested paid leave days exceed available balance
                if (leaveForm.type === LeaveCategory.PAID) {
                    const requestedDays = calculateLeaveDays(leaveForm.start, leaveForm.end);
                    
                    if (requestedDays > availablePaidLeaves) {
                        alert(`You only have ${availablePaidLeaves} paid leave(s) remaining. You cannot request ${requestedDays} day(s).`);
                        return;
                    }
                }

                // Check half-day leave with paid leave selection
                if (leaveForm.type === LeaveCategory.HALF_DAY && leaveForm.halfDayLeaveType === 'paid') {
                    if (availablePaidLeaves < 0.5) {
                        alert(`You need at least 0.5 paid leave(s) remaining for half-day leave. You only have ${availablePaidLeaves} paid leave(s) remaining.`);
                        return;
                    }
                }

                const leaveData: any = {
                    startDate: leaveForm.start,
                    endDate: leaveForm.start, // For half-day, start and end are same
                    category: leaveForm.type,
                    reason: leaveForm.reason
                };
                // For non-half-day leaves, use the end date
                if (leaveForm.type !== LeaveCategory.HALF_DAY) {
                    leaveData.endDate = leaveForm.end;
                } else {
                    // Add half day leave type info to reason
                    const halfDayTypeLabel = leaveForm.halfDayLeaveType === 'paid' ? 'Paid Leave' : 'Extra Time Leave';
                    leaveData.reason = `[${halfDayTypeLabel}] ${leaveForm.reason}`;
                }
                
                // Add time fields for extra time leave and half day leave
                if (leaveForm.type === LeaveCategory.EXTRA_TIME) {
                    if (!leaveForm.startTime || !leaveForm.endTime) {
                        alert('Please provide both start time and end time for Extra Time Leave');
                        return;
                    }
                    leaveData.startTime = leaveForm.startTime;
                    leaveData.endTime = leaveForm.endTime;
                } else if (leaveForm.type === LeaveCategory.HALF_DAY) {
                    if (!leaveForm.startTime) {
                        alert('Please provide start time for Half Day Leave');
                        return;
                    }
                    leaveData.startTime = leaveForm.startTime;
                    // For half day, end time is optional or can be calculated
                    if (leaveForm.endTime) {
                        leaveData.endTime = leaveForm.endTime;
                    }
                }
                
                requestLeave(leaveData);
                // Reset form but keep the selected leave type (don't force change to Paid Leave)
                setLeaveForm({ 
                    start: '', 
                    end: '', 
                    type: leaveForm.type, // Keep the selected type
                    reason: '', 
                    halfDayTime: 'morning',
                    halfDayLeaveType: 'paid', // Reset to default
                    startTime: '',
                    endTime: ''
                }); 
            }} className="space-y-4">
                <div className={`grid gap-4 ${leaveForm.type === LeaveCategory.HALF_DAY ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{leaveForm.type === LeaveCategory.HALF_DAY ? 'Date' : 'From'}</label>
                    <input type="date" className="w-full p-2 border rounded text-sm" required value={leaveForm.start} onChange={e => setLeaveForm({...leaveForm, start: e.target.value})} />
                </div>
                {leaveForm.type !== LeaveCategory.HALF_DAY && (
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                    <input type="date" className="w-full p-2 border rounded text-sm" required value={leaveForm.end} onChange={e => setLeaveForm({...leaveForm, end: e.target.value})} />
                </div>
                )}
                </div>
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select 
                    className="w-full p-2 border rounded text-sm" 
                    value={leaveForm.type} 
                    onChange={(e) => {
                        const selectedType = e.target.value as LeaveCategory;
                        // Only prevent selecting Paid Leave if exhausted, allow all other types freely
                        if (selectedType === LeaveCategory.PAID && isPaidLeaveExhausted) {
                            alert(`All ${TOTAL_PAID_LEAVES} paid leaves have been used. Please select another leave type.`);
                            // Don't change the type, keep current selection
                            return;
                        }
                        // Allow selection of any leave type (Extra Time Leave, Unpaid Leave, Half Day Leave, etc.)
                        setLeaveForm({...leaveForm, type: selectedType});
                    }}
                >
                    {Object.values(LeaveCategory).map(c => (
                        <option 
                            key={c} 
                            value={c}
                            disabled={c === LeaveCategory.PAID && isPaidLeaveExhausted}
                        >
                            {c}{c === LeaveCategory.PAID && isPaidLeaveExhausted ? ' (Exhausted)' : ''}
                        </option>
                    ))}
                </select>
                {leaveForm.type === LeaveCategory.PAID && isPaidLeaveExhausted && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">
                        ⚠️ All paid leaves have been used. Please select another leave type.
                    </p>
                )}
                {leaveForm.type === LeaveCategory.PAID && !isPaidLeaveExhausted && (
                    <p className="text-xs text-blue-600 mt-1">
                        Available: {availablePaidLeaves} paid leave(s) remaining
                    </p>
                )}
                </div>
                {leaveForm.type === LeaveCategory.HALF_DAY && (
                <>
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Time <span className="text-red-500">*</span></label>
                <input 
                    type="time" 
                    className="w-full p-2 border rounded text-sm" 
                    required
                    value={leaveForm.startTime} 
                    onChange={e => setLeaveForm({...leaveForm, startTime: e.target.value})} 
                />
                </div>
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Deduct From</label>
                <select 
                    className="w-full p-2 border rounded text-sm" 
                    value={leaveForm.halfDayLeaveType} 
                    onChange={(e) => {
                        const selectedType = e.target.value;
                        if (selectedType === 'paid' && availablePaidLeaves < 0.5) {
                            alert(`You need at least 0.5 paid leave(s) remaining. You only have ${availablePaidLeaves} paid leave(s) remaining.`);
                            return;
                        }
                        setLeaveForm({...leaveForm, halfDayLeaveType: selectedType});
                    }}
                >
                    <option value="paid">Paid Leave (0.5 days)</option>
                    <option value="extraTime">Extra Time Leave (4 hours)</option>
                </select>
                {leaveForm.halfDayLeaveType === 'paid' && availablePaidLeaves < 0.5 && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">
                        ⚠️ You need at least 0.5 paid leave(s) remaining. Available: {availablePaidLeaves}
                    </p>
                )}
                {leaveForm.halfDayLeaveType === 'paid' && availablePaidLeaves >= 0.5 && (
                    <p className="text-xs text-blue-600 mt-1">
                        Will deduct 0.5 days from paid leave. Available: {availablePaidLeaves} paid leave(s)
                    </p>
                )}
                {leaveForm.halfDayLeaveType === 'extraTime' && (
                    <p className="text-xs text-orange-600 mt-1">
                        Will add 4 hours to Extra Time Leave taken
                    </p>
                )}
                </div>
                </>
                )}
                {leaveForm.type === LeaveCategory.EXTRA_TIME && (
                <>
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Time <span className="text-red-500">*</span></label>
                <input 
                    type="time" 
                    className="w-full p-2 border rounded text-sm" 
                    required
                    value={leaveForm.startTime} 
                    onChange={e => setLeaveForm({...leaveForm, startTime: e.target.value})} 
                />
                </div>
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Time <span className="text-red-500">*</span></label>
                <input 
                    type="time" 
                    className="w-full p-2 border rounded text-sm" 
                    required
                    value={leaveForm.endTime} 
                    onChange={e => setLeaveForm({...leaveForm, endTime: e.target.value})} 
                />
                </div>
                </>
                )}
                <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                <textarea className="w-full p-2 border rounded text-sm h-16" required placeholder="Describe reason..." value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})}></textarea>
                </div>
                <Button type="submit" className="w-full">Submit Request</Button>
            </form>
          </Card>

           <div className="space-y-6 lg:col-span-1">
                {/* Paid Leave Balance */}
                <Card title="Paid Leave Balance" className="h-fit">
                    <div className={`p-4 rounded-lg border ${
                        availablePaidLeaves > 0 
                            ? 'bg-blue-50 border-blue-100' 
                            : 'bg-red-50 border-red-100'
                    }`}>
                        <div className="space-y-4">
                            {/* Summary Row */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Yearly Summary</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Admin Allocated: {user?.paidLeaveAllocation || 0}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-3xl font-bold ${
                                        availablePaidLeaves > 0 ? 'text-blue-700' : 'text-red-700'
                                    }`}>
                                        {availablePaidLeaves}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Remaining</p>
                                </div>
                            </div>

                            {/* Breakdown Table */}
                            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 uppercase mb-1">Allocated</p>
                                    <p className="text-lg font-bold text-gray-800">{TOTAL_PAID_LEAVES}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 uppercase mb-1">Used</p>
                                    <p className="text-lg font-bold text-orange-600">{usedPaidLeaves}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 uppercase mb-1">Remaining</p>
                                    <p className={`text-lg font-bold ${availablePaidLeaves > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {availablePaidLeaves}
                                    </p>
                                </div>
                            </div>

                            {/* Last Allocated Date */}
                            {user?.paidLeaveLastAllocatedDate && (
                                <div className="pt-2 border-t border-gray-200">
                                    <p className="text-xs text-gray-500">
                                        Last Allocated: <span className="font-semibold text-gray-700">{formatDate(user.paidLeaveLastAllocatedDate)}</span>
                                    </p>
                                </div>
                            )}

                            {/* Warning Message */}
                            {isPaidLeaveExhausted && (
                                <div className="mt-3 p-2 bg-red-100 rounded border border-red-200">
                                    <p className="text-xs font-semibold text-red-700">
                                        ⚠️ All paid leaves have been used. Please use other leave types.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Extra Time Leave Balance */}
                {extraTimeLeaveDays > 0 && (
                    <Card title="Extra Time Leave Balance" className="h-fit">
                        <div className={`p-4 rounded-lg border ${
                            remainingExtraTimeLeaveHours > 0 
                                ? 'bg-orange-50 border-orange-100' 
                                : 'bg-green-50 border-green-100'
                        }`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Remaining Extra Time</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        You must work extra time to compensate for Extra Time Leave
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-3xl font-bold ${
                                        remainingExtraTimeLeaveHours > 0 ? 'text-orange-700' : 'text-green-700'
                                    }`}>
                                        {formatHoursToHoursMinutes(remainingExtraTimeLeaveHours)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Remaining
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Extra Time Leave Taken:</span>
                                    <span className="font-semibold text-gray-800">{formatHoursToHoursMinutes(extraTimeLeaveHours)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Extra Time Worked (Final Time):</span>
                                    <span className="font-semibold text-gray-800">
                                        {extraTimeWorkedHours >= 0 ? '+' : ''}{formatHoursToHoursMinutes(Math.abs(extraTimeWorkedHours))}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Remaining Balance:</span>
                                    <span className={`font-semibold ${
                                        remainingExtraTimeLeaveHours > 0 ? 'text-orange-700' : 'text-green-700'
                                    }`}>
                                        {formatHoursToHoursMinutes(remainingExtraTimeLeaveHours)}
                                    </span>
                                </div>
                            </div>
                            {remainingExtraTimeLeaveHours > 0 && isMonthEnd && (
                                <div className="mt-3 p-2 bg-red-100 rounded border border-red-200">
                                    <p className="text-xs font-semibold text-red-700">
                                        ⚠️ Month end: {formatHoursToHoursMinutes(remainingExtraTimeLeaveHours)} will be added to Low Time
                                    </p>
                                </div>
                            )}
                            {remainingExtraTimeLeaveHours > 0 && !isMonthEnd && (
                                <div className="mt-3 p-2 bg-orange-100 rounded border border-orange-200">
                                    <p className="text-xs font-semibold text-orange-700">
                                        ⚠️ Work extra time to complete: {formatDurationStyled(remainingExtraTimeLeaveSeconds)}
                                    </p>
                                </div>
                            )}
                            {remainingExtraTimeLeaveHours <= 0 && (
                                <div className="mt-3 p-2 bg-green-100 rounded border border-green-200">
                                    <p className="text-xs font-semibold text-green-700">
                                        ✅ All Extra Time Leave compensated!
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Current Month Time Statistics */}
                <Card title={`Current Month Time Summary (${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })})`} className="h-fit">
                    <div className="space-y-4">
                        {/* Total Low Time */}
                        <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Total Low Time</p>
                                    <p className="text-xs text-red-600 mt-1">Time less than 8:15</p>
                                    {isMonthEnd && remainingExtraTimeLeaveHours > 0 && (
                                        <p className="text-xs text-orange-600 mt-1 font-semibold">
                                            + {formatDurationStyled(remainingExtraTimeLeaveSeconds)} (uncompleted Extra Time Leave)
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-red-700">{formatDurationStyled(adjustedLowTimeSeconds)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Total Extra Time */}
                        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Total Extra Time</p>
                                    <p className="text-xs text-green-600 mt-1">Time more than 8:30</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-green-700">{formatDurationStyled(totalExtraTimeSeconds)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Final Time Difference */}
                        <div className={`p-4 rounded-lg border ${finalTimeDifferenceAdjusted >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: finalTimeDifferenceAdjusted >= 0 ? '#1e40af' : '#ea580c' }}>
                                        Final Time
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: finalTimeDifferenceAdjusted >= 0 ? '#2563eb' : '#f97316' }}>
                                        {finalTimeDifferenceAdjusted >= 0 ? 'Extra - Low' : 'Low - Extra'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-2xl font-bold ${finalTimeDifferenceAdjusted >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                        {finalTimeDifferenceAdjusted >= 0 ? '+' : '-'}{formatDurationStyled(Math.abs(finalTimeDifferenceAdjusted))}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {currentMonthAttendance.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-2">No attendance records for this month</p>
                        )}
                    </div>
                </Card>

                {/* Upcoming Holidays */}
                <Card title="Upcoming Holidays">
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                        {(() => {
                            // Filter out past holidays - only show upcoming ones
                            const upcomingHolidays = companyHolidays.filter(h => h.status !== 'past');
                            return upcomingHolidays.length === 0 ? (
                                <p className="text-gray-400 text-center py-4 text-sm">No upcoming holidays.</p>
                            ) : (
                                upcomingHolidays.map(h => (
                                    <div key={h.id} className="flex items-center gap-3 p-2 bg-blue-50 rounded border border-blue-100">
                                        <Calendar size={16} className="text-blue-500" />
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">{h.description}</p>
                                            <p className="text-xs text-gray-500">{formatDate(h.date)}</p>
                                        </div>
                                    </div>
                                ))
                            );
                        })()}
                    </div>
                </Card>
            </div>
      </div>

      {/* Attendance History Table (FR20) */}
      <Card title="My Attendance History">
         <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b sticky top-0">
                    <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Check In</th>
                        <th className="px-4 py-3">Check Out</th>
                        <th className="px-4 py-3">Breaks</th>
                        <th className="px-4 py-3">Worked</th>
                        <th className="px-4 py-3">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {myAttendanceHistory.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-4">No records found.</td></tr>
                    ) : (
                        myAttendanceHistory.map(r => {
                            // Find if there's an approved half day leave for this date
                            const halfDayLeave = myLeaves.find(l => {
                                const status = String(l.status || '').trim();
                                const isApproved = status === 'Approved' || status === LeaveStatus.APPROVED;
                                if (!isApproved || l.category !== LeaveCategory.HALF_DAY) return false;
                                const leaveDate = new Date(l.startDate).toISOString().split('T')[0];
                                return leaveDate === r.date;
                            });
                            
                            return (
                                <tr key={r.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        <div>{formatDate(r.date)}</div>
                                        {halfDayLeave && halfDayLeave.startTime && (
                                            <div className="text-xs text-purple-600 mt-1 font-semibold">
                                                Half Day Leave: {halfDayLeave.startTime}
                                                {halfDayLeave.endTime && ` - ${halfDayLeave.endTime}`}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">{formatTime(r.checkIn, systemSettings.timezone)}</td>
                                    <td className="px-4 py-3 font-mono text-xs">{formatTime(r.checkOut, systemSettings.timezone)}</td>
                                    <td className="px-4 py-3 text-xs">{r.breaks.length} breaks</td>
                                    <td className="px-4 py-3 font-mono font-bold">{formatDuration(r.totalWorkedSeconds)}</td>
                                    <td className="px-4 py-3">
                                        {r.lowTimeFlag && <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Low</span>}
                                        {r.extraTimeFlag && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Extra</span>}
                                        {!r.lowTimeFlag && !r.extraTimeFlag && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Normal</span>}
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
         </div>
      </Card>

      {/* Current Month Leaves */}
      <Card title={`Current Month Leaves (${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })})`}>
        {myLeaves.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">No leaves found.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-2">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-800">
                  Total Leave: {totalLeaveDays} {totalLeaveDays === 1 ? 'day' : 'days'}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  (Working days, Sundays excluded)
                </span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg"
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
                  className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg"
                  value={leaveFilterDate}
                  onChange={e => setLeaveFilterDate(e.target.value)}
                  placeholder="Filter by date"
                />
                <input
                  type="month"
                  className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg"
                  value={leaveFilterMonth}
                  onChange={e => setLeaveFilterMonth(e.target.value)}
                  placeholder="Filter by month"
                />
              </div>
            </div>
            {statusFilteredLeaves.length === 0 ? (
              <p className="text-gray-400 text-center py-4 text-sm">No leaves match the selected filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3">Date Range</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusFilteredLeaves.map(leave => {
                      const days = calculateLeaveDays(leave.startDate, leave.endDate);
                      
                      // Helper function to calculate end time for half day leave (add 4 hours)
                      const calculateHalfDayEndTime = (startTime: string): string => {
                        if (!startTime) return '';
                        const [hours, minutes] = startTime.split(':').map(Number);
                        const startMinutes = hours * 60 + minutes;
                        const endMinutes = startMinutes + 240; // 4 hours = 240 minutes
                        const endHours = Math.floor(endMinutes / 60) % 24;
                        const endMins = endMinutes % 60;
                        return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
                      };
                      
                      // Get end time for half day leave
                      const isHalfDay = leave.category === LeaveCategory.HALF_DAY;
                      const isApproved = (leave.status === 'Approved' || leave.status === LeaveStatus.APPROVED);
                      const halfDayEndTime = isHalfDay && isApproved && leave.startTime 
                        ? (leave.endTime || calculateHalfDayEndTime(leave.startTime))
                        : null;
                      
                      return (
                        <tr key={leave.id} className="bg-white border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div>{formatDate(leave.startDate)} - {formatDate(leave.endDate)}</div>
                            {isHalfDay && isApproved && leave.startTime && (
                              <div className="text-xs text-gray-500 mt-1">
                                Start Time: {leave.startTime} {halfDayEndTime && `- End Time: ${halfDayEndTime}`}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{leave.category}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-[10px] rounded-full font-bold uppercase tracking-wider
                              ${(leave.status === 'Approved' || leave.status === LeaveStatus.APPROVED) ? 'bg-green-100 text-green-700' : 
                              (leave.status === 'Rejected' || leave.status === LeaveStatus.REJECTED) ? 'bg-red-100 text-red-700' : 
                              'bg-yellow-100 text-yellow-700'}`}>
                              {leave.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {days} {days === 1 ? 'day' : 'days'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate" title={leave.reason}>
                            {leave.reason}
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
      </Card>
    </div>
  );
};
