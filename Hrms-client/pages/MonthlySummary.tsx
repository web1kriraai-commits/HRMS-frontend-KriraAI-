import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  Calendar, 
  Search, 
  Filter, 
  Download, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowRightLeft,
  User,
  LayoutDashboard,
  ChevronRight,
  ChevronLeft,
  Briefcase
} from 'lucide-react';
import { 
  formatDate, 
  getTodayStr, 
  getLocalISOString, 
  formatDuration, 
  calculateDailyTimeStats,
  ABSENCE_PENALTY_EFFECTIVE_DATE,
  downloadCSV,
  isPenaltyEffective,
  calculateLatenessPenaltySeconds,
  getAbsenceStartDate,
  calculateLeaveDays
} from '../services/utils';
import { Role, LeaveCategory, LeaveStatus, Attendance, LeaveRequest } from '../types';

export const MonthlySummary: React.FC = () => {
  const { users, attendanceRecords, leaveRequests, companyHolidays, loading } = useApp();
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('All');
  const [activeTableTab, setActiveTableTab] = useState<'penalties' | 'leaves' | 'earlyCheckout' | 'overtime'>('penalties');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Derive numeric month (0-indexed) and year from the selected value
  const [selectedYear, selectedMonthIdx] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [y, m - 1];
  }, [selectedMonth]);

  const holidayDateSet = useMemo(() => new Set(
    companyHolidays.map(h => typeof h.date === 'string' && !h.date.includes('T') ? h.date : getLocalISOString(new Date(h.date)))
  ), [companyHolidays]);
  
  // Reset page when tab or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTableTab, searchQuery, leaveTypeFilter, selectedMonth]);

  // 1. Penalty History Logic
  const penaltyHistory = useMemo(() => {
    const penalties: any[] = [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const todayStr = getTodayStr();

    users.filter(u => u.role !== Role.ADMIN).forEach(user => {
      // Real attendance records
      const userRecords = attendanceRecords.filter(r => {
        if (r.userId !== user.id) return false;
        const d = new Date(r.date);
        return d >= startDate && d <= endDate;
      });

      const recordsMap = new Map();
      userRecords.forEach(r => {
        const dStr = typeof r.date === 'string' && !r.date.includes('T') ? r.date : getLocalISOString(new Date(r.date));
        recordsMap.set(dStr, r);
      });

      // Approved leaves for absence check
      const userLeaves = leaveRequests.filter(l => 
        l.userId === user.id && l.status === LeaveStatus.APPROVED
      );
      const leaveDates = new Set();
      userLeaves.forEach(l => {
        let curr = new Date(l.startDate);
        const end = new Date(l.endDate);
        while (curr <= end) {
          leaveDates.add(getLocalISOString(curr));
          curr.setDate(curr.getDate() + 1);
        }
      });

      // Lateness Penalties
      userRecords.forEach(r => {
        const dateStr = typeof r.date === 'string' && !r.date.includes('T') ? r.date : getLocalISOString(new Date(r.date));
        const isHoliday = holidayDateSet.has(dateStr);
        if (!isHoliday && !r.isPenaltyDisabled && r.lateCheckIn && r.penaltySeconds) {
          penalties.push({
            id: `late-${r.id}`,
            userId: user.id,
            userName: user.name,
            department: user.department,
            date: dateStr,
            type: 'Late Check-in',
            amount: formatDuration(r.penaltySeconds),
            details: `Checked in at ${new Date(r.checkIn!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          });
        }
      });

      // Absence Penalties (Injection)
      const now = new Date();
      const iter = new Date(startDate);
      const endRange = endDate < now ? endDate : now;
      
      const firstCheckInDate = attendanceRecords
        .filter(r => r.userId === user.id && r.checkIn)
        .sort((a, b) => {
          const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
          const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
          return d1.localeCompare(d2);
        })[0]?.date;

      while (iter <= endRange) {
        const dateStr = getLocalISOString(iter);
        const dayOfWeek = iter.getDay(); // 0 = Sunday
        const absenceStart = getAbsenceStartDate(user, firstCheckInDate);

        if (!recordsMap.has(dateStr) && !leaveDates.has(dateStr) && dayOfWeek !== 0 && !holidayDateSet.has(dateStr) && dateStr >= absenceStart && dateStr < todayStr) {
          penalties.push({
            id: `absent-${user.id}-${dateStr}`,
            userId: user.id,
            userName: user.name,
            department: user.department,
            date: dateStr,
            type: 'Absence',
            amount: '8h 15m',
            details: 'Unexcused absence'
          });
        }
        iter.setDate(iter.getDate() + 1);
      }
    });

    return penalties.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceRecords, users, selectedMonth, leaveRequests, holidayDateSet]);

  // 2. Leave History Logic
  const filteredLeaves = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return leaveRequests.filter(leave => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      const inMonth = (leaveStart >= startDate && leaveStart <= endDate) ||
                     (leaveEnd >= startDate && leaveEnd <= endDate) ||
                     (leaveStart <= startDate && leaveEnd >= endDate);
      
      if (!inMonth) return false;
      if (leave.status !== LeaveStatus.APPROVED) return false;
      if (leaveTypeFilter !== 'All' && leave.category !== leaveTypeFilter) return false;
      if (searchQuery && !leave.userName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      return true;
    }).map(leave => ({
      ...leave,
      totalDays: calculateLeaveDays(leave.startDate, leave.endDate, holidayDateSet)
    })).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [leaveRequests, selectedMonth, leaveTypeFilter, searchQuery, holidayDateSet]);

  const totalLeaveDays = useMemo(() => {
    return filteredLeaves.reduce((sum, leave) => sum + (leave.totalDays || 0), 0);
  }, [filteredLeaves]);

  // 3. Early Checkout History
  const earlyCheckouts = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return attendanceRecords.filter(r => {
      const d = new Date(r.date);
      const inMonth = d >= startDate && d <= endDate;
      if (!inMonth) return false;
      
      const hasRequest = r.earlyLogoutRequest && r.earlyLogoutRequest !== 'None';
      if (!hasRequest) return false;

      if (searchQuery) {
        const user = users.find(u => u.id === r.userId);
        if (!user?.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }

      return true;
    }).map(r => ({
      ...r,
      userName: users.find(u => u.id === r.userId)?.name || 'Unknown',
      department: users.find(u => u.id === r.userId)?.department || 'N/A'
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceRecords, users, selectedMonth, searchQuery]);

  const totalEarlyCheckoutMinutes = useMemo(() => {
    return earlyCheckouts.reduce((sum, r) => {
      const isHoliday = holidayDateSet.has(r.date);
      const stats = calculateDailyTimeStats(r.totalWorkedSeconds || 0, false, isHoliday, 0, r.date);
      return sum + Math.floor(stats.lowTimeSeconds / 60);
    }, 0);
  }, [earlyCheckouts, holidayDateSet]);

  // 4. Overtime History
  const overtimeHistory = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return attendanceRecords.filter(r => {
      const d = new Date(r.date);
      const inMonth = d >= startDate && d <= endDate;
      if (!inMonth) return false;

      const hasOT = r.overtimeRequest && r.overtimeRequest.status !== 'None';
      if (!hasOT) return false;

      if (searchQuery) {
        const user = users.find(u => u.id === r.userId);
        if (!user?.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }

      return true;
    }).map(r => {
      const requested = r.overtimeRequest?.durationMinutes || 0;
      const workedSec = r.totalWorkedSeconds || 0;
      const isHoliday = holidayDateSet.has(r.date);
      const stats = calculateDailyTimeStats(workedSec, false, isHoliday, 0, r.date);
      const completedMinutes = Math.floor(stats.extraTimeSeconds / 60);

      return {
        ...r,
        userName: users.find(u => u.id === r.userId)?.name || 'Unknown',
        department: users.find(u => u.id === r.userId)?.department || 'N/A',
        requestedMinutes: requested,
        completedMinutes: completedMinutes,
        approvedMinutes: r.overtimeRequest?.status === 'Approved' ? requested : 0
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceRecords, users, selectedMonth, searchQuery, holidayDateSet]);

  const totalOvertimeMinutes = useMemo(() => {
    return overtimeHistory.reduce((sum, o) => sum + (o.completedMinutes || 0), 0);
  }, [overtimeHistory]);

  const exportData = () => {
    let dataToExport: any[] = [];
    let filename = '';

    if (activeTableTab === 'penalties') {
      dataToExport = penaltyHistory.map(p => ({
        Employee: p.userName,
        Date: p.date,
        Type: p.type,
        Amount: p.amount,
        Details: p.details
      }));
      filename = `Penalty_History_${selectedMonth}.csv`;
    } else if (activeTableTab === 'leaves') {
      dataToExport = filteredLeaves.map(l => ({
        Employee: l.userName,
        Category: l.category,
        Start: l.startDate,
        End: l.endDate,
        Status: l.status,
        Reason: l.reason
      }));
      filename = `Leave_History_${selectedMonth}.csv`;
    } else if (activeTableTab === 'earlyCheckout') {
      dataToExport = earlyCheckouts.map(e => ({
        Employee: e.userName,
        Date: e.date,
        Reason: e.earlyLogoutRequestNote,
        Status: e.earlyLogoutRequest
      }));
      filename = `Early_Checkout_History_${selectedMonth}.csv`;
    } else if (activeTableTab === 'overtime') {
      dataToExport = overtimeHistory.map(o => ({
        Employee: o.userName,
        Date: o.date,
        Requested: `${o.requestedMinutes}m`,
        Completed: `${o.completedMinutes}m`,
        Status: o.overtimeRequest?.status,
        Reason: o.overtimeRequest?.reason
      }));
      filename = `Overtime_History_${selectedMonth}.csv`;
    }

    downloadCSV(filename, dataToExport);
  };

  const getMonthName = () => {
    return new Date(selectedYear, selectedMonthIdx).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Calendar size={24} />
            </div>
            Monthly Admin Summary
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">
            Comprehensive overview for {getMonthName()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <Calendar size={18} />
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
            />
          </div>
          <Button 
            onClick={exportData}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            <Download size={18} />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Penalties', value: penaltyHistory.length, icon: AlertCircle, color: 'rose' },
          { label: 'Leaves Taken', value: filteredLeaves.length, subValue: `${totalLeaveDays} Days`, icon: Briefcase, color: 'indigo' },
          { label: 'Early Checkouts', value: earlyCheckouts.length, subValue: `${Math.floor(totalEarlyCheckoutMinutes / 60)}h ${totalEarlyCheckoutMinutes % 60}m`, icon: ArrowRightLeft, color: 'amber' },
          { label: 'Overtime Requests', value: overtimeHistory.length, subValue: `${Math.floor(totalOvertimeMinutes / 60)}h ${totalOvertimeMinutes % 60}m`, icon: Clock, color: 'emerald' },
        ].map((stat, i) => (
          <Card key={i} className="p-6 border-none shadow-sm bg-white hover:shadow-md transition-all group overflow-hidden relative">
            <div className={`absolute top-0 right-0 h-24 w-24 -mr-8 -mt-8 rounded-full bg-${stat.color}-50 transition-transform group-hover:scale-110`} />
            <div className="relative flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl bg-${stat.color}-100 flex items-center justify-center text-${stat.color}-600 shadow-inner`}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-black text-slate-800">{stat.value}</h3>
                  {stat.subValue && (
                    <span className={`text-xs font-bold text-${stat.color}-600 bg-${stat.color}-50 px-2 py-0.5 rounded-lg`}>
                      {stat.subValue}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Tabs and Search Bar */}
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-50/50">
          <div className="flex p-1 bg-slate-200/50 rounded-2xl w-fit">
            {[
              { id: 'penalties', label: 'Penalties', icon: AlertCircle },
              { id: 'leaves', label: 'Leaves', icon: Briefcase },
              { id: 'earlyCheckout', label: 'Early Checkout', icon: ArrowRightLeft },
              { id: 'overtime', label: 'Overtime', icon: Clock },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTableTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeTableTab === tab.id 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {activeTableTab === 'leaves' && (
              <select
                value={leaveTypeFilter}
                onChange={(e) => setLeaveTypeFilter(e.target.value)}
                className="w-full sm:w-48 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="All">All Leave Types</option>
                {Object.values(LeaveCategory).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 font-medium"
              />
            </div>
          </div>
        </div>
        
        {/* Total Count Header */}
        <div className="px-6 py-3 bg-indigo-50/30 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-700">
            <Filter size={14} className="opacity-70" />
            <span className="text-xs font-black uppercase tracking-wider">
              {activeTableTab === 'penalties' && `Total Penalties: ${penaltyHistory.length}`}
              {activeTableTab === 'leaves' && `Total Leaves: ${filteredLeaves.length} (${totalLeaveDays} Days)`}
              {activeTableTab === 'earlyCheckout' && `Total Requests: ${earlyCheckouts.length}`}
              {activeTableTab === 'overtime' && `Total Records: ${overtimeHistory.length}`}
            </span>
          </div>
          <p className="text-[10px] font-bold text-slate-400">Page {currentPage} of {Math.ceil((
            activeTableTab === 'penalties' ? penaltyHistory.length :
            activeTableTab === 'leaves' ? filteredLeaves.length :
            activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
            overtimeHistory.length
          ) / itemsPerPage) || 1}</p>
        </div>

        {/* Dynamic Table Section */}
        <div className="overflow-x-auto min-h-[400px]">
          {activeTableTab === 'penalties' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Penalty Type</th>
                  <th className="px-6 py-4">Deduction</th>
                  <th className="px-6 py-4">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {penaltyHistory.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-medium italic">No penalties recorded for this period.</td></tr>
                ) : penaltyHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          {p.userName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{p.userName}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{p.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600">{formatDate(p.date)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                        p.type === 'Absence' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-700">{p.amount}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs">{p.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTableTab === 'leaves' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Period</th>
                  <th className="px-6 py-4 text-center">Days</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLeaves.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-medium italic">No leave records matching the criteria.</td></tr>
                ) : filteredLeaves.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((l, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800">{l.userName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-[10px] uppercase">
                        {l.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-700">{formatDate(l.startDate)}</p>
                      {l.startDate !== l.endDate && (
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">to {formatDate(l.endDate)}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-600 mx-auto border border-slate-200">
                        {l.totalDays}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 shadow-sm px-2 py-1 rounded-lg bg-white border border-slate-100 w-fit">
                        {l.status === 'Approved' ? <CheckCircle2 className="text-emerald-500" size={14} /> : 
                         l.status === 'Rejected' ? <XCircle className="text-rose-500" size={14} /> : 
                         <Clock className="text-amber-500" size={14} />}
                        <span className={`text-[10px] font-black uppercase ${
                          l.status === 'Approved' ? 'text-emerald-600' : 
                          l.status === 'Rejected' ? 'text-rose-600' : 'text-amber-600'
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 max-w-sm truncate italic" title={l.reason}>
                        "{l.reason}"
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTableTab === 'earlyCheckout' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Reason/Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {earlyCheckouts.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-400 font-medium italic">No early checkout requests found.</td></tr>
                ) : earlyCheckouts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{e.userName}</td>
                    <td className="px-6 py-4 font-bold text-slate-600">{formatDate(e.date)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        e.earlyLogoutRequest === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 
                        e.earlyLogoutRequest === 'Rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {e.earlyLogoutRequest}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 italic max-w-lg">
                      {e.earlyLogoutRequestNote || "No note provided"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTableTab === 'overtime' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-center">Requested</th>
                  <th className="px-6 py-4 text-center">Completed (Admin)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {overtimeHistory.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-medium italic">No overtime requests in this month.</td></tr>
                ) : overtimeHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((o, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{o.userName}</td>
                    <td className="px-6 py-4 font-bold text-slate-600">{formatDate(o.date)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-1 rounded bg-slate-100 text-[11px] font-black text-slate-600">
                        {o.requestedMinutes} MIN
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-[11px] font-black ${
                        o.completedMinutes >= o.requestedMinutes ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                      }`}>
                        {o.completedMinutes} MIN
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        o.overtimeRequest?.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 
                        o.overtimeRequest?.status === 'Rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {o.overtimeRequest?.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 italic truncate max-w-xs" title={o.overtimeRequest?.reason}>
                      {o.overtimeRequest?.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {((activeTableTab === 'penalties' ? penaltyHistory.length :
           activeTableTab === 'leaves' ? filteredLeaves.length :
           activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
           overtimeHistory.length) > itemsPerPage) && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <p className="text-sm text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-slate-900">
                {Math.min(currentPage * itemsPerPage, (
                  activeTableTab === 'penalties' ? penaltyHistory.length :
                  activeTableTab === 'leaves' ? filteredLeaves.length :
                  activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
                  overtimeHistory.length
                ))}
              </span> of <span className="font-bold text-slate-900">
                {activeTableTab === 'penalties' ? penaltyHistory.length :
                 activeTableTab === 'leaves' ? filteredLeaves.length :
                 activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
                 overtimeHistory.length}
              </span> results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-9 w-9 p-0 rounded-lg border-slate-200 disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.ceil((
                  activeTableTab === 'penalties' ? penaltyHistory.length :
                  activeTableTab === 'leaves' ? filteredLeaves.length :
                  activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
                  overtimeHistory.length
                ) / itemsPerPage) }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-9 w-9 rounded-lg text-sm font-bold transition-all ${
                      currentPage === pageNum 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                        : 'text-slate-500 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil((
                  activeTableTab === 'penalties' ? penaltyHistory.length :
                  activeTableTab === 'leaves' ? filteredLeaves.length :
                  activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
                  overtimeHistory.length
                ) / itemsPerPage), prev + 1))}
                disabled={currentPage >= Math.ceil((
                  activeTableTab === 'penalties' ? penaltyHistory.length :
                  activeTableTab === 'leaves' ? filteredLeaves.length :
                  activeTableTab === 'earlyCheckout' ? earlyCheckouts.length :
                  overtimeHistory.length
                ) / itemsPerPage)}
                className="h-9 w-9 p-0 rounded-lg border-slate-200 disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Visual Footer Decor */}
      <div className="flex items-center justify-center gap-1 opacity-20 mt-8">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        <div className="h-1.5 w-8 rounded-full bg-slate-400" />
        <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      </div>
    </div>
  );
};
