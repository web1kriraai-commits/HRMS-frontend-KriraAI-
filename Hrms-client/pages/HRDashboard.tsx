import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LeaveStatus, Role, LeaveCategory } from '../types';
import { formatDate, formatDuration, getTodayStr } from '../services/utils';
import { Check, X, Calendar, Plus, ChevronDown, ChevronUp, AlertCircle, Clock, UserPlus, PenTool, Coffee, TrendingUp, TrendingDown, CheckCircle, Timer, LogIn, LogOut, Users, FileText } from 'lucide-react';
import { attendanceAPI } from '../services/api';

// Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
const MIN_NORMAL_SECONDS = (8 * 3600) + (15 * 60); // 8h 15m = 29700 seconds
const MAX_NORMAL_SECONDS = (8 * 3600) + (30 * 60); // 8h 30m = 30600 seconds

export const HRDashboard: React.FC = () => {
  const { auth, leaveRequests, updateLeaveStatus, users, attendanceRecords, companyHolidays, addCompanyHoliday, createUser, updateUser, refreshData } = useApp();
  
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', department: '' });
  const [correction, setCorrection] = useState({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
  const [paidLeaveAllocation, setPaidLeaveAllocation] = useState({ userId: '', allocation: '' });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [approvalComments, setApprovalComments] = useState<{ [key: string]: string }>({});
  const [hrLeaveStatusFilter, setHrLeaveStatusFilter] = useState<'All' | LeaveStatus.APPROVED | LeaveStatus.REJECTED | LeaveStatus.PENDING>('All');
  const [hrLeaveFilterDate, setHrLeaveFilterDate] = useState('');
  const [hrLeaveFilterMonth, setHrLeaveFilterMonth] = useState('');
  
  // Monthly Summary states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Approved' | 'Rejected' | 'Pending'>('All');
  const [leaveFilterDate, setLeaveFilterDate] = useState('');
  const [leaveFilterMonth, setLeaveFilterMonth] = useState('');

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

  // Calculate working days (excluding Sundays and holidays) between two dates
  const calculateLeaveDays = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return 0;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (start > end) return 0;

    // Create a Set of holiday dates for quick lookup (format: YYYY-MM-DD)
    const holidayDates = new Set(
      companyHolidays.map(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate.toISOString().split('T')[0];
      })
    );

    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sunday
      const dateStr = current.toISOString().split('T')[0];
      
      // Exclude Sundays and holidays
      if (dayOfWeek !== 0 && !holidayDates.has(dateStr)) {
        days += 1;
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const calculateLeaveDaysForCategory = (startDateStr: string, endDateStr: string, category: LeaveCategory) => {
    const baseDays = calculateLeaveDays(startDateStr, endDateStr);
    if (category === LeaveCategory.HALF_DAY) {
      return 0.5;
    }
    return baseDays;
  };

  const filterLeavesForHR = (
    leaves: any[],
    statusFilter: 'All' | LeaveStatus.APPROVED | LeaveStatus.REJECTED | LeaveStatus.PENDING,
    filterDate: string,
    filterMonth: string
  ) => {
    let result = [...leaves];

    if (statusFilter !== 'All') {
      result = result.filter(l => l.status === statusFilter);
    }

    if (filterMonth) {
      const [yearStr, monthStr] = filterMonth.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        const mStart = new Date(y, m, 1);
        const mEnd = new Date(y, m + 1, 0, 23, 59, 59);
        result = result.filter(l => {
          const s = new Date(l.startDate);
          const e = new Date(l.endDate);
          return (s >= mStart && s <= mEnd) ||
                 (e >= mStart && e <= mEnd) ||
                 (s <= mStart && e >= mEnd);
        });
      }
    } else if (filterDate) {
      const d = new Date(filterDate);
      if (!isNaN(d.getTime())) {
        result = result.filter(l => {
          const s = new Date(l.startDate);
          const e = new Date(l.endDate);
          return d >= s && d <= e;
        });
      }
    }

    return result;
  };

  const pendingLeaves = leaveRequests.filter(l => {
      if (l.status !== LeaveStatus.PENDING) return false;
      const requester = users.find(u => u.id === l.userId);
      if (!requester) return true;
      if (auth.user?.role === Role.HR) {
          return requester.role === Role.EMPLOYEE;
      }
      return true;
  });
  
  const employeeStats = users.filter(u => u.role === Role.EMPLOYEE).map(user => {
      const records = attendanceRecords.filter(r => r.userId === user.id);
      const presentDays = records.filter(r => r.checkIn && r.checkOut).length;
      
      let totalWorkedSeconds = 0;
      let totalBreakSeconds = 0;
      let lowTimeCount = 0;
      let extraTimeCount = 0;
      let totalLowTimeSeconds = 0;
      let totalExtraTimeSeconds = 0;

      records.forEach(r => {
          if (r.checkIn && r.checkOut) {
              const checkIn = new Date(r.checkIn).getTime();
              const checkOut = new Date(r.checkOut).getTime();
              const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
              const breakSeconds = getBreakSeconds(r.breaks) || 0;
              const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
              
              totalWorkedSeconds += netWorkedSeconds;
              totalBreakSeconds += breakSeconds;
              
              if (netWorkedSeconds < MIN_NORMAL_SECONDS) {
                  lowTimeCount++;
                  totalLowTimeSeconds += (MIN_NORMAL_SECONDS - netWorkedSeconds);
              } else if (netWorkedSeconds > MAX_NORMAL_SECONDS) {
                  extraTimeCount++;
                  totalExtraTimeSeconds += (netWorkedSeconds - MAX_NORMAL_SECONDS);
              }
          }
      });

      const leaves = leaveRequests.filter(l => l.userId === user.id && l.status === LeaveStatus.APPROVED);
      const allLeaves = leaveRequests.filter(l => l.userId === user.id); 
      
      const sumDaysForCategory = (leavesArr: any[], category: LeaveCategory) => {
        return leavesArr
          .filter(l => l.category === category)
          .reduce((acc, l) => acc + calculateLeaveDaysForCategory(l.startDate, l.endDate, l.category), 0);
      };

      const paid = sumDaysForCategory(leaves, LeaveCategory.PAID);
      const unpaid = sumDaysForCategory(leaves, LeaveCategory.UNPAID);
      const half = sumDaysForCategory(leaves, LeaveCategory.HALF_DAY);
      const extraTime = sumDaysForCategory(leaves, LeaveCategory.EXTRA_TIME);
      const totalLeaves = paid + unpaid + half + extraTime;

      return { 
          user, 
          presentDays, 
          totalWorkedSeconds,
          totalBreakSeconds,
          totalWorkedHours: (totalWorkedSeconds / 3600).toFixed(1),
          lowTimeCount, 
          extraTimeCount,
          totalLowTimeSeconds,
          totalExtraTimeSeconds,
          paid, unpaid, half, extraTime, totalLeaves,
          records, 
          allLeaves
      };
  });

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (newHoliday.date && newHoliday.description) {
        addCompanyHoliday(newHoliday.date, newHoliday.description);
        setNewHoliday({ date: '', description: '' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if(newUser.name && newUser.username && newUser.email && newUser.department) {
        try {
          await createUser({ ...newUser, role: Role.EMPLOYEE, isActive: true });
          setNewUser({ name: '', username: '', email: '', department: '' });
          alert("Employee created successfully! Temporary password: tempPassword123");
        } catch (error: any) {
          alert(error.message || "Failed to create user");
        }
    } else {
        alert("Please fill all required fields");
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
        await refreshData();
      } catch (error: any) {
        alert(error.message || "Failed to save attendance");
      }
  };

  const toggleExpand = (userId: string) => {
      setExpandedUser(expandedUser === userId ? null : userId);
  };

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

  const filteredMonthlyLeaves = monthlyLeaves.filter(leave => {
    // Status filter
    if (leaveStatusFilter !== 'All') {
      const status = (leave.status || '').trim();
      if (status !== leaveStatusFilter) return false;
    }

    // Date filter - check if leave overlaps with the selected date
    if (leaveFilterDate) {
      const filterDate = new Date(leaveFilterDate);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      // Check if filter date falls within leave range
      if (filterDate < leaveStart || filterDate > leaveEnd) {
        return false;
      }
    }

    // Month filter - check if leave overlaps with the selected month
    if (leaveFilterMonth) {
      const [year, month] = leaveFilterMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      // Check if leave overlaps with selected month
      if (leaveEnd < monthStart || leaveStart > monthEnd) {
        return false;
      }
    }

    return true;
  });

  const totalLeaveDays = filteredMonthlyLeaves.reduce((sum, leave) => {
    return sum + calculateLeaveDays(leave.startDate, leave.endDate);
  }, 0);

  // Calculate monthly stats
  const calculateMonthlyStats = () => {
    let totalWorkedSeconds = 0;
    let totalBreakSeconds = 0;
    let daysPresent = 0;
    let totalLowTimeSeconds = 0;
    let totalExtraTimeSeconds = 0;
    
    // Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
    const MIN_NORMAL_SECONDS_LOCAL = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
    const MAX_NORMAL_SECONDS_LOCAL = 8 * 3600 + 30 * 60; // 8h 30m = 30600 seconds

    monthlyAttendance.forEach(record => {
      if (record.checkIn && record.checkOut) {
        daysPresent++;
        const checkIn = new Date(record.checkIn).getTime();
        const checkOut = new Date(record.checkOut).getTime();
        const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
        
        // Get break time from breaks array
        const breakSeconds = getBreakSeconds(record.breaks) || 0;
        const netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
        
        totalWorkedSeconds += netWorkedSeconds;
        totalBreakSeconds += breakSeconds;
        
        // Normal: 8:15 to 8:30, Low < 8:15, Extra > 8:30
        if (netWorkedSeconds < MIN_NORMAL_SECONDS_LOCAL) {
          totalLowTimeSeconds += MIN_NORMAL_SECONDS_LOCAL - netWorkedSeconds;
        } else if (netWorkedSeconds > MAX_NORMAL_SECONDS_LOCAL) {
          totalExtraTimeSeconds += netWorkedSeconds - MAX_NORMAL_SECONDS_LOCAL;
        }
        // If netWorkedSeconds is between 8:15 and 8:30, it's normal (no low/extra)
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

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Approvals Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Pending Requests</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">{pendingLeaves.length}</span>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mb-6">
          {/* Pending Leave Requests */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingLeaves.length === 0 && <p className="text-gray-400 text-sm italic col-span-2">No pending requests.</p>}
              {pendingLeaves.map(req => (
                  <Card key={req.id} className="border-l-4 border-l-yellow-400">
                      <div className="flex flex-col gap-4">
                          <div className="flex justify-between items-start">
                              <div>
                                  <h4 className="font-bold text-gray-900">{req.userName}</h4>
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mt-1 inline-block">{req.category}</span>
                                  <p className="text-sm text-gray-600 mt-2">{formatDate(req.startDate)} - {formatDate(req.endDate)}</p>
                                  <p className="text-sm text-gray-500 mt-2 italic">"{req.reason}"</p>
                                  {req.attachmentUrl && <a href={req.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline mt-1 block">View Attachment</a>}
                              </div>
                          </div>
                          
                          <div className="border-t pt-3">
                             <input 
                               type="text" 
                               className="w-full text-xs p-2 border rounded mb-2" 
                               placeholder="Optional HR Comment..." 
                               value={approvalComments[req.id] || ''}
                               onChange={(e) => setApprovalComments({...approvalComments, [req.id]: e.target.value})}
                             />
                             <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="success" onClick={() => updateLeaveStatus(req.id, LeaveStatus.APPROVED, approvalComments[req.id] || "Approved by HR")}>
                                      <Check size={16} className="mr-1" /> Approve
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => updateLeaveStatus(req.id, LeaveStatus.REJECTED, approvalComments[req.id] || "Rejected by HR")}>
                                      <X size={16} className="mr-1" /> Reject
                                  </Button>
                             </div>
                          </div>
                      </div>
                  </Card>
              ))}
          </div>

          {/* Yearly Paid Leave Summary Table */}
          <Card className="h-fit">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Yearly Summary</h3>
                <p className="text-xs text-gray-500 mt-0.5">Paid leave overview</p>
              </div>
            </div>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[150px]">Employee</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[80px]">Allocated</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[80px]">Used</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[80px]">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center">
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <Users className="h-10 w-10 mb-2 opacity-50" />
                          <p className="text-xs">No employees found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(user => {
                      const userLeaves = leaveRequests.filter(l => l.userId === user.id);
                      const usedPaidLeaves = userLeaves
                        .filter(leave => {
                          const status = (leave.status || '').trim();
                          return (status === 'Approved' || status === LeaveStatus.APPROVED) && 
                                 leave.category === LeaveCategory.PAID;
                        })
                        .reduce((sum, leave) => {
                          return sum + calculateLeaveDays(leave.startDate, leave.endDate);
                        }, 0);
                      
                      // Only show admin allocated paid leaves (no default)
                      const totalAllocated = user.paidLeaveAllocation || 0;
                      const remaining = totalAllocated - usedPaidLeaves;
                      
                      return (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-3 w-[150px]">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-xs bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm flex-shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-xs truncate">{user.name}</p>
                                <p className="text-xs text-gray-500 truncate">{user.department}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center w-[80px]">
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-gray-100 text-gray-800 font-bold text-xs whitespace-nowrap">
                              {totalAllocated}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center w-[80px]">
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs whitespace-nowrap">
                              {usedPaidLeaves}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center w-[80px]">
                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full font-bold text-xs whitespace-nowrap ${
                              remaining > 0 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.max(0, remaining)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* Employee Monthly Summary Table */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Employee Monthly Summary</h2>
        <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                        <tr>
                            <th rowSpan={2} className="px-4 py-3 bg-gray-100 border-r w-10"></th>
                            <th rowSpan={2} className="px-6 py-3 bg-gray-100 border-r">Employee</th>
                            <th colSpan={5} className="px-6 py-2 text-center bg-blue-50 border-b border-r text-blue-800">Attendance</th>
                            <th colSpan={5} className="px-6 py-2 text-center bg-orange-50 border-b text-orange-800">Leave Breakdown (Approved)</th>
                        </tr>
                        <tr>
                            <th className="px-4 py-2 text-center border-r">Present</th>
                            <th className="px-4 py-2 text-center border-r">Total Hours</th>
                            <th className="px-4 py-2 text-center border-r">Break</th>
                            <th className="px-4 py-2 text-center border-r text-red-600">Low Time</th>
                            <th className="px-4 py-2 text-center border-r text-green-600">Extra Time</th>
                            
                            <th className="px-2 py-2 text-center">Paid</th>
                            <th className="px-2 py-2 text-center">Unpaid</th>
                            <th className="px-2 py-2 text-center">Half Day</th>
                            <th className="px-2 py-2 text-center">Extra Time</th>
                            <th className="px-2 py-2 text-center font-bold border-l">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employeeStats.map(stat => (
                            <React.Fragment key={stat.user.id}>
                                <tr className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${expandedUser === stat.user.id ? 'bg-blue-50' : 'bg-white'}`} onClick={() => toggleExpand(stat.user.id)}>
                                    <td className="px-4 py-4 text-center border-r">
                                        {expandedUser === stat.user.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900 border-r">{stat.user.name}</td>
                                    
                                    <td className="px-4 py-4 text-center border-r font-medium">{stat.presentDays}</td>
                                    <td className="px-4 py-4 text-center border-r">{formatDuration(stat.totalWorkedSeconds)}</td>
                                    <td className="px-4 py-4 text-center border-r text-amber-600">
                                        {stat.totalBreakSeconds > 0 ? formatDuration(stat.totalBreakSeconds) : '-'}
                                    </td>
                                    <td className="px-4 py-4 text-center border-r">
                                        {stat.lowTimeCount > 0 ? (
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-red-600 font-bold">{stat.lowTimeCount} days</span>
                                                <span className="text-xs text-red-500 font-medium">
                                                    -{formatDuration(stat.totalLowTimeSeconds)}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-center border-r">
                                        {stat.extraTimeCount > 0 ? (
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-green-600 font-bold">{stat.extraTimeCount} days</span>
                                                <span className="text-xs text-green-600 font-medium">
                                                    +{formatDuration(stat.totalExtraTimeSeconds)}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    
                                    <td className="px-2 py-4 text-center">{stat.paid || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.unpaid || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.half || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.extraTime || '-'}</td>
                                    <td className="px-2 py-4 text-center font-bold border-l bg-gray-50">{stat.totalLeaves}</td>
                                </tr>
                                {expandedUser === stat.user.id && (
                                    <tr className="bg-gray-50">
                                        <td colSpan={12} className="px-6 py-6 border-b">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                {/* Detailed Leave History */}
                                                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                    <div className="px-4 py-2 bg-gray-100 border-b font-semibold text-xs text-gray-700 uppercase flex flex-col gap-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="flex items-center gap-2">
                                                                <Calendar size={14} /> Leave History
                                                            </span>
                                                            <span className="text-[11px] text-gray-500">
                                                                Total Leave:{' '}
                                                                <span className="font-bold text-gray-800">
                                                                    {(() => {
                                                                        const filtered = filterLeavesForHR(stat.allLeaves, hrLeaveStatusFilter, hrLeaveFilterDate, hrLeaveFilterMonth);
                                                                        const total = filtered.reduce((sum, l) => sum + calculateLeaveDaysForCategory(l.startDate, l.endDate, l.category), 0);
                                                                        return `${total} ${total === 1 ? 'day' : 'days'}`;
                                                                    })()}
                                                                </span>
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            <select
                                                                className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded"
                                                                value={hrLeaveStatusFilter}
                                                                onChange={e => setHrLeaveStatusFilter(e.target.value as any)}
                                                            >
                                                                <option value="All">All Status</option>
                                                                <option value={LeaveStatus.APPROVED}>Approved</option>
                                                                <option value={LeaveStatus.REJECTED}>Rejected</option>
                                                                <option value={LeaveStatus.PENDING}>Pending</option>
                                                            </select>
                                                            <input
                                                                type="date"
                                                                className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded"
                                                                value={hrLeaveFilterDate}
                                                                onChange={e => setHrLeaveFilterDate(e.target.value)}
                                                            />
                                                            <input
                                                                type="month"
                                                                className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded"
                                                                value={hrLeaveFilterMonth}
                                                                onChange={e => setHrLeaveFilterMonth(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                    {filterLeavesForHR(stat.allLeaves, hrLeaveStatusFilter, hrLeaveFilterDate, hrLeaveFilterMonth).length === 0 ? (
                                                        <p className="p-4 text-xs text-gray-400 italic">No leave requests found.</p>
                                                    ) : (
                                                        <div className="max-h-60 overflow-y-auto">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-gray-50 text-gray-500">
                                                                    <tr>
                                                                        <th className="px-3 py-2 text-left">Date</th>
                                                                        <th className="px-3 py-2 text-left">Category</th>
                                                                        <th className="px-3 py-2 text-left">Days</th>
                                                                        <th className="px-3 py-2 text-right">Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {filterLeavesForHR(stat.allLeaves, hrLeaveStatusFilter, hrLeaveFilterDate, hrLeaveFilterMonth).map(l => {
                                                                        const days = calculateLeaveDaysForCategory(l.startDate, l.endDate, l.category);
                                                                        return (
                                                                            <tr key={l.id} className="border-t hover:bg-gray-50">
                                                                                <td className="px-3 py-2">{formatDate(l.startDate)}</td>
                                                                                <td className="px-3 py-2">{l.category}</td>
                                                                                <td className="px-3 py-2">{days} {days === 1 ? 'day' : 'days'}</td>
                                                                                <td className="px-3 py-2 text-right">
                                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                                        l.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                                                                        l.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                                                                        'bg-yellow-100 text-yellow-700'
                                                                                    }`}>{l.status}</span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Low Time Logs */}
                                                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                    <div className="px-4 py-2 bg-red-50 border-b border-red-100 font-semibold text-xs text-red-800 uppercase flex items-center gap-2">
                                                        <AlertCircle size={14} /> Low Time Logs (&lt; 8h 15m)
                                                    </div>
                                                    {(() => {
                                                        const lowTimeRecords = stat.records.filter(r => {
                                                            if (!r.checkIn || !r.checkOut) return false;
                                                            const checkIn = new Date(r.checkIn).getTime();
                                                            const checkOut = new Date(r.checkOut).getTime();
                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                            return netWorked < MIN_NORMAL_SECONDS;
                                                        });
                                                        
                                                        return lowTimeRecords.length === 0 ? (
                                                            <p className="p-4 text-xs text-gray-400 italic">No low time records.</p>
                                                        ) : (
                                                            <div className="max-h-60 overflow-y-auto">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-red-50 text-red-700">
                                                                        <tr>
                                                                            <th className="px-3 py-2 text-left">Date</th>
                                                                            <th className="px-3 py-2 text-right">Worked</th>
                                                                            <th className="px-3 py-2 text-right">Break</th>
                                                                            <th className="px-3 py-2 text-right">Shortage</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {lowTimeRecords.map(r => {
                                                                            const checkIn = new Date(r.checkIn!).getTime();
                                                                            const checkOut = new Date(r.checkOut!).getTime();
                                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                                            const shortage = MIN_NORMAL_SECONDS - netWorked;
                                                                            return (
                                                                                <tr key={r.id} className="border-t hover:bg-red-50">
                                                                                    <td className="px-3 py-2">{formatDate(r.date)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono">{formatDuration(netWorked)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-amber-600">{breakSec > 0 ? formatDuration(breakSec) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-red-600">-{formatDuration(shortage)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Extra Time Logs */}
                                                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                    <div className="px-4 py-2 bg-green-50 border-b border-green-100 font-semibold text-xs text-green-800 uppercase flex items-center gap-2">
                                                        <Clock size={14} /> Extra Time Logs (&gt; 8h 30m)
                                                    </div>
                                                    {(() => {
                                                        const extraTimeRecords = stat.records.filter(r => {
                                                            if (!r.checkIn || !r.checkOut) return false;
                                                            const checkIn = new Date(r.checkIn).getTime();
                                                            const checkOut = new Date(r.checkOut).getTime();
                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                            return netWorked > MAX_NORMAL_SECONDS;
                                                        });
                                                        
                                                        return extraTimeRecords.length === 0 ? (
                                                            <p className="p-4 text-xs text-gray-400 italic">No extra time records.</p>
                                                        ) : (
                                                            <div className="max-h-60 overflow-y-auto">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-green-50 text-green-700">
                                                                        <tr>
                                                                            <th className="px-3 py-2 text-left">Date</th>
                                                                            <th className="px-3 py-2 text-right">Worked</th>
                                                                            <th className="px-3 py-2 text-right">Break</th>
                                                                            <th className="px-3 py-2 text-right">Extra</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {extraTimeRecords.map(r => {
                                                                            const checkIn = new Date(r.checkIn!).getTime();
                                                                            const checkOut = new Date(r.checkOut).getTime();
                                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                                            const extra = netWorked - MAX_NORMAL_SECONDS;
                                                                            return (
                                                                                <tr key={r.id} className="border-t hover:bg-green-50">
                                                                                    <td className="px-3 py-2">{formatDate(r.date)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono">{formatDuration(netWorked)}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-amber-600">{breakSec > 0 ? formatDuration(breakSec) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-right font-mono text-green-600">+{formatDuration(extra)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
      </section>

      {/* Monthly Attendance Summary */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Attendance Summary</h2>
        
        {/* Header Card with Filters */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-indigo-600" />
                </div>
                Individual Employee Summary
              </h3>
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
            <div className={`rounded-xl shadow-sm border p-5 flex flex-col md:flex-row items-center gap-5 mb-6 ${
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
                <h3 className="text-xl font-bold text-gray-800">{selectedUser.name}</h3>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
            <div className={`rounded-xl p-6 border mb-6 ${
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-100 bg-purple-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-purple-600" /> Leave Records
                      </h3>
                      <p className="text-gray-500 text-sm">
                        {getMonthName()} • {filteredMonthlyLeaves.length} leave request(s) •{' '}
                        <span className="font-semibold text-purple-700">
                          Total Leave: {totalLeaveDays} {totalLeaveDays === 1 ? 'day' : 'days'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase font-semibold">Filters:</span>
                    <select
                      className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                      value={leaveStatusFilter}
                      onChange={e => setLeaveStatusFilter(e.target.value as any)}
                    >
                      <option value="All">All Status</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Pending">Pending</option>
                    </select>
                    <input
                      type="date"
                      className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                      value={leaveFilterDate}
                      onChange={e => setLeaveFilterDate(e.target.value)}
                      placeholder="Filter by date"
                    />
                    <input
                      type="month"
                      className="text-xs bg-white border border-purple-200 text-gray-700 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                      value={leaveFilterMonth}
                      onChange={e => setLeaveFilterMonth(e.target.value)}
                      placeholder="Filter by month"
                    />
                    {(leaveFilterDate || leaveFilterMonth) && (
                      <button
                        onClick={() => {
                          setLeaveFilterDate('');
                          setLeaveFilterMonth('');
                        }}
                        className="text-xs text-purple-600 hover:text-purple-800 underline"
                      >
                        Clear Date/Month
                      </button>
                    )}
                  </div>
                </div>
                {filteredMonthlyLeaves.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-400 text-sm">
                    No leaves match the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-purple-50/50">
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Category</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Reason</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Days</th>
                          <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredMonthlyLeaves.map(leave => {
                          const days = calculateLeaveDays(leave.startDate, leave.endDate);
                          return (
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
                              <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                                {days} {days === 1 ? 'day' : 'days'}
                              </td>
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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
                        // Normal time: 8:15 to 8:30, Low < 8:15, Extra > 8:30
                        const MIN_NORMAL_SECONDS_LOCAL = 8 * 3600 + 15 * 60; // 8h 15m = 29700 seconds
                        const MAX_NORMAL_SECONDS_LOCAL = 8 * 3600 + 30 * 60; // 8h 30m = 30600 seconds
                        
                        // Get break seconds from breaks array
                        const breakSeconds = getBreakSeconds(record.breaks) || 0;
                        
                        let netWorkedSeconds = 0;
                        if (record.checkIn && record.checkOut) {
                          const checkIn = new Date(record.checkIn).getTime();
                          const checkOut = new Date(record.checkOut).getTime();
                          const totalSessionSeconds = Math.floor((checkOut - checkIn) / 1000);
                          netWorkedSeconds = Math.max(0, totalSessionSeconds - breakSeconds);
                        }
                        
                        // Normal: 8:15 to 8:30, Low < 8:15, Extra > 8:30
                        const isLowTime = netWorkedSeconds > 0 && netWorkedSeconds < MIN_NORMAL_SECONDS_LOCAL;
                        const isExtraTime = netWorkedSeconds > MAX_NORMAL_SECONDS_LOCAL;

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
          <Card>
            <div className="text-center py-12">
              <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">Select an employee to view monthly summary</p>
              <p className="text-gray-400 text-sm mt-2">Choose an employee and month from the filters above</p>
            </div>
          </Card>
        )}
      </section>

      {/* Administrative Actions */}
      <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Administrative Actions</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Create Employee */}
              <Card title="Create Employee" className="h-fit">
                  <form onSubmit={handleCreateUser} className="space-y-3">
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Name</label>
                          <input type="text" className="w-full p-2 border rounded text-sm" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Username</label>
                          <input type="text" className="w-full p-2 border rounded text-sm" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email</label>
                          <input type="email" className="w-full p-2 border rounded text-sm" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Department</label>
                          <input type="text" className="w-full p-2 border rounded text-sm" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} required />
                          <p className="text-xs text-gray-500 mt-1">Employee will receive temporary password: tempPassword123</p>
                      </div>
                      <Button type="submit" className="w-full" variant="primary">
                          <UserPlus size={16} className="mr-2" /> Create Account
                      </Button>
                  </form>
              </Card>

              {/* Attendance Correction */}
              <Card title="Add/Correct Attendance" className="h-fit">
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
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Break Duration (mins)</label>
                          <input type="number" placeholder="e.g. 30" className="w-full p-2 border rounded text-sm" value={correction.breakDuration} onChange={e => setCorrection({...correction, breakDuration: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes</label>
                          <input type="text" placeholder="Reason" className="w-full p-2 border rounded text-sm" value={correction.notes} onChange={e => setCorrection({...correction, notes: e.target.value})} />
                      </div>
                      <Button type="submit" className="w-full" variant="secondary">
                          <PenTool size={16} className="mr-2" /> Save Attendance
                      </Button>
                  </form>
              </Card>

              {/* Holidays */}
              <Card title="Add Company Holiday" className="h-fit">
                  <form onSubmit={handleAddHoliday} className="space-y-3">
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

              {/* Paid Leave Allocation Section */}
              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                  {/* Add Paid Leave Form */}
                  <Card className="h-fit">
                      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
                              <Calendar className="h-6 w-6 text-white" />
                          </div>
                          <div>
                              <h3 className="font-bold text-gray-800 text-lg">Add Paid Leave</h3>
                              <p className="text-xs text-gray-500 mt-0.5">Allocate paid leaves to employees</p>
                          </div>
                      </div>
                      <form onSubmit={async (e) => {
                          e.preventDefault();
                          if (!paidLeaveAllocation.userId) {
                              alert("Please select an employee");
                              return;
                          }
                          if (!paidLeaveAllocation.allocation || paidLeaveAllocation.allocation === '') {
                              alert("Please enter a number to add");
                              return;
                          }
                          try {
                              const allocation = parseInt(paidLeaveAllocation.allocation);
                              if (isNaN(allocation) || allocation < 0) {
                                  alert("Please enter a valid positive number");
                                  return;
                              }
                              await updateUser(paidLeaveAllocation.userId, { paidLeaveAllocation: allocation });
                              alert(`Added ${allocation} paid leave(s) successfully.`);
                              setPaidLeaveAllocation({ userId: '', allocation: '' });
                              await refreshData();
                          } catch (error: any) {
                              alert(error.message || "Failed to update paid leave allocation");
                          }
                      }} className="space-y-5">
                          <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Employee *</label>
                              <select 
                                  className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white" 
                                  value={paidLeaveAllocation.userId} 
                                  onChange={e => {
                                      setPaidLeaveAllocation({
                                          userId: e.target.value,
                                          allocation: ''
                                      });
                                  }} 
                                  required
                              >
                                  <option value="">Choose an employee...</option>
                                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(u => (
                                      <option key={u.id} value={u.id}>
                                          {u.name} - {u.department}
                                      </option>
                                  ))}
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Paid Leaves</label>
                              <input 
                                  type="number" 
                                  placeholder="e.g., 12" 
                                  className="w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all" 
                                  value={paidLeaveAllocation.allocation} 
                                  onChange={e => setPaidLeaveAllocation({...paidLeaveAllocation, allocation: e.target.value})} 
                                  min="1"
                                  required
                              />
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                  <p className="text-xs text-blue-700 leading-relaxed">
                                      <span className="font-semibold">Note:</span> This will be added to the existing allocation. 
                                      For example, if an employee has 5 remaining and you add 12, the total becomes 17.
                                  </p>
                              </div>
                          </div>
                          <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-md" variant="primary">
                              <Calendar size={18} className="mr-2" /> Add Paid Leave Allocation
                          </Button>
                      </form>
                  </Card>

                  {/* Yearly Paid Leave Summary Table */}
                  <Card className="h-fit">
                      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                              <FileText className="h-6 w-6 text-white" />
                          </div>
                          <div>
                              <h3 className="font-bold text-gray-800 text-lg">Yearly Summary</h3>
                              <p className="text-xs text-gray-500 mt-0.5">Current year paid leave overview</p>
                          </div>
                      </div>
                      <div className="overflow-x-auto -mx-6 px-6">
                          <table className="w-full text-sm min-w-[600px]">
                              <thead>
                                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-[200px]">Employee</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Allocated</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Used</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[100px]">Remaining</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-[120px]">Last Allocated</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).length === 0 ? (
                                      <tr>
                                          <td colSpan={5} className="px-4 py-8 text-center">
                                              <div className="flex flex-col items-center justify-center text-gray-400">
                                                  <Users className="h-12 w-12 mb-2 opacity-50" />
                                                  <p className="text-sm">No employees found</p>
                                              </div>
                                          </td>
                                      </tr>
                                  ) : (
                                      users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR).map(user => {
                                          const userLeaves = leaveRequests.filter(l => l.userId === user.id);
                                          const usedPaidLeaves = userLeaves
                                              .filter(leave => {
                                                  const status = (leave.status || '').trim();
                                                  return (status === 'Approved' || status === LeaveStatus.APPROVED) && 
                                                         leave.category === LeaveCategory.PAID;
                                              })
                                              .reduce((sum, leave) => {
                                                  return sum + calculateLeaveDays(leave.startDate, leave.endDate);
                                              }, 0);
                                          
                                          // Only show admin allocated paid leaves (no default)
                                          const totalAllocated = user.paidLeaveAllocation || 0;
                                          const remaining = totalAllocated - usedPaidLeaves;
                                          
                                          return (
                                              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                                  <td className="px-4 py-4 w-[200px]">
                                                      <div className="flex items-center gap-3">
                                                          <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm flex-shrink-0">
                                                              {user.name.charAt(0).toUpperCase()}
                                                          </div>
                                                          <div className="min-w-0">
                                                              <p className="font-semibold text-gray-800 truncate">{user.name}</p>
                                                              <p className="text-xs text-gray-500 mt-0.5 truncate">{user.department}</p>
                                                          </div>
                                                      </div>
                                                  </td>
                                                  <td className="px-4 py-4 text-center w-[100px]">
                                                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-bold text-sm whitespace-nowrap">
                                                          {totalAllocated}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-4 text-center w-[100px]">
                                                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-sm whitespace-nowrap">
                                                          {usedPaidLeaves}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-4 text-center w-[100px]">
                                                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-bold text-sm whitespace-nowrap ${
                                                          remaining > 0 
                                                              ? 'bg-green-100 text-green-700' 
                                                              : 'bg-red-100 text-red-700'
                                                      }`}>
                                                          {Math.max(0, remaining)}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-4 text-center w-[120px]">
                                                      <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                                                          {user.paidLeaveLastAllocatedDate 
                                                              ? formatDate(user.paidLeaveLastAllocatedDate)
                                                              : <span className="text-gray-400 italic">Never</span>}
                                                      </span>
                                                  </td>
                                              </tr>
                                          );
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </Card>
              </div>
          </div>
      </section>
    </div>
  );
};
