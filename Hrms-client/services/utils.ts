import { Attendance, Bond, Break, User, LeaveRequest, LeaveCategory, LeaveStatus } from '../types';

// Business Rules
// BR1: Low Time < 8:15 (495 mins), Extra Time > 8:22 (502 mins)
// BR3: Half-day reduces threshold to 4 hours (240 mins)

const LOW_TIME_THRESHOLD_MINUTES = 495; // 8h 15m
const EXTRA_TIME_THRESHOLD_MINUTES = 502; // 8h 22m
const HALF_DAY_LEAVE_MINUTES = 240; // 4h 00m credit
const HALF_DAY_LOW_THRESHOLD_MINUTES = 255; // (8h 15m - 4h) = 4h 15m
const HALF_DAY_EXTRA_THRESHOLD_MINUTES = 262; // (8h 22m - 4h) = 4h 22m
/** Upper bound of “normal” for a half-day leave day (extra time is above this) — same as `calculateDailyTimeStats` and attendance status column. */
export const HALF_DAY_EXTRA_THRESHOLD_SECONDS = HALF_DAY_EXTRA_THRESHOLD_MINUTES * 60;
export const PENALTY_EFFECTIVE_DATE = '2026-03-01';
export const LATE_PENALTY_SECONDS = 900; // 15 minutes
export const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-06';
export const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';
/** Aligned with Hrms-server COMPULSORY_BREAK_EFFECTIVE_DATE */
export const COMPULSORY_BREAK_EFFECTIVE_DATE = '2026-04-06';
/** Minimum combined Break + Extra Break before checkout (20 minutes). */
export const MIN_TOTAL_BREAK_SECONDS = 1200;

const normYmd = (s: string) => {
  if (!s) return '';
  const x = s.includes('T') ? s.split('T')[0] : s;
  return x.slice(0, 10);
};

/** Approved half-day leave covering this calendar day → no late check-in penalty (UI + summaries). */
export const hasApprovedHalfDayLeaveOnDate = (
  leaves: Array<Pick<LeaveRequest, 'userId' | 'startDate' | 'endDate' | 'category' | 'status'>>,
  userId: string,
  dateStr: string
): boolean => {
  const d = normYmd(dateStr);
  return leaves.some(l => {
    if (l.userId !== userId) return false;
    const st = String(l.status || '').trim();
    if (st !== 'Approved' && st !== LeaveStatus.APPROVED) return false;
    const cat = String(l.category || '');
    if (cat !== LeaveCategory.HALF_DAY && cat !== 'Half Day Leave') return false;
    const start = normYmd(l.startDate);
    const end = normYmd(l.endDate);
    return d >= start && d <= end;
  });
};

export const isLateCheckIn = (isoStr?: string): boolean => {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  // Late if after exactly 09:00:00
  return (hours > 9) || (hours === 9 && (minutes > 0 || seconds > 0));
};

export const isPenaltyEffective = (dateStr: string): boolean => {
  if (!dateStr) return false;
  // Handle both ISO strings and YYYY-MM-DD
  const dateStrSimple = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return dateStrSimple >= PENALTY_EFFECTIVE_DATE;
};

/**
 * DETERMINES THE START DATE FOR ABSENCE PENALTIES
 * Rules (Revised 2026-04-04):
 * 1. Pre-recorded (before 2026-04-06): Absence tracking starts exactly on 2026-04-06.
 * 2. New Joiner (on/after 2026-04-06): Absence tracking starts from their FIRST check-in date.
 *    If they haven't checked in yet, absence doesn't apply (return far future date).
 */
export const getAbsenceStartDate = (user?: User | null, firstCheckInDate?: string): string => {
  let refStr: string;
  
  if (user?.joiningDate) {
    refStr = convertToYYYYMMDD(user.joiningDate);
  } else if (user?.createdAt) {
    refStr = user.createdAt.split('T')[0];
  } else {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }

  // Rule 1: Joined before cutoff -> Tracking starts AT cutoff
  if (refStr < ABSENCE_PENALTY_EFFECTIVE_DATE) {
    return ABSENCE_PENALTY_EFFECTIVE_DATE;
  }
  
  // Rule 2: Joined on/after cutoff -> Tracking starts from first actual check-in
  if (firstCheckInDate) {
    return firstCheckInDate;
  }
  
  // If not checked in yet, tracking hasn't started for this user
  return '9999-12-31';
};

/**
 * Calculates how many seconds late the check-in was relative to 09:00 AM.
 * Minimum penalty is 15 minutes (900s).
 */
export const calculateLatenessPenaltySeconds = (checkInIso?: string): number => {
  if (!checkInIso) return 0;

  const d = new Date(checkInIso);
  const cutoff = new Date(checkInIso);
  cutoff.setHours(9, 0, 0, 0);

  const diff = d.getTime() - cutoff.getTime();
  const latenessSeconds = Math.max(0, Math.floor(diff / 1000));

  if (latenessSeconds > 0) {
    // Penalty is 15 minutes OR actual lateness, whichever is greater
    return Math.max(LATE_PENALTY_SECONDS, latenessSeconds);
  }

  return 0;
};

export const calculateDurationSeconds = (start: string, end: string): number => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, (e - s) / 1000);
};

