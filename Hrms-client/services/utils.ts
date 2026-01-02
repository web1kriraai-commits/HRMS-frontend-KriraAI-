import { Attendance, Bond, Break } from '../types';

// Business Rules
// BR1: Low Time < 8:08 (488 mins), Extra Time > 8:20 (500 mins)
// BR3: Half-day reduces threshold to 4 hours (240 mins)

const LOW_TIME_THRESHOLD_MINUTES = 488; // 8h 08m
const EXTRA_TIME_THRESHOLD_MINUTES = 500; // 8h 20m
const HALF_DAY_THRESHOLD_MINUTES = 240; // 4h 00m

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

export const getFlags = (workedSeconds: number, isHalfDayApproved: boolean) => {
  const workedMinutes = workedSeconds / 60;

  // BR3: If Half-Day, use adjusted threshold
  const lowThreshold = isHalfDayApproved ? HALF_DAY_THRESHOLD_MINUTES : LOW_TIME_THRESHOLD_MINUTES;
  const extraThreshold = isHalfDayApproved ? HALF_DAY_THRESHOLD_MINUTES : EXTRA_TIME_THRESHOLD_MINUTES;

  return {
    lowTime: workedMinutes > 0 && workedMinutes < lowThreshold,
    extraTime: workedMinutes > extraThreshold
  };
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

export const getTodayStr = () => new Date().toISOString().split('T')[0];

// Convert date from yyyy-mm-dd (HTML date input) to dd-mm-yyyy format
export const convertToDDMMYYYY = (dateStr: string): string => {
  if (!dateStr) return '';
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
export const convertToYYYYMMDD = (dateStr: string): string => {
  if (!dateStr) return '';
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Already in yyyy-mm-dd format
    return dateStr;
  }
  if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    // Convert from dd-mm-yyyy to yyyy-mm-dd
    const [day, month, year] = dateStr.split('-');
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
export const parseDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = dateStr.split('-');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return new Date(dateStr);
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

    // First bond starts from joining date (or bond.startDate if provided)
    if (i === 0) {
      bondStartDate = parseDDMMYYYY(bond.startDate) || joiningDateObj || today;
    } else {
      // Subsequent bonds start from previous bond's end date + 1 day
      if (cumulativeStartDate) {
        bondStartDate = new Date(cumulativeStartDate);
        bondStartDate.setDate(bondStartDate.getDate() + 1); // Add 1 day
        bondStartDate.setHours(0, 0, 0, 0);
      } else {
        // Fallback to joining date if no previous bond
        bondStartDate = joiningDateObj || today;
      }
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

  // Calculate first completion bond date (end date of the first bond that will complete)
  let firstCompletionDate: Date | null = null;
  let firstCompletionBondType: string | null = null;
  if (allBondsInfo.length > 0) {
    // Find the first bond that is not expired
    for (const bond of allBondsInfo) {
      if (bond.endDate && !bond.remaining.isExpired) {
        firstCompletionDate = bond.endDate;
        firstCompletionBondType = bond.type;
        break;
      }
    }
    // If all bonds are expired, get the last bond
    if (!firstCompletionDate && allBondsInfo.length > 0) {
      const lastBond = allBondsInfo[allBondsInfo.length - 1];
      if (lastBond.endDate) {
        firstCompletionDate = lastBond.endDate;
        firstCompletionBondType = lastBond.type;
      }
    }
  }

  // Calculate finish date (end date of the last bond) - for backward compatibility
  let finishDate: Date | null = null;
  if (allBondsInfo.length > 0) {
    const lastBond = allBondsInfo[allBondsInfo.length - 1];
    if (lastBond.endDate) {
      finishDate = lastBond.endDate;
    }
  }

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