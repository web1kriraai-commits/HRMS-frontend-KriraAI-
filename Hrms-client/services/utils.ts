import { Attendance, Break } from '../types';

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

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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