export const calculateTotalBreakSeconds = (breaks: Break[]): number => {
  return breaks.reduce((acc, b) => {
    if (b.start && b.end) {
      const stored = (b as Break & { durationSeconds?: number }).durationSeconds;
      if (typeof stored === 'number' && stored > 0) return acc + stored;
      return acc + calculateDurationSeconds(b.start, b.end);
    }
    return acc;
  }, 0);
};

export const hasMinimumTotalBreakTime = (
  breaks: Break[],
  minSeconds: number = MIN_TOTAL_BREAK_SECONDS
): boolean => calculateTotalBreakSeconds(breaks) >= minSeconds;

export const calculateWorkedSeconds = (attendance: Attendance, checkOutTime?: string): number => {
  if (!attendance.checkIn) return 0;

  const endTimeStr = checkOutTime || attendance.checkOut;
  if (!endTimeStr) return 0; // Still active

  const totalSession = calculateDurationSeconds(attendance.checkIn, endTimeStr);
  const totalBreaks = calculateTotalBreakSeconds(attendance.breaks);

  return Math.max(0, totalSession - totalBreaks);
};

export const getFlags = (
  workedSeconds: number,
  isHalfDayApproved: boolean,
  _approvedOvertimeMinutes: number = 0,
  isEarlyReleaseDay: boolean = false
) => {
  const workedMinutes = workedSeconds / 60;
  const lowThreshold = isHalfDayApproved ? HALF_DAY_LOW_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES;
  const extraThreshold = isHalfDayApproved ? HALF_DAY_EXTRA_THRESHOLD_MINUTES : EXTRA_TIME_THRESHOLD_MINUTES;

  return {
    lowTime: isEarlyReleaseDay ? false : workedMinutes > 0 && workedMinutes < lowThreshold,
    extraTime: workedMinutes > extraThreshold
  };
};

/**
 * Calculates deficit (low time) and surplus (extra time) in seconds.
 * 
 * Rules:
 * 1. Before OVERTIME_POLICY_EFFECTIVE_DATE: Extra time is granted for all work above threshold.
 * 2. On/After OVERTIME_POLICY_EFFECTIVE_DATE: Extra time is automatic above threshold (8h 15m + 7m buffer).
 */
export const normalizeAttendanceDateStr = (dateStr?: string): string => {
  if (!dateStr) return '';
  return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.slice(0, 10);
};

export const FULL_DAY_SECONDS = LOW_TIME_THRESHOLD_MINUTES * 60; // 8h 15m
export const HALF_DAY_LEAVE_CREDIT_SECONDS = Math.floor(FULL_DAY_SECONDS / 2);

export type LeaveDayCreditCategory = LeaveCategory | 'ImplicitUnpaid' | null;

export interface LeaveDayCredit {
  creditSeconds: number;
  isFullDayLeave: boolean;
  isHalfDayLeave: boolean;
  isImplicitUnpaid: boolean;
  skipLowTime: boolean;
  category: LeaveDayCreditCategory;
}

export const isDateInLeaveRange = (dateStr: string, leave: LeaveRequest): boolean => {
  const d = normalizeAttendanceDateStr(dateStr);
  const start = normalizeAttendanceDateStr(leave.startDate);
  const end = normalizeAttendanceDateStr(leave.endDate);
  return d >= start && d <= end;
};

/** Resolve half-day leaves to their effective category (Paid / Unpaid / Extra Time). */
export const getEffectiveLeaveCategory = (leave: { category?: string; reason?: string }): string => {
  const cat = leave.category || '';
  if (cat === LeaveCategory.HALF_DAY || cat === 'Half Day Leave') {
    const reason = leave.reason || '';
    if (reason.includes('[Extra Time Leave]')) return LeaveCategory.EXTRA_TIME;
    if (reason.includes('[Unpaid Leave]')) return LeaveCategory.UNPAID;
    if (reason.includes('[Paid Leave]')) return LeaveCategory.PAID;
    return LeaveCategory.PAID;
  }
  return cat;
};

export interface EmployeeBondPeriod {
  startDate: string;
  endDate: string;
  displayEndDate: string;
  totalMonths: number;
  label: string;
  hasBonds: boolean;
}

/** Bond date range for leave summaries (first bond start → last bond end, capped at today for usage). */
export const getEmployeeBondPeriod = (user?: User | null): EmployeeBondPeriod => {
  const todayStr = getTodayStr();
  const fallbackStart = user?.joiningDate ? convertToYYYYMMDD(user.joiningDate) : todayStr;

  if (!user?.bonds?.length) {
    return {
      startDate: fallbackStart,
      endDate: todayStr,
      displayEndDate: todayStr,
      totalMonths: 0,
      label: 'Employment period',
      hasBonds: false,
    };
  }

  const bondInfo = calculateBondRemaining(user.bonds, user.joiningDate);
  const { allBonds, currentBond } = bondInfo;

  if (!allBonds.length) {
    return {
      startDate: fallbackStart,
      endDate: todayStr,
      displayEndDate: todayStr,
      totalMonths: 0,
      label: 'Employment period',
      hasBonds: false,
    };
  }

  const first = allBonds[0];
  const last = allBonds[allBonds.length - 1];
  const parsedFirstStart = convertToYYYYMMDD(first.startDate);
  const startDate = parsedFirstStart && parsedFirstStart.length === 10 ? parsedFirstStart : fallbackStart;
  const bondEndIso = last.endDate ? getLocalISOString(last.endDate) : todayStr;
  const endDate = bondEndIso > todayStr ? todayStr : bondEndIso;
  let totalMonths = 0;
  for (const b of allBonds) totalMonths += b.periodMonths || 0;
  const activeLabel = currentBond?.type ? `${currentBond.type} Bond` : 'Bond period';

  return {
    startDate,
    endDate,
    displayEndDate: bondEndIso,
    totalMonths,
    label: `${activeLabel} · ${totalMonths} month${totalMonths !== 1 ? 's' : ''}`,
    hasBonds: true,
  };
};

