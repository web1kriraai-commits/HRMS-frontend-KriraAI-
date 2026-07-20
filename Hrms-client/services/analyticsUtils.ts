import { Attendance, LeaveCategory, LeaveRequest, LeaveStatus, Role, SystemSettings, User } from '../types';
import {
  calculateDailyTimeStats,
  calculateTotalBreakSeconds,
  formatDuration,
  formatHoursMinutesShort,
  getLocalISOString,
  hasApprovedHalfDayLeaveOnDate,
  isPenaltyEffective,
  normalizeAttendanceDateStr,
  resolveGeneralOvertimeMinutes
} from './utils';

export type AnalyticsPeriod = 'today' | '1month' | '3month' | '1year' | 'all';
export type OvertimeType = 'general' | 'management' | 'earlyCheckoutCover' | 'all';

export type AnalyticsMetricId =
  | 'totalHours'
  | 'earlyCheckout'
  | 'lateCheckin'
  | 'penaltyMinutes'
  | 'lowTime'
  | 'overtime';

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
  count: number;
}

export interface DetailTableRow {
  period: string;
  value: string;
  count: number;
  rawValue: number;
}

export interface MetricSummary {
  total: number;
  count: number;
  formattedTotal: string;
  trend: TrendPoint[];
  tableRows: DetailTableRow[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PERIOD_OPTIONS: { id: AnalyticsPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '1month', label: '1 month' },
  { id: '3month', label: '3 month' },
  { id: '1year', label: '1 year' },
  { id: 'all', label: 'Since 2026' }
];

export const OVERTIME_TYPE_OPTIONS: { id: OvertimeType; label: string }[] = [
  { id: 'all', label: 'All OT' },
  { id: 'general', label: 'General OT' },
  { id: 'management', label: 'Management OT' },
  { id: 'earlyCheckoutCover', label: 'Early Checkout Cover OT' }
];

export const METRIC_CONFIG: Record<
  AnalyticsMetricId,
  { title: string; subtitle: string; unit: 'hours' | 'minutes' | 'count'; color: string; banner: string }
> = {
  totalHours: {
    title: 'Total Working Hours',
    subtitle: 'Per month total hours analytics',
    unit: 'hours',
    color: '#3b82f6',
    banner: 'bg-blue-50 text-blue-700 border-blue-100'
  },
  earlyCheckout: {
    title: 'Early Checkout',
    subtitle: 'Approved & pending early logout requests',
    unit: 'minutes',
    color: '#f59e0b',
    banner: 'bg-amber-50 text-amber-700 border-amber-100'
  },
  lateCheckin: {
    title: 'Late Check-in',
    subtitle: 'Late arrival incidents',
    unit: 'count',
    color: '#ef4444',
    banner: 'bg-rose-50 text-rose-700 border-rose-100'
  },
  penaltyMinutes: {
    title: 'Penalty Minutes',
    subtitle: 'Total lateness penalty deducted',
    unit: 'minutes',
    color: '#8b5cf6',
    banner: 'bg-violet-50 text-violet-700 border-violet-100'
  },
  lowTime: {
    title: 'Low Time',
    subtitle: 'Hours below minimum threshold',
    unit: 'hours',
    color: '#f43f5e',
    banner: 'bg-pink-50 text-pink-700 border-pink-100'
  },
  overtime: {
    title: 'Working Hour Overtime',
    subtitle: 'General, management & early checkout cover OT',
    unit: 'hours',
    color: '#10b981',
    banner: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  }
};

export const getCurrentMonthStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const formatSelectedMonthLabel = (monthStr: string): string => {
  const [year, month] = monthStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

export const getPeriodLabel = (period: AnalyticsPeriod, selectedMonth?: string): string => {
  if (period === '1month' && selectedMonth) {
    return formatSelectedMonthLabel(selectedMonth);
  }
  return PERIOD_OPTIONS.find((p) => p.id === period)?.label || period;
};

export const getPeriodRange = (period: AnalyticsPeriod, selectedMonth?: string): PeriodRange => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Today' };
    case '1month': {
      const monthStr = selectedMonth || getCurrentMonthStr();
      const [year, month] = monthStr.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      monthStart.setHours(0, 0, 0, 0);
      const lastOfMonth = new Date(year, month, 0);
      const now = new Date();
      const monthEnd = lastOfMonth < now ? lastOfMonth : now;
      monthEnd.setHours(23, 59, 59, 999);
      return { start: monthStart, end: monthEnd, label: formatSelectedMonthLabel(monthStr) };
    }
    case '3month':
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: '3 month' };
    case '1year':
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: '1 year' };
    case 'all':
    default:
      start.setFullYear(2026, 0, 1);
      start.setHours(0, 0, 0, 0);
      return { start, end, label: 'Since 2026' };
  }
};

