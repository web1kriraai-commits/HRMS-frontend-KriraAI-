import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LeaveStatus, Role, LeaveCategory } from '../types';
import { formatDate, formatDuration, getTodayStr } from '../services/utils';
import { Check, X, Calendar, Plus, ChevronDown, ChevronUp, AlertCircle, Clock, UserPlus, PenTool, Coffee } from 'lucide-react';
import { attendanceAPI } from '../services/api';

const STANDARD_DAY_SECONDS = (8 * 3600) + (15 * 60); // 8h 15m

export const HRDashboard: React.FC = () => {
  const { auth, leaveRequests, updateLeaveStatus, users, attendanceRecords, companyHolidays, addCompanyHoliday, createUser, refreshData } = useApp();
  
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', department: '' });
  const [correction, setCorrection] = useState({ userId: '', date: getTodayStr(), checkIn: '', checkOut: '', breakDuration: '', notes: '' });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [approvalComments, setApprovalComments] = useState<{ [key: string]: string }>({});

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
              
              if (netWorkedSeconds < STANDARD_DAY_SECONDS) {
                  lowTimeCount++;
                  totalLowTimeSeconds += (STANDARD_DAY_SECONDS - netWorkedSeconds);
              } else if (netWorkedSeconds > STANDARD_DAY_SECONDS) {
                  extraTimeCount++;
                  totalExtraTimeSeconds += (netWorkedSeconds - STANDARD_DAY_SECONDS);
              }
          }
      });

      const leaves = leaveRequests.filter(l => l.userId === user.id && l.status === LeaveStatus.APPROVED);
      const allLeaves = leaveRequests.filter(l => l.userId === user.id); 
      
      const sick = leaves.filter(l => l.category === LeaveCategory.SICK).length;
      const casual = leaves.filter(l => l.category === LeaveCategory.CASUAL).length;
      const paid = leaves.filter(l => l.category === LeaveCategory.PAID).length;
      const half = leaves.filter(l => l.category === LeaveCategory.HALF_DAY).length;
      const totalLeaves = leaves.length;

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
          sick, casual, paid, half, totalLeaves,
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

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Approvals Section */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Pending Requests</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">{pendingLeaves.length}</span>
        </div>
        
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
                            
                            <th className="px-2 py-2 text-center">Sick</th>
                            <th className="px-2 py-2 text-center">Casual</th>
                            <th className="px-2 py-2 text-center">Paid</th>
                            <th className="px-2 py-2 text-center">Half</th>
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
                                    
                                    <td className="px-2 py-4 text-center">{stat.sick || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.casual || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.paid || '-'}</td>
                                    <td className="px-2 py-4 text-center">{stat.half || '-'}</td>
                                    <td className="px-2 py-4 text-center font-bold border-l bg-gray-50">{stat.totalLeaves}</td>
                                </tr>
                                {expandedUser === stat.user.id && (
                                    <tr className="bg-gray-50">
                                        <td colSpan={12} className="px-6 py-6 border-b">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                {/* Detailed Leave History */}
                                                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                    <div className="px-4 py-2 bg-gray-100 border-b font-semibold text-xs text-gray-700 uppercase flex items-center gap-2">
                                                        <Calendar size={14} /> Leave History
                                                    </div>
                                                    {stat.allLeaves.length === 0 ? (
                                                        <p className="p-4 text-xs text-gray-400 italic">No leave requests found.</p>
                                                    ) : (
                                                        <div className="max-h-60 overflow-y-auto">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-gray-50 text-gray-500">
                                                                    <tr>
                                                                        <th className="px-3 py-2 text-left">Date</th>
                                                                        <th className="px-3 py-2 text-left">Category</th>
                                                                        <th className="px-3 py-2 text-right">Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {stat.allLeaves.map(l => (
                                                                        <tr key={l.id} className="border-t hover:bg-gray-50">
                                                                            <td className="px-3 py-2">{formatDate(l.startDate)}</td>
                                                                            <td className="px-3 py-2">{l.category}</td>
                                                                            <td className="px-3 py-2 text-right">
                                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                                    l.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                                                                    l.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' :
                                                                                    'bg-yellow-100 text-yellow-700'
                                                                                }`}>{l.status}</span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
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
                                                            return netWorked < STANDARD_DAY_SECONDS;
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
                                                                            const shortage = STANDARD_DAY_SECONDS - netWorked;
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
                                                        <Clock size={14} /> Extra Time Logs (&gt; 8h 15m)
                                                    </div>
                                                    {(() => {
                                                        const extraTimeRecords = stat.records.filter(r => {
                                                            if (!r.checkIn || !r.checkOut) return false;
                                                            const checkIn = new Date(r.checkIn).getTime();
                                                            const checkOut = new Date(r.checkOut).getTime();
                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                            return netWorked > STANDARD_DAY_SECONDS;
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
                                                                            const checkOut = new Date(r.checkOut!).getTime();
                                                                            const breakSec = getBreakSeconds(r.breaks) || 0;
                                                                            const netWorked = Math.floor((checkOut - checkIn) / 1000) - breakSec;
                                                                            const extra = netWorked - STANDARD_DAY_SECONDS;
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
          </div>
      </section>
    </div>
  );
};
