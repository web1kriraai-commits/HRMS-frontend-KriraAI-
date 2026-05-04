import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { getTodayStr, formatTime, ABSENCE_PENALTY_EFFECTIVE_DATE, calculateDailyTimeStats, formatDuration as utilsFormatDuration, getAbsenceStartDate, getLocalISOString } from '../services/utils';
import { Role } from '../types';
import { Clock, UserCheck, UserMinus, ShieldAlert, Calendar, AlertCircle, UserPlus, TrendingUp, TrendingDown, Umbrella, ChevronLeft, ChevronRight, Search, X, Check, XCircle } from 'lucide-react';
import { attendanceAPI } from '../services/api';

export const TodayAttendance: React.FC = () => {
    const { users, attendanceRecords, leaveRequests, companyHolidays, systemSettings, adminUpdateAttendance, refreshData } = useApp();
    
    // Pagination & Search state
    const RECORDS_PER_PAGE = 10;
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');

    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(getTodayStr());
    const [showManualModal, setShowManualModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<{ id: string, name: string } | null>(null);
    const [manualHoursInput, setManualHoursInput] = useState('');
    const [manualMinutesInput, setManualMinutesInput] = useState('');
    const [manualNoteInput, setManualNoteInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkDept, setBulkDept] = useState('');

    // Get all employees
    const employees = users.filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR);
    
    // Status pre-calculations
    const isToday = selectedDate === getTodayStr();
    const isHoliday = useMemo(() => {
        return companyHolidays.some(h => {
            const hDate = new Date(h.date).toISOString().split('T')[0];
            return hDate === selectedDate;
        });
    }, [companyHolidays, selectedDate]);

    // Map employees to their attendance record for the selected date
    const dateStats = employees.map(emp => {
        const record = attendanceRecords.find(r => {
            const recordDate = typeof r.date === 'string' ? r.date.split('T')[0] : r.date;
            return r.userId === emp.id && recordDate === selectedDate;
        });

        // Calculate status string for searching
        const userLeaves = leaveRequests.filter(l => 
            l.userId === emp.id && 
            l.status === 'Approved' && 
            selectedDate >= l.startDate && 
            selectedDate <= l.endDate
        );
        const approvedLeave = userLeaves[0];
        const isHalfDay = approvedLeave?.category === 'Half Day Leave';
        const isFullDayLeave = approvedLeave && !isHalfDay;
        
        let status = 'Working';
        if (isFullDayLeave) status = 'On Leave';
        else if (!record || (record.totalWorkedSeconds === 0 && !record.checkIn)) {
            const firstCheckInDate = attendanceRecords
                .filter(r => r.userId === emp.id && r.checkIn)
                .sort((a, b) => {
                    const d1 = typeof a.date === 'string' && !a.date.includes('T') ? a.date : getLocalISOString(new Date(a.date));
                    const d2 = typeof b.date === 'string' && !b.date.includes('T') ? b.date : getLocalISOString(new Date(b.date));
                    return d1.localeCompare(d2);
                })[0]?.date;
            const absenceStart = getAbsenceStartDate(emp, firstCheckInDate);
            if (selectedDate < absenceStart) status = 'Not Joined';
            else if (isHoliday) status = 'Holiday';
            else status = isToday ? 'Not Yet Joined' : 'Absent';
        } else if (record.checkOut || record.totalWorkedSeconds > 0) {
            const approvedOT = (record?.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
            const { lowTimeSeconds } = calculateDailyTimeStats(
                record.totalWorkedSeconds, 
                isHalfDay, 
                isHoliday,
                approvedOT,
                selectedDate
            );
            // Only show 'Low Time' status if the record is finalized (has checkOut)
            status = (record.checkOut && lowTimeSeconds > 0) ? 'Low Time' : (record.checkOut ? 'Completed' : 'Working');
        }

        return {
            user: emp,
            record,
            status,
            isHalfDay,
            isFullDayLeave,
            approvedLeave
        };
    });

    // Filter by search query
    const filteredStats = useMemo(() => {
        if (!searchQuery.trim()) return dateStats;
        const query = searchQuery.toLowerCase();
        return dateStats.filter(({ user, status }) => {
            return (
                user.name.toLowerCase().includes(query) ||
                user.department.toLowerCase().includes(query) ||
                status.toLowerCase().includes(query)
            );
        });
    }, [dateStats, searchQuery]);

    const handleTogglePenalty = async (userId: string, record?: any) => {
        setTogglingId(userId);
        try {
            if (record) {
                await adminUpdateAttendance(record.id, { isPenaltyDisabled: !record.isPenaltyDisabled });
            } else {
                await attendanceAPI.adminCreateOrUpdate({
                    userId,
                    date: selectedDate,
                    isPenaltyDisabled: true
                });
                await refreshData();
            }
        } catch (error: any) {
            alert(error.message || 'Failed to toggle penalty');
        } finally {
            setTogglingId(null);
        }
    };

    const handleToggleCompulsoryBreak = async (userId: string, record?: any) => {
        setTogglingId(userId + '_break');
        try {
            if (record) {
                await adminUpdateAttendance(record.id, { isCompulsoryBreakDisabled: !record.isCompulsoryBreakDisabled });
            } else {
                await attendanceAPI.adminCreateOrUpdate({
                    userId,
                    date: selectedDate,
                    isCompulsoryBreakDisabled: true
                });
                await refreshData();
            }
        } catch (error: any) {
            alert(error.message || 'Failed to toggle compulsory break');
        } finally {
            setTogglingId(null);
        }
    };

    const handleAdminAddManualHours = async (e: React.FormEvent) => {
        e.preventDefault();
        const totalHours = Number(manualHoursInput || 0) + (Number(manualMinutesInput || 0) / 60);
        if (totalHours <= 0 || totalHours > 24) return;

        setIsSubmitting(true);
        try {
            await attendanceAPI.adminAddManualHours(selectedUser.id, selectedDate, totalHours, manualNoteInput);
            setShowManualModal(false);
            setManualHoursInput('');
            setManualMinutesInput('');
            setManualNoteInput('');
            setSelectedUser(null);
            await refreshData();
        } catch (error: any) {
            alert(error.message || 'Failed to add manual hours');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAdminBulkAddManualHours = async (e: React.FormEvent) => {
        e.preventDefault();
        const totalHours = Number(manualHoursInput || 0) + (Number(manualMinutesInput || 0) / 60);
        if (totalHours <= 0 || totalHours > 24) return;

        setIsSubmitting(true);
        try {
            await attendanceAPI.adminBulkAddManualHours(selectedDate, totalHours, manualNoteInput, bulkDept || undefined);
            setShowBulkModal(false);
            setManualHoursInput('');
            setManualMinutesInput('');
            setManualNoteInput('');
            setBulkDept('');
            await refreshData();
        } catch (error: any) {
            alert(error.message || 'Failed to bulk add manual hours');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReviewEarlyCheckout = async (recordId: string, status: 'Approved' | 'Rejected') => {
        const adminNote = prompt(`Optional note for ${status}:`);
        setIsSubmitting(true);
        try {
            await attendanceAPI.reviewEarlyCheckout(recordId, status, adminNote || undefined);
            await refreshData();
        } catch (error: any) {
            alert(error.message || 'Failed to review request');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Format selected date for display (DD MM YYYY)
    const displayDate = (() => {
        const d = new Date(selectedDate + 'T00:00:00');
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    })();

    // Calculate paginated results
    const totalPages = Math.max(1, Math.ceil(filteredStats.length / RECORDS_PER_PAGE));
    const paginatedStats = filteredStats.slice(
        (currentPage - 1) * RECORDS_PER_PAGE,
        currentPage * RECORDS_PER_PAGE
    );

    // Reset page on date or search change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedDate, searchQuery]);

    // Format local duration without seconds for clean UI (h m)
    const formatHrmsDuration = (totalSeconds: number) => {
        if (totalSeconds === 0) return '';
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                        <Clock size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            {isToday ? "Today's Attendance" : 'Attendance Detail'}
                        </h1>
                        <p className="text-gray-500 text-sm">{displayDate}</p>
                    </div>
                </div>

                {/* Search Bar & Date Picker & Bulk Action */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search name, dept, status..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full sm:w-64 pl-10 pr-10 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            setManualHoursInput('');
                            setManualMinutesInput('');
                            setManualNoteInput('');
                            setShowBulkModal(true);
                        }}
                        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                    >
                        Bulk Add Hours
                    </button>
                    
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                        <Calendar size={16} className="text-blue-500 shrink-0" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            max={getTodayStr()}
                            className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer"
                        />
                        {!isToday && (
                            <button
                                onClick={() => setSelectedDate(getTodayStr())}
                                className="ml-2 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors font-medium"
                            >
                                Today
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-3">Employee</th>
                                <th className="px-6 py-3">Department</th>
                                <th className="px-6 py-3 text-center">Check In</th>
                                 <th className="px-6 py-3 text-center">Check Out</th>
                                <th className="px-6 py-3 text-center">Worked</th>
                                <th className="px-6 py-3 text-center">Status</th>
                                <th className="px-6 py-3 text-center">Early Logout Request</th>
                                <th className="px-6 py-3 text-center text-blue-600">Accrued</th>
                                <th className="px-6 py-3 text-center">Manual Hrs</th>
                                 <th className="px-6 py-3 text-center text-rose-600">Penalty Amt</th>
                                <th className="px-6 py-3 text-center">Penalty</th>
                                <th className="px-6 py-3 text-center">Compulsory Break</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedStats.map(({ user, record, status, isHalfDay, isFullDayLeave, approvedLeave }) => {
                                return (
                                    <tr key={user.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">{user.name}</td>
                                        <td className="px-6 py-4">{user.department}</td>
                                        <td className="px-6 py-4 text-center font-mono">
                                            <div className="flex flex-col items-center">
                                                {isFullDayLeave ? (
                                                    <span className="text-purple-400 font-bold italic tracking-widest text-[10px]">OFF</span>
                                                ) : record?.checkIn ? (
                                                    <span className="text-blue-600 font-bold">{formatTime(record.checkIn, systemSettings.timezone)}</span>
                                                ) : (
                                                    <span className="text-gray-300">--:--</span>
                                                )}
                                                {record?.lateCheckIn && record.penaltySeconds > 0 && !record.isPenaltyDisabled && (
                                                    <div className="text-[10px] text-red-500 font-bold mt-0.5 flex items-center gap-0.5" title="Late Check-in Penalty (15m)">
                                                        <AlertCircle size={10} /> 15m pen.
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono">
                                            {isFullDayLeave ? (
                                                <span className="text-purple-400 font-bold italic tracking-widest text-[10px]">OFF</span>
                                            ) : record?.checkOut ? (
                                                <span className="text-gray-800">{formatTime(record.checkOut, systemSettings.timezone)}</span>
                                            ) : (
                                                <span className="text-gray-300">--:--</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono">
                                            {isFullDayLeave ? (
                                                <span className="text-purple-400 font-bold italic tracking-widest text-[10px]">--:--</span>
                                            ) : record && record.totalWorkedSeconds > 0 ? (() => {
                                                const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
                                                const { lowTimeSeconds } = calculateDailyTimeStats(record.totalWorkedSeconds, isHalfDay, isHoliday, approvedOT, selectedDate);
                                                const isLow = lowTimeSeconds > 0;
                                                return (
                                                    <span className={`${isLow ? 'text-rose-600 font-black' : 'text-gray-900 font-bold'}`}>
                                                        {Math.floor(record.totalWorkedSeconds / 3600)}h {Math.floor((record.totalWorkedSeconds % 3600) / 60)}m
                                                    </span>
                                                );
                                            })() : (
                                                <span className="text-gray-300">--:--</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {isFullDayLeave ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                                        <Umbrella size={12} className="mr-1" /> On Leave
                                                    </span>
                                                    <span className="text-[10px] font-bold text-purple-600 italic tracking-tight">{approvedLeave?.category}</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                                        ${status === 'Low Time' ? 'bg-rose-100 text-rose-700 font-bold border-2 border-rose-200' : 
                                                          status === 'Completed' ? 'bg-green-100 text-green-800 border border-green-200' : 
                                                          status === 'Manual Entry' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                          status === 'Working' ? 'bg-blue-100 text-blue-800 animate-pulse border border-blue-200' :
                                                          status === 'Absent' ? 'bg-rose-50 text-rose-700 font-bold border border-rose-100' :
                                                          status === 'Holiday' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                          'bg-gray-100 text-gray-500 italic'}`}>
                                                        {status === 'Working' && <Clock size={12} className="mr-1" />}
                                                        {status === 'Completed' && <UserCheck size={12} className="mr-1" />}
                                                        {status === 'Manual Entry' && <UserCheck size={12} className="mr-1" />}
                                                        {status === 'Low Time' && <UserCheck size={12} className="mr-1" />}
                                                        {status === 'Absent' && <UserMinus size={12} className="mr-1" />}
                                                        {status === 'Holiday' && <Umbrella size={12} className="mr-1" />}
                                                        {status === 'Not Yet Joined' && <Clock size={12} className="mr-1" />}
                                                        {status}
                                                    </span>
                                                    {isHalfDay && (
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">HALF DAY LEAVE</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        {/* Early Logout Request Column [NEW] */}
                                        <td className="px-6 py-4 text-center">
                                            {record?.earlyLogoutRequest && record.earlyLogoutRequest !== 'None' ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight border
                                                        ${record.earlyLogoutRequest === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                                                          record.earlyLogoutRequest === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                          'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                        {record.earlyLogoutRequest}
                                                    </span>
                                                    
                                                    {record.earlyLogoutRequest === 'Pending' && (
                                                        <div className="flex gap-1">
                                                            <button 
                                                                onClick={() => handleReviewEarlyCheckout(record.id, 'Approved')}
                                                                disabled={isSubmitting}
                                                                className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors shadow-sm"
                                                                title="Approve Early Logout"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleReviewEarlyCheckout(record.id, 'Rejected')}
                                                                disabled={isSubmitting}
                                                                className="p-1 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 transition-colors shadow-sm"
                                                                title="Reject Early Logout"
                                                            >
                                                                <XCircle size={14} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {record.earlyLogoutRequestNote && (
                                                        <span className="text-[10px] text-slate-400 font-medium italic max-w-[100px] truncate" title={record.earlyLogoutRequestNote}>
                                                            "{record.earlyLogoutRequestNote}"
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-300">--</span>
                                            )}
                                        </td>
                                        {/* Accrued Column [NEW] */}
                                        <td className="px-6 py-4 text-center">
                                            {isFullDayLeave ? (
                                                <span className="text-gray-300">--</span>
                                            ) : record && (record.checkOut || record.totalWorkedSeconds > 0) ? (() => {
                                                const approvedOT = (record.overtimeRequest && record.overtimeRequest.status === 'Approved') ? (record.overtimeRequest.durationMinutes || 0) : 0;
                                                const { lowTimeSeconds, extraTimeSeconds } = calculateDailyTimeStats(
                                                    record.totalWorkedSeconds, 
                                                    isHalfDay, 
                                                    isHoliday,
                                                    approvedOT,
                                                    selectedDate
                                                );

                                                const isLow = lowTimeSeconds > 0;
                                                const isExtra = extraTimeSeconds > 0;
                                                const durationStr = isLow ? formatHrmsDuration(lowTimeSeconds) : formatHrmsDuration(extraTimeSeconds);
                                                
                                                return (
                                                    <div className="flex flex-col items-center">
                                                        {record.checkOut && isLow ? (
                                                            <span className="flex items-center gap-1 text-[11px] font-black italic bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-100 shadow-sm transition-all hover:scale-105" title={`Deficit by ${durationStr}`}>
                                                                <TrendingDown size={14} className="text-rose-500" /> -{durationStr}
                                                            </span>
                                                        ) : isExtra ? (
                                                            <span className="flex items-center gap-1 text-[11px] font-black italic bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg border border-emerald-100 shadow-sm transition-all hover:scale-105" title={`Extra working time: ${durationStr}`}>
                                                                <TrendingUp size={14} className="text-emerald-500" /> +{durationStr}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400 font-bold tracking-widest">NORMAL</span>
                                                        )}
                                                    </div>
                                                );
                                            })() : (
                                                <span className="text-gray-300">--</span>
                                            )}
                                        </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            {record?.manualHours && record.manualHours.length > 0 ? (
                                                <div className="flex flex-wrap justify-center gap-1 max-w-[120px]">
                                                    {record.manualHours.map((m: any, idx: number) => (
                                                        <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.type === 'Admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`} title={m.note}>
                                                            +{m.hours}h
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <button
                                                onClick={() => {
                                                    setSelectedUser({ id: user.id, name: user.name });
                                                    setManualHoursInput('');
                                                    setManualMinutesInput('');
                                                    setManualNoteInput('');
                                                    setShowManualModal(true);
                                                }}
                                                className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full hover:bg-indigo-50 transition-colors"
                                                title="Add Manual Hours"
                                            >
                                                <div className="flex items-center text-[10px] font-bold border border-indigo-200 px-2 py-0.5 rounded">
                                                    + Add
                                                </div>
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {status === 'Absent' && selectedDate >= getAbsenceStartDate(user, (attendanceRecords.filter(r => r.userId === user.id && r.checkIn).sort((a, b) => (typeof a.date === 'string' ? a.date : getLocalISOString(new Date(a.date))).localeCompare(typeof b.date === 'string' ? b.date : getLocalISOString(new Date(b.date))))[0]?.date)) ? (
                                            <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">8h 15m</span>
                                        ) : record?.lateCheckIn && record.penaltySeconds > 0 && !record.isPenaltyDisabled ? (
                                            <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">15m</span>
                                        ) : (
                                            <span className="text-gray-300">--</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center">
                                            {togglingId === user.id ? (
                                                <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={record?.isPenaltyDisabled || false}
                                                        onChange={() => handleTogglePenalty(user.id, record)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                                                </label>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center">
                                            {togglingId === user.id + '_break' ? (
                                                <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={record?.isCompulsoryBreakDisabled || false}
                                                        onChange={() => handleToggleCompulsoryBreak(user.id, record)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                                </label>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                             {filteredStats.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="text-center py-12">
                                        <div className="flex flex-col items-center justify-center text-gray-500">
                                            <div className="p-4 bg-gray-50 rounded-full mb-3">
                                                <Search size={32} className="text-gray-300" />
                                            </div>
                                            <p className="font-bold text-lg">No results found</p>
                                            <p className="text-sm">We couldn't find any employees matching "{searchQuery}"</p>
                                            {searchQuery && (
                                                <button 
                                                    onClick={() => setSearchQuery('')}
                                                    className="mt-4 text-sm font-bold text-indigo-600 hover:text-indigo-800 underline active:scale-95 transition-all"
                                                >
                                                    Clear search query
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    
                    {/* Pagination Footer */}
                    {filteredStats.length > 0 && (
                        <div className="p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between">
                            <div className="text-sm text-gray-500">
                                Showing <span className="font-bold text-gray-800">{(currentPage - 1) * RECORDS_PER_PAGE + 1}</span> to <span className="font-bold text-gray-800">{Math.min(currentPage * RECORDS_PER_PAGE, filteredStats.length)}</span> of <span className="font-bold text-gray-800">{filteredStats.length}</span> employees
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={`p-2 rounded-lg border transition-all ${currentPage === 1 ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                
                                <div className="flex items-center gap-1 text-sm font-bold text-gray-700 mx-2">
                                    <span className="text-indigo-600 px-3 py-1 bg-indigo-50 rounded-md ring-1 ring-inset ring-indigo-200">{currentPage}</span>
                                    <span className="text-gray-400 mx-1">/</span>
                                    <span>{totalPages}</span>
                                </div>
                                
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`p-2 rounded-lg border transition-all ${currentPage === totalPages ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Admin Manual Hours Modal */}
            {showManualModal && selectedUser && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-50"
                        onClick={() => setShowManualModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Add Working Hours</h3>
                                    <p className="text-xs text-indigo-600 font-medium">{selectedUser.name} • {selectedDate}</p>
                                </div>
                                <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <UserMinus size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleAdminAddManualHours} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Time to Add</label>
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="0"
                                                max="23"
                                                value={manualHoursInput}
                                                onChange={(e) => setManualHoursInput(e.target.value)}
                                                placeholder="HH"
                                                className="w-full p-3 pl-10 border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                required
                                                autoFocus
                                            />
                                            <Clock className="absolute left-3 top-3.5 text-indigo-400" size={20} />
                                            <span className="absolute right-3 top-3.5 text-gray-400 font-medium">h</span>
                                        </div>
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="0"
                                                max="59"
                                                value={manualMinutesInput}
                                                onChange={(e) => setManualMinutesInput(e.target.value)}
                                                placeholder="MM"
                                                className="w-full p-3 pl-10 border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                required
                                            />
                                            <Clock className="absolute left-3 top-3.5 text-indigo-400" size={20} />
                                            <span className="absolute right-3 top-3.5 text-gray-400 font-medium">m</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Select hours and minutes to add to work duration.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Note / Reason</label>
                                    <textarea
                                        value={manualNoteInput}
                                        onChange={(e) => setManualNoteInput(e.target.value)}
                                        placeholder="Reason for adding these hours..."
                                        className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                        rows={3}
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualModal(false)}
                                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50"
                                        disabled={isSubmitting || (!manualHoursInput && !manualMinutesInput)}
                                    >
                                        {isSubmitting ? 'Saving...' : 'Confirm'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </>
            )}

            {/* Admin Bulk Hours Modal */}
            {showBulkModal && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-50"
                        onClick={() => setShowBulkModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in border-t-8 border-indigo-600">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Bulk Add Hours</h3>
                                    <p className="text-xs text-indigo-600 font-medium">Add to all matching employees for {selectedDate}</p>
                                </div>
                                <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <UserMinus size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleAdminBulkAddManualHours} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department (Optional)</label>
                                    <select
                                        value={bulkDept}
                                        onChange={(e) => setBulkDept(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="">All Departments</option>
                                        {[...new Set(users.map(u => u.department))].filter(Boolean).map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Time to Add to Each</label>
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="0"
                                                max="23"
                                                value={manualHoursInput}
                                                onChange={(e) => setManualHoursInput(e.target.value)}
                                                placeholder="HH"
                                                className="w-full p-3 pl-10 border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                required
                                                autoFocus
                                            />
                                            <Clock className="absolute left-3 top-3.5 text-indigo-400" size={20} />
                                            <span className="absolute right-3 top-3.5 text-gray-400 font-medium">h</span>
                                        </div>
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="0"
                                                max="59"
                                                value={manualMinutesInput}
                                                onChange={(e) => setManualMinutesInput(e.target.value)}
                                                placeholder="MM"
                                                className="w-full p-3 pl-10 border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                required
                                            />
                                            <Clock className="absolute left-3 top-3.5 text-indigo-400" size={20} />
                                            <span className="absolute right-3 top-3.5 text-gray-400 font-medium">m</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Note / Reason</label>
                                    <textarea
                                        value={manualNoteInput}
                                        onChange={(e) => setManualNoteInput(e.target.value)}
                                        placeholder="Reason for adding these hours..."
                                        className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                        rows={3}
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkModal(false)}
                                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50"
                                        disabled={isSubmitting || (!manualHoursInput && !manualMinutesInput)}
                                    >
                                        {isSubmitting ? 'Adding...' : 'Add Hours'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
