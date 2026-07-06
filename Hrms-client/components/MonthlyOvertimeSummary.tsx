import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Clock, TrendingUp, Briefcase, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Attendance, LeaveRequest } from '../types';
import {
  calculateMonthlyOvertimeSummary,
  formatHoursMinutesShort
} from '../services/utils';
import { attendanceAPI } from '../services/api';

interface MonthlyOvertimeSummaryProps {
  monthStr: string;
  monthLabel: string;
  userId: string;
  attendanceRecords: Attendance[];
  leaves: LeaveRequest[];
  holidayDateSet: Set<string>;
  onMonthChange?: (month: string) => void;
  maxMonth?: string;
  showMonthPicker?: boolean;
}

const StatTile: React.FC<{
  label: string;
  sublabel?: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  border: string;
}> = ({ label, sublabel, value, icon, accent, bg, border }) => (
  <div className={`p-4 rounded-2xl border ${bg} ${border} shadow-sm transition-transform hover:scale-[1.01]`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 ${accent}`}>
          {icon}
          <p className="text-[10px] font-black uppercase tracking-widest truncate">{label}</p>
        </div>
        {sublabel && (
          <p className="text-[9px] font-bold opacity-60 mt-0.5 leading-tight">{sublabel}</p>
        )}
      </div>
      <p className={`text-xl font-black tabular-nums shrink-0 ${accent}`}>{value}</p>
    </div>
  </div>
);

const currentMonthStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const MonthlyOvertimeSummary: React.FC<MonthlyOvertimeSummaryProps> = ({
  monthStr,
  monthLabel,
  userId,
  attendanceRecords,
  leaves,
  holidayDateSet,
  onMonthChange,
  maxMonth,
  showMonthPicker = true
}) => {
  const [liveTodayWorkedSeconds, setLiveTodayWorkedSeconds] = useState<number | null>(null);
  const isCurrentMonth = monthStr === currentMonthStr();

  const fetchLiveWorked = useCallback(async () => {
    if (!isCurrentMonth) {
      setLiveTodayWorkedSeconds(null);
      return;
    }
    try {
      const todayData = await attendanceAPI.getToday() as {
        checkIn?: string;
        checkOut?: string;
        liveWorkedSeconds?: number;
      } | null;
      if (todayData?.checkIn && !todayData?.checkOut && typeof todayData.liveWorkedSeconds === 'number') {
        setLiveTodayWorkedSeconds(todayData.liveWorkedSeconds);
      } else {
        setLiveTodayWorkedSeconds(null);
      }
    } catch {
      // Keep last known value on transient errors
    }
  }, [isCurrentMonth]);

  useEffect(() => {
    fetchLiveWorked();
    if (!isCurrentMonth) return;

    const intervalId = window.setInterval(fetchLiveWorked, 60_000);
    return () => window.clearInterval(intervalId);
  }, [fetchLiveWorked, isCurrentMonth, monthStr]);

  const summary = useMemo(
    () =>
      calculateMonthlyOvertimeSummary(
        monthStr,
        attendanceRecords,
        leaves,
        holidayDateSet,
        userId,
        undefined,
        isCurrentMonth ? liveTodayWorkedSeconds : null
      ),
    [monthStr, attendanceRecords, leaves, holidayDateSet, userId, isCurrentMonth, liveTodayWorkedSeconds]
  );

  return (
    <Card
      title={`Monthly Overtime (${monthLabel})`}
      className="h-fit bg-gradient-to-br from-white via-slate-50/40 to-indigo-50/20"
      action={
        showMonthPicker && onMonthChange ? (
          <input
            type="month"
            className="text-[10px] bg-slate-50 border border-slate-200 text-slate-700 px-2 py-1 rounded-lg ml-2 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            value={monthStr}
            max={maxMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            title="Select month"
          />
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* Three OT types */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatTile
            label="General OT"
            sublabel="Auto above 8h 15m"
            value={formatHoursMinutesShort(summary.generalOvertimeSeconds)}
            icon={<TrendingUp size={12} />}
            accent="text-emerald-700"
            bg="bg-emerald-50/60"
            border="border-emerald-100"
          />
          <StatTile
            label="Management OT"
            sublabel="Admin approved"
            value={formatHoursMinutesShort(summary.managementOvertimeSeconds)}
            icon={<Briefcase size={12} />}
            accent="text-violet-700"
            bg="bg-violet-50/60"
            border="border-violet-100"
          />
          <StatTile
            label="Early OT"
            sublabel="Early checkout deficit"
            value={formatHoursMinutesShort(summary.earlyOvertimeOutstandingSeconds)}
            icon={<LogOut size={12} />}
            accent={summary.earlyOvertimeOutstandingSeconds > 0 ? 'text-amber-700' : 'text-slate-600'}
            bg={summary.earlyOvertimeOutstandingSeconds > 0 ? 'bg-amber-50/60' : 'bg-slate-50/60'}
            border={summary.earlyOvertimeOutstandingSeconds > 0 ? 'border-amber-100' : 'border-slate-100'}
          />
        </div>

        {/* Remaining + actual worked */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <StatTile
            label="Actual Worked"
            sublabel="Includes leave days (paid/unpaid) at 8h 15m"
            value={formatHoursMinutesShort(summary.actualWorkedSeconds)}
            icon={<Clock size={12} />}
            accent="text-blue-700"
            bg="bg-blue-50/60"
            border="border-blue-100"
          />
          <StatTile
            label="Remaining Time"
            sublabel={isCurrentMonth && liveTodayWorkedSeconds != null ? 'Updates every minute while clocked in' : 'Balance vs required working days'}
            value={formatHoursMinutesShort(summary.remainingSeconds)}
            icon={summary.remainingSeconds > 0 ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
            accent={summary.remainingSeconds > 0 ? 'text-rose-700' : 'text-emerald-700'}
            bg={summary.remainingSeconds > 0 ? 'bg-rose-50/60' : 'bg-emerald-50/60'}
            border={summary.remainingSeconds > 0 ? 'border-rose-100' : 'border-emerald-100'}
          />
        </div>

        {summary.earlyOvertimeCoveredSeconds > 0 && (
          <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl">
            <p className="text-[10px] font-bold text-teal-700">
              ✓ {formatHoursMinutesShort(summary.earlyOvertimeCoveredSeconds)} of early checkout time covered this month
            </p>
          </div>
        )}

        {summary.remainingSeconds > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
            <p className="text-[10px] font-bold text-rose-700 leading-relaxed">
              You still need {formatHoursMinutesShort(summary.remainingSeconds)} of working time this month.
            </p>
          </div>
        )}

        {summary.remainingSeconds <= 0 && summary.actualWorkedSeconds > 0 && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
            <p className="text-[10px] font-bold text-emerald-700">
              Monthly hours met or exceeded — surplus of {formatHoursMinutesShort(Math.abs(summary.remainingSeconds))}.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
