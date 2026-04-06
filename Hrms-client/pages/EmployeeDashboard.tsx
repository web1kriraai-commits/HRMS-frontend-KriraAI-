import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BreakType, LeaveCategory, LeaveStatus, User } from '../types';
import { getTodayStr, formatDuration, formatTime, formatDate, convertToDDMMYYYY, isPenaltyEffective, calculateLatenessPenaltySeconds, calculateDailyTimeStats, ABSENCE_PENALTY_EFFECTIVE_DATE, getLocalISOString, getAbsenceStartDate } from '../services/utils';
import { Clock, Coffee, AlertCircle, Bell, Calendar, X, RotateCcw, Timer, MessageSquare } from 'lucide-react';
import { attendanceAPI, leaveAPI, holidayAPI, notificationAPI } from '../services/api';
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

// Helper to format penalty duration (e.g. 900 -> 15m, 3720 -> 1h 2m)
const formatPenaltyDisplay = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

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

// Get total paid leaves for a user (only admin allocated)
const getTotalPaidLeaves = (user?: User | null) => {
  // Only show admin allocated paid leaves (no default)
  return user?.paidLeaveAllocation || 0;
};

const formatDisplayDays = (val: number) => {
  if (typeof val !== 'number') return val;
  // Format to 2 decimals max, removing trailing zeros
  return Math.round(val * 100) / 100;
};

