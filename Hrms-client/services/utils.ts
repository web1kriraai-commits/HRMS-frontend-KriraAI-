import { Attendance, Bond, Break, User } from '../types';

// Business Rules
// BR1: Low Time < 8:15 (495 mins), Extra Time > 8:22 (502 mins)
// BR3: Half-day reduces threshold to 4 hours (240 mins)

const LOW_TIME_THRESHOLD_MINUTES = 495; // 8h 15m
const EXTRA_TIME_THRESHOLD_MINUTES = 502; // 8h 22m
const HALF_DAY_LEAVE_MINUTES = 240; // 4h 00m credit
const HALF_DAY_LOW_THRESHOLD_MINUTES = 255; // (8h 15m - 4h) = 4h 15m
const HALF_DAY_EXTRA_THRESHOLD_MINUTES = 262; // (8h 22m - 4h) = 4h 22m
export const PENALTY_EFFECTIVE_DATE = '2026-03-01';
export const LATE_PENALTY_SECONDS = 900; // 15 minutes
export const ABSENCE_PENALTY_EFFECTIVE_DATE = '2026-04-06';
export const OVERTIME_POLICY_EFFECTIVE_DATE = '2026-04-06';

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
      return acc + calculateDurationSeconds(b.start, b.end);
    }
    return acc;
  }, 0);
};

export const calculateWorkedSeconds = (attendance: Attendance, checkOutTime?: string): number => {
  if (!attendance.checkIn) return 0;

  const endTimeStr = checkOutTime || attendance.checkOut;
  if (!endTimeStr) return 0; // Still active

  const totalSession = calculateDurationSeconds(attendance.checkIn, endTimeStr);
  const totalBreaks = calculateTotalBreakSeconds(attendance.breaks);

  return Math.max(0, totalSession - totalBreaks);
};

export const getFlags = (workedSeconds: number, isHalfDayApproved: boolean, approvedOvertimeMinutes: number = 0) => {
  const workedMinutes = workedSeconds / 60;

  // If Half-Day, use adjusted threshold (Standard - 4h leave)
  const lowThreshold = isHalfDayApproved ? HALF_DAY_LOW_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES;
  const extraThreshold = isHalfDayApproved ? HALF_DAY_EXTRA_THRESHOLD_MINUTES : EXTRA_TIME_THRESHOLD_MINUTES;
  
  // COMMITMENT RULE: Approved Overtime increases the target for extra work, 
  // but Low Time is only triggered if work is below the standard minimum.
  const targetMinutes = extraThreshold + approvedOvertimeMinutes;

  return {
    lowTime: workedMinutes > 0 && workedMinutes < lowThreshold,
    extraTime: approvedOvertimeMinutes > 0 && workedMinutes > extraThreshold
  };
};

/**
 * Calculates deficit (low time) and surplus (extra time) in seconds.
 * 
 * Rules:
 * 1. Before OVERTIME_POLICY_EFFECTIVE_DATE: Extra time is granted for all work above threshold.
 * 2. On/After OVERTIME_POLICY_EFFECTIVE_DATE: Extra time requires approved overtime request.
 */
export const calculateDailyTimeStats = (effectiveWorkedSeconds: number, isHalfDayApproved: boolean, isHoliday: boolean, approvedOvertimeMinutes: number = 0, dateStr?: string) => {
  if (isHoliday) {
    return { lowTimeSeconds: 0, extraTimeSeconds: effectiveWorkedSeconds };
  }

  const lowThresholdSec = (isHalfDayApproved ? HALF_DAY_LOW_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES) * 60;
  const extraThresholdSec = (isHalfDayApproved ? HALF_DAY_EXTRA_THRESHOLD_MINUTES : EXTRA_TIME_THRESHOLD_MINUTES) * 60;
  
  let lowTimeSeconds = 0;
  let extraTimeSeconds = 0;

  // Deficit calculation: only against standard lower bound (not target)
  if (effectiveWorkedSeconds < lowThresholdSec) {
    // If they haven't started working, don't show full deficit
    if (effectiveWorkedSeconds > 0) {
      lowTimeSeconds = lowThresholdSec - effectiveWorkedSeconds;
    } else {
      lowTimeSeconds = lowThresholdSec;
    }
  } 
  
  if (effectiveWorkedSeconds > extraThresholdSec) {
    const actualExtraSec = effectiveWorkedSeconds - extraThresholdSec;
    
    // Policy rule: Approved overtime request is required from April 6th onwards
    const isPrePolicy = dateStr && dateStr < OVERTIME_POLICY_EFFECTIVE_DATE;
    
    if (isPrePolicy) {
      // Before policy: give full extra time surplus
      extraTimeSeconds = actualExtraSec;
    } else if (approvedOvertimeMinutes > 0) {
      // After policy: only if approved, capped by approved amount
      const maxApprovedSec = approvedOvertimeMinutes * 60;
      extraTimeSeconds = Math.min(actualExtraSec, maxApprovedSec);
    }
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