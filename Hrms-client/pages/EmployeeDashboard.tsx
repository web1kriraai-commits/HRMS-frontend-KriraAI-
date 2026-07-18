import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BreakType, LeaveCategory, LeaveStatus, User, Role } from '../types';
import { AdminDashboard } from './AdminDashboard';
import { MonthlyOvertimeSummary } from '../components/MonthlyOvertimeSummary';
import { resolveGeneralOvertimeMinutes } from '../services/utils';
import { getTodayStr, formatDuration, formatTime, formatDate, convertToDDMMYYYY, isPenaltyEffective, calculateLatenessPenaltySeconds, calculateDailyTimeStats, ABSENCE_PENALTY_EFFECTIVE_DATE, COMPULSORY_BREAK_EFFECTIVE_DATE, getLocalISOString, getAbsenceStartDate, hasApprovedHalfDayLeaveOnDate, isBeforeEarliestCheckIn, HALF_DAY_EXTRA_THRESHOLD_SECONDS, calculateTotalBreakSeconds, hasMinimumTotalBreakTime, MIN_TOTAL_BREAK_SECONDS, getDateStrInTimezone, resolveCheckInTimeForDate, resolveCheckoutTimeForDate, formatCheckoutTimeLabel, isClockOutTimeAllowed, hasCheckoutOverrideForDate, formatHoursMinutesShort, getLeaveDayCredit, applyLeaveCreditToWorkedSeconds, getEffectiveLeaveCategory, getEmployeeBondPeriod, calculateBondLeaveSummary, BOND_LEAVE_EFFECTIVE_DATE, getLateCheckInPenaltyInfo, resolveLatePenaltyStartTime } from '../services/utils';
import { Clock, Coffee, AlertCircle, Bell, Calendar, X, RotateCcw, Timer, MessageSquare, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { attendanceAPI, leaveAPI, holidayAPI, notificationAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { appAlert } from '../services/appAlert';
import { EarlyOvertimePanel } from '../components/EarlyOvertimePanel';
import { OvertimeManagePanel } from '../components/OvertimeManagePanel';

/** Half-day minimum net worked time (matches server: Math.floor(495/2)*60). */
const HALF_DAY_MIN_SHIFT_SECONDS = Math.floor(495 / 2) * 60;
const FULL_DAY_MIN_SHIFT_SECONDS = (8 * 3600) + (15 * 60);
const ATTENDANCE_HISTORY_PAGE_SIZE = 8;

/** Employee apply-form category options (display label vs backend category). */
const EMPLOYEE_LEAVE_FORM_OPTIONS: { value: LeaveCategory; label: string }[] = [
  { value: LeaveCategory.UNPAID, label: 'Full Day Leave' },
  { value: LeaveCategory.HALF_DAY, label: 'Half Day Leave' },
];

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
  const { auth, attendanceRecords, clockIn, clockOut, startBreak, endBreak, requestLeave, leaveRequests, notifications, companyHolidays, systemSettings, refreshData, updateLeaveStatus, requestEarlyLeaveOvertime, users } = useApp();
  const user = auth.user;
  const canRequestPaidLeave = user ? user.paidLeaveAccess !== false : true;

  // Real-time timer
  const [elapsed, setElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0); // Break duration timer
  const [todayRecord, setTodayRecord] = useState(attendanceRecords.find(r => r.userId === user?.id && r.date === getTodayStr()));
  const [isResolvingAbsence, setIsResolvingAbsence] = useState(false);
  const [isSubmittingEarlyLeaveOt, setIsSubmittingEarlyLeaveOt] = useState(false);
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
  const [showManualLogModal, setShowManualLogModal] = useState(false);
  const [manualHoursInput, setManualHoursInput] = useState('');
  const [manualMinutesInput, setManualMinutesInput] = useState('');
  const [manualNoteInput, setManualNoteInput] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [showCheckoutRequestModal, setShowCheckoutRequestModal] = useState(false);
  const [checkoutRequestNote, setCheckoutRequestNote] = useState('');
  const [checkoutRequestType, setCheckoutRequestType] = useState<'early' | 'break'>('early');
  const [isSubmittingCheckoutRequest, setIsSubmittingCheckoutRequest] = useState(false);

  /** Updates every second so check-in/checkout time gates unlock without waiting for unrelated re-renders */
  const [wallClockNow, setWallClockNow] = useState(() => new Date());
  const [attendanceHistoryPage, setAttendanceHistoryPage] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setWallClockNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const approvedHalfDayToday = useMemo(() => {
    const today = getTodayStr();
    return leaveRequests.some(l => {
      const status = String(l.status || '').trim();
      if (!(status === 'Approved' || status === LeaveStatus.APPROVED)) return false;
      if (l.userId !== user?.id) return false;
      if (l.category !== LeaveCategory.HALF_DAY) return false;
      const startDate = new Date(l.startDate);
      const endDate = new Date(l.endDate);
      return new Date(today) >= startDate && new Date(today) <= endDate;
    });
  }, [leaveRequests, user?.id]);

  // Move these up to fix ReferenceErrors in helper functions and initial render logic
  const holidayDateSet = useMemo(() => new Set(
    companyHolidays.map(h => {
      const dateStr = typeof h.date === 'string' ? h.date : new Date(h.date).toISOString().split('T')[0];
      return dateStr.split('T')[0];
    })
  ), [companyHolidays]);

  const isTodayHoliday = useMemo(() => holidayDateSet.has(getTodayStr()), [holidayDateSet]);

  const compulsoryBreakEnforced = useMemo(() => {
    if (isTodayHoliday) return false;
    if (getTodayStr() < COMPULSORY_BREAK_EFFECTIVE_DATE) return false;
    if (todayRecord?.isCompulsoryBreakDisabled) return false;
    if (approvedHalfDayToday) return false;
    return true;
  }, [todayRecord?.isCompulsoryBreakDisabled, approvedHalfDayToday, isTodayHoliday]);

  const totalBreakSecondsToday = useMemo(
    () => calculateTotalBreakSeconds(todayRecord?.breaks || []),
    [todayRecord?.breaks]
  );
  const hasMinimumTotalBreak = hasMinimumTotalBreakTime(todayRecord?.breaks || []);
  const breakMinutesRemaining = Math.max(0, Math.ceil((MIN_TOTAL_BREAK_SECONDS - totalBreakSecondsToday) / 60));
  const activeBreakObj = todayRecord?.breaks.find(b => !b.end);
  const activeBreakType = activeBreakObj?.type;
  const activeBreakStartTime = localBreakStartTime ? localBreakStartTime : (activeBreakObj ? new Date(activeBreakObj.start) : null);

  // Handler for ending break (no minimum per session — 20 min total checked at checkout)
  const handleEndBreak = useCallback(async () => {
    setLocalBreakStartTime(null);
    try {
      await endBreak();
    } catch (error) {
      if (activeBreakStartTime) {
        setLocalBreakStartTime(activeBreakStartTime);
      }
      throw error;
    }
  }, [endBreak, activeBreakStartTime]);

  const handleAddManualHours = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalHours = Number(manualHoursInput || 0) + (Number(manualMinutesInput || 0) / 60);
    
    if (totalHours <= 0 || totalHours > 24) {
      appAlert('Please enter a valid work duration between 1 minute and 24 hours');
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
      appAlert('Failed to add manual hours. Please try again.');
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
      appAlert(
        checkoutRequestType === 'break'
          ? 'Checkout approval request sent. An admin can approve checkout without the 20-minute break requirement.'
          : 'Early checkout request sent successfully. Admin/HR will review it.'
      );
    } catch (err: any) {
      appAlert(err.message || 'Failed to send early checkout request.');
    } finally {
      setIsSubmittingCheckoutRequest(false);
    }
  };

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({
    start: '',
    end: '',
    type: LeaveCategory.UNPAID as LeaveCategory,
    reason: '',
    halfDayTime: 'morning',
    halfDayLeaveType: 'unpaid',
    startTime: '', // For extra time leave and half day leave
    endTime: '' // For extra time leave
  });

  useLayoutEffect(() => {
    setLeaveForm((prev) => {
      const next = { ...prev };
      if (prev.type === LeaveCategory.PAID) next.type = LeaveCategory.UNPAID;
      if (prev.halfDayLeaveType === 'paid') next.halfDayLeaveType = 'unpaid';
      return next;
    });
  }, [user?.id]);

  const isOnBreak = localBreakStartTime !== null || todayRecord?.breaks.some(b => !b.end);
  const isCheckedIn = !!localCheckInTime || !!todayRecord?.checkIn;
  const isCheckedOut = !!todayRecord?.checkOut;



  const myLeaves = leaveRequests.filter(l => l.userId === user?.id);
  const myNotifications = notifications.filter(n => n.userId === user?.id);
  const myAttendanceHistory = attendanceRecords.filter(r => r.userId === user?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /** HR can approve Employee leave requests (not their own / not Admin). */
  const pendingLeaveApprovals = useMemo(() => {
    if (user?.role !== Role.HR) return [];
    return leaveRequests.filter(l => {
      if (l.status !== LeaveStatus.PENDING && l.status !== 'Pending') return false;
      const requester = users.find(u => u.id === l.userId);
      if (!requester) return true;
      return requester.role === Role.EMPLOYEE;
    });
  }, [user?.role, leaveRequests, users]);

  const attendanceHistoryTotalPages = Math.max(1, Math.ceil(myAttendanceHistory.length / ATTENDANCE_HISTORY_PAGE_SIZE));
  const paginatedAttendanceHistory = useMemo(() => {
    const start = (attendanceHistoryPage - 1) * ATTENDANCE_HISTORY_PAGE_SIZE;
    return myAttendanceHistory.slice(start, start + ATTENDANCE_HISTORY_PAGE_SIZE);
  }, [myAttendanceHistory, attendanceHistoryPage]);

  useEffect(() => {
    if (attendanceHistoryPage > attendanceHistoryTotalPages) {
      setAttendanceHistoryPage(attendanceHistoryTotalPages);
    }
  }, [attendanceHistoryPage, attendanceHistoryTotalPages]);

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
  const minShiftSecondsForTodayCheckout = useMemo(
    () => (isHalfDayLeaveToday ? HALF_DAY_MIN_SHIFT_SECONDS : FULL_DAY_MIN_SHIFT_SECONDS),
    [isHalfDayLeaveToday]
  );

  const todayDateStr = useMemo(
    () => getDateStrInTimezone(wallClockNow, systemSettings.timezone),
    [wallClockNow, systemSettings.timezone]
  );

  const employeeSchedule = useMemo(
    () =>
      user
        ? {
            defaultCheckInTime: user.defaultCheckInTime,
            checkInTimeOverrides: user.checkInTimeOverrides,
            defaultCheckoutTime: user.defaultCheckoutTime,
            checkoutTimeOverrides: user.checkoutTimeOverrides
          }
        : null,
    [user]
  );

  const checkInTimeToday = useMemo(
    () => resolveCheckInTimeForDate(systemSettings, todayDateStr, employeeSchedule),
    [systemSettings, todayDateStr, employeeSchedule]
  );

  const checkInAvailableLabel = useMemo(
    () => formatCheckoutTimeLabel(checkInTimeToday.hour, checkInTimeToday.minute),
    [checkInTimeToday]
  );

  const checkoutTimeToday = useMemo(
    () => resolveCheckoutTimeForDate(systemSettings, todayDateStr, employeeSchedule),
    [systemSettings, todayDateStr, employeeSchedule]
  );

  const checkoutAvailableLabel = useMemo(
    () => formatCheckoutTimeLabel(checkoutTimeToday.hour, checkoutTimeToday.minute),
    [checkoutTimeToday]
  );

  const hasTodayCheckoutOverride = useMemo(
    () => hasCheckoutOverrideForDate(systemSettings, todayDateStr, employeeSchedule),
    [systemSettings, todayDateStr, employeeSchedule]
  );

  const checkoutTimeReached = useMemo(() => {
    if (user?.role === 'Admin' || isTodayHoliday) return true;
    if (todayRecord?.earlyLogoutRequest === 'Approved') return true;
    if (isHalfDayLeaveToday) return true;
    return isClockOutTimeAllowed(wallClockNow, {
      checkoutHour: checkoutTimeToday.hour,
      checkoutMinute: checkoutTimeToday.minute,
      timeZone: systemSettings.timezone
    });
  }, [wallClockNow, user?.role, todayRecord?.earlyLogoutRequest, isHalfDayLeaveToday, isTodayHoliday, checkoutTimeToday, systemSettings.timezone]);

  const isCheckOutRestricted = !checkoutTimeReached;

  const shiftCompleteForCheckout = elapsed >= minShiftSecondsForTodayCheckout;
  const earlyLogoutStatus = todayRecord?.earlyLogoutRequest ?? 'None';
  const earlyLeaveOtStatus = todayRecord?.overtimeManageRequest?.status ?? 'None';
  const hasEarlyLeaveOtActivity =
    earlyLeaveOtStatus === 'Pending' || earlyLeaveOtStatus === 'Managed';
  const canShowOvertimeRequests = shiftCompleteForCheckout || hasEarlyLeaveOtActivity;
  const canSubmitOvertimeRequests = shiftCompleteForCheckout;
  const canRequestEarlyLeaveOt =
    (user?.role === Role.EMPLOYEE || user?.role === Role.HR) &&
    canSubmitOvertimeRequests &&
    earlyLeaveOtStatus !== 'Pending' &&
    earlyLeaveOtStatus !== 'Managed';
  const isEarlyReleaseCheckout =
    hasTodayCheckoutOverride && checkoutTimeReached;
  const canCheckoutDirectly =
    (shiftCompleteForCheckout ||
      earlyLogoutStatus === 'Approved' ||
      isEarlyReleaseCheckout) &&
    (!compulsoryBreakEnforced ||
      hasMinimumTotalBreak ||
      earlyLogoutStatus === 'Approved' ||
      isEarlyReleaseCheckout);
  const needsBreakExemptionRequest =
    compulsoryBreakEnforced &&
    shiftCompleteForCheckout &&
    !hasMinimumTotalBreak &&
    earlyLogoutStatus !== 'Approved' &&
    earlyLogoutStatus !== 'Pending';
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

  // Get current calendar month bounds (used by leave filters / time summary)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

  const currentMonthLeaves = myLeaves.filter(l => {
    const startDate = new Date(l.startDate);
    const endDate = new Date(l.endDate);
    return (startDate >= monthStart && startDate <= monthEnd) ||
      (endDate >= monthStart && endDate <= monthEnd) ||
      (startDate <= monthStart && endDate >= monthEnd);
  }).sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    return dateA - dateB;
  });

  // Leave filters & helpers
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Approved' | 'Rejected' | 'Pending'>('All');
  const [leaveFilterDate, setLeaveFilterDate] = useState('');
  const [leaveFilterMonth, setLeaveFilterMonth] = useState(
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  );
  const [leaveShowAll, setLeaveShowAll] = useState(false);
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});


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
  const [overtimeHistoryMonth, setOvertimeHistoryMonth] = useState<string>(
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

  // Overtime history by type — only finalized check-out days (or approved Mgmt/Early OT)
  const overtimeHistory = useMemo(() => {
    return myAttendanceHistory
      .filter(r => {
        const hasMgmt =
          r.managementOvertime?.status === 'Approved' &&
          (r.managementOvertime.completedMinutes ?? 0) > 0;
        const hasEarlyDeficit = (r.earlyOvertime?.deficitMinutes ?? 0) > 0;
        const hasEarlyCompleted = (r.earlyOvertime?.completedMinutes ?? 0) > 0;
        const hasManagedEarly =
          (r.overtimeManageRequest?.allocations?.earlyRequestMinutes ?? 0) > 0;
        const hasGeneral = r.checkOut && resolveGeneralOvertimeMinutes(r) > 0;
        return hasGeneral || hasMgmt || hasEarlyDeficit || hasEarlyCompleted || hasManagedEarly;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [myAttendanceHistory]);

  const filteredOvertimeHistory = useMemo(() => {
    return overtimeHistory.filter(r => {
      const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : getLocalISOString(new Date(r.date));
      return dateStr.startsWith(overtimeHistoryMonth);
    });
  }, [overtimeHistory, overtimeHistoryMonth]);

  const overtimeHistoryMonthLabel = useMemo(
    () => new Date(`${overtimeHistoryMonth}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    [overtimeHistoryMonth]
  );

  // Compute leaves to show based on date/month filters
  const leavesForPeriod = (() => {
    // All button: show every leave for this employee
    if (leaveShowAll) {
      return [...myLeaves].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
    }

    // If month filter selected, show leaves overlapping that month
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

  // Leave Summary shows approved applications only (manual adjustments are admin offsets, not shown here)
  const usedPaidLeaves = baseUsedPaidLeaves;
  const totalExtraTimeUsed = baseExtraTimeLeaveDays;
  const totalUnpaidUsed = baseUnpaidLeaveDays;

  // Get total paid leaves allocation (custom or default)
  const TOTAL_PAID_LEAVES = getTotalPaidLeaves(user);
  const availablePaidLeaves = TOTAL_PAID_LEAVES - usedPaidLeaves;
  const isPaidLeaveExhausted = availablePaidLeaves <= 0;

  const bondPeriod = useMemo(() => getEmployeeBondPeriod(user), [user?.bonds, user?.joiningDate]);

  const bondLeaveSummary = useMemo(
    () => calculateBondLeaveSummary(user, myLeaves, myAttendanceHistory, holidayDateSet),
    [user, myLeaves, myAttendanceHistory, holidayDateSet]
  );


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
  const selectedMonthDate = timeSummaryMonth
    ? (() => { const [y, m] = timeSummaryMonth.split('-').map(Number); return new Date(y, m - 1, 1); })()
    : new Date(currentYear, currentMonth, 1);
  const selectedMonthLabel = selectedMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

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

  const todayStrForMonth = getTodayStr();

  for (let iter = new Date(startDate); iter <= endDate; iter.setDate(iter.getDate() + 1)) {
    const dateStr = getLocalISOString(iter);
    const dayOfWeek = iter.getDay(); // 0 = Sunday
    const isHolidayDay = holidayDateSet.has(dateStr);
    const record = attendanceMap.get(dateStr);

    if (dayOfWeek === 0 || isHolidayDay) continue;

    const leaveCredit = getLeaveDayCredit(dateStr, user!.id, myLeaves, holidayDateSet, {
      hasAttendance: Boolean(record?.checkIn),
      treatAbsentAsUnpaidLeave: true,
      todayStr: todayStrForMonth
    });

    // Case 1: Existing attendance record
    if (record) {
      let effectiveWorkedSeconds = record.totalWorkedSeconds || 0;
      effectiveWorkedSeconds = applyLeaveCreditToWorkedSeconds(effectiveWorkedSeconds, leaveCredit);

      const hasApprovedHalfDay = leaveCredit.isHalfDayLeave;
      const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
      const { lowTimeSeconds, extraTimeSeconds } = calculateDailyTimeStats(
        effectiveWorkedSeconds,
        hasApprovedHalfDay,
        isHolidayDay,
        approvedOT,
        dateStr,
        systemSettings,
        leaveCredit.skipLowTime
      );
      if (record.checkOut && !leaveCredit.skipLowTime) {
        totalLowTimeSeconds += lowTimeSeconds;
      }
      totalExtraTimeSeconds += extraTimeSeconds;
    }
    // Case 2: No check-in — counted as unpaid leave (8h 15m credit), NOT low time
    else if (leaveCredit.creditSeconds > 0 && dateStr < todayStrForMonth) {
      // Leave / implicit unpaid day — hours credited via Monthly Overtime Summary; no low-time penalty
    }
  }

  // Manual Extra Time Leave adjustment (days) from admin/HR
  const manualExtraAdjustment = user?.manualExtraTimeAdjustment || 0;

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
    }, 0) + (manualExtraAdjustment * 8.25);

  // Forwarding: forwardedOut = time sent out from this month, forwardedIn = time received into this month
  const forwardedOutSeconds = (user?.forwardedMonths?.[timeSummaryMonth] || 0);
  const forwardedInSeconds = (user?.forwardedInMonths?.[timeSummaryMonth] || 0);
  
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

    if (category === LeaveCategory.PAID && !canRequestPaidLeave) {
      appAlert('Paid leave is not enabled for your account. Please resolve using Unpaid Leave or contact your administrator.');
      return;
    }

    // Check if enough paid leaves available
    if (category === LeaveCategory.PAID && availablePaidLeaves < 1) {
      appAlert(`You do not have enough Paid Leave balance (Available: ${availablePaidLeaves}). Please use Extra Time or contact HR.`);
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
        appAlert(`Successfully resolved absence for ${date} using ${category}.`);
        await refreshData();
    } catch (error: any) {
        console.error('Error resolving absence:', error);
        appAlert(error.message || 'Failed to resolve absence. Please contact HR.');
    } finally {
        setIsResolvingAbsence(false);
    }
  };

  // Extra Time Worked = Final Time (convert from seconds to hours)
  const extraTimeWorkedHours = finalTimeDifference / 3600;

  // Time Restrictions Logic (admin-configured check-in time in company timezone)
  const isCheckInRestricted = useMemo(() => {
    if (user?.role === 'Admin' || isTodayHoliday) return false;
    return isBeforeEarliestCheckIn(
      wallClockNow,
      systemSettings.timezone,
      checkInTimeToday.hour,
      checkInTimeToday.minute
    );
  }, [wallClockNow, user?.role, systemSettings.timezone, isTodayHoliday, checkInTimeToday]);

  // Extra Time Leave balance check for leave request validation
  const extraTimeLeaveHoursTaken = baseExtraTimeLeaveHours;
  const remainingExtraTimeBalanceHours = extraTimeWorkedHours - extraTimeLeaveHoursTaken;

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
                        if (!isOnBreak && checkInTime && !todayRecord?.checkOut && !todayRecord?.isPenaltyDisabled && !approvedHalfDayToday) {
                          if (isPenaltyEffective(todayDateStr)) {
                            livePenaltySeconds = calculateLatenessPenaltySeconds(
                              checkInTime.toISOString(),
                              resolveLatePenaltyStartTime(systemSettings, todayDateStr, employeeSchedule),
                              systemSettings.timezone
                            );
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

                <div className="flex flex-col gap-3 w-full md:w-96 lg:w-[28rem] items-stretch shrink-0">
                      {!isCheckedIn && !isCheckedOut && (
                        <div className="flex flex-col items-stretch md:items-start gap-2">
                        <Button 
                          size="lg" 
                          disabled={isCheckInRestricted}
                          title={
                            isCheckInRestricted
                              ? `Check-in is available from ${checkInAvailableLabel} (${systemSettings.timezone})`
                              : undefined
                          }
                          onClick={async () => {
                            if (isCheckInRestricted) return;
                            if (user?.role !== 'Admin' && !isTodayHoliday && isBeforeEarliestCheckIn(new Date(), systemSettings.timezone, checkInTimeToday.hour, checkInTimeToday.minute)) {
                              appAlert(`Check-in is only allowed from ${checkInAvailableLabel} (${systemSettings.timezone}).`);
                              return;
                            }
                            const checkInTime = new Date();
                            setLocalCheckInTime(checkInTime);
                            try {
                              await clockIn();
                            } catch (error: unknown) {
                              setLocalCheckInTime(null);
                              const msg =
                                error instanceof Error
                                  ? error.message
                                  : 'Check-in failed. Please try again.';
                              appAlert(msg);
                            }
                          }} className={`w-full md:w-48 h-14 text-lg shadow-lg ${isCheckInRestricted ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none' : 'shadow-blue-200'}`}>
                          <Clock className="mr-2" /> 
                          {isCheckInRestricted ? `From ${checkInAvailableLabel}` : isTodayHoliday ? 'Holiday Work' : 'Check In'}
                        </Button>
                        {isCheckInRestricted && (
                          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                            Check-in opens at{' '}
                            <span className="font-semibold text-slate-600">{checkInAvailableLabel}</span> in{' '}
                            <span className="font-mono">{systemSettings.timezone}</span>.
                            Now:{' '}
                            <span className="font-mono tabular-nums">
                              {wallClockNow.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZone: systemSettings.timezone
                              })}
                            </span>
                          </p>
                        )}
                        </div>
                      )}

                  {isCheckedIn && !isCheckedOut && (
                    <div className="w-full flex flex-col items-stretch gap-2">
                      <Button
                        variant="secondary"
                        disabled={isOnBreak}
                        onClick={async () => {
                          const breakStartTime = new Date();
                          setLocalBreakStartTime(breakStartTime);
                          try {
                            await startBreak(BreakType.STANDARD);
                          } catch (error) {
                            setLocalBreakStartTime(null);
                            throw error;
                          }
                        }}
                        className="w-full py-4 font-bold rounded-xl"
                      >
                        <Coffee className="mr-2 h-4 w-4" /> Break
                      </Button>

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
                              onClick={handleEndBreak}
                              variant="secondary"
                              className="w-full font-extrabold flex flex-col items-center py-2.5 rounded-xl transition-all active:scale-95 border bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-md shadow-indigo-100"
                            >
                              <span className="text-sm uppercase tracking-wide">End Break</span>
                            </Button>
                          </div>
                        )
                      ) : (
                        /* CHECKOUT: full day 8h15m; half-day leave = ~4h7.5m minimum (server-aligned) */
                        <div className="w-full flex flex-col gap-2">
                          {earlyLogoutStatus === 'Pending' ? (
                            <div className="flex flex-col items-center justify-center p-4 bg-amber-50 border border-amber-100 rounded-xl">
                              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Approval Pending</span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <RotateCcw size={10} className="animate-spin text-amber-500" />
                                <span className="text-[10px] font-bold text-amber-500">Waiting for Admin</span>
                              </div>
                            </div>
                          ) : !checkoutTimeReached ? (
                            <div className="w-full flex flex-col gap-2">
                              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Checkout Time</span>
                                <span className="text-xs font-bold text-gray-600">
                                  Regular checkout from {checkoutAvailableLabel}
                                </span>
                              </div>
                              {earlyLogoutStatus === 'Rejected' ? (
                                <Button
                                  onClick={() => {
                                    setCheckoutRequestType('early');
                                    setShowCheckoutRequestModal(true);
                                  }}
                                  className="w-full py-4 bg-rose-100/50 text-rose-600 border-2 border-rose-100 font-black rounded-xl hover:bg-rose-100/80 transition-all uppercase tracking-widest text-xs"
                                >
                                  Request Rejected - Re-Apply
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => {
                                    setCheckoutRequestType('early');
                                    setShowCheckoutRequestModal(true);
                                  }}
                                  className="w-full py-4 bg-slate-900 border border-slate-800 text-white font-black rounded-xl hover:bg-black shadow-lg shadow-slate-200 transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                  Early Checkout Request
                                </Button>
                              )}
                            </div>
                          ) : canCheckoutDirectly ? (
                            <Button
                              variant="danger"
                              disabled={isCheckOutRestricted}
                              onClick={() => {
                                setConfirmationPopup({
                                  show: true,
                                  title: '📋 Task Sheet Reminder',
                                  message: 'Have you updated your task sheet for today? Please make sure all your tasks are recorded before checking out.',
                                  onConfirm: async () => {
                                    if (compulsoryBreakEnforced && !hasMinimumTotalBreak && earlyLogoutStatus !== 'Approved') {
                                      setConfirmationPopup({
                                        show: true,
                                        title: '⚠️ Break Policy',
                                        message: `You need at least 20 minutes of break. You have ${formatDuration(totalBreakSecondsToday)}. Take more break or request admin approval.`,
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
                              className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 ${isCheckOutRestricted ? 'bg-gray-50 text-gray-600 border border-gray-200 cursor-not-allowed shadow-none' : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100'}`}
                            >
                              {isCheckOutRestricted ? `Available at ${checkoutAvailableLabel}` : isTodayHoliday ? 'Finish Holiday Work' : 'Check Out'}
                            </Button>
                          ) : (
                            <div className="w-full flex flex-col gap-2">
                              {needsBreakExemptionRequest && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-1 text-center">
                                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block">Break Required at Checkout</span>
                                  <span className="text-[10px] font-bold text-amber-500">
                                    Break: {formatDuration(totalBreakSecondsToday)} / 20m — need {breakMinutesRemaining}m more, or request admin approval.
                                  </span>
                                </div>
                              )}

                              {earlyLogoutStatus === 'Rejected' ? (
                                <Button
                                  onClick={() => {
                                    setCheckoutRequestType(needsBreakExemptionRequest ? 'break' : 'early');
                                    setShowCheckoutRequestModal(true);
                                  }}
                                  className="w-full py-4 bg-rose-100/50 text-rose-600 border-2 border-rose-100 font-black rounded-xl hover:bg-rose-100/80 transition-all uppercase tracking-widest text-xs"
                                >
                                  Request Rejected - Re-Apply
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => {
                                    setCheckoutRequestType(needsBreakExemptionRequest ? 'break' : 'early');
                                    setShowCheckoutRequestModal(true);
                                  }}
                                  className="w-full py-4 bg-slate-900 border border-slate-800 text-white font-black rounded-xl hover:bg-black shadow-lg shadow-slate-200 transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                  {needsBreakExemptionRequest ? 'Request Checkout Approval' : 'Early Checkout Request'}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                      }

                    </div>
                  )}

                  {isCheckedOut && (
                    <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-600 font-medium">Day Completed</p>
                      <p className="text-sm text-gray-400">Checked out at {formatTime(todayRecord?.checkOut, systemSettings.timezone)}</p>
                      {todayRecord?.lowTimeFlag && <span className="text-xs text-red-500 font-bold block mt-1">Low Time Detected</span>}
                      {todayRecord?.extraTimeFlag && (
                        <span className="text-xs text-green-600 font-bold block mt-1">
                          Overtime recorded
                          {resolveGeneralOvertimeMinutes(todayRecord) > 0 && ` · General ${resolveGeneralOvertimeMinutes(todayRecord)}m`}
                        </span>
                      )}
                      {todayRecord?.earlyOvertime && (todayRecord.earlyOvertime.deficitMinutes ?? 0) > 0 && (
                        <span className="text-xs text-amber-600 font-bold block mt-1">
                          Early OT: {todayRecord.earlyOvertime.deficitMinutes - (todayRecord.earlyOvertime.coveredMinutes ?? 0)}m to cover
                        </span>
                      )}
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

              {/* Overtime request — Early Leave after 8h 15m (surplus managed by Admin/HR) */}
              {isCheckedIn && !isCheckedOut && (canShowOvertimeRequests || canRequestEarlyLeaveOt) &&
                (user?.role === Role.EMPLOYEE || user?.role === Role.HR) && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Overtime Request</p>
                  {!canSubmitOvertimeRequests && !hasEarlyLeaveOtActivity && (
                    <p className="text-[10px] text-slate-400 text-center italic">
                      Complete 8h 15m to submit an overtime request
                    </p>
                  )}

                  {earlyLeaveOtStatus === 'Pending' ? (
                    <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-center">
                      <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Overtime Request Pending</p>
                      <p className="text-[10px] text-teal-500 font-bold mt-1">
                        Extra time (completed hours → checkout) awaits Admin/HR allocation
                        {(todayRecord?.overtimeManageRequest?.extraMinutes ?? 0) > 0 &&
                          ` · ${formatHoursMinutesShort((todayRecord.overtimeManageRequest?.extraMinutes ?? 0) * 60)}`}
                      </p>
                    </div>
                  ) : earlyLeaveOtStatus === 'Managed' ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Overtime Managed</p>
                      <p className="text-[10px] text-emerald-500 font-bold mt-1">
                        Allocated as {todayRecord?.overtimeManageRequest?.allocationType || 'OT'}
                      </p>
                    </div>
                  ) : canRequestEarlyLeaveOt ? (
                    <Button
                      variant="secondary"
                      disabled={isSubmittingEarlyLeaveOt}
                      onClick={async () => {
                        setIsSubmittingEarlyLeaveOt(true);
                        try {
                          await requestEarlyLeaveOvertime();
                          appAlert('Overtime request submitted. Extra time will be counted from completed working hours to checkout.');
                        } catch (error: any) {
                          appAlert(error.message || 'Failed to submit overtime request');
                        } finally {
                          setIsSubmittingEarlyLeaveOt(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-sm"
                    >
                      <Clock size={16} />
                      {isSubmittingEarlyLeaveOt ? 'Submitting...' : 'Overtime Request'}
                    </Button>
                  ) : null}
                </div>
              )}

              {/* Overtime after checkout — claim surplus if not yet requested */}
              {isCheckedOut &&
                (user?.role === Role.EMPLOYEE || user?.role === Role.HR) &&
                (earlyLeaveOtStatus === 'Pending' ||
                  earlyLeaveOtStatus === 'Managed' ||
                  (canRequestEarlyLeaveOt &&
                    (todayRecord?.extraTimeFlag ||
                      resolveGeneralOvertimeMinutes(todayRecord) > 0))) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {earlyLeaveOtStatus === 'Pending' ? (
                    <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-center">
                      <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Overtime Request Pending</p>
                      <p className="text-[10px] text-teal-500 font-bold mt-1">
                        Extra {formatHoursMinutesShort((todayRecord?.overtimeManageRequest?.extraMinutes ?? 0) * 60)} awaiting Admin/HR allocation
                      </p>
                    </div>
                  ) : earlyLeaveOtStatus === 'Managed' ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Overtime Managed</p>
                      <p className="text-[10px] text-emerald-500 font-bold mt-1">
                        Allocated as {todayRecord?.overtimeManageRequest?.allocationType || 'OT'}
                      </p>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={isSubmittingEarlyLeaveOt}
                      onClick={async () => {
                        setIsSubmittingEarlyLeaveOt(true);
                        try {
                          await requestEarlyLeaveOvertime();
                          appAlert('Overtime request submitted for today\'s surplus.');
                        } catch (error: any) {
                          appAlert(error.message || 'Failed to submit overtime request');
                        } finally {
                          setIsSubmittingEarlyLeaveOt(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-sm"
                    >
                      <Clock size={16} />
                      {isSubmittingEarlyLeaveOt ? 'Submitting...' : 'Overtime Request'}
                    </Button>
                  )}
                </div>
              )}
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
        {/* Layout: Left Column (Request Form & Paid Balance), Right Column (OT Balance & Stats) */}
        <div className="flex flex-wrap gap-6 mb-8 mt-12 w-full items-start">
          {/* Left Column */}
          <div className="flex-1 min-w-[320px] space-y-6">
            <Card title="Request Leave" className="h-fit overflow-hidden">
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!leaveForm.start || !leaveForm.reason) return;
                if (leaveForm.type !== LeaveCategory.HALF_DAY && leaveForm.type !== LeaveCategory.EXTRA_TIME && !leaveForm.end) return;

                if (leaveForm.type === LeaveCategory.PAID && !canRequestPaidLeave) {
                  appAlert('Paid leave is not enabled for your account. Please choose Unpaid Leave or contact your administrator.');
                  return;
                }

                if (leaveForm.type === LeaveCategory.HALF_DAY && leaveForm.halfDayLeaveType === 'paid' && !canRequestPaidLeave) {
                  appAlert('Paid leave is not enabled for your account. Use half-day as Unpaid or contact your administrator.');
                  return;
                }

                if (leaveForm.type === LeaveCategory.PAID && isPaidLeaveExhausted) {
                  appAlert(`All ${TOTAL_PAID_LEAVES} paid leaves have been used. Please select another leave type.`);
                  return;
                }

                if (leaveForm.type === LeaveCategory.EXTRA_TIME) {
                  const requestedDays = calculateLeaveDays(leaveForm.start, leaveForm.end, holidayDateSet);
                  const requestedHours = requestedDays * 8.25;
                  if (requestedHours > remainingExtraTimeBalanceHours) {
                    appAlert(`Requested Extra Time Leave exceeds your remaining balance (${formatHoursToHoursMinutes(remainingExtraTimeBalanceHours)}).`);
                    return;
                  }
                }

                if (leaveForm.type === LeaveCategory.PAID) {
                  const requestedDays = calculateLeaveDays(leaveForm.start, leaveForm.end, holidayDateSet);
                  if (requestedDays > availablePaidLeaves) {
                    appAlert(`You only have ${availablePaidLeaves} paid leave(s) remaining.`);
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
                  leaveData.reason = `[Unpaid Leave] ${leaveForm.reason}`;
                  if (!leaveForm.startTime) return appAlert('Please provide start time');
                  leaveData.startTime = leaveForm.startTime;
                }

                requestLeave(leaveData);
                setLeaveForm({ ...leaveForm, start: '', end: '', reason: '', startTime: '' });
              }} className="space-y-3">
                <div className={`grid gap-4 ${leaveForm.type === LeaveCategory.HALF_DAY || leaveForm.type === LeaveCategory.EXTRA_TIME ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">From/Date</label>
                    <input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" required value={leaveForm.start} onChange={e => setLeaveForm({ ...leaveForm, start: e.target.value })} />
                  </div>
                  {leaveForm.type !== LeaveCategory.HALF_DAY && leaveForm.type !== LeaveCategory.EXTRA_TIME && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
                      <input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" required value={leaveForm.end} onChange={e => setLeaveForm({ ...leaveForm, end: e.target.value })} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Category</label>
                  <div className="relative">
                    <select className="w-full p-2 pr-9 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none" value={leaveForm.type} onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value as LeaveCategory })}>
                      {EMPLOYEE_LEAVE_FORM_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {leaveForm.type === LeaveCategory.HALF_DAY && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Start Time</label>
                    <input type="time" className="w-full p-2 border border-slate-200 rounded-lg text-sm" required value={leaveForm.startTime} onChange={e => setLeaveForm({ ...leaveForm, startTime: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reason</label>
                  <textarea className="w-full p-2 border border-slate-200 rounded-lg text-sm h-12 resize-none outline-none focus:ring-2 focus:ring-blue-500" required placeholder="Reason for leave..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                </div>
                <Button type="submit" className="w-full font-bold shadow-lg shadow-blue-100 py-3 active:scale-95 transition-all">Submit Request</Button>
              </form>
            </Card>

            <Card title="Leave Summary" className="h-fit">
              <div className="p-4 rounded-2xl border bg-slate-50/50 border-slate-100">
                <p className="text-[10px] text-slate-400 font-medium mb-3 leading-snug">
                  {bondPeriod.label}
                  <span className="block text-slate-300 mt-0.5">
                    {formatDate(bondPeriod.startDate)} – {formatDate(bondPeriod.displayEndDate)}
                  </span>
                  <span className="block text-slate-300 mt-0.5">
                    Leave counted from {formatDate(BOND_LEAVE_EFFECTIVE_DATE)}
                  </span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 min-w-0">
                  {[
                    { label: 'Allocated Leave', value: bondLeaveSummary.allocated, valueClass: 'text-slate-600', boxClass: 'bg-white border-slate-100' },
                    { label: 'Paid Leave', value: usedPaidLeaves, valueClass: 'text-violet-600', boxClass: 'bg-violet-50/60 border-violet-100' },
                    { label: 'Unpaid Leave', value: totalUnpaidUsed, valueClass: 'text-amber-600', boxClass: 'bg-amber-50/60 border-amber-100' },
                    { label: 'Total Leave', value: usedPaidLeaves + totalUnpaidUsed, valueClass: 'text-rose-500', boxClass: 'bg-rose-50/60 border-rose-100' },
                  ].map(stat => (
                    <div key={stat.label} className={`rounded-xl border p-2.5 sm:p-3.5 text-center min-w-0 ${stat.boxClass}`}>
                      <p className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1 sm:mb-1.5 leading-tight">{stat.label}</p>
                      <p className={`text-xl sm:text-2xl font-bold tabular-nums ${stat.valueClass}`}>{formatDisplayDays(stat.value)}</p>
                      <p className="text-[8px] sm:text-[9px] text-slate-400 mt-0.5">{stat.value === 1 ? 'day' : 'days'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="flex-1 min-w-[320px] space-y-6">
            {/* Monthly Overtime Summary — 3 OT types + remaining */}
            {user && (
              <MonthlyOvertimeSummary
                monthStr={timeSummaryMonth}
                monthLabel={selectedMonthLabel}
                userId={user.id}
                attendanceRecords={myAttendanceHistory}
                leaves={myLeaves}
                holidayDateSet={holidayDateSet}
                onMonthChange={setTimeSummaryMonth}
                maxMonth={`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`}
              />
            )}

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

        {/* Overtime history by type */}
        <Card
          title={`My Overtime History — ${overtimeHistoryMonthLabel}`}
          className="w-full border-indigo-100 bg-indigo-50/5"
          action={
            <input
              type="month"
              className="text-xs bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1.5 rounded-lg"
              value={overtimeHistoryMonth}
              max={`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`}
              onChange={e => setOvertimeHistoryMonth(e.target.value)}
              aria-label="Filter overtime history by month"
            />
          }
        >
          <p className="text-xs text-indigo-600/80 font-medium mb-4 px-1">
            General OT is automatic above 8h 15m. Management OT and early checkout OT are credited on approval as worked time minus 8h 15m. Early OT repayment tracks deficits to cover.
          </p>
          <div className="overflow-x-auto">
            <div className="max-h-[26rem] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-indigo-700 uppercase bg-indigo-50/50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">General OT</th>
                    <th className="px-4 py-3">Management OT</th>
                    <th className="px-4 py-3">Early OT</th>
                    <th className="px-4 py-3">Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOvertimeHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                        No overtime records for {overtimeHistoryMonthLabel}.
                      </td>
                    </tr>
                  ) : (
                    filteredOvertimeHistory.map(r => {
                      const generalMins = resolveGeneralOvertimeMinutes(r);
                      const mgmtMins = r.managementOvertime?.status === 'Approved'
                        ? (r.managementOvertime.completedMinutes ?? 0) : 0;
                      const earlyDeficit = r.earlyOvertime?.deficitMinutes ?? 0;
                      const earlyCovered = r.earlyOvertime?.coveredMinutes ?? 0;
                      const earlyCompleted = Math.max(
                        r.earlyOvertime?.completedMinutes ?? 0,
                        r.overtimeManageRequest?.allocations?.earlyRequestMinutes ?? 0
                      );
                      const earlyDisplay = earlyCompleted > 0
                        ? `${earlyCompleted}m`
                        : earlyDeficit > 0
                          ? `${earlyDeficit - earlyCovered}m owed`
                          : '-';
                      const workedDisplay = r.checkOut
                        ? formatDuration(r.totalWorkedSeconds || 0)
                        : (r.date === getTodayStr() && isCheckedIn ? 'In progress' : '--');

                      return (
                        <tr key={r.id} className="bg-white border-b hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3 font-bold text-gray-900">{formatDate(r.date)}</td>
                          <td className="px-4 py-3 font-mono text-emerald-600 font-bold">{generalMins > 0 ? `${generalMins}m` : '-'}</td>
                          <td className="px-4 py-3 font-mono text-violet-600 font-bold">{mgmtMins > 0 ? `${mgmtMins}m` : '-'}</td>
                          <td className="px-4 py-3 font-mono text-amber-600 font-bold">{earlyDisplay}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-700">{workedDisplay}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Attendance History Table (FR20) */}
        <Card title="My Attendance History" className="w-full">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
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
                  paginatedAttendanceHistory.map(r => {
                    const recordDate = typeof r.date === 'string' ? r.date.split('T')[0] : getLocalISOString(new Date(r.date));
                    const halfDayThisDate =
                      user?.id && hasApprovedHalfDayLeaveOnDate(myLeaves, user.id, recordDate);
                    // Find leave row for label (time range)
                    const halfDayLeave = myLeaves.find(l => {
                      const status = String(l.status || '').trim();
                      const isApproved = status === 'Approved' || status === LeaveStatus.APPROVED;
                      if (!isApproved || l.category !== LeaveCategory.HALF_DAY) return false;
                      const start = typeof l.startDate === 'string' ? l.startDate.split('T')[0] : getLocalISOString(new Date(l.startDate));
                      const end = typeof l.endDate === 'string' ? l.endDate.split('T')[0] : getLocalISOString(new Date(l.endDate));
                      return recordDate >= start && recordDate <= end;
                    });

                    // Check if this day is a company holiday
                    const isHolidayWorkDay = holidayDateSet.has(recordDate);

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
                        <td className="px-4 py-3 font-mono text-xs">
                          <div>{formatTime(r.checkIn, systemSettings.timezone)}</div>
                          {(() => {
                            const { isLate, penaltySeconds } = getLateCheckInPenaltyInfo(
                              r,
                              systemSettings,
                              !!halfDayThisDate,
                              employeeSchedule
                            );
                            return isLate && penaltySeconds > 0 ? (
                              <div className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                                <AlertCircle size={10} /> Late check-in penalty: {formatPenaltyDisplay(penaltySeconds)}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{formatTime(r.checkOut, systemSettings.timezone)}</td>
                        <td className="px-4 py-3 text-xs">
                          <div>{r.breaks.length} breaks</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {formatDuration(
                            halfDayThisDate
                              ? (r.totalWorkedSeconds || 0) + (r.penaltySeconds || 0)
                              : r.totalWorkedSeconds || 0
                          )}
                          {(() => {
                            const { isLate, penaltySeconds } = getLateCheckInPenaltyInfo(
                              r,
                              systemSettings,
                              !!halfDayThisDate,
                              employeeSchedule
                            );
                            return isLate && penaltySeconds > 0 ? (
                              <div className="text-[10px] text-gray-400 font-normal">
                                (-{formatPenaltyDisplay(penaltySeconds)} late check-in penalty)
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
                            // totalWorkedSeconds is already net of late penalty on the server; subtracting
                            // penaltySeconds again would double-count and wrongly show "low time" (see monthly stats above).
                            let effectiveWorked = r.totalWorkedSeconds || 0;

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

                            const recordDateNorm = r.date?.includes('T') ? r.date.split('T')[0] : r.date;
                            if (hasCheckoutOverrideForDate(systemSettings, recordDateNorm, employeeSchedule)) {
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight">Admin early release</span>
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-semibold">No low time</span>
                                </div>
                              );
                            }

                            // Match backend General OT: surplus above 8h 15m (4h 15m half-day),
                            // using totalWorkedSeconds which is already net of late-check-in penalty.
                            const MIN_NORMAL = halfDayLeave ? (255 * 60) : ((8 * 3600) + (15 * 60)); // 4h15m or 8h15m

                            if (effectiveWorked > MIN_NORMAL) {
                              const diff = effectiveWorked - MIN_NORMAL;
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  {halfDayLeave && (
                                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tight">Leave: 04:00:00</span>
                                  )}
                                  {extraTimeLeaveForDate && (
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Extra Time Leave Credit</span>
                                  )}
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">+{formatDuration(diff)}</span>
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
          {myAttendanceHistory.length > ATTENDANCE_HISTORY_PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Showing{' '}
                <span className="font-semibold text-gray-800">
                  {(attendanceHistoryPage - 1) * ATTENDANCE_HISTORY_PAGE_SIZE + 1}
                </span>
                {' '}to{' '}
                <span className="font-semibold text-gray-800">
                  {Math.min(attendanceHistoryPage * ATTENDANCE_HISTORY_PAGE_SIZE, myAttendanceHistory.length)}
                </span>
                {' '}of{' '}
                <span className="font-semibold text-gray-800">{myAttendanceHistory.length}</span> records
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAttendanceHistoryPage(p => Math.max(1, p - 1))}
                  disabled={attendanceHistoryPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-sm text-gray-600 min-w-[5rem] text-center">
                  Page {attendanceHistoryPage} of {attendanceHistoryTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAttendanceHistoryPage(p => Math.min(attendanceHistoryTotalPages, p + 1))}
                  disabled={attendanceHistoryPage === attendanceHistoryTotalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {user?.role === Role.HR && (
          <AdminDashboard embeddedSection="monthly-performance" />
        )}

        {/* Leave Listing */}
        <Card title={`My Leaves${leaveShowAll ? ' — All' : leaveFilterMonth ? ` — ${new Date(leaveFilterMonth + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })}` : ''}`} className="w-full">
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
                    onChange={e => {
                      setLeaveShowAll(false);
                      setLeaveFilterDate(e.target.value);
                    }}
                    placeholder="Filter by date"
                  />
                  <input
                    type="month"
                    className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg"
                    value={leaveShowAll ? '' : leaveFilterMonth}
                    onChange={e => {
                      setLeaveShowAll(false);
                      setLeaveFilterMonth(e.target.value);
                    }}
                    placeholder="Filter by month"
                  />
                  <button
                    type="button"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      leaveShowAll
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                    }`}
                    onClick={() => {
                      setLeaveShowAll(true);
                      setLeaveFilterMonth('');
                      setLeaveFilterDate('');
                    }}
                  >
                    All
                  </button>
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
                            <td className="px-4 py-3">
                              {(() => {
                                const effectiveCat = getEffectiveLeaveCategory(leave);
                                const catStyle = effectiveCat === LeaveCategory.PAID ? 'bg-blue-50 text-blue-600' :
                                  effectiveCat === LeaveCategory.UNPAID ? 'bg-rose-50 text-rose-500' :
                                  effectiveCat === LeaveCategory.EXTRA_TIME ? 'bg-emerald-50 text-emerald-600' :
                                  'bg-amber-50 text-amber-600';
                                return (
                                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${catStyle}`}>
                                    {effectiveCat}
                                  </span>
                                );
                              })()}
                            </td>
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
                                        appAlert('Leave reverted to Pending status successfully');
                                        await refreshData();
                                      } catch (error: any) {
                                        appAlert(error.message || 'Failed to revert leave');
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

        {/* HR: 3 lists — Leave, Early Checkout, Overtime */}
        {user?.role === Role.HR && (
          <section className="w-full space-y-6">
            <h2 className="text-xl font-bold text-gray-800">Pending Requests</h2>

            {/* 1. Leave Requests */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">1. Leave Requests</h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  {pendingLeaveApprovals.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingLeaveApprovals.length === 0 && (
                  <p className="text-gray-400 text-sm italic col-span-2">No pending leave requests.</p>
                )}
                {pendingLeaveApprovals.map(req => (
                  <Card key={req.id} className="border-l-4 border-l-yellow-400">
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-900">{req.userName}</h4>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mt-1 inline-block">
                            {req.category}
                          </span>
                          <p className="text-sm text-gray-600 mt-2">
                            {formatDate(req.startDate)} - {formatDate(req.endDate)}
                          </p>
                          <p className="text-sm text-gray-500 mt-2 italic">"{req.reason}"</p>
                          {req.attachmentUrl && (
                            <a
                              href={req.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-500 underline mt-1 block"
                            >
                              View Attachment
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <input
                          type="text"
                          className="w-full text-xs p-2 border rounded mb-2"
                          placeholder="Optional HR Comment..."
                          value={approvalComments[req.id] || ''}
                          onChange={(e) =>
                            setApprovalComments({ ...approvalComments, [req.id]: e.target.value })
                          }
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() =>
                              updateLeaveStatus(
                                req.id,
                                LeaveStatus.APPROVED,
                                approvalComments[req.id] || 'Approved by HR'
                              )
                            }
                          >
                            <Check size={16} className="mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              updateLeaveStatus(
                                req.id,
                                LeaveStatus.REJECTED,
                                approvalComments[req.id] || 'Rejected by HR'
                              )
                            }
                          >
                            <X size={16} className="mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* 2. Early Checkout Requests */}
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4">2. Early Checkout Requests</h3>
              <EarlyOvertimePanel variant="full" showTitle={false} />
            </div>

            {/* 3. Overtime Requests */}
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">3. Overtime Requests</h3>
              <p className="text-sm text-gray-500 mb-4">
                Extra time from completed working hours to checkout — Manage to allocate OT buckets
              </p>
              <OvertimeManagePanel variant="full" showTitle={false} />
            </div>
          </section>
        )}

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
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  {checkoutRequestType === 'break' ? 'Checkout Approval Request' : 'Early Checkout Request'}
                </h3>
                <div className="mt-2 text-sm text-slate-500 leading-relaxed px-2">
                  {checkoutRequestType === 'break' ? (
                    <>
                      You need <span className="font-bold text-slate-900">20 minutes</span> of break before checkout.
                      You currently have <span className="font-bold text-slate-900">{formatDuration(totalBreakSecondsToday)}</span>.
                      Ask admin to approve checkout without the break requirement.
                    </>
                  ) : (
                    <>
                      Standard shift completion requires <span className="font-bold text-slate-900">8 hours and 15 minutes</span>.
                      Please specify your reason for an early checkout.
                    </>
                  )}
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

    </div>
  );
};