/** True when a leave overlaps [startYmd, endYmd] inclusive. */
export const leaveOverlapsDateRange = (
  leave: { startDate: string; endDate: string },
  startYmd: string,
  endYmd: string
): boolean => leave.startDate <= endYmd && leave.endDate >= startYmd;

/** Count working-day absences for a user within a calendar month (YYYY-MM). */
export const calculateAbsentDaysForMonth = (
  userId: string,
  user: User | undefined,
  monthStr: string,
  attendanceRecords: Attendance[],
  leaveRequests: LeaveRequest[],
  holidayDateSet: Set<string>
): number => {
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return 0;

  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const todayStr = getTodayStr();

  const attendedDates = new Set(
    attendanceRecords
      .filter(r => r.userId === userId && r.checkIn)
      .map(r => normalizeAttendanceDateStr(typeof r.date === 'string' ? r.date : getLocalISOString(new Date(r.date))))
  );

  const leaveDates = new Set<string>();
  leaveRequests
    .filter(l => {
      if (l.userId !== userId) return false;
      const st = String(l.status || '').trim();
      return st === 'Approved' || st === LeaveStatus.APPROVED;
    })
    .forEach(l => {
      let curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        leaveDates.add(getLocalISOString(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });

  const firstCheckIn = attendanceRecords
    .filter(r => r.userId === userId && r.checkIn)
    .sort((a, b) => {
      const d1 = normalizeAttendanceDateStr(typeof a.date === 'string' ? a.date : getLocalISOString(new Date(a.date)));
      const d2 = normalizeAttendanceDateStr(typeof b.date === 'string' ? b.date : getLocalISOString(new Date(b.date)));
      return d1.localeCompare(d2);
    })[0]?.date;
  const firstCheckInStr = firstCheckIn
    ? normalizeAttendanceDateStr(typeof firstCheckIn === 'string' ? firstCheckIn : getLocalISOString(new Date(firstCheckIn)))
    : undefined;
  const absenceStart = getAbsenceStartDate(user, firstCheckInStr);

  let absentCount = 0;
  const iter = new Date(monthStart);
  const now = new Date();
  const endRange = monthEnd < now ? monthEnd : now;

  while (iter <= endRange) {
    const dateStr = getLocalISOString(iter);
    const dayOfWeek = iter.getDay();
    if (
      dateStr.startsWith(monthStr) &&
      !attendedDates.has(dateStr) &&
      !leaveDates.has(dateStr) &&
      dayOfWeek !== 0 &&
      !holidayDateSet.has(dateStr) &&
      dateStr >= absenceStart &&
      dateStr < todayStr
    ) {
      absentCount += 1;
    }
    iter.setDate(iter.getDate() + 1);
  }
  return absentCount;
};

/** Approved leave credit for a calendar day (paid/unpaid/half-day/ETL). Absent days → implicit unpaid leave. */
export const getLeaveDayCredit = (
  dateStr: string,
  userId: string,
  leaves: LeaveRequest[],
  holidayDateSet: Set<string>,
  options: {
    hasAttendance?: boolean;
    treatAbsentAsUnpaidLeave?: boolean;
    todayStr?: string;
  } = {}
): LeaveDayCredit => {
  const empty: LeaveDayCredit = {
    creditSeconds: 0,
    isFullDayLeave: false,
    isHalfDayLeave: false,
    isImplicitUnpaid: false,
    skipLowTime: false,
    category: null
  };

  if (holidayDateSet.has(dateStr)) return empty;
  const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
  if (dayOfWeek === 0) return empty;

  const approvedOnDate = leaves.filter((l) => {
    if (l.userId !== userId) return false;
    const st = String(l.status || '').trim();
    if (st !== 'Approved' && st !== LeaveStatus.APPROVED) return false;
    return isDateInLeaveRange(dateStr, l);
  });

  const halfDay = approvedOnDate.find((l) => {
    if (l.category !== LeaveCategory.HALF_DAY) return false;
    return !(l.reason || '').includes('[Extra Time Leave]');
  });
  if (halfDay) {
    return {
      creditSeconds: HALF_DAY_LEAVE_CREDIT_SECONDS,
      isFullDayLeave: false,
      isHalfDayLeave: true,
      isImplicitUnpaid: false,
      skipLowTime: false,
      category: LeaveCategory.HALF_DAY
    };
  }

  const paid = approvedOnDate.find((l) => l.category === LeaveCategory.PAID);
  if (paid) {
    return {
      creditSeconds: FULL_DAY_SECONDS,
      isFullDayLeave: true,
      isHalfDayLeave: false,
      isImplicitUnpaid: false,
      skipLowTime: true,
      category: LeaveCategory.PAID
    };
  }

  const unpaid = approvedOnDate.find((l) => l.category === LeaveCategory.UNPAID);
  if (unpaid) {
    return {
      creditSeconds: FULL_DAY_SECONDS,
      isFullDayLeave: true,
      isHalfDayLeave: false,
      isImplicitUnpaid: false,
      skipLowTime: true,
      category: LeaveCategory.UNPAID
    };
  }

  const etl = approvedOnDate.find((l) => l.category === LeaveCategory.EXTRA_TIME);
  if (etl) {
    let credit = FULL_DAY_SECONDS;
    if (etl.startTime && etl.endTime) {
      const [sh, sm] = etl.startTime.split(':').map(Number);
      const [eh, em] = etl.endTime.split(':').map(Number);
      credit = Math.max(0, eh * 60 + em - (sh * 60 + sm)) * 60;
    }
    return {
      creditSeconds: credit,
      isFullDayLeave: true,
      isHalfDayLeave: false,
      isImplicitUnpaid: false,
      skipLowTime: true,
      category: LeaveCategory.EXTRA_TIME
    };
  }

  const todayStr = options.todayStr || getTodayStr();
  if (
    options.treatAbsentAsUnpaidLeave &&
    !options.hasAttendance &&
    approvedOnDate.length === 0 &&
    dateStr < todayStr
  ) {
    return {
      creditSeconds: FULL_DAY_SECONDS,
      isFullDayLeave: true,
      isHalfDayLeave: false,
      isImplicitUnpaid: true,
      skipLowTime: true,
      category: 'ImplicitUnpaid'
    };
  }

  return empty;
};

/** Merge worked seconds with leave credit for working-hours totals. */
export const applyLeaveCreditToWorkedSeconds = (
  workedSeconds: number,
  credit: LeaveDayCredit
): number => {
  if (credit.creditSeconds <= 0) return workedSeconds;
  if (credit.isFullDayLeave) {
    return Math.max(workedSeconds, credit.creditSeconds);
  }
  return workedSeconds + credit.creditSeconds;
};

export const calculateDailyTimeStats = (
  effectiveWorkedSeconds: number,
  isHalfDayApproved: boolean,
  isHoliday: boolean,
  _approvedOvertimeMinutes: number = 0,
  dateStr?: string,
  systemSettings?: { checkoutTimeOverrides?: Record<string, string> },
  skipLowTime: boolean = false
) => {
  if (isHoliday) {
    return { lowTimeSeconds: 0, extraTimeSeconds: effectiveWorkedSeconds };
  }

  const normDate = normalizeAttendanceDateStr(dateStr);
  const isEarlyReleaseDay =
    Boolean(normDate && systemSettings && hasCheckoutOverrideForDate(systemSettings, normDate));

  const lowThresholdSec = (isHalfDayApproved ? HALF_DAY_LOW_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES) * 60;
  const extraThresholdSec = (isHalfDayApproved ? HALF_DAY_EXTRA_THRESHOLD_MINUTES : EXTRA_TIME_THRESHOLD_MINUTES) * 60;

  let lowTimeSeconds = 0;
  let extraTimeSeconds = 0;

  if (skipLowTime) {
    if (effectiveWorkedSeconds > extraThresholdSec) {
      extraTimeSeconds = effectiveWorkedSeconds - extraThresholdSec;
    }
    return { lowTimeSeconds: 0, extraTimeSeconds };
  }

  // Deficit calculation: only against standard lower bound (not target)
  if (!isEarlyReleaseDay && effectiveWorkedSeconds < lowThresholdSec) {
    if (effectiveWorkedSeconds > 0) {
      lowTimeSeconds = lowThresholdSec - effectiveWorkedSeconds;
    } else {
      lowTimeSeconds = lowThresholdSec;
    }
  }

  if (effectiveWorkedSeconds > extraThresholdSec) {
    extraTimeSeconds = effectiveWorkedSeconds - extraThresholdSec;
  }

  return { lowTimeSeconds, extraTimeSeconds };
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatDate = (dateStr: string | Date): string => {
  if (!dateStr) return '';

  let date: Date;

  if (dateStr instanceof Date) {
    date = dateStr;
  } else if (typeof dateStr === 'string' && /^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
    // Check for dd-mm-yyyy format
    const [day, month, year] = dateStr.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    // Try standard parsing
    date = new Date(dateStr);
  }

  if (isNaN(date.getTime())) return 'Invalid Date';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const DEFAULT_CHECK_IN_TIME = '08:30';
export const DEFAULT_CHECKOUT_TIME = '17:30';

export const getWallClockHM = (
  date: Date,
  timeZone: string = 'Asia/Kolkata'
): { hour: number; minute: number } => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
    return { hour, minute };
  } catch {
    return { hour: date.getHours(), minute: date.getMinutes() };
  }
};

export const getDateStrInTimezone = (date: Date, timeZone: string = 'Asia/Kolkata'): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
};

export const parseCheckoutTime = (timeStr?: string): { hour: number; minute: number } => {
  const s = String(timeStr || DEFAULT_CHECKOUT_TIME).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 17, minute: 30 };
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 17, minute: 30 };
  return { hour, minute };
};

