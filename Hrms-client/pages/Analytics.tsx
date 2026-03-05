import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Loader2, Search, TrendingUp, Clock, Calendar, Users, Briefcase, ArrowUpRight, ArrowDownRight, Award, AlertTriangle, CheckCircle, PieChart as PieIcon } from 'lucide-react';
import { isPenaltyEffective, calculateLatenessPenaltySeconds } from '../services/utils';

export const Analytics: React.FC = () => {
    const { users, attendanceRecords, leaveRequests, companyHolidays, loading } = useApp();
    const [searchQuery, setSearchQuery] = React.useState('');

    // Dynamic month/year selection — defaults to the current real month (lazy initializer so Date is only called once)
    const [selectedMonth, setSelectedMonth] = React.useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Derive numeric month (0-indexed) and year from the selected value
    const [selectedYear, selectedMonthIdx] = useMemo(() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        return [y, m - 1]; // month is 0-indexed for consistency with previous code
    }, [selectedMonth]);

    const MIN_NORMAL_SECONDS = (8 * 3600) + (15 * 60); // 8h 15m = 29700 seconds
    const MAX_NORMAL_SECONDS = (8 * 3600) + (22 * 60); // 8h 22m = 30120 seconds

    // Filter data for the selected month
    const monthRecords = useMemo(() => {
        return attendanceRecords.filter(rec => {
            const [year, month] = rec.date.split('-').map(Number);
            return year === selectedYear && (month - 1) === selectedMonthIdx;
        });
    }, [attendanceRecords, selectedYear, selectedMonthIdx]);

    const monthLeaves = useMemo(() => {
        return leaveRequests.filter(leave => {
            if (leave.status !== 'Approved') return false;
            const [year, month] = leave.startDate.split('-').map(Number);
            return year === selectedYear && (month - 1) === selectedMonthIdx;
        });
    }, [leaveRequests, selectedYear, selectedMonthIdx]);

    // Calculate individual stats for each employee
    const processedEmployeeStats = useMemo(() => {
        const holidayDates = new Set(
            companyHolidays.map(h => typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0])
        );

        return users.map(user => {
            const records = monthRecords.filter(r => r.userId === user.id);
            const leaves = monthLeaves.filter(l => l.userId === user.id);

            let totalWorkedSeconds = 0;
            let totalExtraTimeSeconds = 0;
            let totalLowTimeSeconds = 0;
            let lateCheckInCount = 0;

            records.forEach(r => {
                if (r.checkIn && r.checkOut) {
                    const checkInDate = new Date(r.checkIn);
                    const checkOutDate = new Date(r.checkOut);
                    const totalSessionSeconds = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / 1000);

                    const breakSeconds = (r.breaks || []).reduce((acc: number, b: any) => {
                        if (b.durationSeconds) return acc + b.durationSeconds;
                        if (b.start && b.end) {
                            return acc + Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
                        }
                        return acc;
                    }, 0);

                    const netWorkedRaw = Math.max(0, totalSessionSeconds - breakSeconds);
                    const attendanceDate = typeof r.date === 'string' ? r.date.split('T')[0] : r.date;
                    const isHolidayDay = holidayDates.has(attendanceDate);

                    // Use the centralised penalty utility (same as AdminDashboard & EmployeeDashboard)
                    const penaltySeconds = !isHolidayDay && isPenaltyEffective(attendanceDate)
                        ? calculateLatenessPenaltySeconds(r.checkIn)
                        : 0;
                    if (penaltySeconds > 0) lateCheckInCount++;

                    let netWorkedSeconds = Math.max(0, netWorkedRaw - penaltySeconds);

                    if (isHolidayDay) {
                        if (netWorkedRaw > 0) {
                            totalExtraTimeSeconds += netWorkedRaw;
                            totalWorkedSeconds += netWorkedRaw;
                        }
                    } else {
                        const extraTimeLeaveForDate = leaves.find(l =>
                            l.category === 'Extra Time Leave' &&
                            (l.startDate === attendanceDate || (new Date(attendanceDate) >= new Date(l.startDate) && new Date(attendanceDate) <= new Date(l.endDate)))
                        );

                        if (extraTimeLeaveForDate && extraTimeLeaveForDate.startTime && extraTimeLeaveForDate.endTime) {
                            const [sH, sM] = extraTimeLeaveForDate.startTime.split(':').map(Number);
                            const [eH, eM] = extraTimeLeaveForDate.endTime.split(':').map(Number);
                            const leaveMinutes = (eH * 60 + eM) - (sH * 60 + sM);
                            netWorkedSeconds += (leaveMinutes * 60);
                        }

                        const hasHalfDay = leaves.some(l =>
                            l.category === 'Half Day Leave' &&
                            (l.startDate === attendanceDate || (new Date(attendanceDate) >= new Date(l.startDate) && new Date(attendanceDate) <= new Date(l.endDate)))
                        );

                        totalWorkedSeconds += netWorkedSeconds;

                        if (netWorkedSeconds < MIN_NORMAL_SECONDS) {
                            if (!hasHalfDay) {
                                totalLowTimeSeconds += (MIN_NORMAL_SECONDS - netWorkedSeconds);
                            }
                        } else if (netWorkedSeconds > MAX_NORMAL_SECONDS) {
                            totalExtraTimeSeconds += (netWorkedSeconds - MAX_NORMAL_SECONDS);
                        }
                    }
                }
            });

            return {
                id: user.id,
                name: user.name,
                dept: user.department || 'Other',
                workedHours: totalWorkedSeconds / 3600,
                overtimeHours: totalExtraTimeSeconds / 3600,
                lowTimeHours: totalLowTimeSeconds / 3600,
                leaveCount: leaves.length,
                lateCheckInCount,
                isActive: user.isActive
            };
        });
    }, [users, monthRecords, monthLeaves, companyHolidays, selectedYear, selectedMonthIdx]);

    // 1. Summary Statistics
    const stats = useMemo(() => {
        const totalWorked = processedEmployeeStats.reduce((acc, s) => acc + s.workedHours, 0);
        const totalLeaves = processedEmployeeStats.reduce((acc, s) => acc + s.leaveCount, 0);
        const totalLate = processedEmployeeStats.reduce((acc, s) => acc + s.lateCheckInCount, 0);

        const totalHolidays = companyHolidays.filter(h => {
            const [year, month] = h.date.split('-').map(Number);
            return year === selectedYear && (month - 1) === selectedMonthIdx;
        }).length;

        const uniqueDays = new Set(monthRecords.map(rec => rec.date)).size;

        return {
            workingHours: Math.round(totalWorked),
            leaves: totalLeaves,
            holidays: totalHolidays,
            workingDays: uniqueDays,
            activeUsers: processedEmployeeStats.filter(u => u.isActive).length,
            lateArrivals: totalLate
        };
    }, [processedEmployeeStats, monthRecords, companyHolidays, selectedYear, selectedMonthIdx]);

    // 2. Daily Attendance Trend (Area Chart)
    const dailyTrendData = useMemo(() => {
        const dailyMap: Record<string, number> = {};

        monthRecords.forEach(rec => {
            dailyMap[rec.date] = (dailyMap[rec.date] || 0) + (rec.totalWorkedSeconds || 0) / 3600;
        });

        return Object.entries(dailyMap)
            .map(([date, hours]) => ({ date, hours: Math.round(hours * 10) / 10 }))
            .sort((a, b) => {
                const parseDate = (d: string) => {
                    const [year, month, day] = d.split('-').map(Number);
                    return new Date(year, month - 1, day).getTime();
                };
                return parseDate(a.date) - parseDate(b.date);
            });
    }, [monthRecords]);

    // 3. Leave Category Distribution (Pie Chart)
    const leaveCategoryData = useMemo(() => {
        const catMap: Record<string, number> = {};
        monthLeaves.forEach(leave => {
            const cat = leave.category || 'Other';
            catMap[cat] = (catMap[cat] || 0) + 1;
        });

        const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899'];
        return Object.entries(catMap).map(([name, value], idx) => ({
            name,
            value,
            color: COLORS[idx % COLORS.length]
        }));
    }, [monthLeaves]);

    // 4. Departmental Status Breakdown
    const deptStatusData = useMemo(() => {
        const data: Record<string, { name: string; leaves: number; extra: number; low: number; normal: number }> = {};

        users.forEach(user => {
            const dept = user.department || 'Other';
            if (!data[dept]) data[dept] = { name: dept, leaves: 0, extra: 0, low: 0, normal: 0 };
        });

        monthRecords.forEach(rec => {
            const user = users.find(u => u.id === rec.userId);
            const dept = user?.department || 'Other';
            if (!data[dept]) return;

            if (rec.extraTimeFlag) data[dept].extra += 1;
            else if (rec.lowTimeFlag) data[dept].low += 1;
            else data[dept].normal += 1;
        });

        monthLeaves.forEach(leave => {
            const user = users.find(u => u.id === leave.userId);
            const dept = user?.department || 'Other';
            if (data[dept]) data[dept].leaves += 1;
        });

        return Object.values(data).sort((a, b) => (b.extra + b.normal + b.low + b.leaves) - (a.extra + a.normal + a.low + a.leaves));
    }, [users, monthRecords, monthLeaves]);

    // 5. Dept Time Analysis (Overtime & Low Time Hours)
    const deptTimeAnalysisData = useMemo(() => {
        const data: Record<string, { name: string; overtime: number; lowTime: number }> = {};

        processedEmployeeStats.forEach(s => {
            if (!data[s.dept]) data[s.dept] = { name: s.dept, overtime: 0, lowTime: 0 };
            data[s.dept].overtime += s.overtimeHours;
            data[s.dept].lowTime += s.lowTimeHours;
        });

        return Object.values(data).map(d => ({
            ...d,
            overtime: Math.round(d.overtime * 10) / 10,
            lowTime: Math.round(d.lowTime * 10) / 10
        })).sort((a, b) => (b.overtime + b.lowTime) - (a.overtime + a.lowTime));
    }, [processedEmployeeStats]);

    // 6. Dept Leave Breakdown
    const deptLeaveTypeData = useMemo(() => {
        const data: Record<string, any> = {};
        const categories = ['Paid Leave', 'Unpaid Leave', 'Half Day Leave', 'Extra Time Leave', 'Other'];

        users.forEach(user => {
            const dept = user.department || 'Other';
            if (!data[dept]) {
                data[dept] = { name: dept };
                categories.forEach(cat => data[dept][cat] = 0);
            }
        });

        monthLeaves.forEach(leave => {
            const user = users.find(u => u.id === leave.userId);
            const dept = user?.department || 'Other';
            const cat = leave.category || 'Other';
            if (data[dept]) {
                data[dept][cat] = (data[dept][cat] || 0) + 1;
            }
        });

        return Object.values(data).sort((a: any, b: any) => {
            const totalA = categories.reduce((sum, cat) => sum + (a[cat] || 0), 0);
            const totalB = categories.reduce((sum, cat) => sum + (b[cat] || 0), 0);
            return totalB - totalA;
        });
    }, [users, monthLeaves]);

    // 7. Status Distribution (Pie)
    const statusData = useMemo(() => {
        const extraTime = monthRecords.filter(r => r.extraTimeFlag).length;
        const lowTime = monthRecords.filter(r => r.lowTimeFlag).length;
        const normal = monthRecords.length - extraTime - lowTime;

        return [
            { name: 'Extra Time', value: extraTime, color: '#10b981' },
            { name: 'On Time', value: Math.max(0, normal), color: '#3b82f6' },
            { name: 'Low Time', value: lowTime, color: '#f43f5e' },
        ];
    }, [monthRecords]);

    // 8. Top Performers
    const topPerformers = useMemo(() => {
        return processedEmployeeStats
            .map(s => ({
                name: s.name,
                hours: Math.round(s.workedHours * 10) / 10,
                dept: s.dept
            }))
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 5);
    }, [processedEmployeeStats]);

    // 9. Employee-wise Monthly Detail
    const employeeWiseData = useMemo(() => {
        return processedEmployeeStats.map(s => ({
            id: s.id,
            name: s.name,
            dept: s.dept,
            workedHours: Math.round(s.workedHours * 10) / 10,
            overtimeHours: Math.round(s.overtimeHours * 10) / 10,
            lowTimeHours: Math.round(s.lowTimeHours * 10) / 10,
            leaveCount: s.leaveCount
        })).sort((a, b) => b.workedHours - a.workedHours);
    }, [processedEmployeeStats]);

    const filteredEmployeeData = useMemo(() => {
        return employeeWiseData.filter(emp =>
            emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.dept.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [employeeWiseData, searchQuery]);

    // Human-readable label for the selected month
    const selectedMonthLabel = useMemo(() => {
        return new Date(selectedYear, selectedMonthIdx).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [selectedYear, selectedMonthIdx]);

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
            {/* Header with Month Filter */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">HR Analytics Pro</h2>
                    <p className="text-slate-500 text-sm">Advanced insights into company-wide productivity and trends</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Month picker */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                        <Calendar size={16} className="text-blue-500 shrink-0" />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="text-sm font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 shadow-sm whitespace-nowrap">
                        <Calendar size={14} />
                        {selectedMonthLabel} Report
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Working Hours', value: stats.workingHours, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100', trend: 'Monthly Total' },
                    { label: 'Total Leaves', value: stats.leaves, icon: Briefcase, color: 'text-rose-600', bg: 'bg-rose-100', trend: 'Approved only' },
                    { label: 'Late Arrivals', value: stats.lateArrivals, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100', trend: 'Check-in delays' },
                    { label: 'Active Emp', value: stats.activeUsers, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100', trend: 'Current Staff' },
                ].map((item, id) => (
                    <Card key={id} className="p-4 border-none shadow-sm bg-white hover:shadow-md transition-all cursor-default group">
                        <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-2xl ${item.bg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                                <item.icon className={`h-6 w-6 ${item.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.trend}</p>
                                <h3 className="text-2xl font-extrabold text-slate-800">{item.value.toLocaleString()}</h3>
                                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Daily Production Time Data (Table) */}
            <Card className="p-6" title="Daily Company Production (Text)">
                <div className="overflow-y-auto mt-4 max-h-[400px]">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 italic text-slate-400">
                                <th className="py-2 px-4">Date</th>
                                <th className="py-2 px-4 text-center">Total Hours Worked</th>
                                <th className="py-2 px-4 text-right">Progress</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {dailyTrendData.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="py-8 text-center text-slate-400 italic">No attendance data for {selectedMonthLabel}</td>
                                </tr>
                            ) : dailyTrendData.map((d, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                                    <td className="py-2 px-4 font-bold text-slate-700">{d.date}</td>
                                    <td className="py-2 px-4 text-center text-blue-600 font-bold">{d.hours}h</td>
                                    <td className="py-2 px-4 text-right w-48">
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all group-hover:bg-blue-600"
                                                style={{ width: `${Math.min(100, (d.hours / 100) * 100)}%` }}
                                            ></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Departmental Status Data (Table) */}
                <Card className="p-6" title="Departmental Status Analysis (Text)">
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 italic text-slate-400">
                                    <th className="py-2">Department</th>
                                    <th className="py-2 text-center">Normal</th>
                                    <th className="py-2 text-center">Extra</th>
                                    <th className="py-2 text-center">Low</th>
                                    <th className="py-2 text-center">Leaves</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {deptStatusData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 font-bold text-slate-700">{d.name}</td>
                                        <td className="py-2 text-center text-blue-600 font-bold">{d.normal}</td>
                                        <td className="py-2 text-center text-emerald-600 font-bold">{d.extra}</td>
                                        <td className="py-2 text-center text-rose-500 font-bold">{d.low}</td>
                                        <td className="py-2 text-center text-purple-600 font-bold">{d.leaves}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Dept Time Analysis Data (Table) */}
                <Card className="p-6" title="Overtime vs Low Time Hours (Text)">
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 italic text-slate-400">
                                    <th className="py-2">Department</th>
                                    <th className="py-2 text-center">Overtime</th>
                                    <th className="py-2 text-center">Low Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {deptTimeAnalysisData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 font-bold text-slate-700">{d.name}</td>
                                        <td className="py-2 text-center text-emerald-600 font-bold">{d.overtime}h</td>
                                        <td className="py-2 text-center text-rose-500 font-bold">{d.lowTime}h</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Departmental Leave Type Breakdown (Text) */}
            <Card className="p-6" title="Departmental Leave Type Breakdown (Text)">
                <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 italic text-slate-400">
                                <th className="py-2 px-4">Department</th>
                                <th className="py-2 px-4 text-center">Paid</th>
                                <th className="py-2 px-4 text-center">Unpaid</th>
                                <th className="py-2 px-4 text-center">Half Day</th>
                                <th className="py-2 px-4 text-center">Extra Time</th>
                                <th className="py-2 px-4 text-center">Other</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {deptLeaveTypeData.map((d: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2 px-4 font-bold text-slate-700">{d.name}</td>
                                    <td className="py-2 px-4 text-center font-bold text-blue-600">{d['Paid Leave']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-rose-500">{d['Unpaid Leave']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-amber-500">{d['Half Day Leave']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-purple-600">{d['Extra Time Leave']}</td>
                                    <td className="py-2 px-4 text-center font-bold text-slate-400">{d['Other']}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Leave Distribution Data (Table) */}
                <Card className="p-6" title="Leave Distribution (Text)">
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 italic text-slate-400">
                                    <th className="py-2">Category</th>
                                    <th className="py-2 text-center">Count</th>
                                    <th className="py-2 text-center">Percentage</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {leaveCategoryData.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2 font-bold text-slate-700">{d.name}</td>
                                        <td className="py-2 text-center font-black">{d.value}</td>
                                        <td className="py-2 text-center text-slate-400 font-medium">
                                            {stats.leaves > 0 ? Math.round((d.value / stats.leaves) * 100) : 0}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Star Performers List */}
                <Card className="p-6" title="Star Performers (Monthly)">
                    <div className="mt-4 space-y-3">
                        {topPerformers.length === 0 ? (
                            <p className="text-center text-slate-400 italic text-sm py-6">No data for {selectedMonthLabel}</p>
                        ) : topPerformers.map((emp, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-all hover:bg-white hover:shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{emp.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{emp.dept}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-blue-600">{emp.hours}h</p>
                                    <div className="h-1 w-12 bg-slate-200 rounded-full mt-1 overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (emp.hours / 160) * 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <hr className="border-slate-100 my-8" />
            <div className="pt-4 text-center">
                <h3 className="text-lg font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Graphical Visualizations</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Daily Attendance Trend Chart */}
                <Card className="lg:col-span-2 p-6" title="Daily Company-wide Productivity">
                    <div className="h-80 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
                                />
                                <Area type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 2. Leave Category Distribution */}
                <Card className="p-6" title="Leave Distribution Graph">
                    <div className="h-64 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={leaveCategoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    {leaveCategoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. Departmental Status Breakdown */}
                <Card className="p-6" title="Departmental Status Breakdown">
                    <div className="h-80 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptStatusData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f8fafc' }}
                                    formatter={(value: number) => [`${value} Days`, '']}
                                />
                                <Legend iconType="circle" />
                                <Bar name="On Time" dataKey="normal" stackId="a" fill="#3b82f6" />
                                <Bar name="Extra Time" dataKey="extra" stackId="a" fill="#10b981" />
                                <Bar name="Low Time" dataKey="low" stackId="a" fill="#f43f5e" />
                                <Bar name="Leaves" dataKey="leaves" stackId="a" fill="#8b5cf6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 4. Dept Time Analysis */}
                <Card className="p-6" title="Departmental Overtime vs Low Time Breakdown">
                    <div className="h-80 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptTimeAnalysisData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f8fafc' }}
                                    formatter={(value: number) => [`${value} Hours`, '']}
                                />
                                <Legend iconType="circle" />
                                <Bar name="Overtime" dataKey="overtime" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar name="Low Time" dataKey="lowTime" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                {/* 5. Departmental Leave Type Breakdown */}
                <Card className="p-6" title="Departmental Leave Type Categorization">
                    <div className="h-80 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deptLeaveTypeData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f8fafc' }}
                                />
                                <Legend iconType="circle" />
                                <Bar name="Paid" dataKey="Paid Leave" stackId="a" fill="#3b82f6" />
                                <Bar name="Unpaid" dataKey="Unpaid Leave" stackId="a" fill="#f43f5e" />
                                <Bar name="Half Day" dataKey="Half Day Leave" stackId="a" fill="#f59e0b" />
                                <Bar name="Extra Time" dataKey="Extra Time Leave" stackId="a" fill="#8b5cf6" />
                                <Bar name="Other" dataKey="Other" stackId="a" fill="#94a3b8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Employee Monthly Performance Detail */}
            <Card className="p-6 mt-6" title="Employee Monthly Performance Detail">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <p className="text-sm text-slate-500">Individual performance metrics for {selectedMonthLabel}</p>
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search employee or dept..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-y border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Employee</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Department</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Worked Hours</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Overtime</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Low Time</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Leaves</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredEmployeeData.length > 0 ? (
                                filteredEmployeeData.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{emp.name}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                                                {emp.dept}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-black text-slate-700">{emp.workedHours}h</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-bold ${emp.overtimeHours > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                                {emp.overtimeHours > 0 ? `+${emp.overtimeHours}h` : '0h'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-bold ${emp.lowTimeHours > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                                                {emp.lowTimeHours > 0 ? `-${emp.lowTimeHours}h` : '0h'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <Briefcase size={12} className={emp.leaveCount > 0 ? 'text-amber-500' : 'text-slate-200'} />
                                                <span className={`text-sm font-bold ${emp.leaveCount > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                                    {emp.leaveCount}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                                        No employees found matching your search...
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
