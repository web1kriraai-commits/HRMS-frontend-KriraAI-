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

                {/* Date Picker */}
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

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-3">Employee</th>
                                <th className="px-6 py-3">Department</th>
                                <th className="px-6 py-3 text-center">Check In</th>
                                <th className="px-6 py-3 text-center">Check Out</th>
                                <th className="px-6 py-3 text-center">Status</th>
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
                                    <td className="px-6 py-4 text-center">
                                        {!record || (!record.checkIn && !record.checkOut) ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                <UserMinus size={12} className="mr-1" /> Absent
                                            </span>
                                        ) : record.checkOut ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                <UserCheck size={12} className="mr-1" /> Completed
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                                                <Clock size={12} className="mr-1" /> Working
                                            </span>
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
                                    <td colSpan={6} className="text-center py-8 text-gray-400">No employees found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};