export const parseCheckInTime = (timeStr?: string): { hour: number; minute: number } => {
  const s = String(timeStr || DEFAULT_CHECK_IN_TIME).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 8, minute: 30 };
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 8, minute: 30 };
  return { hour, minute };
};

export const getCheckInOverrideForDate = (
  settings: { checkInTimeOverrides?: Record<string, string> },
  dateStr: string
): string | null => settings?.checkInTimeOverrides?.[dateStr] ?? null;

export const hasCheckInOverrideForDate = (
  settings: { checkInTimeOverrides?: Record<string, string> },
  dateStr: string
): boolean => Boolean(getCheckInOverrideForDate(settings, dateStr));

export const resolveCheckInTimeForDate = (
  settings: { defaultCheckInTime?: string; checkInTimeOverrides?: Record<string, string> },
  dateStr: string
): { hour: number; minute: number } => {
  const override = getCheckInOverrideForDate(settings, dateStr);
  return parseCheckInTime(override || settings?.defaultCheckInTime || DEFAULT_CHECK_IN_TIME);
};

export const getCheckoutOverrideForDate = (
  settings: { checkoutTimeOverrides?: Record<string, string> },
  dateStr: string
): string | null => settings?.checkoutTimeOverrides?.[dateStr] ?? null;

export const hasCheckoutOverrideForDate = (
  settings: { checkoutTimeOverrides?: Record<string, string> },
  dateStr: string
): boolean => Boolean(getCheckoutOverrideForDate(settings, dateStr));

