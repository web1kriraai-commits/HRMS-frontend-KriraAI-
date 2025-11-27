import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Role } from '../types';
import { Download, FileText, Activity, Users, Calendar, Plus, PenTool, Globe, Clock, LogIn, LogOut, Coffee, TrendingUp, TrendingDown, CheckCircle, Timer, Bell, X, UserPlus, Trash2 } from 'lucide-react';
import { formatDate, getTodayStr, formatDuration } from '../services/utils';
import { attendanceAPI, notificationAPI, userAPI } from '../services/api';

export const AdminDashboard: React.FC = () => {
  const { auth, users, auditLogs, exportReports, companyHolidays, addCompanyHoliday, attendanceRecords, systemSettings, updateSystemSettings, refreshData, notifications, leaveRequests } = useApp();
  const [activeTab, setActiveTab] = useState<'summary' | 'users' | 'audit' | 'reports' | 'settings'>('summary');
  
  // User management states
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', department: '', role: 'Employee' });
  
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });
  const [correction, setCorrection] = useState({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
  const [reportFilters, setReportFilters] = useState({ start: '', end: '', department: '' });
  
  // Summary states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const timezones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];

  // Get monthly attendance for selected user
  const getMonthlyAttendance = () => {
    if (!selectedUserId || !selectedMonth) return [];
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    return attendanceRecords
      .filter(record => {
        if (record.userId !== selectedUserId) return false;
        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const monthlyAttendance = getMonthlyAttendance();
  const selectedUser = users.find(u => u.id === selectedUserId);

  // Get leaves for selected user in selected month
  const getMonthlyLeaves = () => {
    if (!selectedUserId || !selectedMonth) return [];
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    return leaveRequests
      .filter(leave => {
        if (leave.userId !== selectedUserId) return false;
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        // Check if leave overlaps with selected month
        return (leaveStart >= startDate && leaveStart <= endDate) ||
               (leaveEnd >= startDate && leaveEnd <= endDate) ||
               (leaveStart <= startDate && leaveEnd >= endDate);
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  };

  const monthlyLeaves = getMonthlyLeaves();

  // Helper to calculate break seconds from breaks array
  const getBreakSeconds = (breaks: any[]) => {
    if (!breaks || !Array.isArray(breaks)) return 0;
    return breaks.reduce((acc, b) => {
      if (b.durationSeconds) return acc + b.durationSeconds;
      if (b.start && b.end) {
        return acc + Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
      }
      return acc;
    }, 0);
  };

  // Calculate monthly stats
  const calculateMonthlyStats = () => {
    let totalWorkedSeconds = 0;
    let totalBreakSeconds = 0;
    let daysPresent = 0;
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    
    const STANDARD_DAY_SECONDS = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds

    monthlyAttendance.forEach(record => {
      if (record.checkIn && record.checkOut) {
        daysPresent++;
        const checkIn = new Date(record.checkIn).getTime();
        const checkOut = new Date(record.checkOut).getTime();
        const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
        
        // Get break time from breaks array or totalBreakDuration
        const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
        const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
        
        totalWorkedSeconds += netWorkedSeconds;
        totalBreakSeconds += breakSeconds;
        
        // Only flag as low/extra if NOT exactly on standard time
        if (netWorkedSeconds < STANDARD_DAY_SECONDS) {
          totalLowTimeSeconds += STANDARD_DAY_SECONDS - netWorkedSeconds;
        } else if (netWorkedSeconds > STANDARD_DAY_SECONDS) {
          totalExtraTimeSeconds += netWorkedSeconds - STANDARD_DAY_SECONDS;
        }
        // If netWorkedSeconds === STANDARD_DAY_SECONDS, it's exactly on time (no low/extra)
      }
    });

    return {
      totalWorkedSeconds,
      totalBreakSeconds,
      daysPresent,
      totalLowTimeSeconds,
      totalExtraTimeSeconds,
      finalDifference: totalExtraTimeSeconds - totalLowTimeSeconds
    };
  };

  const stats = calculateMonthlyStats();

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHoliday.date && newHoliday.description) {
        addCompanyHoliday(newHoliday.date, newHoliday.description);
        setNewHoliday({ date: '', description: '' });
    }
  };

  const handleCorrection = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!correction.userId || !correction.date) return;
      
      if(!correction.checkIn && !correction.checkOut) {
        alert("Please provide at least Check In or Check Out time");
        return;
      }

      try {
        await attendanceAPI.adminCreateOrUpdate({
          userId: correction.userId,
          date: correction.date,
          checkIn: correction.checkIn || undefined,
          checkOut: correction.checkOut || undefined,
          breakDurationMinutes: correction.breakDuration ? parseInt(correction.breakDuration) : undefined,
          notes: correction.notes || undefined
        });
        alert("Attendance saved successfully.");
        setCorrection({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
        // Refresh data to show updated records
        await refreshData();
      } catch (error: any) {
        alert(error.message || "Failed to save attendance");
      }
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getMonthName = () => {
    if (!selectedMonth) return '';
    return new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Format duration with small text for units
  const formatDurationStyled = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    if (h === 0 && m === 0) return <><span>0</span><span className="text-sm font-normal ml-1">minutes</span></>;
    if (h === 0) return <><span>{m}</span><span className="text-sm font-normal ml-1">minutes</span></>;
    if (m === 0) return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span></>;
    return <><span>{h}</span><span className="text-sm font-normal ml-1">hours</span> <span>{m}</span><span className="text-sm font-normal ml-1">min</span></>;
  };

  // Format notification time
  const formatNotificationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Notifications Section */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">Notifications</h3>
              <p className="text-xs text-gray-500">Auto-removed after 24 hours</p>
            </div>
            <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{notifications.length}</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {notifications.map(n => (
              <div key={n.id} className="bg-white rounded-xl p-3 border border-amber-100 flex items-start gap-3">
                <div className={`h-2 w-2 rounded-full mt-2 ${n.read ? 'bg-gray-300' : 'bg-amber-500'}`}></div>
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatNotificationTime(n.createdAt)}</p>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      await notificationAPI.deleteNotification(n.id);
                      await refreshData();
                    } catch (e) {}
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 overflow-x-auto">
          <button onClick={() => setActiveTab('summary')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'summary' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Clock size={16} className="mr-2"/> Monthly Summary
          </button>
          <button onClick={() => setActiveTab('users')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'users' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Users size={16} className="mr-2"/> User Management
          </button>
          <button onClick={() => setActiveTab('audit')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'audit' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Activity size={16} className="mr-2"/> Audit Logs
          </button>
          <button onClick={() => setActiveTab('reports')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'reports' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <FileText size={16} className="mr-2"/> System Management
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap transition-all ${activeTab === 'settings' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Globe size={16} className="mr-2"/> Settings
          </button>
      </div>

      {/* MONTHLY SUMMARY TAB */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Header Card with Filters */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-indigo-600" />
                  </div>
                  Monthly Attendance Summary
                </h1>
                <p className="text-gray-500 mt-1 ml-13">Track individual employee performance & attendance</p>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <select 
                  className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-[220px] font-medium"
                  value={selectedUserId} 
                  onChange={e => setSelectedUserId(e.target.value)}
                >
                  <option value="">👤 Select Employee</option>
                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <input 
                  type="month" 
                  className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 font-medium"
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          {selectedUserId && selectedUser ? (
            <>
              {/* Back Button */}
              <button
                onClick={() => setSelectedUserId('')}
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-medium transition-colors mb-2"
              >
                <span className="text-lg">←</span> Back to All Employees
              </button>

              {/* User Profile Card */}
              <div className={`rounded-xl shadow-sm border p-5 flex flex-col md:flex-row items-center gap-5 ${
                selectedUser.role === Role.HR ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'
              }`}>
                <div className="relative">
                  <div className={`h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-bold ${
                    selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-700' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-xl font-bold text-gray-800">{selectedUser.name}</h2>
                  <p className="text-gray-500 text-sm">{selectedUser.email}</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      selectedUser.role === Role.HR ? 'bg-yellow-200 text-yellow-800' : 'bg-emerald-50 text-emerald-600'
                    }`}>{selectedUser.role}</span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">{selectedUser.department}</span>
                  </div>
                </div>
                <div className="text-center md:text-right bg-gray-50 rounded-xl px-5 py-3">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Viewing</p>
                  <p className="text-lg font-bold text-gray-700">{getMonthName()}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Days Present */}
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-blue-600 uppercase">Days</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{stats.daysPresent}</p>
                  <p className="text-gray-500 text-sm mt-1">Days Present</p>
                </div>

                {/* Total Worked */}
                <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Timer className="h-5 w-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 uppercase">Hours</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalWorkedSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Total Worked</p>
                </div>

                {/* Low Time */}
                <div className="bg-rose-50 rounded-xl border border-rose-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-rose-600" />
                    </div>
                    <span className="text-xs font-semibold text-rose-600 uppercase">Deficit</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalLowTimeSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Low Time</p>
                </div>

                {/* Extra Time */}
                <div className="bg-violet-50 rounded-xl border border-violet-100 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-violet-600" />
                    </div>
                    <span className="text-xs font-semibold text-violet-600 uppercase">Bonus</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-800">{formatDurationStyled(stats.totalExtraTimeSeconds)}</p>
                  <p className="text-gray-500 text-sm mt-1">Extra Time</p>
                </div>
              </div>

              {/* Net Time Balance Card */}
              <div className={`rounded-xl p-6 border ${
                stats.finalDifference >= 0 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : 'bg-orange-50 border-orange-200'
              }`}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${
                      stats.finalDifference >= 0 ? 'bg-emerald-100' : 'bg-orange-100'
                    }`}>
                      {stats.finalDifference >= 0 ? (
                        <TrendingUp className={`h-7 w-7 text-emerald-600`} />
                      ) : (
                        <TrendingDown className="h-7 w-7 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${stats.finalDifference >= 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                        Net Time Balance
                      </p>
                      <p className="text-gray-500 text-xs">(Extra Time - Low Time)</p>
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <p className={`text-4xl font-bold ${stats.finalDifference >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {stats.finalDifference >= 0 ? '+' : '-'}{formatDuration(Math.abs(stats.finalDifference))}
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                      {stats.finalDifference >= 0 ? '✅ Good Performance' : '⚠️ Needs Improvement'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Leave Records */}
              {monthlyLeaves.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-purple-50">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-purple-600" /> Leave Records
                    </h3>
                    <p className="text-gray-500 text-sm">{getMonthName()} • {monthlyLeaves.length} leave(s)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-purple-50/50">
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Category</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Reason</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {monthlyLeaves.map(leave => (
                          <tr key={leave.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-gray-800">{formatDate(leave.startDate)}</div>
                              {leave.startDate !== leave.endDate && (
                                <div className="text-xs text-gray-400">to {formatDate(leave.endDate)}</div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                                {leave.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 text-sm max-w-xs truncate">{leave.reason}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                                leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                leave.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {leave.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Attendance Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-lg font-bold text-gray-800">Daily Attendance Log</h3>
                  <p className="text-gray-500 text-sm">{getMonthName()} • {monthlyAttendance.length} records</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogIn size={14} className="text-emerald-500"/> Check In</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><LogOut size={14} className="text-rose-500"/> Check Out</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                          <div className="flex items-center gap-2"><Coffee size={14} className="text-amber-500"/> Break</div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Worked</th>
                        <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthlyAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-gray-400">
                            No attendance records found for this month
                          </td>
                        </tr>
                      ) : (
                        monthlyAttendance.map((record, idx) => {
                          const STANDARD_DAY_SECONDS = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
                          
                          // Get break seconds from breaks array or totalBreakDuration
                          const breakSeconds = getBreakSeconds(record.breaks) || (record as any).totalBreakDuration || 0;
                          
                          let netWorkedSeconds = 0;
                          if (record.checkIn && record.checkOut) {
                            const checkIn = new Date(record.checkIn).getTime();
                            const checkOut = new Date(record.checkOut).getTime();
                            const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
                            netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
                          }
                          
                          // Only flag as low/extra if NOT exactly on standard time
                          const isLowTime = netWorkedSeconds > 0 && netWorkedSeconds < STANDARD_DAY_SECONDS;
                          const isExtraTime = netWorkedSeconds > STANDARD_DAY_SECONDS;

                          return (
                            <tr key={record.id} className={`hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                              <td className="px-6 py-4">
                                <div className="font-semibold text-gray-800">{formatDate(record.date)}</div>
                                <div className="text-xs text-gray-400">{new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-emerald-600 font-semibold">
                                  {formatTime(record.checkIn)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-rose-600 font-semibold">
                                  {formatTime(record.checkOut)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-amber-600 font-medium">
                                  {breakSeconds > 0 ? formatDuration(breakSeconds) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-bold text-gray-800">
                                  {netWorkedSeconds > 0 ? formatDuration(netWorkedSeconds) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {!record.checkIn ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">Absent</span>
                                ) : !record.checkOut ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700">In Progress</span>
                                ) : isLowTime ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">Low Time</span>
                                ) : isExtraTime ? (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">Extra Time</span>
                                ) : (
                                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">On Time</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-800">All Employees Overview</h3>
                <p className="text-gray-500 text-sm">Select an employee above to view detailed monthly summary</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Department</th>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase">Total Days</th>
                      <th className="px-6 py-4 text-center text-xs font-black text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(emp => {
                      const empAttendance = attendanceRecords.filter(r => r.userId === emp.id);
                      const isHR = emp.role === Role.HR;
                      return (
                        <tr key={emp.id} className={isHR ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold ${
                                isHR ? 'bg-yellow-200 text-yellow-700' : 'bg-indigo-100 text-indigo-600'
                              }`}>
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-800">{emp.name}</p>
                                  {isHR && <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-bold rounded">HR</span>}
                                </div>
                                <p className="text-xs text-gray-400">@{emp.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{emp.department}</td>
                          <td className="px-6 py-4 text-gray-500 text-sm">{emp.email}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold ${isHR ? 'text-yellow-700' : 'text-indigo-600'}`}>{empAttendance.length}</span>
                            <span className="text-gray-400 text-sm ml-1">days</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => setSelectedUserId(emp.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                isHR ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                          No employees found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USER MANAGEMENT TAB */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create User Form */}
          <Card className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Create User</h3>
                <p className="text-xs text-gray-500">Add Admin, HR, or Employee</p>
              </div>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newUser.name || !newUser.username || !newUser.email || !newUser.department) {
                alert('Please fill all required fields');
                return;
              }
              try {
                await userAPI.createUser({
                  name: newUser.name,
                  username: newUser.username,
                  email: newUser.email,
                  department: newUser.department,
                  role: newUser.role
                });
                alert('User created successfully! Temporary password: tempPassword123');
                setNewUser({ name: '', username: '', email: '', department: '', role: 'Employee' });
                await refreshData();
              } catch (error: any) {
                alert(error.message || 'Failed to create user');
              }
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Name *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="Full Name" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Username *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="username" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Email *</label>
                <input type="email" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="email@example.com" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Department *</label>
                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} placeholder="Engineering" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Role *</label>
                <select className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="Employee">Employee</option>
                  <option value="HR">HR</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">User will receive temporary password: <span className="font-mono font-bold">tempPassword123</span></p>
              <Button type="submit" className="w-full">
                <UserPlus size={16} className="mr-2" /> Create User
              </Button>
            </form>
          </Card>

          {/* Users List */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden p-0">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">All Users</h3>
                    <p className="text-xs text-gray-500">{users.length} users</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 text-left">User</th>
                      <th className="px-5 py-3 text-left">Role</th>
                      <th className="px-5 py-3 text-left">Department</th>
                      <th className="px-5 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                              user.role === Role.ADMIN ? 'bg-purple-500' : 
                              user.role === Role.HR ? 'bg-blue-500' : 'bg-emerald-500'
                            }`}>
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{user.name}</p>
                              <p className="text-xs text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            user.role === Role.ADMIN ? 'bg-purple-100 text-purple-700' : 
                            user.role === Role.HR ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>{user.role}</span>
                        </td>
                        <td className="px-5 py-4 text-gray-600">{user.department}</td>
                        <td className="px-5 py-4 text-center">
                          {user.id !== auth.user?.id && (
                            <button 
                              onClick={async () => {
                                if (confirm(`Are you sure you want to delete ${user.name}?`)) {
                                  try {
                                    await userAPI.deleteUser(user.id);
                                    alert(`User ${user.name} deleted successfully`);
                                    await refreshData();
                                  } catch (error: any) {
                                    alert(error.message || 'Failed to delete user');
                                  }
                                }
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
          <Card title="System Audit Logs">
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                          <tr>
                              <th className="px-6 py-3">Time</th>
                              <th className="px-6 py-3">Actor</th>
                              <th className="px-6 py-3">Target</th>
                              <th className="px-6 py-3">Action</th>
                              <th className="px-6 py-3">Details</th>
                          </tr>
                      </thead>
                      <tbody>
                          {auditLogs.length === 0 ? (
                              <tr><td colSpan={5} className="text-center py-4 text-gray-400">No audit logs found</td></tr>
                          ) : (
                              auditLogs.map(log => (
                                  <tr key={log.id} className="bg-white border-b">
                                      <td className="px-6 py-4 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                      <td className="px-6 py-4 font-medium text-gray-900">{log.actorName}</td>
                                      <td className="px-6 py-4">
                                          <span className="text-xs font-bold text-gray-600 block">{log.targetType}</span>
                                          <span className="text-xs font-mono text-gray-400">{log.targetId}</span>
                                      </td>
                                      <td className="px-6 py-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-mono">{log.action}</span></td>
                                      <td className="px-6 py-4">
                                          <p className="text-gray-600 text-sm">{log.details}</p>
                                          {log.beforeData && (
                                            <details className="mt-1 text-xs text-gray-400 cursor-pointer">
                                                <summary>View Diff</summary>
                                                <div className="p-2 bg-gray-50 rounded mt-1 font-mono">
                                                    <p className="text-red-500 line-through">{log.beforeData}</p>
                                                    <p className="text-green-600">{log.afterData}</p>
                                                </div>
                                            </details>
                                          )}
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </Card>
      )}

      {/* REPORTS & MANAGEMENT TAB */}
      {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Add Holiday */}
                <Card title="Add Company Holiday" className="lg:col-span-1 h-fit">
                    <form onSubmit={handleAddHoliday} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Holiday Date</label>
                            <input type="date" className="w-full p-2 border rounded text-sm" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description</label>
                            <input type="text" placeholder="e.g. Independence Day" className="w-full p-2 border rounded text-sm" value={newHoliday.description} onChange={e => setNewHoliday({...newHoliday, description: e.target.value})} required />
                        </div>
                        <Button type="submit" className="w-full">
                            <Plus size={16} className="mr-2" /> Post Holiday
                        </Button>
                    </form>
                </Card>

                {/* Correction */}
                <Card title="Correct Attendance" className="lg:col-span-1 h-fit">
                  <form onSubmit={handleCorrection} className="space-y-3">
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Employee</label>
                          <select className="w-full p-2 border rounded text-sm" value={correction.userId} onChange={e => setCorrection({...correction, userId: e.target.value})} required>
                              <option value="">Select Employee</option>
                              {users.filter(u => u.role === Role.EMPLOYEE).map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                          <input type="date" className="w-full p-2 border rounded text-sm" value={correction.date} onChange={e => setCorrection({...correction, date: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check In</label>
                              <input type="time" className="w-full p-2 border rounded text-sm" value={correction.checkIn} onChange={e => setCorrection({...correction, checkIn: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Check Out</label>
                              <input type="time" className="w-full p-2 border rounded text-sm" value={correction.checkOut} onChange={e => setCorrection({...correction, checkOut: e.target.value})} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Total Break Deduction (mins)</label>
                          <input type="number" placeholder="Override break time" className="w-full p-2 border rounded text-sm" value={correction.breakDuration} onChange={e => setCorrection({...correction, breakDuration: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Admin Notes</label>
                          <input type="text" placeholder="Reason for correction" className="w-full p-2 border rounded text-sm" value={correction.notes} onChange={e => setCorrection({...correction, notes: e.target.value})} />
                      </div>
                      <Button type="submit" className="w-full" variant="secondary">
                          <PenTool size={16} className="mr-2" /> Update Record
                      </Button>
                  </form>
                </Card>

                {/* List Holidays */}
                <Card title="Scheduled Holidays" className="lg:col-span-1">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {companyHolidays.length === 0 ? <p className="text-gray-400 text-sm p-2">No holidays scheduled.</p> : 
                            companyHolidays.map(holiday => (
                                <div key={holiday.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-purple-100 text-purple-600 p-2 rounded-lg">
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">{holiday.description}</p>
                                            <p className="text-xs text-gray-500">{formatDate(holiday.date)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </Card>
            </div>
          </div>
      )}
      
      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
          <Card title="Global System Settings">
             <div className="max-w-md">
                 <label className="block text-sm font-bold text-gray-700 mb-2">Company Timezone</label>
                 <p className="text-xs text-gray-500 mb-2">This timezone affects how timestamps are displayed to all users.</p>
                 <select 
                    className="w-full p-2 border rounded-lg" 
                    value={systemSettings.timezone}
                    onChange={(e) => updateSystemSettings({ timezone: e.target.value })}
                 >
                     {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                 </select>
                 <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
                     <p className="text-sm font-mono">Current Time in Zone: {new Date().toLocaleTimeString('en-US', { timeZone: systemSettings.timezone })}</p>
                 </div>
             </div>
          </Card>
      )}

    </div>
  );
};
