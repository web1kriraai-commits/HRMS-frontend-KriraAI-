import React from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { getTodayStr, formatTime } from '../services/utils';
import { Role } from '../types';
import { Clock, UserCheck, UserMinus, Calendar } from 'lucide-react';

export const TodayAttendance: React.FC = () => {
  const { users, attendanceRecords, systemSettings } = useApp();
  const today = getTodayStr();
  
  // Get all employees
  const employees = users.filter(u => u.role === Role.EMPLOYEE);
  
  // Map employees to their today's record
  const todayStats = employees.map(emp => {
    const record = attendanceRecords.find(r => r.userId === emp.id && r.date === today);
    return {
      user: emp,
      record
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Clock size={24} />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Today's Attendance</h1>
                <p className="text-gray-500 text-sm">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
                        </tr>
                    </thead>
                    <tbody>
                        {todayStats.map(({ user, record }) => (
                            <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
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
                                    {!record ? (
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
                            </tr>
                        ))}
                        {todayStats.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-400">No employees found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    </div>
  );
};