const parseRecordDate = (dateStr: string): Date => {
  const normalized = normalizeAttendanceDateStr(dateStr);
  const [y, m, d] = normalized.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const isDateInRange = (dateStr: string, range: PeriodRange): boolean => {
  const d = parseRecordDate(dateStr);
  return d >= range.start && d <= range.end;
};

const formatMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

const formatDayLabel = (dateStr: string): string => {
  const d = parseRecordDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatMetricValue = (value: number, unit: 'hours' | 'minutes' | 'count'): string => {
  if (unit === 'count') return value.toLocaleString();
  if (unit === 'minutes') return `${Math.round(value)}m`;
  return formatHoursMinutesShort(Math.round(value * 3600));
};

const buildTrendBuckets = (period: AnalyticsPeriod, range: PeriodRange): { key: string; label: string }[] => {
  if (period === 'today') {
    const key = getLocalISOString(range.start);
    return [{ key, label: formatDayLabel(key) }];
  }

  if (period === '1month') {
    const buckets: { key: string; label: string }[] = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      const key = getLocalISOString(cursor);
      buckets.push({ key, label: formatDayLabel(key) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  const buckets: { key: string; label: string }[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label: formatMonthLabel(key) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
};

const getBucketKey = (dateStr: string, period: AnalyticsPeriod): string => {
  const normalized = normalizeAttendanceDateStr(dateStr);
  return period === 'today' || period === '1month' ? normalized : normalized.slice(0, 7);
};

const getOvertimeSeconds = (record: Attendance, otType: OvertimeType): number => {
  if (otType === 'general' || otType === 'all') {
    const generalMins = resolveGeneralOvertimeMinutes(record);
    if (generalMins > 0) return generalMins * 60;
  }
  if (otType === 'management' || otType === 'all') {
    const mgmt = record.managementOvertime;
    if (mgmt?.status === 'Approved') {
      return (mgmt.completedMinutes || mgmt.durationMinutes || 0) * 60;
    }
  }
  if (otType === 'earlyCheckoutCover' || otType === 'all') {
    const earlyMins = Math.max(
      record.earlyOvertime?.completedMinutes || 0,
      record.overtimeManageRequest?.allocations?.earlyRequestMinutes || 0
    );
    if (earlyMins > 0) return earlyMins * 60;
  }
  return 0;
};

const getOvertimeSecondsForType = (record: Attendance, otType: OvertimeType): number => {
  if (otType === 'all') return getOvertimeSeconds(record, 'all');
  if (otType === 'general') {
    return resolveGeneralOvertimeMinutes(record) * 60;
  }
  if (otType === 'management') {
    const mgmt = record.managementOvertime;
    return mgmt?.status === 'Approved'
      ? (mgmt.completedMinutes || mgmt.durationMinutes || 0) * 60
      : 0;
  }
  const earlyMins = Math.max(
    record.earlyOvertime?.completedMinutes || 0,
    record.overtimeManageRequest?.allocations?.earlyRequestMinutes || 0
  );
  return earlyMins * 60;
};

interface AggregateContext {
  records: Attendance[];
  users: User[];
  leaveRequests: LeaveRequest[];
  holidayDateSet: Set<string>;
  systemSettings: SystemSettings;
  period: AnalyticsPeriod;
  range: PeriodRange;
  overtimeType?: OvertimeType;
}

const aggregateMetric = (
  metricId: AnalyticsMetricId,
  ctx: AggregateContext
): MetricSummary => {
  const config = METRIC_CONFIG[metricId];
  const buckets = buildTrendBuckets(ctx.period, ctx.range);
  const bucketMap = new Map<string, { value: number; count: number }>();
  buckets.forEach((b) => bucketMap.set(b.key, { value: 0, count: 0 }));

  let total = 0;
  let totalCount = 0;

  for (const record of ctx.records) {
    if (!isDateInRange(record.date, ctx.range)) continue;

    const dateStr = normalizeAttendanceDateStr(record.date);
    const bucketKey = getBucketKey(dateStr, ctx.period);
    const bucket = bucketMap.get(bucketKey);
    if (!bucket) continue;

    const isHoliday = ctx.holidayDateSet.has(dateStr);
    const hasHalfDay = hasApprovedHalfDayLeaveOnDate(ctx.leaveRequests, record.userId, dateStr);
    const stats = calculateDailyTimeStats(
      record.totalWorkedSeconds || 0,
      hasHalfDay,
      isHoliday,
      0,
      dateStr,
      ctx.systemSettings
    );

    let value = 0;
    let incrementCount = 0;

    switch (metricId) {
      case 'totalHours':
        if (record.checkIn && record.checkOut) {
          value = (record.totalWorkedSeconds || 0) / 3600;
          incrementCount = 1;
        }
        break;
      case 'earlyCheckout': {
        const hasRequest = record.earlyLogoutRequest && record.earlyLogoutRequest !== 'None';
        if (!hasRequest) break;
        value = record.earlyOvertime?.deficitMinutes ?? Math.floor(stats.lowTimeSeconds / 60);
        incrementCount = 1;
        break;
      }
      case 'lateCheckin':
        if (
          !isHoliday &&
          !record.isPenaltyDisabled &&
          record.lateCheckIn &&
          isPenaltyEffective(dateStr) &&
          !hasHalfDay
        ) {
          incrementCount = 1;
          value = 1;
        }
        break;
      case 'penaltyMinutes':
        if (
          !isHoliday &&
          !record.isPenaltyDisabled &&
          record.penaltySeconds &&
          record.penaltySeconds > 0 &&
          isPenaltyEffective(dateStr) &&
          !hasHalfDay
        ) {
          value = record.penaltySeconds / 60;
          incrementCount = 1;
        }
        break;
      case 'lowTime':
        if (stats.lowTimeSeconds > 0) {
          value = stats.lowTimeSeconds / 3600;
          incrementCount = 1;
        }
        break;
      case 'overtime': {
        const otSec = getOvertimeSecondsForType(record, ctx.overtimeType || 'all');
        if (otSec > 0) {
          value = otSec / 3600;
          incrementCount = 1;
        }
        break;
      }
    }

    if (value > 0 || incrementCount > 0) {
      bucket.value += value;
      bucket.count += incrementCount;
      total += value;
      totalCount += incrementCount;
    }
  }

  const trend: TrendPoint[] = buckets.map((b) => {
    const data = bucketMap.get(b.key) || { value: 0, count: 0 };
    return {
      key: b.key,
      label: b.label,
      value: Math.round(data.value * 100) / 100,
      count: data.count
    };
  });

  const tableRows: DetailTableRow[] = trend.map((t) => ({
    period: t.label,
    value:
      config.unit === 'count'
        ? t.count.toLocaleString()
        : config.unit === 'minutes'
          ? `${Math.round(t.value)} min`
          : formatHoursMinutesShort(Math.round(t.value * 3600)),
    count: t.count,
    rawValue: t.value
  }));

  return {
    total,
    count: totalCount,
    formattedTotal: formatMetricValue(total, config.unit),
    trend,
    tableRows
  };
};

export interface AnalyticsDashboardData {
  range: PeriodRange;
  metrics: Record<AnalyticsMetricId, MetricSummary>;
  kpiCards: {
    totalHours: string;
    earlyCheckout: string;
    lateCheckin: string;
    penaltyMinutes: string;
    lowTime: string;
    overtime: string;
  };
}

export const buildAnalyticsDashboard = (
  period: AnalyticsPeriod,
  attendanceRecords: Attendance[],
  users: User[],
  leaveRequests: LeaveRequest[],
  companyHolidays: { date: string }[],
  systemSettings: SystemSettings,
  overtimeType: OvertimeType = 'all',
  selectedMonth?: string
): AnalyticsDashboardData => {
  const range = getPeriodRange(period, selectedMonth);
  const holidayDateSet = new Set(
    companyHolidays.map((h) =>
      typeof h.date === 'string' ? h.date.split('T')[0] : getLocalISOString(new Date(h.date))
    )
  );

  const employeeRecords = attendanceRecords.filter((r) => {
    const user = users.find((u) => u.id === r.userId);
    return user && user.role !== Role.ADMIN;
  });

  const ctx: AggregateContext = {
    records: employeeRecords,
    users,
    leaveRequests,
    holidayDateSet,
    systemSettings,
    period,
    range,
    overtimeType
  };

  const metrics = {
    totalHours: aggregateMetric('totalHours', ctx),
    earlyCheckout: aggregateMetric('earlyCheckout', ctx),
    lateCheckin: aggregateMetric('lateCheckin', ctx),
    penaltyMinutes: aggregateMetric('penaltyMinutes', ctx),
    lowTime: aggregateMetric('lowTime', ctx),
    overtime: aggregateMetric('overtime', { ...ctx, overtimeType })
  };

  return {
    range,
    metrics,
    kpiCards: {
      totalHours: metrics.totalHours.formattedTotal,
      earlyCheckout: `${metrics.earlyCheckout.count} req · ${Math.round(metrics.earlyCheckout.total)}m`,
      lateCheckin: metrics.lateCheckin.count.toLocaleString(),
      penaltyMinutes: `${Math.round(metrics.penaltyMinutes.total)}m`,
      lowTime: metrics.lowTime.formattedTotal,
      overtime: metrics.overtime.formattedTotal
    }
  };
};

export const getEmployeeBreakdownRows = (
  metricId: AnalyticsMetricId,
  period: AnalyticsPeriod,
  attendanceRecords: Attendance[],
  users: User[],
  leaveRequests: LeaveRequest[],
  holidayDateSet: Set<string>,
  systemSettings: SystemSettings,
  overtimeType: OvertimeType = 'all',
  selectedMonth?: string
): { employee: string; department: string; value: string; count: number }[] => {
  const range = getPeriodRange(period, selectedMonth);
  const empMap = new Map<string, { name: string; dept: string; value: number; count: number }>();

  users
    .filter((u) => u.role !== Role.ADMIN)
    .forEach((u) => empMap.set(u.id, { name: u.name, dept: u.department || 'Other', value: 0, count: 0 }));

  for (const record of attendanceRecords) {
    if (!isDateInRange(record.date, range)) continue;
    const entry = empMap.get(record.userId);
    if (!entry) continue;

    const dateStr = normalizeAttendanceDateStr(record.date);
    const isHoliday = holidayDateSet.has(dateStr);
    const hasHalfDay = hasApprovedHalfDayLeaveOnDate(leaveRequests, record.userId, dateStr);
    const stats = calculateDailyTimeStats(
      record.totalWorkedSeconds || 0,
      hasHalfDay,
      isHoliday,
      0,
      dateStr,
      systemSettings
    );

    let value = 0;
    let count = 0;

    switch (metricId) {
      case 'totalHours':
        if (record.checkIn && record.checkOut) {
          value = (record.totalWorkedSeconds || 0) / 3600;
          count = 1;
        }
        break;
      case 'earlyCheckout':
        if (record.earlyLogoutRequest && record.earlyLogoutRequest !== 'None') {
          value = record.earlyOvertime?.deficitMinutes ?? Math.floor(stats.lowTimeSeconds / 60);
          count = 1;
        }
        break;
      case 'lateCheckin':
        if (
          !isHoliday &&
          !record.isPenaltyDisabled &&
          record.lateCheckIn &&
          isPenaltyEffective(dateStr) &&
          !hasHalfDay
        ) {
          count = 1;
          value = 1;
        }
        break;
      case 'penaltyMinutes':
        if (
          !isHoliday &&
          !record.isPenaltyDisabled &&
          record.penaltySeconds &&
          record.penaltySeconds > 0 &&
          isPenaltyEffective(dateStr) &&
          !hasHalfDay
        ) {
          value = record.penaltySeconds / 60;
          count = 1;
        }
        break;
      case 'lowTime':
        if (stats.lowTimeSeconds > 0) {
          value = stats.lowTimeSeconds / 3600;
          count = 1;
        }
        break;
      case 'overtime': {
        const otSec = getOvertimeSecondsForType(record, overtimeType);
        if (otSec > 0) {
          value = otSec / 3600;
          count = 1;
        }
        break;
      }
    }

    if (value > 0 || count > 0) {
      entry.value += value;
      entry.count += count;
    }
  }

  const config = METRIC_CONFIG[metricId];
  return Array.from(empMap.values())
    .filter((e) => e.value > 0 || e.count > 0)
    .map((e) => ({
      employee: e.name,
      department: e.dept,
      value:
        config.unit === 'count'
          ? e.count.toLocaleString()
          : config.unit === 'minutes'
            ? `${Math.round(e.value)} min`
            : formatHoursMinutesShort(Math.round(e.value * 3600)),
      count: e.count
    }))
    .sort((a, b) => b.count - a.count);
};

export interface TopPerformerEntry {
  userId: string;
  name: string;
  department: string;
  score: number;
  workedHours: number;
  overtimeHours: number;
  presentDays: number;
  lateCheckins: number;
  penaltyMinutes: number;
  lowTimeHours: number;
  leaveDays: number;
  breakHours: number;
  earlyCheckouts: number;
}

const countLeaveDaysInRange = (
  startDateStr: string,
  endDateStr: string,
  range: PeriodRange,
  category?: LeaveCategory
): number => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const effectiveStart = start < range.start ? new Date(range.start) : start;
  const effectiveEnd = end > range.end ? new Date(range.end) : end;
  effectiveStart.setHours(0, 0, 0, 0);
  effectiveEnd.setHours(0, 0, 0, 0);

  if (effectiveStart > effectiveEnd) return 0;

  let days = 0;
  const cursor = new Date(effectiveStart);
  while (cursor <= effectiveEnd) {
    days += category === LeaveCategory.HALF_DAY ? 0.5 : 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const ratio = (value: number, max: number): number => (max > 0 ? value / max : 0);

/** Composite performance score (0–100) from attendance, OT, punctuality, leave, and breaks. */
export const computeTopPerformers = (
  period: AnalyticsPeriod,
  attendanceRecords: Attendance[],
  users: User[],
  leaveRequests: LeaveRequest[],
  holidayDateSet: Set<string>,
  systemSettings: SystemSettings,
  limit = 10
): TopPerformerEntry[] => {
  const range = getPeriodRange(period);

  interface EmpMetrics {
    userId: string;
    name: string;
    department: string;
    workedHours: number;
    overtimeHours: number;
    presentDays: number;
    lateCheckins: number;
    penaltyMinutes: number;
    lowTimeHours: number;
    leaveDays: number;
    breakSeconds: number;
    earlyCheckouts: number;
  }

  const metricsMap = new Map<string, EmpMetrics>();

  users
    .filter((u) => u.isActive && u.role !== Role.ADMIN)
    .forEach((u) => {
      metricsMap.set(u.id, {
        userId: u.id,
        name: u.name,
        department: u.department || '-',
        workedHours: 0,
        overtimeHours: 0,
        presentDays: 0,
        lateCheckins: 0,
        penaltyMinutes: 0,
        lowTimeHours: 0,
        leaveDays: 0,
        breakSeconds: 0,
        earlyCheckouts: 0
      });
    });

  for (const record of attendanceRecords) {
    if (!isDateInRange(record.date, range)) continue;
    const entry = metricsMap.get(record.userId);
    if (!entry) continue;

    const dateStr = normalizeAttendanceDateStr(record.date);
    const isHoliday = holidayDateSet.has(dateStr);
    const hasHalfDay = hasApprovedHalfDayLeaveOnDate(leaveRequests, record.userId, dateStr);
    const stats = calculateDailyTimeStats(
      record.totalWorkedSeconds || 0,
      hasHalfDay,
      isHoliday,
      0,
      dateStr,
      systemSettings
    );

    if (record.checkIn && record.checkOut) {
      entry.workedHours += (record.totalWorkedSeconds || 0) / 3600;
      entry.presentDays += 1;
    }

    entry.breakSeconds += calculateTotalBreakSeconds(record.breaks || []);

    if (
      !isHoliday &&
      !record.isPenaltyDisabled &&
      record.lateCheckIn &&
      isPenaltyEffective(dateStr) &&
      !hasHalfDay
    ) {
      entry.lateCheckins += 1;
    }

    if (
      !isHoliday &&
      !record.isPenaltyDisabled &&
      record.penaltySeconds &&
      record.penaltySeconds > 0 &&
      isPenaltyEffective(dateStr) &&
      !hasHalfDay
    ) {
      entry.penaltyMinutes += record.penaltySeconds / 60;
    }

    if (stats.lowTimeSeconds > 0) {
      entry.lowTimeHours += stats.lowTimeSeconds / 3600;
    }

    const otSec = getOvertimeSeconds(record, 'all');
    if (otSec > 0) {
      entry.overtimeHours += otSec / 3600;
    }

    if (record.earlyLogoutRequest && record.earlyLogoutRequest !== 'None') {
      entry.earlyCheckouts += 1;
    }
  }

  for (const leave of leaveRequests) {
    const status = (leave.status || '').trim();
    if (status !== 'Approved' && status !== LeaveStatus.APPROVED) continue;
    const entry = metricsMap.get(leave.userId);
    if (!entry) continue;
    entry.leaveDays += countLeaveDaysInRange(
      leave.startDate,
      leave.endDate,
      range,
      leave.category
    );
  }

  const allMetrics = Array.from(metricsMap.values()).filter((m) => m.presentDays > 0);
  if (allMetrics.length === 0) return [];

  const maxWorked = Math.max(...allMetrics.map((m) => m.workedHours), 0.001);
  const maxOT = Math.max(...allMetrics.map((m) => m.overtimeHours), 0.001);
  const maxPresent = Math.max(...allMetrics.map((m) => m.presentDays), 0.001);
  const maxLate = Math.max(...allMetrics.map((m) => m.lateCheckins), 0.001);
  const maxPenalty = Math.max(...allMetrics.map((m) => m.penaltyMinutes), 0.001);
  const maxLow = Math.max(...allMetrics.map((m) => m.lowTimeHours), 0.001);
  const maxLeave = Math.max(...allMetrics.map((m) => m.leaveDays), 0.001);
  const maxBreak = Math.max(...allMetrics.map((m) => m.breakSeconds / 3600), 0.001);
  const maxEarly = Math.max(...allMetrics.map((m) => m.earlyCheckouts), 0.001);

  return allMetrics
    .map((m) => {
      const breakHours = m.breakSeconds / 3600;
      const score = Math.round(
        ratio(m.workedHours, maxWorked) * 25 +
          ratio(m.overtimeHours, maxOT) * 15 +
          ratio(m.presentDays, maxPresent) * 20 +
          (1 - ratio(m.lateCheckins, maxLate)) * 10 +
          (1 - ratio(m.penaltyMinutes, maxPenalty)) * 8 +
          (1 - ratio(m.lowTimeHours, maxLow)) * 8 +
          (1 - ratio(m.leaveDays, maxLeave)) * 8 +
          (1 - ratio(breakHours, maxBreak)) * 3 +
          (1 - ratio(m.earlyCheckouts, maxEarly)) * 3
      );

      return {
        userId: m.userId,
        name: m.name,
        department: m.department,
        score: Math.max(0, Math.min(100, score)),
        workedHours: Math.round(m.workedHours * 100) / 100,
        overtimeHours: Math.round(m.overtimeHours * 100) / 100,
        presentDays: m.presentDays,
        lateCheckins: m.lateCheckins,
        penaltyMinutes: Math.round(m.penaltyMinutes),
        lowTimeHours: Math.round(m.lowTimeHours * 100) / 100,
        leaveDays: Math.round(m.leaveDays * 10) / 10,
        breakHours: Math.round(breakHours * 100) / 100,
        earlyCheckouts: m.earlyCheckouts
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export { formatDuration };