export const EmployeeDashboard: React.FC = () => {
  const { auth, attendanceRecords, clockIn, clockOut, startBreak, endBreak, requestLeave, leaveRequests, notifications, companyHolidays, systemSettings, refreshData, updateLeaveStatus } = useApp();
  const user = auth.user;

  // Real-time timer
  const [elapsed, setElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0); // Break duration timer
  const [todayRecord, setTodayRecord] = useState(attendanceRecords.find(r => r.userId === user?.id && r.date === getTodayStr()));
  const [isResolvingAbsence, setIsResolvingAbsence] = useState(false);
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
  // Extra break reason state
  const [extraBreakReason, setExtraBreakReason] = useState('');
  const [showExtraBreakReasonInput, setShowExtraBreakReasonInput] = useState(false);
  const [showManualLogModal, setShowManualLogModal] = useState(false);
  const [manualHoursInput, setManualHoursInput] = useState('');
  const [manualMinutesInput, setManualMinutesInput] = useState('');
  const [manualNoteInput, setManualNoteInput] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [showCheckoutRequestModal, setShowCheckoutRequestModal] = useState(false);
  const [checkoutRequestNote, setCheckoutRequestNote] = useState('');
  const [isSubmittingCheckoutRequest, setIsSubmittingCheckoutRequest] = useState(false);

  // Overtime Request States
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeMinutes, setOvertimeMinutes] = useState<number>(0);
  const [overtimeTargetDate, setOvertimeTargetDate] = useState<string | null>(null);
  const [isSubmittingOvertime, setIsSubmittingOvertime] = useState(false);

  // On mount: if page was reloaded (refresh), auto-cancel any lingering Pause break
  useEffect(() => {
    const cancelPauseOnReload = async () => {
      try {
        const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';
        if (!isReload) return;

        // Wait briefly for attendanceRecords to populate via the initial data fetch
        const token = localStorage.getItem('token');
        if (!token) return;

        // Fetch today's record directly to check for an active Pause break
        const todayData = await attendanceAPI.getToday().catch(() => null) as any;
        if (!todayData) return;
        
        const pauseBreak = (todayData?.breaks || []).find((b: any) => !b.end && b.type === 'Pause');
        if (pauseBreak) {
          await attendanceAPI.cancelBreak().catch(() => null);
          setLocalBreakStartTime(null);
          // Refresh data after canceling pause
          await refreshData();
        }
      } catch (err) {
        console.error('Auto-cancel pause on reload error:', err);
      }
    };
    cancelPauseOnReload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

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
      // Don't restore a Pause break on page load — it will be auto-canceled by the reload handler above
      if (activeBreak.type !== 'Pause') {
        const breakStart = new Date(activeBreak.start);
        if (!localBreakStartTime || Math.abs(breakStart.getTime() - localBreakStartTime.getTime()) > 2000) {
          setLocalBreakStartTime(breakStart);
        }
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

  // Auto-pause logic: removed beforeunload trigger to prevent false pauses on page refresh.
  // Users can manually use the "Resume Work" button if they need to cancel an accidental pause.

  // Resume (Mistake) handler
  const handleResumeMistake = useCallback(async () => {
    try {
      await attendanceAPI.cancelBreak();
      setLocalBreakStartTime(null);
      setConfirmationPopup(null); // Close the popup
      await refreshData();
    } catch (error) {
      console.error('Error canceling break:', error);
      setConfirmationPopup(null); // Close the popup even on error
    }
  }, [refreshData]);



  // Check if standard break already taken today
  const hasStandardBreak = todayRecord?.breaks.some(b => b.type === 'Standard' && b.end) || false;
  const activeBreakObj = todayRecord?.breaks.find(b => !b.end);
  const activeBreakType = activeBreakObj?.type;
  const activeBreakStartTime = localBreakStartTime ? localBreakStartTime : (activeBreakObj ? new Date(activeBreakObj.start) : null);

  // Handler for ending break
  const handleEndBreak = useCallback(async () => {
    // ENFORCE 20 MINUTE BREAK (1200 seconds)
    if (breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled) {
      const remainingSecs = Math.ceil(1200 - breakElapsed);
      const remainingMins = Math.ceil(remainingSecs / 60);
      setConfirmationPopup({
        show: true,
        title: '⚠️ Break Progress',
        message: `Mandatory Break Policy: You must take at least 20 minutes of break. Please wait ${remainingMins} more minute(s).`,
        onConfirm: () => setConfirmationPopup(null),
        onCancel: () => setConfirmationPopup(null),
      });
      return;
    }

    setLocalBreakStartTime(null);
    try {
      await endBreak();
      setConfirmationPopup(null); // Close the popup
    } catch (error) {
      // Restore break state on error
      if (activeBreakStartTime) {
        setLocalBreakStartTime(activeBreakStartTime);
      }
      setConfirmationPopup(null); // Close the popup even on error
      throw error;
    }
  }, [endBreak, activeBreakStartTime, breakElapsed]);

  const handleAddManualHours = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalHours = Number(manualHoursInput || 0) + (Number(manualMinutesInput || 0) / 60);
    
    if (totalHours <= 0 || totalHours > 24) {
      alert('Please enter a valid work duration between 1 minute and 24 hours');
      return;
    }

    setIsSubmittingManual(true);
    try {
      await attendanceAPI.addManualHours(getTodayStr(), totalHours, manualNoteInput);
      setShowManualLogModal(false);
      setManualHoursInput('');
      setManualMinutesInput('');
      setManualNoteInput('');
      await refreshData();
    } catch (error) {
      console.error('Error adding manual hours:', error);
      alert('Failed to add manual hours. Please try again.');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleRequestEarlyCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutRequestNote.trim()) return;
    setIsSubmittingCheckoutRequest(true);
    try {
      await attendanceAPI.requestEarlyCheckout(checkoutRequestNote.trim());
      setShowCheckoutRequestModal(false);
      setCheckoutRequestNote('');
      await refreshData();
      alert('Early checkout request sent successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to send early checkout request.');
    } finally {
      setIsSubmittingCheckoutRequest(false);
    }
  };

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



  const myLeaves = leaveRequests.filter(l => l.userId === user?.id);
  const myNotifications = notifications.filter(n => n.userId === user?.id);
  const myAttendanceHistory = attendanceRecords.filter(r => r.userId === user?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
  const isFullDayLeaveToday = todayLeave && todayLeave.category !== LeaveCategory.HALF_DAY;
  const isHalfDayLeaveToday = todayLeave && todayLeave.category === LeaveCategory.HALF_DAY;
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

  // Move these up to fix ReferenceErrors in helper functions and initial render logic
  const holidayDateSet = useMemo(() => new Set(
    companyHolidays.map(h => {
      const dateStr = typeof h.date === 'string' ? h.date : new Date(h.date).toISOString().split('T')[0];
      return dateStr.split('T')[0];
    })
  ), [companyHolidays]);

  const attendanceMap = useMemo(() => {
    const map = new Map();
    myAttendanceHistory.forEach(record => {
      const dateStr = typeof record.date === 'string' ? record.date.split('T')[0] : record.date;
      map.set(dateStr, record);
    });
    return map;
  }, [myAttendanceHistory]);

  const approvedLeaveDates = useMemo(() => {
    const set = new Set();
    myLeaves.filter(l => {
      const status = (l.status || '').trim();
      return status === 'Approved' || status === LeaveStatus.APPROVED;
    }).forEach(l => {
      let curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        set.add(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
      }
    });
    return set;
  }, [myLeaves]);

  // Month filter for Time Summary card — default to current month
  const [timeSummaryMonth, setTimeSummaryMonth] = useState<string>(
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  );

  // Calculate working days (excluding Sundays and holidays) between two dates
  const calculateLeaveDays = (startDateStr: string, endDateStr: string, limitStart?: Date, limitEnd?: Date) => {
    if (!startDateStr || !endDateStr) return 0;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
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

  // Compute overtime history (approved/pending/rejected requests)
  const overtimeHistory = useMemo(() => {
    return myAttendanceHistory.filter(r => r.overtimeRequest && r.overtimeRequest.status && r.overtimeRequest.status !== 'None')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [myAttendanceHistory]);

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
    let limitStart, limitEnd;
    if (leaveFilterMonth) {
      const [y, m] = leaveFilterMonth.split('-').map(Number);
      limitStart = new Date(y, m - 1, 1);
      limitEnd = new Date(y, m, 0, 23, 59, 59);
    }
    return sum + calculateLeaveDays(leave.startDate, leave.endDate, limitStart, limitEnd);
  }, 0);

  // Calculate used paid leaves (only approved ones)
  // Includes full paid leaves and all half-day leaves (merged logic)
  const baseUsedPaidLeaves = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      
      if (leave.category === LeaveCategory.PAID) return true;
      if (leave.category === LeaveCategory.HALF_DAY) {
        // Only count as paid if it's NOT marked as Extra Time Leave or Unpaid Leave in reason
        const reason = leave.reason || '';
        return !reason.includes('[Extra Time Leave]') && !reason.includes('[Unpaid Leave]');
      }
      return false;
    })
    .reduce((sum, leave) => {
      if (leave.category === LeaveCategory.HALF_DAY) {
        return sum + 0.5;
      }
      return sum + calculateLeaveDays(leave.startDate, leave.endDate);
    }, 0);

  // Extra Time Leave Total (Days)
  const baseExtraTimeLeaveDays = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      
      if (leave.category === LeaveCategory.EXTRA_TIME) return true;
      if (leave.category === LeaveCategory.HALF_DAY) {
        return (leave.reason || '').includes('[Extra Time Leave]');
      }
      return false;
    })
    .reduce((sum, leave) => {
      if (leave.category === LeaveCategory.HALF_DAY) {
        return sum + 0.5;
      }
      return sum + calculateLeaveDays(leave.startDate, leave.endDate);
    }, 0);

  // Unpaid Leave Total (Days)
  const baseUnpaidLeaveDays = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      
      if (leave.category === LeaveCategory.UNPAID) return true;
      if (leave.category === LeaveCategory.HALF_DAY) {
        return (leave.reason || '').includes('[Unpaid Leave]');
      }
      return false;
    })
    .reduce((sum, leave) => {
      if (leave.category === LeaveCategory.HALF_DAY) {
        return sum + 0.5;
      }
      return sum + calculateLeaveDays(leave.startDate, leave.endDate);
    }, 0);

  // Incorporate manual adjustments from user object
  const manualPaidAdjustment = user?.manualPaidLeaveAdjustment || 0;
  const manualHalfDayAdjustment = user?.manualHalfDayLeaveAdjustment || 0;
  const manualExtraAdjustment = user?.manualExtraTimeAdjustment || 0;
  const manualUnpaidAdjustment = user?.manualUnpaidLeaveAdjustment || 0;
  
  const usedPaidLeaves = baseUsedPaidLeaves + manualPaidAdjustment + manualHalfDayAdjustment;
  const totalExtraTimeUsed = baseExtraTimeLeaveDays + manualExtraAdjustment;
  const totalUnpaidUsed = baseUnpaidLeaveDays + manualUnpaidAdjustment;

  // Get total paid leaves allocation (custom or default)
  const TOTAL_PAID_LEAVES = getTotalPaidLeaves(user);
  const availablePaidLeaves = TOTAL_PAID_LEAVES - usedPaidLeaves;
  const isPaidLeaveExhausted = availablePaidLeaves <= 0;


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
  // Normal time: 8:15 to 8:22, Low < 8:15, Extra > 8:22
  const MIN_NORMAL_SECONDS = (8 * 3600) + (15 * 60); // 8 hours 15 minutes = 29700 seconds
  const MAX_NORMAL_SECONDS = (8 * 3600) + (22 * 60); // 8 hours 22 minutes = 30120 seconds
  const currentMonthStr = timeSummaryMonth; // driven by month picker
  const selectedMonthDate = timeSummaryMonth
    ? (() => { const [y, m] = timeSummaryMonth.split('-').map(Number); return new Date(y, m - 1, 1); })()
    : new Date(currentYear, currentMonth, 1);
  const selectedMonthLabel = selectedMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const currentMonthAttendance = myAttendanceHistory.filter(r => {
    return typeof r.date === 'string' && r.date.startsWith(currentMonthStr);
  });

  let totalLowTimeSeconds = 0;
  let totalExtraTimeSeconds = 0;



  // Iterate through all days of the month until today
  const [year, month] = timeSummaryMonth.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const nowDay = new Date();
  const endDate = lastOfMonth < nowDay ? lastOfMonth : nowDay;

  const firstCheckInDate = myAttendanceHistory
    .filter(r => r.checkIn)
    .sort((a, b) => {
      const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
      const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
      return d1.localeCompare(d2);
    })[0]?.date;

  for (let iter = new Date(startDate); iter <= endDate; iter.setDate(iter.getDate() + 1)) {
    const dateStr = getLocalISOString(iter);
    const dayOfWeek = iter.getDay(); // 0 = Sunday
    const isHolidayDay = holidayDateSet.has(dateStr);
    const record = attendanceMap.get(dateStr);
    const hasApprovedLeave = approvedLeaveDates.has(dateStr);

    // Case 1: Existing record (worked, partial, or zero-worked with penalty)
    if (record) {
      const netWorkedRaw = record.totalWorkedSeconds || 0;
      // NOTE: totalWorkedSeconds already has penalty deducted by the backend
      // (attendanceController stores: totalWorkedSeconds = worked - penaltySeconds)
      // so we do NOT subtract penaltySeconds again here to avoid double-counting
      let effectiveWorkedSeconds = netWorkedRaw;

      // Check for approved Extra Time Leave (Full Day category) for this date
      const extraTimeLeaveForDate = myLeaves.find(leave => {
        const status = (leave.status || '').trim();
        if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
        if (leave.category !== LeaveCategory.EXTRA_TIME) return false;
        const leaveStart = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : leave.startDate;
        const leaveEnd = typeof leave.endDate === 'string' ? leave.endDate.split('T')[0] : leave.endDate;
        return dateStr >= leaveStart && dateStr <= leaveEnd;
      });

      if (extraTimeLeaveForDate) {
        if (extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime) {
          const leaveHours = calculateHoursPerDay(extraTimeLeaveForDate.startTime, extraTimeLeaveForDate.endTime);
          effectiveWorkedSeconds += leaveHours * 3600;
        } else {
          effectiveWorkedSeconds += 8.25 * 3600;
        }
      }

      // Calculate approved half-day leave for this date
      const hasApprovedHalfDay = myLeaves.some(l => {
        const status = (l.status || '').trim();
        if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
        if (l.category !== LeaveCategory.HALF_DAY) return false;
        const leaveDate = typeof l.startDate === 'string' ? l.startDate.split('T')[0] : l.startDate;
        return leaveDate === dateStr;
      });

      const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
      const { lowTimeSeconds, extraTimeSeconds } = calculateDailyTimeStats(effectiveWorkedSeconds, hasApprovedHalfDay, isHolidayDay, approvedOT, dateStr);
      // Only count low time if the day is finalized (has checkOut).
      // This prevents "In Progress" sessions (today or past missed checkouts) 
      // from showing a full deficit in the monthly summary.
      if (record.checkOut) {
        totalLowTimeSeconds += lowTimeSeconds;
      }
      totalExtraTimeSeconds += extraTimeSeconds;
    } 
    // Case 2: Absent day (No record, no leave, not Sunday, not holiday)
    else if (!record && !hasApprovedLeave && dayOfWeek !== 0 && !isHolidayDay) {
      // This is an unexcused absence -> full deficit of 8.25h ONLY on or after effective date
      // AND strictly before today (don't mark today as absent before it's over)
      const todayStr = getTodayStr();
      const absenceStart = getAbsenceStartDate(user, firstCheckInDate);
      if (dateStr >= absenceStart && dateStr < todayStr) {
        totalLowTimeSeconds += (8.25 * 3600);
      }
    }
  }

  // Calculate Extra Time Leave tracking
  // Calculate approved Extra Time Leave days (only approved ones)
  // Includes full extra time leaves and half-day leaves marked as extra time
  const extraTimeLeaveDays = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;

      // Filter by selected month
      const [year, month] = timeSummaryMonth.split('-').map(Number);
      const mStart = new Date(year, month - 1, 1);
      const mEnd = new Date(year, month, 0, 23, 59, 59);
      const s = new Date(leave.startDate);
      const e = new Date(leave.endDate);
      const overlaps = (s <= mEnd && e >= mStart);
      if (!overlaps) return false;

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
      const [year, month] = timeSummaryMonth.split('-').map(Number);
      const mStart = new Date(year, month - 1, 1);
      const mEnd = new Date(year, month, 0, 23, 59, 59);

      if (leave.category === LeaveCategory.EXTRA_TIME) {
        return sum + calculateLeaveDays(leave.startDate, leave.endDate, mStart, mEnd);
      } else if (leave.category === LeaveCategory.HALF_DAY) {
        // Half-day leaves count as 0.5 days for calculation
        return sum + 0.5;
      }
      return sum;
    }, 0) + manualExtraAdjustment; // Total days including manual


  // Convert Extra Time Leave to hours
  // For extra time leave: calculate actual hours from start and end time
  // Half-days: 0.5 day = 4 hours (as per requirement)
  const baseExtraTimeLeaveHours = myLeaves
    .filter(leave => {
      const status = (leave.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;

      // Filter by selected month
      const [year, month] = timeSummaryMonth.split('-').map(Number);
      const mStart = new Date(year, month - 1, 1);
      const mEnd = new Date(year, month, 0, 23, 59, 59);
      const s = new Date(leave.startDate);
      const e = new Date(leave.endDate);
      const overlaps = (s <= mEnd && e >= mStart);
      if (!overlaps) return false;

      if (leave.category === LeaveCategory.EXTRA_TIME) return true;

      if (leave.category === LeaveCategory.HALF_DAY) {
        const reason = leave.reason || '';
        return reason.includes('[Extra Time Leave]');
      }

      return false;
    })
    .reduce((sum, leave) => {
      const [year, month] = timeSummaryMonth.split('-').map(Number);
      const mStart = new Date(year, month - 1, 1);
      const mEnd = new Date(year, month, 0, 23, 59, 59);

      if (leave.category === LeaveCategory.EXTRA_TIME) {
        // For extra time leave: (end time - start time) * number of days within boundary
        const hasTimeFields = leave.startTime && leave.endTime &&
          leave.startTime.trim() !== '' && leave.endTime.trim() !== '';

        if (hasTimeFields) {
          // Calculate hours per day: (end time - start time)
          const hoursPerDay = calculateHoursPerDay(leave.startTime, leave.endTime);

          // Calculate number of days (excluding Sundays and holidays) within boundary
          const numberOfDays = calculateLeaveDays(leave.startDate, leave.endDate, mStart, mEnd);

          // Total hours = hours per day * number of days
          const totalHours = hoursPerDay * numberOfDays;

          if (totalHours > 0) {
            return sum + totalHours;
          }
        }
        // Fallback to old calculation only if time fields are missing or invalid
        return sum + (calculateLeaveDays(leave.startDate, leave.endDate, mStart, mEnd) * 8.25);
      } else if (leave.category === LeaveCategory.HALF_DAY) {
        // Half-day extra time leave: 4 hours
        return sum + 4;
      }
      return sum;
    }, 0);

  // Forwarding: forwardedOut = time sent out from this month, forwardedIn = time received into this month
  const forwardedOutSeconds = (user?.forwardedMonths?.[timeSummaryMonth] || 0);
  const forwardedInSeconds = (user?.forwardedInMonths?.[timeSummaryMonth] || 0);
  
  // Display variables for UI cards (actual worked + forwarded in)
  const displayLowTimeSeconds = totalLowTimeSeconds + (forwardedInSeconds < 0 ? Math.abs(forwardedInSeconds) : 0);
  const displayExtraTimeSeconds = totalExtraTimeSeconds + (forwardedInSeconds > 0 ? forwardedInSeconds : 0);

  // extraTimeLeaveHours for balance subtraction (no global pool, uses per-month forwarding)
  const extraTimeLeaveHours = baseExtraTimeLeaveHours;

  // Calculate Final Time (net difference between extra time and low time - forwarded out + forwarded in)
  // Formula: Net = (Extra - Low) - Sent + Prev
  const finalTimeDifference = totalExtraTimeSeconds - totalLowTimeSeconds - forwardedOutSeconds + forwardedInSeconds;

  // Identify all unresolved absences since ABSENCE_PENALTY_EFFECTIVE_DATE
  const unresolvedAbsenceDates = useMemo(() => {
    if (!user || isCheckedIn) return [];
    
    const absenceStart = getAbsenceStartDate(user, firstCheckInDate);
    const start = new Date(absenceStart);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Create local sets for faster lookup
    const localAttendanceSet = new Set(myAttendanceHistory.map(r => typeof r.date === 'string' ? r.date.split('T')[0] : r.date));
    const localLeaveDateSet = new Set();
    myLeaves.filter(l => {
        const s = String(l.status || '').trim();
        return s === 'Approved' || s === LeaveStatus.APPROVED || s === 'Pending' || s === LeaveStatus.PENDING;
    }).forEach(l => {
        let curr = new Date(l.startDate);
        const end = new Date(l.endDate);
        while(curr <= end) {
            localLeaveDateSet.add(getLocalISOString(curr));
            curr.setDate(curr.getDate() + 1);
        }
    });

    const dates: string[] = [];
    const iter = new Date(start);
    while (iter <= yesterday) {
        const dStr = getLocalISOString(iter);
        const dayOfWeek = iter.getDay();
        const isHoliday = holidayDateSet.has(dStr);
        
        if (dayOfWeek !== 0 && !isHoliday) {
            if (!localAttendanceSet.has(dStr) && !localLeaveDateSet.has(dStr)) {
                dates.push(dStr);
            }
        }
        iter.setDate(iter.getDate() + 1);
    }
    return dates;
  }, [user, myAttendanceHistory, myLeaves, holidayDateSet, isCheckedIn]);

  const handleResolveAbsence = async (date: string, category: LeaveCategory) => {
    if (!date || !user || isResolvingAbsence) return;

    // Check if enough paid leaves available
    if (category === LeaveCategory.PAID && availablePaidLeaves < 1) {
      alert(`You do not have enough Paid Leave balance (Available: ${availablePaidLeaves}). Please use Extra Time or contact HR.`);
      return;
    }
    
    
    setIsResolvingAbsence(true);
    try {
        const leaveData: any = {
            userId: user.id,
            startDate: date,
            endDate: date,
            category: category,
            reason: `Resolution for unexcused absence on ${date}`,
            status: 'Approved' // Self-resolve auto-approves
        };
        
        if (category === LeaveCategory.EXTRA_TIME) {
            // Standard 8.25h window for extra time resolution
            leaveData.startTime = '09:00';
            leaveData.endTime = '17:15';
        }
        
        await leaveAPI.requestLeave(leaveData);
        alert(`Successfully resolved absence for ${date} using ${category}.`);
        await refreshData();
    } catch (error: any) {
        console.error('Error resolving absence:', error);
        alert(error.message || 'Failed to resolve absence. Please contact HR.');
    } finally {
        setIsResolvingAbsence(false);
    }
  };

  const handleOvertimeSubmit = async () => {
    if (!overtimeReason.trim() || overtimeMinutes <= 0) {
      alert('Please provide a reason and valid duration for overtime.');
      return;
    }

    setIsSubmittingOvertime(true);
    try {
      await attendanceAPI.requestOvertime(overtimeReason.trim(), overtimeMinutes, overtimeTargetDate || undefined);
      alert(`Overtime request submitted successfully${overtimeTargetDate ? ` for ${formatDate(overtimeTargetDate)}` : ''}. It will be added to your extra time once approved by Admin.`);
      setShowOvertimeModal(false);
      setOvertimeReason('');
      setOvertimeMinutes(0);
      setOvertimeTargetDate(null);
      await refreshData();
    } catch (error: any) {
      console.error('Error submitting overtime request:', error);
      alert(error.message || 'Failed to submit overtime request.');
    } finally {
      setIsSubmittingOvertime(false);
    }
  };

  // Extra Time Worked = Final Time (convert from seconds to hours)
  const extraTimeWorkedHours = finalTimeDifference / 3600;

  // OLD LOGIC: Extra Time Leave Balance = Extra Time Worked (Final Time) - Extra Time Leave Taken
  const extraTimeLeaveHoursTaken = baseExtraTimeLeaveHours;
  const remainingExtraTimeBalanceHours = extraTimeWorkedHours - extraTimeLeaveHoursTaken;

  // At month end, if there's remaining balance, it should be added to low time
  const isMonthEnd = now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingExtraTimeLeaveSeconds = remainingExtraTimeBalanceHours * 3600;

  // If deficit at month end, adjust low time
  const adjustedLowTimeSeconds = isMonthEnd && remainingExtraTimeBalanceHours < 0
    ? totalLowTimeSeconds + Math.abs(remainingExtraTimeLeaveSeconds)
    : totalLowTimeSeconds;

  // Final time difference with adjusted low time and forwarding (per-month, no global pool)
  const finalTimeDifferenceAdjusted = totalExtraTimeSeconds - adjustedLowTimeSeconds - forwardedOutSeconds + forwardedInSeconds;

  // Chart Data: Last 7 days worked hours
  const chartData = myAttendanceHistory
    .slice(0, 7)
    .reverse()
    .map(r => {
      // Format date nicely (MM-DD)
      let dateLabel = r.date;
      if (typeof r.date === 'string') {
        if (r.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateLabel = r.date.slice(5);
        } else {
          try {
            const d = new Date(r.date);
            if (!isNaN(d.getTime())) {
              dateLabel = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-');
            }
          } catch (e) {
            // Keep original if parsing fails
          }
        }
      }

      // Check if this attendance is on a company holiday
      const attendanceDate = r.date;
      const isHolidayWork = holidayDateSet.has(attendanceDate);

      // Calculate Total Seconds (Worked + Extra Time Leave)
      let totalSecondsForChart = r.totalWorkedSeconds || 0;

      if (isHolidayWork) {
        // Holiday: entire worked time is overtime
        return {
          date: dateLabel,
          hours: +(totalSecondsForChart / 3600).toFixed(2),
          isLow: false,
          isExtra: totalSecondsForChart > 0,
          isHoliday: true
        };
      }

      // Check for approved Extra Time Leave for this date
      const extraTimeLeaveForDate = myLeaves.find(leave => {
        const status = (leave.status || '').trim();
        if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
        if (leave.category !== LeaveCategory.EXTRA_TIME) return false;
        return leave.startDate === attendanceDate || leave.endDate === attendanceDate ||
          (new Date(attendanceDate) >= new Date(leave.startDate) && new Date(attendanceDate) <= new Date(leave.endDate));
      });

      if (extraTimeLeaveForDate && extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime) {
        const parseTime = (timeStr: string) => {
          const [h, m] = timeStr.split(':').map(Number);
          return h * 60 + m;
        };
        const startMinutes = parseTime(extraTimeLeaveForDate.startTime);
        const endMinutes = parseTime(extraTimeLeaveForDate.endTime);
        const leaveMinutes = Math.max(0, endMinutes - startMinutes);
        totalSecondsForChart += (leaveMinutes * 60);
      }

      // Determine Status based on Total Seconds
      // Low < 8:15 (29700s), Extra > 8:22 (30120s)
      const isLow = totalSecondsForChart < MIN_NORMAL_SECONDS;
      const isExtra = totalSecondsForChart > MAX_NORMAL_SECONDS;

      // Check for Half Day Leave (adjusts expectations, so maybe not Low)
      const hasHalfDay = myLeaves.some(leave => {
        const status = (leave.status || '').trim();
        if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
        if (leave.category !== LeaveCategory.HALF_DAY) return false;
        return leave.startDate === attendanceDate || leave.endDate === attendanceDate;
      });

      // If Half Day approved, we might strictly not mark as Low (or use a lower threshold), 
      // but for now, let's just use the calculated flags unless Half Day exists, in which case Low might be ignored.
      // However, usually Half Day sets a different threshold (e.g. 4 hours).
      // Let's trust the logic: if half day, we don't flag as red unless it's SUPER low, but simplest is to unflag Low.
      const finalIsLow = hasHalfDay ? false : isLow;

      return {
        date: dateLabel,
        hours: +(totalSecondsForChart / 3600).toFixed(2),
        isLow: finalIsLow,
        isExtra: isExtra,
        isHoliday: false
      };
    });

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

      <div className="flex flex-wrap gap-6">

        {/* Attendance Card */}
        <Card className="flex-1 min-w-[300px] lg:min-w-[600px]" title="Today's Attendance">
          {isFullDayLeaveToday ? (
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
              {isHalfDayLeaveToday && (
                <div className="mb-6 p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-purple-900">Half Day Leave Approved Today</p>
                    <p className="text-xs text-purple-600">{todayLeave?.reason}</p>
                  </div>
                  <div className="px-3 py-1 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                    {todayLeave?.startTime ? `@ ${todayLeave.startTime}` : 'Approved'}
                  </div>
                </div>
              )}
              <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="text-center md:text-left">
                  <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">
                    {isOnBreak ? 'Break Timer' : 'Work Timer'}
                  </p>
                  <div className={`mt-2 ${isOnBreak ? 'text-amber-500' : 'text-blue-600'}`}>
                    <div className="flex items-center justify-center md:justify-start gap-1">
                      {(() => {
                        // Compute live penalty from check-in time (same rules as backend getFlags)
                        const checkInTime = localCheckInTime || (todayRecord?.checkIn ? new Date(todayRecord.checkIn) : null);
                        let livePenaltySeconds = 0;
                        if (!isOnBreak && checkInTime && !todayRecord?.checkOut && !todayRecord?.isPenaltyDisabled) {
                          if (isPenaltyEffective(getTodayStr())) {
                            livePenaltySeconds = calculateLatenessPenaltySeconds(checkInTime.toISOString());
                          }
                        }

                        // Show break timer when on break, penalty-adjusted work timer when working
                        const rawDisplay = isOnBreak ? breakElapsed : elapsed;
                        const displayTime = isOnBreak ? rawDisplay : Math.max(0, rawDisplay - livePenaltySeconds);
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
                            {!isOnBreak && livePenaltySeconds > 0 && (
                              <div className="ml-2 self-center">
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold border border-red-200" title={`Late check-in penalty: ${Math.round(livePenaltySeconds / 60)} min deducted`}>
                                  -{Math.round(livePenaltySeconds / 60)}m penalty
                                </span>
                              </div>
                            )}
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
                  {unresolvedAbsenceDates.length > 0 && !isCheckedIn && !isCheckedOut ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 w-full md:w-[600px] shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                          <AlertCircle className="h-6 w-6 text-rose-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-rose-900">Pending Absences Detected</h4>
                          <p className="text-sm text-rose-700 mt-1 mb-4">
                            You have {unresolvedAbsenceDates.length} unresolved absence{unresolvedAbsenceDates.length > 1 ? 's' : ''}. 
                            Please resolve each to enable Check In.
                          </p>
                          
                          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {unresolvedAbsenceDates.map((date) => (
                              <div key={date} className="bg-white/60 border border-rose-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <span className="font-bold text-gray-800">{convertToDDMMYYYY(date)}</span>
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm"
                                    variant="danger" 
                                    className="text-[10px] h-9 px-3 font-bold"
                                    onClick={() => handleResolveAbsence(date, LeaveCategory.PAID)}
                                    disabled={isResolvingAbsence}
                                  >
                                    Paid Leave
                                  </Button>
                                  <Button 
                                    size="sm"
                                    variant="primary" 
                                    className="text-[10px] h-9 px-3 font-bold bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => handleResolveAbsence(date, LeaveCategory.EXTRA_TIME)}
                                    disabled={isResolvingAbsence}
                                  >
                                    Extra Time
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
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
                    </>
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
                        activeBreakType === 'Pause' ? (
                          <div className="flex flex-col space-y-2">
                            <div className="bg-blue-100 text-blue-800 p-2 rounded text-center text-sm font-medium">
                              Timer Paused
                            </div>
                            <Button
                              onClick={handleResumeMistake}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
                            >
                              Resume Work
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col w-full gap-2">
                            <Button
                              onClick={() => {
                                if (breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled) {
                                  setConfirmationPopup({
                                    show: true,
                                    title: '⚠️ Break Progress',
                                    message: `Mandatory Break Policy: You must take at least 20 minutes of break. ${Math.ceil((1200 - breakElapsed) / 60)} minutes remaining.`,
                                    onConfirm: () => setConfirmationPopup(null),
                                    onCancel: () => setConfirmationPopup(null),
                                  });
                                  return;
                                }
                                setConfirmationPopup({
                                  show: true,
                                  title: 'End Break',
                                  message: 'Are you sure you want to end your break?',
                                  onConfirm: handleEndBreak,
                                  onCancel: () => setConfirmationPopup(null),
                                  customButtons: (
                                    <div className="flex space-x-2">
                                      <Button
                                        onClick={handleEndBreak}
                                        disabled={breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled}
                                        className={`${(breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled) ? 'bg-slate-100 text-slate-400' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                                      >
                                        End Break
                                      </Button>
                                      <Button
                                        onClick={handleResumeMistake}
                                        className="bg-gray-500 hover:bg-gray-600 text-white text-sm"
                                        title="Click if you closed the tab by mistake"
                                      >
                                        Resume (Mistake)
                                      </Button>
                                    </div>
                                  )
                                });
                              }}
                              variant="secondary"
                              className={`w-full font-extrabold flex flex-col items-center py-2.5 rounded-xl transition-all active:scale-95 border ${breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled
                                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed shadow-none'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-md shadow-indigo-100'
                                }`}
                            >
                              <span className="text-sm uppercase tracking-wide">End Break</span>
                              {breakElapsed < 1200 && !todayRecord?.isCompulsoryBreakDisabled && (
                                <span className="text-[10px] font-bold mt-0.5 bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                                  {Math.ceil((1200 - breakElapsed) / 60)}m remaining
                                </span>
                              )}
                            </Button>
                          </div>
                        )
                      ) : (
                        /* CHECKOUT LOGIC: Mandatory 8h 15m (29700 seconds) */
                        <div className="w-full flex flex-col gap-2">
                          {/* Request Overtime Button (shows after 8h 22m) */}
                          {isCheckedIn && !isCheckedOut && !isOnBreak && elapsed >= 30120 && (!todayRecord?.overtimeRequest || todayRecord.overtimeRequest.status === 'None') && (
                            <Button
                              onClick={() => setShowOvertimeModal(true)}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-100 transition-all active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-2 mb-1"
                            >
                              <Clock size={16} /> Request Overtime
                            </Button>
                          )}

                          {(elapsed >= 29700) || todayRecord?.earlyLogoutRequest === 'Approved' ? (
                            <Button
                              variant="danger"
                              onClick={() => {
                                setConfirmationPopup({
                                  show: true,
                                  title: '📋 Task Sheet Reminder',
                                  message: 'Have you updated your task sheet for today? Please make sure all your tasks are recorded before checking out.',
                                  onConfirm: async () => {
                                    // MANDATORY 20-MINUTE BREAK CHECK
                                    const standardBreaks = todayRecord?.breaks?.filter(b => b.type === 'Standard' && b.end) || [];
                                    const hasCompletedFullBreak = standardBreaks.some(b => {
                                      const duration = Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
                                      return duration >= 1200; // 20 minutes
                                    });

                                    if (!hasCompletedFullBreak && !todayRecord?.isCompulsoryBreakDisabled && todayRecord?.earlyLogoutRequest !== 'Approved') {
                                      setConfirmationPopup({
                                        show: true,
                                        title: '⚠️ Break Policy Alert',
                                        message: 'Mandatory Break Policy: You must take at least 20 minutes of standard break before checking out. Please take a break or contact an admin to exempt you.',
                                        onConfirm: () => setConfirmationPopup(null),
                                        onCancel: () => setConfirmationPopup(null),
                                      });
                                      return;
                                    }

                                    try {
                                      await clockOut();
                                      setConfirmationPopup(null);
                                    } catch (error: any) {
                                      setConfirmationPopup({
                                        show: true,
                                        title: '❌ Checkout Failed',
                                        message: error.message || 'An error occurred while checking out. Please try again.',
                                        onConfirm: () => setConfirmationPopup(null),
                                        onCancel: () => setConfirmationPopup(null),
                                      });
                                    }
                                  },
                                  onCancel: () => setConfirmationPopup(null)
                                });
                              }}
                              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-100 transition-all active:scale-95"
                            >
                              Check Out
                            </Button>
                          ) : (
                            <div className="w-full flex flex-col gap-2">
                              {/* If shift is complete but break is missing, notify user */}
                              {elapsed >= 29700 && !hasStandardBreak && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-1 text-center">
                                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block">Break Required</span>
                                  <span className="text-[10px] font-bold text-amber-500">Take your mandatory 20-minute break before checkout.</span>
                                </div>
                              )}

                              {todayRecord?.earlyLogoutRequest === 'Pending' ? (
                                <div className="flex flex-col items-center justify-center p-4 bg-amber-50 border border-amber-100 rounded-xl">
                                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Logout Req Pending</span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <RotateCcw size={10} className="animate-spin text-amber-500" />
                                    <span className="text-[10px] font-bold text-amber-500">Waiting for Admin</span>
                                  </div>
                                </div>
                              ) : todayRecord?.earlyLogoutRequest === 'Rejected' ? (
                                <Button
                                  onClick={() => setShowCheckoutRequestModal(true)}
                                  className="w-full py-4 bg-rose-100/50 text-rose-600 border-2 border-rose-100 font-black rounded-xl hover:bg-rose-100/80 transition-all uppercase tracking-widest text-xs"
                                >
                                  Request Rejected - Re-Apply
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => setShowCheckoutRequestModal(true)}
                                  className="w-full py-4 bg-slate-900 border border-slate-800 text-white font-black rounded-xl hover:bg-black shadow-lg shadow-slate-200 transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                  Early Checkout Request
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                      }

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
                      return acc + (b.end ? (new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000 : 0)
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
          {chartData.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value} hrs`, 'Working Hours']}
                    labelStyle={{ color: '#374151' }}
                  />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isHoliday ? '#f59e0b' : entry.isLow ? '#ef4444' : entry.isExtra ? '#16a34a' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 w-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
              <Calendar className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No attendance data for this week</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between text-xs text-gray-500 mt-2 px-2 gap-2">
            <span className="flex items-center"><div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div> Low</span>
            <span className="flex items-center"><div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div> Normal</span>
            <span className="flex items-center"><div className="w-2 h-2 bg-green-600 rounded-full mr-1"></div> Extra</span>
            <span className="flex items-center"><div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#f59e0b' }}></div> Holiday Work</span>
          </div>
        </Card>




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
                  {confirmationPopup.customButtons ? (
                    confirmationPopup.customButtons
                  ) : (
                    <>
                      <Button variant="secondary" onClick={confirmationPopup.onCancel}>
                        Cancel
                      </Button>
                      <Button variant="primary" onClick={confirmationPopup.onConfirm}>
                        Confirm
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Manual Work Log Modal */}
        {showManualLogModal && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-50 px-4"
              onClick={() => setShowManualLogModal(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Add Working Hours</h3>
                  <button onClick={() => setShowManualLogModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                
                <form onSubmit={handleAddManualHours} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time Worked</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={manualHoursInput}
                          onChange={(e) => setManualHoursInput(e.target.value)}
                          placeholder="HH"
                          className="w-full p-3 pl-10 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                          autoFocus
                        />
                        <Clock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <span className="absolute right-3 top-3.5 text-gray-400 font-medium">h</span>
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={manualMinutesInput}
                          onChange={(e) => setManualMinutesInput(e.target.value)}
                          placeholder="MM"
                          className="w-full p-3 pl-10 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                        <Clock className="absolute left-3 top-3.5 text-gray-400" size={20} />
                        <span className="absolute right-3 top-3.5 text-gray-400 font-medium">m</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Select hours and minutes you worked manually (e.g. for client work or outdoor tasks)</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                    <textarea
                      value={manualNoteInput}
                      onChange={(e) => setManualNoteInput(e.target.value)}
                      placeholder="What did you work on?"
                      className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      rows={3}
                    />
                  </div>
                  
                  <div className="pt-2 flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowManualLogModal(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      className="flex-1"
                      disabled={isSubmittingManual || (!manualHoursInput && !manualMinutesInput)}
                    >
                      {isSubmittingManual ? 'Saving...' : 'Add Hours'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Leave Request Form */}
        <div className="flex flex-wrap gap-6 w-full">
          <Card title="Request Leave" className="flex-1 min-w-[300px]">
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!leaveForm.start || !leaveForm.reason) return;
              // For non-half-day/non-extra-time leaves, end date is required
              if (leaveForm.type !== LeaveCategory.HALF_DAY && leaveForm.type !== LeaveCategory.EXTRA_TIME && !leaveForm.end) return;

              // Prevent submitting Paid Leave if exhausted
              if (leaveForm.type === LeaveCategory.PAID && isPaidLeaveExhausted) {
                alert(`All ${TOTAL_PAID_LEAVES} paid leaves have been used. Please select another leave type.`);
                return;
              }

              // Check if requested extra time leave days exceed available balance (using hours)
              if (leaveForm.type === LeaveCategory.EXTRA_TIME) {
                const requestedDays = calculateLeaveDays(leaveForm.start, leaveForm.end);
                const requestedHours = requestedDays * 8.25;

                if (requestedHours > remainingExtraTimeBalanceHours) {
                  alert(`Requested Extra Time Leave exceeds your remaining balance (${formatHoursToHoursMinutes(remainingExtraTimeBalanceHours)}). Please work more extra time to increase your balance.`);
                  return;
                }
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

              const isSingleDay = leaveForm.type === LeaveCategory.HALF_DAY || leaveForm.type === LeaveCategory.EXTRA_TIME;

              const leaveData: any = {
                startDate: leaveForm.start,
                endDate: isSingleDay ? leaveForm.start : leaveForm.end,
                category: leaveForm.type,
                reason: leaveForm.reason
              };
              if (leaveForm.type === LeaveCategory.HALF_DAY) {
                // Add half day leave type info to reason
                const halfDayTypeLabel = leaveForm.halfDayLeaveType === 'paid' ? 'Paid Leave' : 'Extra Time Leave';
                leaveData.reason = `[${halfDayTypeLabel}] ${leaveForm.reason}`;
              }

              // Add time fields for half day leave only
              if (leaveForm.type === LeaveCategory.HALF_DAY) {
                if (!leaveForm.startTime) {
                  alert('Please provide start time for Half Day Leave');
                  return;
                }
                leaveData.startTime = leaveForm.startTime;
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
              <div className={`grid gap-4 ${leaveForm.type === LeaveCategory.HALF_DAY || leaveForm.type === LeaveCategory.EXTRA_TIME ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{leaveForm.type === LeaveCategory.HALF_DAY || leaveForm.type === LeaveCategory.EXTRA_TIME ? 'Date' : 'From'}</label>
                  <input type="date" className="w-full p-2 border rounded text-sm" required value={leaveForm.start} onChange={e => setLeaveForm({ ...leaveForm, start: e.target.value })} />
                </div>
                {leaveForm.type !== LeaveCategory.HALF_DAY && leaveForm.type !== LeaveCategory.EXTRA_TIME && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                    <input type="date" className="w-full p-2 border rounded text-sm" required value={leaveForm.end} onChange={e => setLeaveForm({ ...leaveForm, end: e.target.value })} />
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
                    setLeaveForm({ ...leaveForm, type: selectedType });
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
                      onChange={e => setLeaveForm({ ...leaveForm, startTime: e.target.value })}
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
                        setLeaveForm({ ...leaveForm, halfDayLeaveType: selectedType });
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                <textarea className="w-full p-2 border rounded text-sm h-16" required placeholder="Describe reason..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}></textarea>
              </div>
              <Button type="submit" className="w-full">Submit Request</Button>
            </form>
          </Card>

          <div className="flex-1 min-w-[300px] space-y-6">
            {/* Paid Leave Balance */}
            <Card title="Paid Leave Balance" className="h-fit">
              <div className={`p-4 rounded-lg border ${availablePaidLeaves > 0
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
                      <p className={`text-3xl font-bold ${availablePaidLeaves > 0 ? 'text-blue-700' : 'text-red-700'
                        }`}>
                        {availablePaidLeaves}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Remaining</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-3 pt-3 border-t border-gray-200 text-center">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Allocated</p>
                      <p className="text-lg font-bold text-gray-800">{TOTAL_PAID_LEAVES}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Paid</p>
                      <p className="text-lg font-bold text-rose-600">{usedPaidLeaves}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Extra</p>
                      <p className="text-lg font-bold text-emerald-600">{totalExtraTimeUsed}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Unpaid</p>
                      <p className="text-lg font-bold text-rose-700">{totalUnpaidUsed}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Remain</p>
                      <p className={`text-lg font-bold ${availablePaidLeaves > 0 ? 'text-blue-600' : 'text-red-600'}`}>
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

            {/* Extra Time Leave Balance Restored UI */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4 mb-4">
              <Card title="Extra Time Leave Balance" className="h-fit">
                <div className={`p-4 rounded-lg border ${remainingExtraTimeBalanceHours < 0 
                  ? 'bg-orange-50 border-orange-100' 
                  : 'bg-green-50 border-green-100'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Remaining Extra Time</p>
                      <p className="text-xs text-gray-600 mt-1">You must work extra time to compensate for Extra Time Leave</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-bold ${remainingExtraTimeBalanceHours < 0 ? 'text-orange-700' : 'text-green-700'}`}>
                        {formatHoursToHoursMinutes(remainingExtraTimeBalanceHours)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Remaining</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Extra Time Leave Taken:</span>
                      <span className="font-semibold text-gray-800">{formatHoursToHoursMinutes(extraTimeLeaveHoursTaken)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Extra Time Worked (Final Time):</span>
                      <span className="font-semibold text-gray-800">
                        {extraTimeWorkedHours >= 0 ? '+' : ''}{formatHoursToHoursMinutes(extraTimeWorkedHours)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Remaining Balance:</span>
                      <span className={`font-semibold ${remainingExtraTimeBalanceHours < 0 ? 'text-orange-700' : 'text-green-700'}`}>
                        {formatHoursToHoursMinutes(remainingExtraTimeBalanceHours)}
                      </span>
                    </div>
                  </div>

                  {remainingExtraTimeBalanceHours < 0 && (
                    <div className={`mt-3 p-2 rounded border ${isMonthEnd ? 'bg-red-100 border-red-200' : 'bg-orange-100 border-orange-200'}`}>
                      <p className={`text-xs font-semibold ${isMonthEnd ? 'text-red-700' : 'text-orange-700'}`}>
                        {isMonthEnd 
                          ? `⚠️ Month end: ${formatHoursToHoursMinutes(Math.abs(remainingExtraTimeBalanceHours))} will be added to Low Time`
                          : `⚠️ Deficit: Work ${formatHoursToHoursMinutes(Math.abs(remainingExtraTimeBalanceHours))} extra to compensate`
                        }
                      </p>
                    </div>
                  )}
                  
                  {remainingExtraTimeBalanceHours >= 0 && (
                    <div className="mt-3 p-2 bg-green-100 rounded border border-green-200">
                      <p className="text-xs font-semibold text-green-700">
                        ✅ All Extra Time Leave compensated!
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Current Month Time Statistics */}
            <Card
              title={`Time Performance (${selectedMonthLabel})`}
              className="h-fit bg-gradient-to-br from-white to-slate-50/30"
              action={
                <input
                  type="month"
                  className="text-[10px] bg-slate-50 border border-slate-200 text-slate-700 px-2 py-1 rounded-lg ml-2 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={timeSummaryMonth}
                  max={`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`}
                  onChange={e => setTimeSummaryMonth(e.target.value)}
                  title="Select month"
                />
              }
            >
              <div className="space-y-4">
                {/* Total Low Time */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100/60 shadow-sm transition-transform hover:scale-[1.01]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Total Low Time</p>
                      <p className="text-[9px] text-rose-400 font-bold mt-0.5">Threshold: &lt; 8h 15m</p>
                      {isMonthEnd && remainingExtraTimeBalanceHours > 0 && (
                        <p className="text-xs text-orange-600 mt-2 font-bold flex items-center gap-1">
                          <AlertCircle size={12} />
                          + {formatDurationStyled(remainingExtraTimeLeaveSeconds)} (C/O)
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-rose-600 tabular-nums">{formatDurationStyled(displayLowTimeSeconds)}</p>
                      {forwardedInSeconds < 0 && (
                        <p className="text-[9px] text-rose-500 font-bold italic mt-0.5 animate-pulse">
                          (Incl. {formatHoursToHoursMinutes(Math.abs(forwardedInSeconds) / 3600)} forwarded)
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Total Extra Time */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/60 shadow-sm transition-transform hover:scale-[1.01]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Extra Time</p>
                      <p className="text-[9px] text-emerald-400 font-bold mt-0.5">Threshold: &gt; 8h 22m</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">{formatDurationStyled(displayExtraTimeSeconds)}</p>
                      {forwardedInSeconds > 0 && (
                        <p className="text-[9px] text-emerald-500 font-bold italic mt-0.5 animate-pulse">
                          (Incl. {formatHoursToHoursMinutes(forwardedInSeconds / 3600)} forwarded)
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Final Time Difference */}
                <div className={`p-4 rounded-2xl border shadow-sm transition-all ${finalTimeDifferenceAdjusted >= 0 ? 'bg-indigo-50/50 border-indigo-100/60' : 'bg-orange-50/50 border-orange-100/60'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: finalTimeDifferenceAdjusted >= 0 ? '#4338ca' : '#ea580c' }}>
                        Net Performance
                      </p>
                      <p className="text-[8px] font-bold opacity-70 mt-0.5" style={{ color: finalTimeDifferenceAdjusted >= 0 ? '#4338ca' : '#ea580c' }}>
                        Extra - (ETL + Low) - Sent + Prev
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-bold opacity-60" style={{ color: finalTimeDifferenceAdjusted >= 0 ? '#4338ca' : '#ea580c' }}>
                          {finalTimeDifferenceAdjusted >= 0 ? 'Surplus Balance' : 'Current Deficit'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black tabular-nums ${finalTimeDifferenceAdjusted >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                        {finalTimeDifferenceAdjusted >= 0 ? '+' : '-'}{formatDurationStyled(Math.abs(finalTimeDifferenceAdjusted))}
                      </p>
                    </div>
                  </div>
                </div>

                {currentMonthAttendance.length === 0 && (
                  <p className="text-[10px] text-slate-400 text-center py-2 font-bold uppercase tracking-widest italic">No attendance records</p>
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

        {/* Overtime Request History */}
        {overtimeHistory.length > 0 && (
          <Card title="My Overtime Commitments" className="w-full border-indigo-100 bg-indigo-50/5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-indigo-700 uppercase bg-indigo-50/50 border-b">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Fulfillment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {overtimeHistory.map(r => {
                    const req = r.overtimeRequest!;
                    const isApproved = req.status === 'Approved';
                    const isRejected = req.status === 'Rejected';
                    const isPending = req.status === 'Pending';
                    
                    // Calculate fulfillment for approved requests
                    const actualOTMinutes = isApproved ? Math.max(0, Math.floor(((r.totalWorkedSeconds || 0) - 30120) / 60)) : 0;
                    
                    let fulfillmentDisplay = '--';
                    if (isApproved && r.checkOut) {
                        const percent = Math.min(100, Math.round((actualOTMinutes / req.durationMinutes) * 100));
                        fulfillmentDisplay = `${actualOTMinutes}m / ${req.durationMinutes}m (${percent}%)`;
                    } else if (isApproved && !r.checkOut && isCheckedIn && r.date === getTodayStr()) {
                        fulfillmentDisplay = 'In Progress';
                    }

                    return (
                      <tr key={r.id} className="bg-white border-b hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 font-mono text-indigo-600 font-bold">{req.durationMinutes}m</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-gray-700">{fulfillmentDisplay}</span>
                            {isApproved && r.checkOut && (
                               <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${actualOTMinutes >= req.durationMinutes ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, (Math.max(0, Math.floor((r.totalWorkedSeconds - 30120) / 60)) / req.durationMinutes) * 100)}%` }}
                                  />
                               </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 text-[10px] rounded-lg font-black uppercase tracking-tight border
                            ${isPending ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                              isApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 italic max-w-xs truncate" title={req.reason}>
                          "{req.reason}"
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Attendance History Table (FR20) */}
        <Card title="My Attendance History" className="w-full">
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

                    // Check if this day is a company holiday
                    const isHolidayWorkDay = holidayDateSet.has(r.date);

                    return (
                      <tr key={r.id} className={`bg-white border-b hover:bg-gray-50 ${isHolidayWorkDay ? 'bg-amber-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div>{formatDate(r.date)}</div>
                          {isHolidayWorkDay && (
                            <div className="text-xs text-amber-600 mt-1 font-semibold">🏖 Holiday Work</div>
                          )}
                          {halfDayLeave && halfDayLeave.startTime && (
                            <div className="text-xs text-purple-600 mt-1 font-semibold">
                              Half Day Leave: {halfDayLeave.startTime}
                              {halfDayLeave.endTime && ` - ${halfDayLeave.endTime}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{formatTime(r.checkIn, systemSettings.timezone)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{formatTime(r.checkOut, systemSettings.timezone)}</td>
                        <td className="px-4 py-3 text-xs">
                          <div>{r.breaks.length} breaks</div>
                          {(() => {
                            const isLate = !!r.lateCheckIn;
                            const hasPenalty = (r.penaltySeconds || 0) > 0;
                            const shouldShowPenalty = isPenaltyEffective(r.date);
                            return (isLate && hasPenalty && shouldShowPenalty) ? (
                              <div className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                                <AlertCircle size={10} /> Late Penalty: {formatPenaltyDisplay(r.penaltySeconds || 0)}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {formatDuration(r.totalWorkedSeconds)}
                          {(() => {
                            const isLate = !!r.lateCheckIn;
                            const hasPenalty = (r.penaltySeconds || 0) > 0;
                            const shouldShowPenalty = isPenaltyEffective(r.date);
                            return (isLate && hasPenalty && shouldShowPenalty) ? (
                              <div className="text-[10px] text-gray-400 font-normal">
                                (-{formatPenaltyDisplay(r.penaltySeconds || 0)} penalty applied)
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {!r.checkIn && r.totalWorkedSeconds > 0 ? (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">Completed (Manual)</span>
                          ) : !r.checkOut ? (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-semibold">In Progress</span>
                          ) : isHolidayWorkDay && r.checkIn && r.checkOut ? (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-semibold">Holiday OT</span>
                          ) : (() => {
                            // Sync logic with summary cards (Subtract penalty, Add Extra Time Leave credits)
                            const netWorkedRaw = r.totalWorkedSeconds || 0;
                            let effectiveWorked = Math.max(0, netWorkedRaw - (r.penaltySeconds || 0));

                            // Find approved Extra Time Leave for this date
                            const extraTimeLeaveForDate = myLeaves.find(leave => {
                              const status = (leave.status || '').trim();
                              if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
                              if (leave.category !== LeaveCategory.EXTRA_TIME) return false;
                              const leaveStart = typeof leave.startDate === 'string' ? leave.startDate.split('T')[0] : leave.startDate;
                              const leaveEnd = typeof leave.endDate === 'string' ? leave.endDate.split('T')[0] : leave.endDate;
                              return r.date >= leaveStart && r.date <= leaveEnd;
                            });

                            if (extraTimeLeaveForDate) {
                              if (extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime) {
                                const leaveHours = calculateHoursPerDay(extraTimeLeaveForDate.startTime, extraTimeLeaveForDate.endTime);
                                effectiveWorked += leaveHours * 3600;
                              } else {
                                effectiveWorked += 8.25 * 3600;
                              }
                            }

                            // Use half-day threshold if applicable
                            const MIN_NORMAL = halfDayLeave ? (255 * 60) : ((8 * 3600) + (15 * 60)); // 4h15m or 8h15m
                            const MAX_NORMAL = halfDayLeave ? (262 * 60) : ((8 * 3600) + (22 * 60)); // 4h22m or 8h22m

                            if (effectiveWorked > MAX_NORMAL) {
                              const diff = effectiveWorked - MAX_NORMAL;
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  {halfDayLeave && (
                                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tight">Leave: 04:00:00</span>
                                  )}
                                  {extraTimeLeaveForDate && (
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Extra Time Leave Credit</span>
                                  )}
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">+{formatDuration(diff)}</span>
                                  
                                  {/* Retrospective Overtime Request Button */}
                                  {r.date >= '2026-04-06' && (!r.overtimeRequest || r.overtimeRequest.status === 'None') && (
                                    <button
                                      onClick={() => {
                                        setOvertimeTargetDate(r.date);
                                        setOvertimeMinutes(Math.max(0, Math.floor((effectiveWorked - MAX_NORMAL) / 60)));
                                        setShowOvertimeModal(true);
                                      }}
                                      className="mt-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg hover:bg-indigo-100 font-black uppercase tracking-tight transition-all active:scale-95"
                                    >
                                      Request OT
                                    </button>
                                  )}
                                </div>
                              );
                            } else if (effectiveWorked < MIN_NORMAL) {
                              const diff = MIN_NORMAL - effectiveWorked;
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  {halfDayLeave && (
                                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tight">Leave: 04:00:00</span>
                                  )}
                                  {extraTimeLeaveForDate && (
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Extra Time Leave Applied</span>
                                  )}
                                  <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-bold">-{formatDuration(diff)}</span>
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  {halfDayLeave && (
                                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tight">Leave: 04:00:00</span>
                                  )}
                                  {extraTimeLeaveForDate && (
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Extra Time Leave Applied</span>
                                  )}
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-semibold">Normal</span>
                                  
                                  {/* Retrospective Overtime Request Button (for edge cases where precisely at threshold) */}
                                  {r.date >= '2026-04-06' && effectiveWorked >= MAX_NORMAL && (!r.overtimeRequest || r.overtimeRequest.status === 'None') && (
                                    <button
                                      onClick={() => {
                                        setOvertimeTargetDate(r.date);
                                        setOvertimeMinutes(1); // Default to 1 min if precisely at 8:22
                                        setShowOvertimeModal(true);
                                      }}
                                      className="mt-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg hover:bg-indigo-100 font-black uppercase tracking-tight transition-all active:scale-95"
                                    >
                                      Request OT
                                    </button>
                                  )}
                                </div>
                              );
                            }
                          })()
                          }
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
        <Card title={`Current Month Leaves (${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })})`} className="w-full">
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
                        {(user?.role === 'Admin' || user?.role === 'HR') && (
                          <th className="px-4 py-3 text-center">Action</th>
                        )}
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
                        const isRejected = (leave.status === 'Rejected' || leave.status === LeaveStatus.REJECTED);
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
                            {(user?.role === 'Admin' || user?.role === 'HR') && (
                              <td className="px-4 py-3 text-center">
                                {(isApproved || isRejected) && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to revert this ${leave.status.toLowerCase()} leave?`)) return;
                                      try {
                                        await updateLeaveStatus(leave.id, LeaveStatus.PENDING, `Reverted from ${leave.status} by ${user?.role}`);
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
                              </td>
                            )}
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
      {/* Early Checkout Request Modal */}
      {showCheckoutRequestModal && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]" onClick={() => setShowCheckoutRequestModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[101] animate-scale-in px-4">
          <Card className="border-none shadow-2xl relative overflow-hidden" bodyClassName="p-0">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 via-rose-500 to-rose-600" />
            
            <button 
              onClick={() => setShowCheckoutRequestModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={18} />
            </button>

            <div className="p-8">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-rose-100">
                  <AlertCircle size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Early Checkout Request</h3>
                <div className="mt-2 text-sm text-slate-500 leading-relaxed px-2">
                  Standard shift completion requires <span className="font-bold text-slate-900">8 hours and 15 minutes</span>. 
                  Please specify your reason for an early checkout.
                </div>
              </div>

              <form onSubmit={handleRequestEarlyCheckout} className="space-y-6">
                <div className="relative group">
                  <textarea
                    value={checkoutRequestNote}
                    onChange={(e) => setCheckoutRequestNote(e.target.value)}
                    placeholder="Describe your reason here (e.g. Health issue, Family emergency...)"
                    required
                    className="w-full p-4 bg-slate-50/50 border-2 border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all resize-none min-h-[120px] outline-none group-hover:border-slate-200"
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-medium">
                    {checkoutRequestNote.length} characters
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setShowCheckoutRequestModal(false)}
                    variant="secondary"
                    className="flex-1 font-bold py-3.5 rounded-xl border border-slate-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmittingCheckoutRequest || !checkoutRequestNote.trim()}
                    className="flex-1 font-bold py-3.5 rounded-xl shadow-xl shadow-blue-200 group relative overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isSubmittingCheckoutRequest ? (
                        <>
                          <RotateCcw className="animate-spin -ml-1 mr-2" size={18} />
                          Processing...
                        </>
                      ) : (
                        'Send Request'
                      )}
                    </span>
                  </Button>
                </div>
              </form>
            </div>
          </Card>
          </div>
        </>
      )}

      {/* Overtime Request Modal */}
      {showOvertimeModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[110] animate-fade-in"
            onClick={() => {
              if (!isSubmittingOvertime) {
                setShowOvertimeModal(false);
                setOvertimeTargetDate(null);
              }
            }}
          />
          <div className="fixed inset-0 z-[111] flex items-center justify-center px-4 animate-scale-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-indigo-100">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center relative">
                  <Clock className="text-indigo-600" size={24} />
                  {overtimeTargetDate && (
                    <div className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5 border-2 border-white">
                      <Calendar size={10} />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 leading-tight">
                    {overtimeTargetDate ? `Request for ${formatDate(overtimeTargetDate)}` : 'Request Overtime'}
                  </h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Formal Approval Workflow</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                    Overtime Duration (Minutes)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={overtimeMinutes || ''}
                      onChange={(e) => setOvertimeMinutes(parseInt(e.target.value) || 0)}
                      placeholder="e.g. 60"
                      className="w-full h-12 bg-gray-50 border-2 border-gray-100 rounded-xl px-4 text-sm font-bold focus:bg-white focus:border-indigo-500 transition-all outline-none"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase">
                      min
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                    Reason for Overtime
                  </label>
                  <textarea
                    value={overtimeReason}
                    onChange={(e) => setOvertimeReason(e.target.value)}
                    placeholder="Describe why overtime was needed..."
                    className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 transition-all outline-none resize-none"
                    rows={4}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    className="flex-1 h-12 rounded-xl font-bold text-gray-600 border-2 border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setShowOvertimeModal(false);
                      setOvertimeTargetDate(null);
                    }}
                    disabled={isSubmittingOvertime}
                  >
                    Discard
                  </button>
                  <button
                    className="flex-1 h-12 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all"
                    onClick={handleOvertimeSubmit}
                    disabled={isSubmittingOvertime || !overtimeReason.trim() || overtimeMinutes <= 0}
                  >
                    {isSubmittingOvertime ? 'Sending...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
