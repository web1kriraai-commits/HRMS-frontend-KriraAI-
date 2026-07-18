import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Clock, TrendingUp, Briefcase, LogOut, Timer } from 'lucide-react';
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
        <div className="grid grid-cols-2 gap-2">
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
            label="Early Leave Time"
            sublabel="Approved early checkout"
            value={formatHoursMinutesShort(summary.earlyLeaveTimeTotalSeconds)}
            icon={<LogOut size={12} />}
            accent={summary.earlyLeaveTimeTotalSeconds > 0 ? 'text-amber-700' : 'text-slate-600'}
            bg={summary.earlyLeaveTimeTotalSeconds > 0 ? 'bg-amber-50/60' : 'bg-slate-50/60'}
            border={summary.earlyLeaveTimeTotalSeconds > 0 ? 'border-amber-100' : 'border-slate-100'}
          />
          <StatTile
            label="Early Leave OT"
            sublabel="Admin allocated early request OT"
            value={formatHoursMinutesShort(summary.earlyRequestOvertimeSeconds)}
            icon={<Timer size={12} />}
            accent={summary.earlyRequestOvertimeSeconds > 0 ? 'text-teal-700' : 'text-slate-600'}
            bg={summary.earlyRequestOvertimeSeconds > 0 ? 'bg-teal-50/60' : 'bg-slate-50/60'}
            border={summary.earlyRequestOvertimeSeconds > 0 ? 'border-teal-100' : 'border-slate-100'}
          />
        </div>

        <StatTile
          label="Actual Worked"
          sublabel="Includes leave days (paid/unpaid) at 8h 15m"
          value={formatHoursMinutesShort(summary.actualWorkedSeconds)}
          icon={<Clock size={12} />}
          accent="text-blue-700"
          bg="bg-blue-50/60"
          border="border-blue-100"
        />

        {summary.earlyLeaveTimeNetSeconds > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-[10px] font-bold text-amber-800">
              {formatHoursMinutesShort(summary.earlyLeaveTimeNetSeconds)} early leave still to cover
              {summary.earlyOvertimeCoveredSeconds > 0 && (
                <span className="font-medium text-amber-600">
                  {' '}
                  ({formatHoursMinutesShort(summary.earlyLeaveTimeTotalSeconds)} − {formatHoursMinutesShort(summary.earlyOvertimeCoveredSeconds)})
                </span>
              )}
            </p>
          </div>
        )}

      </div>
    </Card>
  );
};
