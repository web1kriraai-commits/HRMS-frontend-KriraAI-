import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import {
  ClipboardList,
  User,
  Calendar,
  Clock,
  Coffee,
  TrendingUp,
  Briefcase,
  AlertCircle,
  ArrowRightLeft,
  Timer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getTodayStr,
  getLocalISOString,
  formatDuration,
  formatTime,
  calculateDailyTimeStats,
  calculateTotalBreakSeconds,
  calculateLeaveDays,
  calculateBondLeaveSummary,
  hasApprovedHalfDayLeaveOnDate,
  convertToYYYYMMDD,
  getLateCheckInPenaltyInfo,
  formatPenaltyDisplay,
  normalizeAttendanceDateStr,
} from '../services/utils';
import { Role, Attendance, LeaveRequest } from '../types';
import { attendanceAPI } from '../services/api';

type PeriodFilter = 'today' | 'month' | 'year' | 'all';
type DetailTab =
  | 'attendance'
  | 'breaks'
  | 'performance'
  | 'leaveBalance'
  | 'leaveRequests'
  | 'overtime'
  | 'earlyCheckout'
  | 'penalties';

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'Current Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All Time' },
];

const resolveUserId = (userId: unknown): string => {
  if (userId == null) return '';
  if (typeof userId === 'string' || typeof userId === 'number') return String(userId);
  const obj = userId as { id?: string; _id?: string };
  return String(obj.id || obj._id || '');
};

const TAB_OPTIONS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: 'attendance', label: 'Check-in / Check-out', icon: Clock },
  { id: 'breaks', label: 'Break Time', icon: Coffee },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'leaveBalance', label: 'Leave Balance', icon: Briefcase },
  { id: 'leaveRequests', label: 'Leave Requests', icon: Calendar },
  { id: 'overtime', label: 'Overtime', icon: Timer },
  { id: 'earlyCheckout', label: 'Early Checkout', icon: ArrowRightLeft },
  { id: 'penalties', label: 'Penalties', icon: AlertCircle },
];

