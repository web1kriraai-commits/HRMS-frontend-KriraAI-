import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { X, BarChart3, Table2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import {
  AnalyticsMetricId,
  AnalyticsPeriod,
  METRIC_CONFIG,
  MetricSummary,
  OvertimeType,
  OVERTIME_TYPE_OPTIONS,
  PERIOD_OPTIONS,
  getCurrentMonthStr,
  getEmployeeBreakdownRows,
  getPeriodLabel
} from '../../services/analyticsUtils';
import { Attendance, LeaveRequest, SystemSettings, User } from '../../types';

interface AnalyticsDetailModalProps {
  metricId: AnalyticsMetricId;
  period: AnalyticsPeriod;
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  summary: MetricSummary;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onClose: () => void;
  overtimeType: OvertimeType;
  onOvertimeTypeChange: (type: OvertimeType) => void;
  users: User[];
  attendanceRecords: Attendance[];
  leaveRequests: LeaveRequest[];
  holidayDateSet: Set<string>;
  systemSettings: SystemSettings;
}

export const AnalyticsDetailModal: React.FC<AnalyticsDetailModalProps> = ({
  metricId,
  period,
  selectedMonth,
  onSelectedMonthChange,
  summary,
  onPeriodChange,
  onClose,
  overtimeType,
  onOvertimeTypeChange,
  users,
  attendanceRecords,
  leaveRequests,
  holidayDateSet,
  systemSettings
}) => {
  const BREAKDOWN_PER_PAGE = 10;
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [breakdownPage, setBreakdownPage] = useState(1);
  const config = METRIC_CONFIG[metricId];
  const periodLabel = getPeriodLabel(period, selectedMonth);

  useEffect(() => {
    setBreakdownPage(1);
  }, [period, metricId, selectedMonth]);

  const totalBreakdownPages = Math.max(1, Math.ceil(summary.tableRows.length / BREAKDOWN_PER_PAGE));
  const paginatedBreakdownRows = useMemo(() => {
    const start = (breakdownPage - 1) * BREAKDOWN_PER_PAGE;
    return summary.tableRows.slice(start, start + BREAKDOWN_PER_PAGE);
  }, [summary.tableRows, breakdownPage]);

  useEffect(() => {
    if (breakdownPage > totalBreakdownPages) {
      setBreakdownPage(Math.max(1, totalBreakdownPages));
    }
  }, [breakdownPage, totalBreakdownPages]);

  const employeeRows = useMemo(
    () =>
      getEmployeeBreakdownRows(
        metricId,
        period,
        attendanceRecords,
        users,
        leaveRequests,
        holidayDateSet,
        systemSettings,
        overtimeType,
        selectedMonth
      ),
    [
      metricId,
      period,
      selectedMonth,
      attendanceRecords,
      users,
      leaveRequests,
      holidayDateSet,
      systemSettings,
      overtimeType
    ]
  );

  const totalLabel =
    metricId === 'lateCheckin'
      ? 'TOTAL INCIDENTS'
      : metricId === 'earlyCheckout'
        ? 'TOTAL DEFICIT MINUTES'
        : metricId === 'penaltyMinutes'
          ? 'TOTAL PENALTY'
          : metricId === 'totalHours'
            ? 'TOTAL HOURS'
            : metricId === 'lowTime'
              ? 'TOTAL LOW TIME'
              : 'TOTAL OVERTIME';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${config.color}18` }}
            >
              <BarChart3 size={20} style={{ color: config.color }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {config.title} ({periodLabel})
              </h2>
              <p className="text-sm text-slate-500">Analytics detail view</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Period filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Period</p>
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onPeriodChange(opt.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    period === opt.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {period === '1month' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <Calendar size={14} className="text-blue-500 shrink-0" />
                  <input
                    type="month"
                    value={selectedMonth}
                    max={getCurrentMonthStr()}
                    onChange={(e) => onSelectedMonthChange(e.target.value)}
                    className="text-sm font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Overtime sub-filter */}
          {metricId === 'overtime' && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Overtime Type</p>
              <div className="flex flex-wrap gap-2">
                {OVERTIME_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onOvertimeTypeChange(opt.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                      overtimeType === opt.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary + view toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className={`px-5 py-3 rounded-xl border ${config.banner}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{totalLabel}</p>
              <p className="text-2xl font-black mt-0.5">{summary.formattedTotal}</p>
              {summary.count > 0 && metricId !== 'lateCheckin' && (
                <p className="text-xs font-medium opacity-70 mt-0.5">{summary.count} records</p>
              )}
            </div>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  viewMode === 'chart' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <BarChart3 size={16} />
                Chart
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors border-l border-slate-200 ${
                  viewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Table2 size={16} />
                Table
              </button>
            </div>
          </div>

          {/* Chart or table */}
          {viewMode === 'chart' ? (
            <div className="h-72 w-full">
              {summary.trend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                  No data for selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {metricId === 'lateCheckin' || metricId === 'earlyCheckout' ? (
                    <BarChart data={summary.trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)'
                        }}
                        formatter={(value: number) => [
                          metricId === 'lateCheckin' ? `${value} incidents` : `${value}`,
                          metricId === 'lateCheckin' ? 'Count' : config.unit === 'minutes' ? 'Minutes' : 'Value'
                        ]}
                      />
                      <Bar dataKey={metricId === 'lateCheckin' ? 'count' : 'value'} fill={config.color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={summary.trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)'
                        }}
                        formatter={(value: number) => [
                          config.unit === 'minutes' ? `${Math.round(value)} min` : `${value}h`,
                          config.title
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={config.color}
                        strokeWidth={3}
                        dot={{ fill: config.color, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">
                  {period === 'today' || period === '1month' ? 'Daily' : 'Monthly'} Breakdown
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {period === 'today' || period === '1month' ? 'Date' : 'Month'}
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                          Value
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                          Records
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {summary.tableRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">
                            No data available
                          </td>
                        </tr>
                      ) : (
                        paginatedBreakdownRows.map((row) => (
                          <tr key={row.period} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">{row.period}</td>
                            <td className="px-4 py-3 text-center font-bold" style={{ color: config.color }}>
                              {row.value}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500">{row.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {summary.tableRows.length > BREAKDOWN_PER_PAGE && (
                  <div className="mt-3 px-1 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Showing{' '}
                      <span className="font-bold text-slate-700">
                        {(breakdownPage - 1) * BREAKDOWN_PER_PAGE + 1}
                      </span>{' '}
                      to{' '}
                      <span className="font-bold text-slate-700">
                        {Math.min(breakdownPage * BREAKDOWN_PER_PAGE, summary.tableRows.length)}
                      </span>{' '}
                      of <span className="font-bold text-slate-700">{summary.tableRows.length}</span> months
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBreakdownPage((p) => Math.max(1, p - 1))}
                        disabled={breakdownPage === 1}
                        className={`p-1.5 rounded-lg border transition-all ${
                          breakdownPage === 1
                            ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed'
                            : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-700 mx-1">
                        <span className="text-blue-600 px-2 py-0.5 bg-blue-50 rounded border border-blue-100">
                          {breakdownPage}
                        </span>
                        <span className="text-slate-400">/</span>
                        <span>{totalBreakdownPages}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBreakdownPage((p) => Math.min(totalBreakdownPages, p + 1))}
                        disabled={breakdownPage === totalBreakdownPages}
                        className={`p-1.5 rounded-lg border transition-all ${
                          breakdownPage === totalBreakdownPages
                            ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed'
                            : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">Employee Breakdown</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Department
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                          Total
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {employeeRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                            No employee data
                          </td>
                        </tr>
                      ) : (
                        employeeRows.map((row) => (
                          <tr key={row.employee} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">{row.employee}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 uppercase">
                                {row.department}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold" style={{ color: config.color }}>
                              {row.value}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500">{row.count}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
