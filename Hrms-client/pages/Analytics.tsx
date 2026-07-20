import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { AnalyticsDetailModal } from '../components/analytics/AnalyticsDetailModal';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Loader2,
  Clock,
  LogOut,
  AlertTriangle,
  Timer,
  TrendingDown,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Calendar
} from 'lucide-react';
import { getLocalISOString } from '../services/utils';
import {
  AnalyticsMetricId,
  AnalyticsPeriod,
  METRIC_CONFIG,
  OvertimeType,
  OVERTIME_TYPE_OPTIONS,
  PERIOD_OPTIONS,
  buildAnalyticsDashboard,
  getCurrentMonthStr
} from '../services/analyticsUtils';

const KPI_ICONS: Record<AnalyticsMetricId, React.ElementType> = {
  totalHours: Clock,
  earlyCheckout: LogOut,
  lateCheckin: AlertTriangle,
  penaltyMinutes: Timer,
  lowTime: TrendingDown,
  overtime: TrendingUp
};

const KPI_COLORS: Record<AnalyticsMetricId, { bg: string; icon: string; border: string }> = {
  totalHours: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
  earlyCheckout: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
  lateCheckin: { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-100' },
  penaltyMinutes: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-100' },
  lowTime: { bg: 'bg-pink-50', icon: 'text-pink-600', border: 'border-pink-100' },
  overtime: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' }
};

const METRIC_ORDER: AnalyticsMetricId[] = [
  'totalHours',
  'earlyCheckout',
  'lateCheckin',
  'penaltyMinutes',
  'lowTime',
  'overtime'
];

export const Analytics: React.FC = () => {
  const { users, attendanceRecords, leaveRequests, companyHolidays, systemSettings, loading } = useApp();
  const [period, setPeriod] = useState<AnalyticsPeriod>('3month');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr);
  const [overtimeType, setOvertimeType] = useState<OvertimeType>('all');
  const [modalMetric, setModalMetric] = useState<AnalyticsMetricId | null>(null);
  const [modalPeriod, setModalPeriod] = useState<AnalyticsPeriod>('3month');
  const [modalSelectedMonth, setModalSelectedMonth] = useState(getCurrentMonthStr);
  const [modalOvertimeType, setModalOvertimeType] = useState<OvertimeType>('all');
  const [pageViewMode, setPageViewMode] = useState<'chart' | 'table'>('chart');

  const holidayDateSet = useMemo(
    () =>
      new Set(
        companyHolidays.map((h) =>
          typeof h.date === 'string' ? h.date.split('T')[0] : getLocalISOString(new Date(h.date))
        )
      ),
    [companyHolidays]
  );

  const dashboard = useMemo(
    () =>
      buildAnalyticsDashboard(
        period,
        attendanceRecords,
        users,
        leaveRequests,
        companyHolidays,
        systemSettings,
        overtimeType,
        selectedMonth
      ),
    [period, selectedMonth, attendanceRecords, users, leaveRequests, companyHolidays, systemSettings, overtimeType]
  );

  const modalDashboard = useMemo(() => {
    if (!modalMetric) return null;
    return buildAnalyticsDashboard(
      modalPeriod,
      attendanceRecords,
      users,
      leaveRequests,
      companyHolidays,
      systemSettings,
      modalMetric === 'overtime' ? modalOvertimeType : 'all',
      modalSelectedMonth
    );
  }, [
    modalMetric,
    modalPeriod,
    modalSelectedMonth,
    modalOvertimeType,
    attendanceRecords,
    users,
    leaveRequests,
    companyHolidays,
    systemSettings
  ]);

  const openModal = (metricId: AnalyticsMetricId) => {
    setModalMetric(metricId);
    setModalPeriod(period);
    setModalSelectedMonth(selectedMonth);
    setModalOvertimeType(metricId === 'overtime' ? overtimeType : 'all');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">HR Analytics</h2>
          <p className="text-slate-500 text-sm">
            Attendance insights — hours, penalties, low time & overtime
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setPageViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                pageViewMode === 'chart' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
              }`}
            >
              <BarChart3 size={14} />
              Charts
            </button>
            <button
              onClick={() => setPageViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-l border-slate-200 ${
                pageViewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Period filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Duration</p>
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                period === opt.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {period === '1month' && (
            <div className="flex items-center gap-2 ml-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
              <Calendar size={14} className="text-blue-500 shrink-0" />
              <input
                type="month"
                value={selectedMonth}
                max={getCurrentMonthStr()}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {METRIC_ORDER.map((metricId) => {
          const config = METRIC_CONFIG[metricId];
          const colors = KPI_COLORS[metricId];
          const Icon = KPI_ICONS[metricId];
          const kpiValue = dashboard.kpiCards[metricId];

          return (
            <button
              key={metricId}
              onClick={() => openModal(metricId)}
              className={`text-left p-4 rounded-2xl bg-white border ${colors.border} shadow-sm hover:shadow-md transition-all group`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                    {config.title}
                  </p>
                  <p className="text-xl font-black text-slate-800 mt-1 tabular-nums">{kpiValue}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 flex items-center gap-1 group-hover:text-blue-600 transition-colors">
                    View details <ArrowRight size={10} />
                  </p>
                </div>
                <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Overtime type filter */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          Overtime Filter
        </p>
        <div className="flex flex-wrap gap-2">
          {OVERTIME_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setOvertimeType(opt.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                overtimeType === opt.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-emerald-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics grid */}
      {pageViewMode === 'chart' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {METRIC_ORDER.map((metricId) => {
            const config = METRIC_CONFIG[metricId];
            const summary =
              metricId === 'overtime' ? dashboard.metrics.overtime : dashboard.metrics[metricId];
            const totalBanner =
              metricId === 'lateCheckin'
                ? `TOTAL INCIDENTS: ${summary.count}`
                : metricId === 'earlyCheckout'
                  ? `TOTAL REQUESTS: ${summary.count}`
                  : metricId === 'penaltyMinutes'
                    ? `TOTAL PENALTY: ${Math.round(summary.total)}m`
                    : metricId === 'totalHours'
                      ? `TOTAL HOURS: ${summary.formattedTotal}`
                      : metricId === 'lowTime'
                        ? `TOTAL LOW TIME: ${summary.formattedTotal}`
                        : `TOTAL OT: ${summary.formattedTotal}`;

            return (
              <Card
                key={metricId}
                className="overflow-hidden"
                bodyClassName="p-0"
                title={config.title}
                action={
                  <button
                    onClick={() => openModal(metricId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <BarChart3 size={14} />
                    Analytic
                  </button>
                }
              >
                <div className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b ${config.banner}`}>
                  {totalBanner}
                </div>
                <div className="p-5 h-64">
                  {summary.trend.every((t) => t.value === 0 && t.count === 0) ? (
                    <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                      No data for {dashboard.range.label}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {metricId === 'lateCheckin' ? (
                        <BarChart data={summary.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
                            formatter={(v: number) => [`${v} incidents`, 'Late Check-in']}
                          />
                          <Bar dataKey="count" fill={config.color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : metricId === 'earlyCheckout' ? (
                        <BarChart data={summary.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
                            formatter={(v: number) => [`${Math.round(v)} min`, 'Deficit']}
                          />
                          <Bar dataKey="value" fill={config.color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <LineChart data={summary.trend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
                            formatter={(v: number) => [
                              config.unit === 'minutes' ? `${Math.round(v)} min` : `${v}h`,
                              config.title
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={config.color}
                            strokeWidth={2}
                            dot={{ fill: config.color, r: 3 }}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {METRIC_ORDER.map((metricId) => {
            const config = METRIC_CONFIG[metricId];
            const summary =
              metricId === 'overtime' ? dashboard.metrics.overtime : dashboard.metrics[metricId];

            return (
              <Card
                key={metricId}
                title={config.title}
                action={
                  <button
                    onClick={() => openModal(metricId)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Open detail →
                  </button>
                }
              >
                <p className="text-sm text-slate-500 mb-4">{config.subtitle}</p>
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
                      {summary.tableRows.filter((r) => r.rawValue > 0 || r.count > 0).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic">
                            No data for {dashboard.range.label}
                          </td>
                        </tr>
                      ) : (
                        summary.tableRows
                          .filter((r) => r.rawValue > 0 || r.count > 0)
                          .map((row) => (
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
                    <tfoot>
                      <tr className="bg-slate-50/80 border-t border-slate-100 font-bold">
                        <td className="px-4 py-3 text-slate-700">Total</td>
                        <td className="px-4 py-3 text-center" style={{ color: config.color }}>
                          {summary.formattedTotal}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{summary.count}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {modalMetric && modalDashboard && (
        <AnalyticsDetailModal
          metricId={modalMetric}
          period={modalPeriod}
          selectedMonth={modalSelectedMonth}
          onSelectedMonthChange={setModalSelectedMonth}
          summary={modalDashboard.metrics[modalMetric]}
          onPeriodChange={setModalPeriod}
          onClose={() => setModalMetric(null)}
          overtimeType={modalOvertimeType}
          onOvertimeTypeChange={setModalOvertimeType}
          users={users}
          attendanceRecords={attendanceRecords}
          leaveRequests={leaveRequests}
          holidayDateSet={holidayDateSet}
          systemSettings={systemSettings}
        />
      )}
    </div>
  );
};
