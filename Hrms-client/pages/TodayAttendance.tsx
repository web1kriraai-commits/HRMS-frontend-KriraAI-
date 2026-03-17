import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { getTodayStr, formatTime } from '../services/utils';
import { Role } from '../types';
import { Clock, UserCheck, UserMinus, ShieldAlert, Calendar } from 'lucide-react';
import { attendanceAPI } from '../services/api';

export const TodayAttendance: React.FC = () => {
    const { users, attendanceRecords, systemSettings, adminUpdateAttendance, refreshData } = useApp();
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

    // Map employees to their attendance record for the selected date
    const dateStats = employees.map(emp => {
        const record = attendanceRecords.find(r => {
            const recordDate = typeof r.date === 'string' ? r.date.split('T')[0] : r.date;
            return r.userId === emp.id && recordDate === selectedDate;
        });
        return {
            user: emp,
            record
        };
    });

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

    // Format selected date for display
    const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const isToday = selectedDate === getTodayStr();

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

                {/* Date Picker & Bulk Action */}
                <div className="flex flex-wrap items-center gap-2">
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
                                <th className="px-6 py-3 text-center">Manual Hrs</th>
                                <th className="px-6 py-3 text-center">Penalty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dateStats.map(({ user, record }) => (
                                <tr key={user.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">{user.name}</td>
                                    <td className="px-6 py-4">{user.department}</td>
                                    <td className="px-6 py-4 text-center font-mono">
                                        {record?.checkIn ? (
                                            <span className="text-blue-600 font-bold">{formatTime(record.checkIn, systemSettings.timezone)}</span>
                                        ) : (
                                            <span className="text-gray-300">--:--</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono">
                                        {record?.checkOut ? (
                                            <span className="text-gray-800">{formatTime(record.checkOut, systemSettings.timezone)}</span>
                                        ) : (
                                            <span className="text-gray-300">--:--</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono">
                                        {record && record.totalWorkedSeconds > 0 ? (
                                            <span className="text-gray-900 font-bold">
                                                {Math.floor(record.totalWorkedSeconds / 3600)}h {Math.floor((record.totalWorkedSeconds % 3600) / 60)}m
                                            </span>
                                        ) : (
                                            <span className="text-gray-300">--:--</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {!record || (record.totalWorkedSeconds === 0 && !record.checkIn) ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                <UserMinus size={12} className="mr-1" /> Absent
                                            </span>
                                        ) : record.checkOut || record.totalWorkedSeconds > 0 ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                <UserCheck size={12} className="mr-1" /> {record.checkOut ? 'Completed' : 'Manual Entry'}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                                                <Clock size={12} className="mr-1" /> Working
                                            </span>
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
                                                    {record?.isPenaltyDisabled && (
                                                        <ShieldAlert size={14} className="ml-2 text-rose-600" title="Penalty Disabled" />
                                                    )}
                                                </label>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {dateStats.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-gray-400">No employees found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