export const resolveCheckoutTimeForDate = (
  settings: { defaultCheckoutTime?: string; checkoutTimeOverrides?: Record<string, string> },
  dateStr: string
): { hour: number; minute: number } => {
  const override = getCheckoutOverrideForDate(settings, dateStr);
  return parseCheckoutTime(override || settings?.defaultCheckoutTime || DEFAULT_CHECKOUT_TIME);
};

export const formatCheckoutTimeLabel = (hour: number, minute: number): string => {
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

export const isClockOutTimeAllowed = (
  now: Date,
  opts: {
    hasHalfDayLeave?: boolean;
    earlyLogoutApproved?: boolean;
    roleIsAdmin?: boolean;
    isHoliday?: boolean;
    checkoutHour?: number;
    checkoutMinute?: number;
    timeZone?: string;
  } = {}
): boolean => {
  const {
    hasHalfDayLeave = false,
    earlyLogoutApproved = false,
    roleIsAdmin = false,
    isHoliday = false,
    checkoutHour = 17,
    checkoutMinute = 30,
    timeZone = 'Asia/Kolkata'
  } = opts;
  if (roleIsAdmin || earlyLogoutApproved || isHoliday || hasHalfDayLeave) return true;
  const { hour, minute } = getWallClockHM(now, timeZone);
  return hour > checkoutHour || (hour === checkoutHour && minute >= checkoutMinute);
};

/** True if local time in `timeZone` is still before 8:30 (employees cannot check in yet). */
export const isBeforeEarliestCheckIn = (
  date: Date,
  timeZone: string = 'Asia/Kolkata',
  earliestHour = 8,
  earliestMinute = 30
): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
    return h < earliestHour || (h === earliestHour && m < earliestMinute);
  } catch {
    const h = date.getHours();
    const m = date.getMinutes();
    return h < earliestHour || (h === earliestHour && m < earliestMinute);
  }
};

// BR6: Display timestamps in company timezone
export const formatTime = (isoStr?: string, timeZone: string = 'Asia/Kolkata'): string => {
  if (!isoStr) return '--:--';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timeZone
    });
  } catch (e) {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
};

export const getTodayStr = () => getLocalISOString(new Date());

/**
 * Returns YYYY-MM-DD in local time
 */
export const getLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Calculate working days (excluding Sundays and holidays) between two dates
export const calculateLeaveDays = (startDateStr: string, endDateStr: string, holidayDateSet: Set<string>, limitStart?: Date, limitEnd?: Date): number => {
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
    const dateStr = getLocalISOString(current);

    // Exclude Sundays and holidays using the provided holidayDateSet
    if (dayOfWeek !== 0 && !holidayDateSet.has(dateStr)) {
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
};

// Convert date from yyyy-mm-dd (HTML date input) to dd-mm-yyyy format
export const convertToDDMMYYYY = (dateStr: string | Date): string => {
  if (!dateStr) return '';
  
  // If it's already a Date object, format it directly
  if (dateStr instanceof Date) {
    const day = String(dateStr.getDate()).padStart(2, '0');
    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
    const year = dateStr.getFullYear();
    return `${day}-${month}-${year}`;
  }

  if (typeof dateStr !== 'string') return String(dateStr);

  if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    // Already in dd-mm-yyyy format
    return dateStr;
  }
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Convert from yyyy-mm-dd to dd-mm-yyyy
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
  }
  // Try to parse as Date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (e) {
    // Ignore error
  }
  return dateStr;
};

// Convert date from dd-mm-yyyy to yyyy-mm-dd (for HTML date input)
export const convertToYYYYMMDD = (dateStr: string | Date): string => {
  if (!dateStr) return '';
  
  if (dateStr instanceof Date) {
    return dateStr.toISOString().split('T')[0];
  }

  if (typeof dateStr !== 'string') return String(dateStr);

  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Already in yyyy-mm-dd format
    return dateStr;
  }
  const dmYMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmYMatch) {
    const day = dmYMatch[1];
    const month = dmYMatch[2];
    const year = dmYMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Try to parse as Date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Ignore error
  }
  return dateStr;
};