const formatHoursMinutes = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const resolveManagementOvertimeFields = (r: Attendance) => {
  const mgmt = r.managementOvertime;
  if (mgmt?.status && mgmt.status !== 'None') {
    return {
      status: mgmt.status,
      durationMinutes: mgmt.durationMinutes || 0,
      completedMinutes: mgmt.completedMinutes || 0,
      reason: mgmt.reason || '',
      isManagement: true,
      source: 'Management OT' as const,
    };
  }
  const legacy = r.overtimeRequest;
  if (legacy?.status && legacy.status !== 'None') {
    return {
      status: legacy.status,
      durationMinutes: legacy.durationMinutes || 0,
      completedMinutes: legacy.completedMinutes || 0,
      reason: legacy.reason || '',
      isManagement: false,
      source: 'Overtime Request' as const,
    };
  }
  if ((r.generalOvertimeMinutes || 0) > 0) {
    return {
      status: 'Approved' as const,
      durationMinutes: r.generalOvertimeMinutes || 0,
      completedMinutes: r.generalOvertimeMinutes || 0,
      reason: 'General overtime',
      isManagement: false,
      source: 'General OT' as const,
    };
  }
  return null;
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="px-6 py-16 text-center text-slate-400 font-medium italic">{message}</div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const tone =
    status === 'Approved' || status === 'Repaid'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'Pending' || status === 'Outstanding'
        ? 'bg-amber-50 text-amber-700'
        : status === 'Rejected' || status === 'Unresolved'
          ? 'bg-rose-50 text-rose-700'
          : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${tone}`}>
      {status}
    </span>
  );
};

export const EmployeeSummary: React.FC = () => {
  const { users, attendanceRecords, leaveRequests, companyHolidays, systemSettings, loading } = useApp();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [activeTab, setActiveTab] = useState<DetailTab>('attendance');
  const [currentPage, setCurrentPage] = useState(1);
  const [periodAttendance, setPeriodAttendance] = useState<Attendance[]>([]);
  const [loadingPeriodData, setLoadingPeriodData] = useState(false);
  const itemsPerPage = 10;

  const employeeOptions = useMemo(
    () =>
      users
        .filter(u => u.role !== Role.ADMIN && u.isActive !== false)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const selectedEmployee = useMemo(
    () => employeeOptions.find(u => u.id === selectedEmployeeId) || null,
    [employeeOptions, selectedEmployeeId]
  );

  const holidayDateSet = useMemo(
    () =>
      new Set(
        companyHolidays.map(h =>
          normalizeAttendanceDateStr(
            typeof h.date === 'string' ? h.date : getLocalISOString(new Date(h.date))
          )
        )
      ),
    [companyHolidays]
  );

  const dateRange = useMemo(() => {
    const today = getTodayStr();
    const [ty, tm] = today.split('-').map(Number);
    if (period === 'today') {
      return { start: today, end: today, label: 'Today' };
    }
    if (period === 'month') {
      const start = `${ty}-${String(tm).padStart(2, '0')}-01`;
      const lastDay = new Date(ty, tm, 0).getDate();
      const monthEnd = `${ty}-${String(tm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const monthDate = new Date(ty, tm - 1, 1);
      return {
        start,
        end: monthEnd > today ? today : monthEnd,
        label: monthDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    }
    if (period === 'year') {
      return { start: `${ty}-01-01`, end: today, label: `${ty}` };
    }
    const joining = selectedEmployee?.joiningDate
      ? convertToYYYYMMDD(selectedEmployee.joiningDate)
      : null;
    const start = joining && joining.length === 10 ? joining : '2000-01-01';
    return { start, end: today, label: 'All Time' };
  }, [period, selectedEmployee]);

  const normalizeDate = (date: string) => normalizeAttendanceDateStr(date);

  // Load attendance for the selected period so current-month records are not missed by the global 1000-row cap
  React.useEffect(() => {
    let cancelled = false;

    const loadPeriodAttendance = async () => {
      if (!selectedEmployeeId) {
        setPeriodAttendance([]);
        return;
      }
      setLoadingPeriodData(true);
      try {
        const raw = await attendanceAPI.getAll(dateRange.start, dateRange.end);
        if (cancelled) return;
        const rows = (Array.isArray(raw) ? raw : []).map((apiAttendance: any) => {
          const recordDate = normalizeAttendanceDateStr(apiAttendance.date);
          const { isLate, penaltySeconds } = getLateCheckInPenaltyInfo(
            {
              checkIn: apiAttendance.checkIn,
              penaltySeconds: apiAttendance.penaltySeconds,
              isPenaltyDisabled: apiAttendance.isPenaltyDisabled,
              date: recordDate,
            },
            systemSettings,
            false
          );
          return {
            id: apiAttendance.id || apiAttendance._id,
            userId: resolveUserId(apiAttendance.userId),
            date: recordDate,
            checkIn: apiAttendance.checkIn,
            checkOut: apiAttendance.checkOut,
            location: apiAttendance.location,
            breaks: (apiAttendance.breaks || []).map((b: any) => ({
              id: b.id || b._id,
              attendanceId: apiAttendance.id || apiAttendance._id,
              start: b.start,
              end: b.end,
              type: b.type,
              durationSeconds: b.durationSeconds,
              reason: b.reason,
            })),
            totalWorkedSeconds: apiAttendance.totalWorkedSeconds ?? 0,
            lowTimeFlag: apiAttendance.lowTimeFlag || false,
            extraTimeFlag: apiAttendance.extraTimeFlag || false,
            penaltySeconds:
              apiAttendance.penaltySeconds && apiAttendance.penaltySeconds > 0
                ? apiAttendance.penaltySeconds
                : penaltySeconds,
            lateCheckIn: !!(apiAttendance.lateCheckIn || isLate),
            isManualFlag: apiAttendance.isManualFlag || false,
            isPenaltyDisabled: !!apiAttendance.isPenaltyDisabled,
            isCompulsoryBreakDisabled: !!apiAttendance.isCompulsoryBreakDisabled,
            notes: apiAttendance.notes,
            manualHours: apiAttendance.manualHours || [],
            earlyLogoutRequest: apiAttendance.earlyLogoutRequest || 'None',
            earlyLogoutRequestNote: apiAttendance.earlyLogoutRequestNote,
            generalOvertimeMinutes: apiAttendance.generalOvertimeMinutes || 0,
            managementOvertime: apiAttendance.managementOvertime,
            earlyOvertime: apiAttendance.earlyOvertime,
            earlyOvertimeRepayment: apiAttendance.earlyOvertimeRepayment,
            overtimeRequest: apiAttendance.overtimeRequest,
          } as Attendance;
        });
        setPeriodAttendance(rows);
      } catch {
        if (!cancelled) setPeriodAttendance([]);
      } finally {
        if (!cancelled) setLoadingPeriodData(false);
      }
    };

    loadPeriodAttendance();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId, dateRange.start, dateRange.end, systemSettings]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, period, selectedEmployeeId]);

  const employeeAttendance = useMemo(() => {
    if (!selectedEmployeeId) return [] as Attendance[];
    const source = periodAttendance.length > 0 || loadingPeriodData
      ? periodAttendance
      : attendanceRecords;
    return source
      .filter(r => {
        if (resolveUserId(r.userId) !== selectedEmployeeId) return false;
        const dateStr = normalizeDate(r.date);
        return dateStr >= dateRange.start && dateStr <= dateRange.end;
      })
      .slice()
      .sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)));
  }, [
    attendanceRecords,
    periodAttendance,
    loadingPeriodData,
    selectedEmployeeId,
    dateRange,
  ]);

  const attendanceRows = useMemo(
    () =>
      employeeAttendance.map(r => {
        const dateStr = normalizeDate(r.date);
        const breakSeconds = calculateTotalBreakSeconds(r.breaks || []);
        return {
          id: r.id,
          date: dateStr,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          workedSeconds: r.totalWorkedSeconds || 0,
          breakSeconds,
          lowTimeFlag: r.lowTimeFlag,
          extraTimeFlag: r.extraTimeFlag,
          lateCheckIn: r.lateCheckIn,
        };
      }),
    [employeeAttendance]
  );

  const breakRows = useMemo(() => {
    const rows: Array<{
      id: string;
      date: string;
      type: string;
      start?: string;
      end?: string;
      durationSeconds: number;
      reason?: string;
    }> = [];
    for (const r of employeeAttendance) {
      const dateStr = normalizeDate(r.date);
      for (const b of r.breaks || []) {
        const duration =
          typeof b.durationSeconds === 'number'
            ? b.durationSeconds
            : b.start && b.end
              ? Math.max(0, Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000))
              : 0;
        rows.push({
          id: b.id || `${r.id}-${b.start}`,
          date: dateStr,
          type: b.type || 'Standard',
          start: b.start,
          end: b.end,
          durationSeconds: duration,
          reason: b.reason,
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [employeeAttendance]);

  const performanceStats = useMemo(() => {
    let presentDays = 0;
    let lowTimeDays = 0;
    let extraTimeDays = 0;
    let lateDays = 0;
    let totalWorkedSeconds = 0;
    let totalLowSeconds = 0;
    let totalExtraSeconds = 0;
    let totalBreakSeconds = 0;

    for (const r of employeeAttendance) {
      const dateStr = normalizeDate(r.date);
      const isHoliday = holidayDateSet.has(dateStr);
      if (r.checkIn || (r.totalWorkedSeconds || 0) > 0 || (r.manualHours && r.manualHours.length > 0)) {
        presentDays += 1;
      }
      totalWorkedSeconds += r.totalWorkedSeconds || 0;
      totalBreakSeconds += calculateTotalBreakSeconds(r.breaks || []);
      if (r.lateCheckIn) lateDays += 1;
      if (r.lowTimeFlag) lowTimeDays += 1;
      if (r.extraTimeFlag) extraTimeDays += 1;
      const stats = calculateDailyTimeStats(
        r.totalWorkedSeconds || 0,
        false,
        isHoliday,
        0,
        dateStr,
        systemSettings
      );
      totalLowSeconds += stats.lowTimeSeconds || 0;
      totalExtraSeconds += stats.extraTimeSeconds || 0;
    }

    return {
      presentDays,
      lowTimeDays,
      extraTimeDays,
      lateDays,
      totalWorkedSeconds,
      totalLowSeconds,
      totalExtraSeconds,
      totalBreakSeconds,
      avgWorkedSeconds: presentDays > 0 ? Math.floor(totalWorkedSeconds / presentDays) : 0,
    };
  }, [employeeAttendance, holidayDateSet, systemSettings]);

  const leaveBalance = useMemo(() => {
    if (!selectedEmployee) return null;
    return calculateBondLeaveSummary(
      selectedEmployee,
      leaveRequests,
      attendanceRecords,
      holidayDateSet,
      {
        paid: selectedEmployee.manualPaidLeaveAdjustment || 0,
        halfDay: selectedEmployee.manualHalfDayLeaveAdjustment || 0,
        unpaid: selectedEmployee.manualUnpaidLeaveAdjustment || 0,
      }
    );
  }, [selectedEmployee, leaveRequests, attendanceRecords, holidayDateSet]);

  const leaveRequestRows = useMemo(() => {
    if (!selectedEmployeeId) return [] as Array<LeaveRequest & { totalDays: number }>;
    return leaveRequests
      .filter(leave => {
        if (resolveUserId(leave.userId) !== selectedEmployeeId) return false;
        const overlaps =
          leave.startDate <= dateRange.end && leave.endDate >= dateRange.start;
        return overlaps;
      })
      .map(leave => ({
        ...leave,
        totalDays: calculateLeaveDays(leave.startDate, leave.endDate, holidayDateSet),
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [leaveRequests, selectedEmployeeId, dateRange, holidayDateSet]);

  const overtimeRows = useMemo(() => {
    return employeeAttendance
      .map(r => {
        const ot = resolveManagementOvertimeFields(r);
        if (!ot) return null;
        const dateStr = normalizeDate(r.date);
        const isHoliday = holidayDateSet.has(dateStr);
        const stats = calculateDailyTimeStats(
          r.totalWorkedSeconds || 0,
          false,
          isHoliday,
          0,
          dateStr,
          systemSettings
        );
        const completedMinutes = ot.isManagement
          ? ot.completedMinutes
          : ot.source === 'General OT'
            ? ot.completedMinutes
            : Math.floor(stats.extraTimeSeconds / 60);
        return {
          id: r.id,
          date: dateStr,
          source: ot.source,
          requestedMinutes: ot.durationMinutes,
          completedMinutes,
          status: ot.status,
          reason: ot.reason,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      date: string;
      source: string;
      requestedMinutes: number;
      completedMinutes: number;
      status: string;
      reason: string;
    }>;
  }, [employeeAttendance, holidayDateSet, systemSettings]);

  const earlyCheckoutRows = useMemo(() => {
    const currentMonthKey = getTodayStr().slice(0, 7);
    return employeeAttendance
      .filter(r => r.earlyLogoutRequest && r.earlyLogoutRequest !== 'None')
      .map(r => {
        const dateStr = normalizeDate(r.date);
        const deficitMinutes = r.earlyOvertime?.deficitMinutes ?? 0;
        const coveredMinutes = r.earlyOvertime?.coveredMinutes ?? 0;
        const outstandingMinutes = Math.max(0, deficitMinutes - coveredMinutes);
        const recordMonthKey = dateStr.slice(0, 7);
        let repaymentStatus: 'None' | 'Outstanding' | 'Repaid' | 'Unresolved' = 'None';
        if (deficitMinutes > 0) {
          if (outstandingMinutes <= 0) repaymentStatus = 'Repaid';
          else if (recordMonthKey < currentMonthKey) repaymentStatus = 'Unresolved';
          else repaymentStatus = 'Outstanding';
        }
        const isHoliday = holidayDateSet.has(dateStr);
        const stats = calculateDailyTimeStats(
          r.totalWorkedSeconds || 0,
          false,
          isHoliday,
          0,
          dateStr,
          systemSettings
        );
        return {
          id: r.id,
          date: dateStr,
          checkOut: r.checkOut,
          status: r.earlyLogoutRequest || 'None',
          reason: r.earlyLogoutRequestNote || '',
          earlyMinutes: Math.floor(stats.lowTimeSeconds / 60),
          repaymentStatus,
          outstandingMinutes,
        };
      });
  }, [employeeAttendance, holidayDateSet, systemSettings]);

  const penaltyRows = useMemo(() => {
    if (!selectedEmployeeId) return [] as Array<{
      id: string;
      date: string;
      type: string;
      amount: string;
      amountSeconds: number;
      details: string;
    }>;
    const rows: Array<{
      id: string;
      date: string;
      type: string;
      amount: string;
      amountSeconds: number;
      details: string;
    }> = [];

    for (const r of employeeAttendance) {
      const dateStr = normalizeDate(r.date);
      if (!dateStr) continue;

      const isHoliday = holidayDateSet.has(dateStr);
      if (isHoliday || r.isPenaltyDisabled) continue;

      const hasHalfDay = hasApprovedHalfDayLeaveOnDate(leaveRequests, selectedEmployeeId, dateStr);

      // Prefer stored flags (same as Monthly Summary), then recompute from check-in time
      const { isLate, penaltySeconds: computedPenalty } = getLateCheckInPenaltyInfo(
        { ...r, date: dateStr },
        systemSettings,
        hasHalfDay
      );

      const storedSeconds =
        !hasHalfDay && r.lateCheckIn && (r.penaltySeconds || 0) > 0 ? r.penaltySeconds || 0 : 0;
      const penaltySeconds = storedSeconds > 0 ? storedSeconds : isLate ? computedPenalty : 0;

      if (penaltySeconds <= 0) continue;

      rows.push({
        id: `late-${r.id}`,
        date: dateStr,
        type: 'Late Check-in Penalty',
        amount: formatPenaltyDisplay(penaltySeconds),
        amountSeconds: penaltySeconds,
        details: r.checkIn
          ? `Checked in at ${formatTime(r.checkIn)} · −${formatPenaltyDisplay(penaltySeconds)} deducted`
          : 'Late check-in penalty applied',
      });
    }

    return rows;
  }, [employeeAttendance, holidayDateSet, leaveRequests, selectedEmployeeId, systemSettings]);

  const activeRowsCount = (() => {
    switch (activeTab) {
      case 'attendance':
        return attendanceRows.length;
      case 'breaks':
        return breakRows.length;
      case 'leaveRequests':
        return leaveRequestRows.length;
      case 'overtime':
        return overtimeRows.length;
      case 'earlyCheckout':
        return earlyCheckoutRows.length;
      case 'penalties':
        return penaltyRows.length;
      default:
        return 0;
    }
  })();

  const totalPages = Math.max(1, Math.ceil(activeRowsCount / itemsPerPage));
  const pageSlice = <T,>(rows: T[]) => {
    const start = (currentPage - 1) * itemsPerPage;
    return rows.slice(start, start + itemsPerPage);
  };

  const Pagination = () => {
    if (activeRowsCount <= itemsPerPage) return null;
    return (
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
        <p className="text-sm text-slate-500">
          Showing {(currentPage - 1) * itemsPerPage + 1}–
          {Math.min(currentPage * itemsPerPage, activeRowsCount)} of {activeRowsCount}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    if (!selectedEmployee) {
      return <EmptyState message="Select an employee to view summary details." />;
    }

    switch (activeTab) {
      case 'attendance':
        if (!attendanceRows.length) {
          return <EmptyState message={`No check-in / check-out records for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Check-in', 'Check-out', 'Worked', 'Break', 'Flags'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(attendanceRows).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{row.date}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.checkIn ? formatTime(row.checkIn) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.checkOut ? formatTime(row.checkOut) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-800">
                        {row.workedSeconds > 0 ? formatDuration(row.workedSeconds) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.breakSeconds > 0 ? formatDuration(row.breakSeconds) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {row.lateCheckIn && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700">Late</span>
                          )}
                          {row.lowTimeFlag && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700">Low</span>
                          )}
                          {row.extraTimeFlag && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">Extra</span>
                          )}
                          {!row.lateCheckIn && !row.lowTimeFlag && !row.extraTimeFlag && (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      case 'breaks':
        if (!breakRows.length) {
          return <EmptyState message={`No break time records for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Type', 'Start', 'End', 'Duration', 'Reason'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(breakRows).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{row.date}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.type}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.start ? formatTime(row.start) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.end ? formatTime(row.end) : 'Ongoing'}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-800">
                        {row.durationSeconds > 0 ? formatDuration(row.durationSeconds) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate">
                        {row.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      case 'performance':
        if (performanceStats.presentDays === 0 && attendanceRows.length === 0) {
          return <EmptyState message={`No performance data for ${dateRange.label}.`} />;
        }
        return (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Present Days', value: String(performanceStats.presentDays) },
              { label: 'Total Worked', value: formatDuration(performanceStats.totalWorkedSeconds) },
              { label: 'Avg Worked / Day', value: formatDuration(performanceStats.avgWorkedSeconds) },
              { label: 'Total Break', value: formatDuration(performanceStats.totalBreakSeconds) },
              { label: 'Low Time Days', value: String(performanceStats.lowTimeDays) },
              { label: 'Extra Time Days', value: String(performanceStats.extraTimeDays) },
              { label: 'Late Days', value: String(performanceStats.lateDays) },
              { label: 'Low / Extra Time', value: `${formatDuration(performanceStats.totalLowSeconds)} / ${formatDuration(performanceStats.totalExtraSeconds)}` },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                <p className="mt-2 text-xl font-black text-slate-800">{stat.value}</p>
              </div>
            ))}
          </div>
        );

      case 'leaveBalance':
        if (!leaveBalance) {
          return <EmptyState message="No leave balance data available for this employee." />;
        }
        return (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              Bond leave summary ({leaveBalance.countStart} → {leaveBalance.countEnd}). Period filter does not change bond balance totals.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Allocated', value: leaveBalance.allocated },
                { label: 'Used', value: leaveBalance.used },
                { label: 'Remaining', value: leaveBalance.remaining },
                { label: 'Extra Taken', value: leaveBalance.extra },
                { label: 'Applied Days', value: leaveBalance.appliedDays },
                { label: 'Absent Days', value: leaveBalance.absentDays },
                { label: 'Total Taken', value: leaveBalance.totalTaken },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-xl font-black text-slate-800">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'leaveRequests':
        if (!leaveRequestRows.length) {
          return <EmptyState message={`No leave requests for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Category', 'Start', 'End', 'Days', 'Status', 'Reason'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(leaveRequestRows).map(leave => (
                    <tr key={leave.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{leave.category}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{leave.startDate}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{leave.endDate}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{leave.totalDays}</td>
                      <td className="px-6 py-3 text-sm">
                        <StatusBadge status={leave.status} />
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate">
                        {leave.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      case 'overtime':
        if (!overtimeRows.length) {
          return <EmptyState message={`No overtime details for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Source', 'Requested', 'Completed', 'Status', 'Reason'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(overtimeRows).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{row.date}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.source}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {formatHoursMinutes(row.requestedMinutes)}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-800">
                        {formatHoursMinutes(row.completedMinutes)}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate">
                        {row.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      case 'earlyCheckout':
        if (!earlyCheckoutRows.length) {
          return <EmptyState message={`No early checkout records for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Check-out', 'Early By', 'Status', 'Repayment', 'Reason'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(earlyCheckoutRows).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{row.date}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.checkOut ? formatTime(row.checkOut) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.earlyMinutes > 0 ? formatHoursMinutes(row.earlyMinutes) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-3 text-sm">
                        {row.repaymentStatus === 'None' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <StatusBadge status={row.repaymentStatus} />
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate">
                        {row.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      case 'penalties':
        if (!penaltyRows.length) {
          return <EmptyState message={`No late check-in penalties recorded for ${dateRange.label}.`} />;
        }
        return (
          <>
            <div className="px-6 pt-4 text-sm text-slate-500">
              Late check-in penalties for {dateRange.label}
              <span className="ml-2 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">
                {penaltyRows.length} {penaltyRows.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Type', 'Penalty', 'Details'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSlice(penaltyRows).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-800">{row.date}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{row.type}</td>
                      <td className="px-6 py-3 text-sm font-medium text-rose-700">−{row.amount}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{row.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <ClipboardList size={24} />
            </div>
            Employee Summary
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            View one employee&apos;s attendance, leave, overtime, and penalty history
            {selectedEmployee ? (
              <span className="text-blue-600 font-bold"> — {selectedEmployee.name}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px]">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <User size={18} />
            </div>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="pl-10 pr-8 py-2.5 w-full max-w-[min(100vw-2rem,320px)] bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-slate-700 text-sm appearance-none cursor-pointer"
              aria-label="Select employee"
            >
              <option value="">Select employee…</option>
              {employeeOptions.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.department})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  period === opt.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !selectedEmployee ? (
        <Card className="p-12 text-center text-slate-500">Loading employee data…</Card>
      ) : !selectedEmployee ? (
        <Card className="p-16 text-center">
          <User size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-semibold text-slate-700">Select an employee</p>
          <p className="text-slate-400 mt-1 italic">
            Choose an employee above to see their full summary for the selected period.
          </p>
        </Card>
      ) : loadingPeriodData && employeeAttendance.length === 0 ? (
        <Card className="p-12 text-center text-slate-500">Loading {dateRange.label} attendance…</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Attendance Days', value: attendanceRows.length, tone: 'blue' },
              { label: 'Leave Requests', value: leaveRequestRows.length, tone: 'indigo' },
              { label: 'Overtime Entries', value: overtimeRows.length, tone: 'emerald' },
              { label: 'Penalties', value: penaltyRows.length, tone: 'rose' },
            ].map(stat => (
              <Card key={stat.label} className="p-4 border-none shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-800">{stat.value}</p>
                <p className="text-xs text-slate-400 mt-1">{dateRange.label}</p>
              </Card>
            ))}
          </div>

          <Card bodyClassName="p-0" className="border-none shadow-sm overflow-hidden">
            <div className="px-4 pt-4 border-b border-slate-100 overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {TAB_OPTIONS.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-t-lg text-sm font-bold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {renderTable()}
          </Card>
        </>
      )}
    </div>
  );
};