// Parse dd-mm-yyyy date to Date object
export const parseDDMMYYYY = (dateStr: string | Date): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  if (typeof dateStr !== 'string') return new Date(dateStr);

  try {
    const dmYMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{2,4})$/);
    if (dmYMatch) {
      const day = parseInt(dmYMatch[1]);
      const month = parseInt(dmYMatch[2]);
      const yearStr = dmYMatch[3];
      let year = parseInt(yearStr);
      // Handle 2-digit years
      if (yearStr.length === 2) {
        year += year < 50 ? 2000 : 1900;
      }
      return new Date(year, month - 1, day);
    }
    // Try standard ISO parsing
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) return isoDate;
    return null;
  } catch {
    return null;
  }
};

// Calculate remaining bond period for multiple bonds
// Returns information about current active bond and total remaining time
export const calculateBondRemaining = (bonds?: Bond[], joiningDate?: string) => {
  if (!bonds || bonds.length === 0) {
    return {
      currentBond: null,
      totalRemaining: { years: 0, months: 0, days: 0, display: '-', isExpired: false },
      allBonds: []
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sort bonds by order
  const sortedBonds = [...bonds].sort((a, b) => (a.order || 0) - (b.order || 0));

  let currentBondIndex = -1;
  let totalRemainingMonths = 0;
  let totalRemainingDays = 0;
  const allBondsInfo: Array<{
    type: string;
    periodMonths: number;
    startDate: string;
    endDate: Date | null;
    remaining: { months: number; days: number; display: string; isExpired: boolean; isActive: boolean };
    salary?: number;
  }> = [];

  // Calculate end dates and find current active bond
  let cumulativeStartDate: Date | null = null;
  const joiningDateObj = joiningDate ? parseDDMMYYYY(joiningDate) : null;

  for (let i = 0; i < sortedBonds.length; i++) {
    const bond = sortedBonds[i];
    let bondStartDate: Date;

    // Prioritize manual start date if provided
    const manualStartDate = parseDDMMYYYY(bond.startDate);
    
    if (manualStartDate && !isNaN(manualStartDate.getTime())) {
      bondStartDate = manualStartDate;
    } else if (i === 0) {
      // First bond falls back to joining date if no manual start date
      bondStartDate = joiningDateObj || today;
    } else if (cumulativeStartDate && !isNaN(cumulativeStartDate.getTime())) {
      // Subsequent bonds start from previous bond's end date + 1 day if no manual start date
      bondStartDate = new Date(cumulativeStartDate);
      bondStartDate.setDate(bondStartDate.getDate() + 1);
      bondStartDate.setHours(0, 0, 0, 0);
    } else {
      // Fallback
      bondStartDate = today;
    }

    // Calculate end date
    const endDate = new Date(bondStartDate);
    endDate.setMonth(endDate.getMonth() + bond.periodMonths);
    endDate.setHours(23, 59, 59, 999);

    // Check if this bond is currently active
    const isActive = today >= bondStartDate && today <= endDate;
    const isExpired = today > endDate;
    const isFuture = today < bondStartDate;

    if (isActive && currentBondIndex === -1) {
      currentBondIndex = i;
    }

    // Calculate remaining time for this bond
    let remainingMonths = 0;
    let remainingDays = 0;
    let display = '';
    let bondIsExpired = false;

    if (isExpired) {
      bondIsExpired = true;
      const expiredTime = today.getTime() - endDate.getTime();
      const expiredDays = Math.floor(expiredTime / (1000 * 60 * 60 * 24));
      const expiredMonths = Math.floor(expiredDays / 30);
      display = `Expired ${expiredMonths > 0 ? `${expiredMonths} month${expiredMonths > 1 ? 's' : ''} ` : ''}${expiredDays % 30} day${(expiredDays % 30) !== 1 ? 's' : ''} ago`;
    } else if (isActive) {
      // Calculate remaining time until end date - properly calculate months and days
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDay = today.getDate();
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth();
      const endDay = endDate.getDate();

      // Calculate months difference
      let yearDiff = endYear - todayYear;
      let monthDiff = endMonth - todayMonth;
      remainingMonths = yearDiff * 12 + monthDiff;

      // Calculate days - if end day is before today's day in the end month, subtract a month
      if (endDay < todayDay) {
        remainingMonths = Math.max(0, remainingMonths - 1);
        // Calculate days from today to end of current month + days from start of end month to end day
        const daysInCurrentMonth = new Date(todayYear, todayMonth + 1, 0).getDate();
        const daysToEndOfMonth = daysInCurrentMonth - todayDay;
        remainingDays = daysToEndOfMonth + endDay;
      } else {
        remainingDays = endDay - todayDay;
      }

      // If remainingMonths is 0, just show days
      if (remainingMonths === 0) {
        display = `${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
      } else if (remainingDays === 0) {
        display = `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
      } else {
        display = `${remainingMonths} month${remainingMonths > 1 ? 's' : ''} ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
      }

      // Add to total remaining
      totalRemainingMonths += remainingMonths;
      totalRemainingDays += remainingDays;
    } else if (isFuture) {
      // Future bond - add full period to total
      totalRemainingMonths += bond.periodMonths;
      display = `Starts in ${Math.ceil((bondStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} days`;
    }

    allBondsInfo.push({
      type: bond.type,
      periodMonths: bond.periodMonths,
      startDate: bond.startDate,
      endDate,
      remaining: {
        months: remainingMonths,
        days: remainingDays,
        display,
        isExpired: bondIsExpired,
        isActive
      },
      salary: bond.salary || 0
    });

    // Store end date for next bond (will add +1 day at start of next iteration)
    cumulativeStartDate = new Date(endDate);
  }

  // Calculate total remaining time - properly handle months and days
  // Don't convert days to months, keep them separate for accurate display
  let totalYears = Math.floor(totalRemainingMonths / 12);
  let totalRemainingMonthsOnly = totalRemainingMonths % 12;
  let totalDays = totalRemainingDays;

  // If days exceed 30, convert excess to months
  if (totalDays >= 30) {
    const extraMonths = Math.floor(totalDays / 30);
    totalRemainingMonthsOnly += extraMonths;
    totalDays = totalDays % 30;
    // Recalculate years if needed
    if (totalRemainingMonthsOnly >= 12) {
      totalYears += Math.floor(totalRemainingMonthsOnly / 12);
      totalRemainingMonthsOnly = totalRemainingMonthsOnly % 12;
    }
  }

  let totalDisplay = '';
  if (totalYears > 0 && totalRemainingMonthsOnly > 0) {
    totalDisplay = `${totalYears} year${totalYears > 1 ? 's' : ''} ${totalRemainingMonthsOnly} month${totalRemainingMonthsOnly > 1 ? 's' : ''}`;
  } else if (totalYears > 0) {
    totalDisplay = `${totalYears} year${totalYears > 1 ? 's' : ''}`;
  } else if (totalRemainingMonthsOnly > 0) {
    totalDisplay = `${totalRemainingMonthsOnly} month${totalRemainingMonthsOnly > 1 ? 's' : ''} ${totalDays > 0 ? `${totalDays} day${totalDays > 1 ? 's' : ''}` : ''}`;
  } else if (totalDays > 0) {
    totalDisplay = `${totalDays} day${totalDays > 1 ? 's' : ''}`;
  } else {
    totalDisplay = 'Completed';
  }

  // Calculate final completion date (end date of the last bond in the sequence)
  let firstCompletionDate: Date | null = null;
  let firstCompletionBondType: string | null = null;
  
  if (allBondsInfo.length > 0) {
    const lastBond = allBondsInfo[allBondsInfo.length - 1];
    firstCompletionDate = lastBond.endDate;
    firstCompletionBondType = lastBond.type;
  }

  // Calculate finish date (end date of the last bond) - for backward compatibility
  let finishDate = firstCompletionDate;

  // Calculate current bond remaining time (only for the active bond, not total)
  let currentBondRemainingMonths = 0;
  let currentBondRemainingDays = 0;
  let currentBondDisplay = 'Completed';

  if (currentBondIndex >= 0 && allBondsInfo[currentBondIndex]) {
    const currentBond = allBondsInfo[currentBondIndex];
    currentBondRemainingMonths = currentBond.remaining.months;
    currentBondRemainingDays = currentBond.remaining.days;
    currentBondDisplay = currentBond.remaining.display;
  } else {
    // If no active bond, find the next future bond
    for (const bond of allBondsInfo) {
      if (!bond.remaining.isExpired && !bond.remaining.isActive) {
        // Future bond - calculate days until it starts
        if (bond.endDate) {
          const daysUntilStart = Math.ceil((bond.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          currentBondDisplay = `Starts in ${daysUntilStart} day${daysUntilStart > 1 ? 's' : ''}`;
        }
        break;
      }
    }
  }

  // Get current salary/stipend from active bond
  let currentSalary = 0;
  if (currentBondIndex >= 0 && sortedBonds[currentBondIndex]) {
    currentSalary = sortedBonds[currentBondIndex].salary || 0;
  }

  return {
    currentBond: currentBondIndex >= 0 ? allBondsInfo[currentBondIndex] : null,
    totalRemaining: {
      years: totalYears,
      months: totalRemainingMonthsOnly,
      days: totalDays,
      display: totalDisplay,
      isExpired: false
    },
    currentBondRemaining: {
      months: currentBondRemainingMonths,
      days: currentBondRemainingDays,
      display: currentBondDisplay
    },
    allBonds: allBondsInfo,
    finishDate: finishDate, // End date of the last bond
    firstCompletionDate: firstCompletionDate, // End date of the first bond that will complete
    firstCompletionBondType: firstCompletionBondType, // Type of the first bond that will complete
    currentSalary: currentSalary // Current salary/stipend based on active bond
  };
};

/** Resolve general OT from new or legacy fields — never discards historical overtimeRequest data. */
export const resolveGeneralOvertimeMinutes = (record: Attendance): number => {
  const stored = record.generalOvertimeMinutes;
  if (typeof stored === 'number' && stored > 0) return stored;
  const ot = record.overtimeRequest;
  if (ot?.completedMinutes && ot.completedMinutes > 0) return ot.completedMinutes;
  if (ot?.status === 'Approved' && ot.durationMinutes && ot.durationMinutes > 0) return ot.durationMinutes;
  return stored ?? 0;
};

export interface MonthlyOvertimeSummary {
  workingDays: number;
  expectedSeconds: number;
  actualWorkedSeconds: number;
  generalOvertimeSeconds: number;
  managementOvertimeSeconds: number;
  earlyOvertimeOutstandingSeconds: number;
  earlyOvertimeCoveredSeconds: number;
  remainingSeconds: number;
}

/** Monthly overtime breakdown for dashboard (3 OT types + remaining). */
export const calculateMonthlyOvertimeSummary = (
  monthStr: string,
  attendanceRecords: Attendance[],
  leaves: LeaveRequest[],
  holidayDateSet: Set<string>,
  userId: string,
  systemSettings?: { checkoutTimeOverrides?: Record<string, string> },
  liveTodayWorkedSeconds?: number | null
): MonthlyOvertimeSummary => {
  const [year, month] = monthStr.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const nowDay = new Date();
  const endDate = lastOfMonth < nowDay ? lastOfMonth : nowDay;

  const attendanceMap = new Map<string, Attendance>();
  attendanceRecords
    .filter((r) => r.userId === userId)
    .forEach((r) => {
      const d = normalizeAttendanceDateStr(r.date);
      if (d.startsWith(monthStr)) attendanceMap.set(d, r);
    });

  const approvedLeaveDates = new Set<string>();
  leaves
    .filter((l) => {
      if (l.userId !== userId) return false;
      const st = String(l.status || '').trim();
      return st === 'Approved' || st === LeaveStatus.APPROVED;
    })
    .forEach((l) => {
      let curr = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (curr <= end) {
        approvedLeaveDates.add(getLocalISOString(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });

  let workingDays = 0;
  let actualWorkedSeconds = 0;
  let generalOvertimeSeconds = 0;
  let managementOvertimeSeconds = 0;
  let earlyOvertimeOutstandingSeconds = 0;
  let earlyOvertimeCoveredSeconds = 0;

  const todayStr = getTodayStr();

  for (let iter = new Date(startDate); iter <= endDate; iter.setDate(iter.getDate() + 1)) {
    const dateStr = getLocalISOString(iter);
    const dayOfWeek = iter.getDay();
    const isHoliday = holidayDateSet.has(dateStr);
    const hasFullLeave = approvedLeaveDates.has(dateStr);

    if (dayOfWeek === 0) continue;

    const record = attendanceMap.get(dateStr);
    const leaveCredit = getLeaveDayCredit(dateStr, userId, leaves, holidayDateSet, {
      hasAttendance: Boolean(record?.checkIn),
      treatAbsentAsUnpaidLeave: true,
      todayStr
    });

    const hasHalfDay = leaveCredit.isHalfDayLeave;

    // Count as working day if not on full-day leave and not a holiday
    if (!isHoliday && (!hasFullLeave || hasHalfDay)) {
      workingDays += hasHalfDay ? 0.5 : 1;
    }

    let effectiveWorked = record?.checkOut ? (record.totalWorkedSeconds || 0) : 0;
    effectiveWorked = applyLeaveCreditToWorkedSeconds(effectiveWorked, leaveCredit);

    if (!record?.checkOut) {
      if (record?.checkIn && dateStr === todayStr && liveTodayWorkedSeconds != null) {
        let liveWorked = applyLeaveCreditToWorkedSeconds(liveTodayWorkedSeconds, leaveCredit);
        if (!isHoliday) {
          actualWorkedSeconds += liveWorked;
        } else {
          actualWorkedSeconds += liveTodayWorkedSeconds;
        }
      } else if (leaveCredit.creditSeconds > 0 && !isHoliday) {
        actualWorkedSeconds += effectiveWorked;
      }
      continue;
    }

    if (isHoliday) {
      actualWorkedSeconds += effectiveWorked;
      generalOvertimeSeconds += record.totalWorkedSeconds || 0;
      continue;
    }

    actualWorkedSeconds += effectiveWorked;

    const generalMins = resolveGeneralOvertimeMinutes(record);
    if (generalMins > 0) {
      generalOvertimeSeconds += generalMins * 60;
    } else {
      const minSec = (hasHalfDay ? HALF_DAY_LOW_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES) * 60;
      const rawWorked = record.totalWorkedSeconds || 0;
      if (rawWorked > minSec) {
        generalOvertimeSeconds += rawWorked - minSec;
      }
    }

    const mgmtMins =
      record.managementOvertime?.status === 'Approved'
        ? record.managementOvertime.completedMinutes || record.managementOvertime.durationMinutes || 0
        : 0;
    managementOvertimeSeconds += mgmtMins * 60;

    const eo = record.earlyOvertime;
    if (eo && eo.deficitMinutes > 0) {
      earlyOvertimeCoveredSeconds += (eo.coveredMinutes || 0) * 60;
      earlyOvertimeOutstandingSeconds +=
        Math.max(0, eo.deficitMinutes - (eo.coveredMinutes || 0)) * 60;
    }
  }

  const expectedSeconds = Math.round(workingDays * FULL_DAY_SECONDS);
  const remainingSeconds = expectedSeconds - actualWorkedSeconds;

  return {
    workingDays,
    expectedSeconds,
    actualWorkedSeconds,
    generalOvertimeSeconds,
    managementOvertimeSeconds,
    earlyOvertimeOutstandingSeconds,
    earlyOvertimeCoveredSeconds,
    remainingSeconds
  };
};

export const formatHoursMinutesShort = (totalSeconds: number): string => {
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sign = totalSeconds < 0 ? '-' : '';
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
};

export const downloadCSV = (filename: string, rows: any[]) => {
  if (!rows || !rows.length) return;
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows.map(row => {
      return keys.map(k => {
        let cell = row[k] === null || row[k] === undefined ? '' : row[k];
        cell = cell instanceof Date ? cell.toLocaleString() : cell.toString().replace(/"/g, '""');
        if (cell.search(/("|,|\n)/g) >= 0) {
          cell = `"${cell}"`;
        }
        return cell;
      }).join(separator);
    }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};