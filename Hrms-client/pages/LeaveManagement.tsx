import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role, LeaveCategory, LeaveStatus, User } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
    CalendarDays,
    DollarSign,
    Users,
    Clock,
    Search,
    FileText,
    History,
    Info,
    ChevronRight,
    PlusCircle,
    AlertCircle,
    CheckCircle2,
    Calendar,
    X,
    TrendingUp,
    ArrowRight
} from 'lucide-react';
import { formatDate, getTodayStr } from '../services/utils';
import { userAPI } from '../services/api';

export const LeaveManagement: React.FC = () => {
    const { users, leaveRequests, companyHolidays, refreshData } = useApp();
    const [selectedUserForAllocation, setSelectedUserForAllocation] = useState('');
    const [allocationAmount, setAllocationAmount] = useState('');
    const [allocationAction, setAllocationAction] = useState<'set' | 'add'>('add');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedHistoryUser, setSelectedHistoryUser] = useState<any>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (location.state?.openAllocationModal) {
            setIsAllocationModalOpen(true);
            // Clear state to avoid reopening on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Holiday date Set for calculations
    const holidayDateSet = useMemo(() => new Set(
        companyHolidays.map(h => typeof h.date === 'string' ? h.date.split('T')[0] : new Date(h.date).toISOString().split('T')[0])
    ), [companyHolidays]);

    // Calculate working days (excluding Sundays and holidays)
    const calculateLeaveDays = (startDateStr: string, endDateStr: string) => {
        if (!startDateStr || !endDateStr) return 0;
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

        let days = 0;
        const current = new Date(start);
        while (current <= end) {
            if (current.getDay() !== 0 && !holidayDateSet.has(current.toISOString().split('T')[0])) {
                days += 1;
            }
            current.setDate(current.getDate() + 1);
        }
        return days;
    };

    // Process paid leave statistics for employees
    const employeeLeaveStats = useMemo(() => {
        return users
            .filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR)
            .map(user => {
                const userLeaves = leaveRequests.filter(l => l.userId === user.id);

                // Detailed history for hover
                const leaveHistory = userLeaves
                    .filter(l => (l.status === 'Approved' || l.status === LeaveStatus.APPROVED))
                    .map(l => {
                        let daysCount = 0;
                        if (l.category === LeaveCategory.HALF_DAY) {
                            daysCount = 0.5;
                        } else if (l.category === LeaveCategory.EXTRA_TIME) {
                            daysCount = calculateLeaveDays(l.startDate, l.endDate);
                        } else {
                            daysCount = calculateLeaveDays(l.startDate, l.endDate);
                        }
                        return { ...l, daysCount };
                    })
                    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

                const usedPaidLeaves = leaveHistory
                    .filter(l => l.category === LeaveCategory.PAID)
                    .reduce((sum, l) => sum + l.daysCount, 0);

                // Calculate counts for all categories
                const categorySummaries = leaveHistory.reduce((acc: { [key: string]: number }, l) => {
                    const cat = l.category || 'Other';
                    acc[cat] = (acc[cat] || 0) + l.daysCount;
                    return acc;
                }, {});

                const allocated = user.paidLeaveAllocation || 0;
                const remaining = Math.max(0, allocated - usedPaidLeaves);

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    allocated,
                    usedPaidLeaves,
                    remaining,
                    leaveHistory,
                    categorySummaries
                };
            })
            .filter(stat =>
                stat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                stat.department.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [users, leaveRequests, holidayDateSet, searchQuery]);

    const handleAllocationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserForAllocation || !allocationAmount) return;

        setIsSubmitting(true);
        try {
            await userAPI.updateUser(selectedUserForAllocation, {
                paidLeaveAllocation: Number(allocationAmount),
                paidLeaveAction: allocationAction
            });
            alert(`Paid leave ${allocationAction === 'set' ? 'set to' : 'added'}: ${allocationAmount} days`);
            setAllocationAmount('');
            setIsAllocationModalOpen(false);
            refreshData();
        } catch (error: any) {
            console.error('Allocation failed:', error);
            alert(error.message || 'Failed to allocate leave');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <CalendarDays size={26} />
                        </div>
                        Leave Management
                    </h1>
                    <p className="text-slate-500 mt-2 ml-15 font-medium">Global leave tracking and paid leave allocation.</p>
                </div>
                <button
                    onClick={() => setIsAllocationModalOpen(true)}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                >
                    <PlusCircle size={20} />
                    Allocate Paid Leave
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Total Allocated</p>
                        <p className="text-2xl font-black text-slate-800">
                            {users.reduce((sum, u) => sum + (u.paidLeaveAllocation || 0), 0)} <span className="text-xs text-slate-400 font-bold">Days</span>
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Total Used (Paid)</p>
                        <p className="text-2xl font-black text-rose-600">
                            {employeeLeaveStats.reduce((sum, s) => sum + s.usedPaidLeaves, 0)} <span className="text-xs text-rose-400 font-bold">Days</span>
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Extra Time Taken</p>
                        <p className="text-2xl font-black text-emerald-600">
                            {employeeLeaveStats.reduce((sum, s) => sum + (s.categorySummaries[LeaveCategory.EXTRA_TIME] || 0), 0)} <span className="text-xs text-emerald-400 font-bold">Days</span>
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Employees Tracked</p>
                        <p className="text-2xl font-black text-slate-800">{employeeLeaveStats.length}</p>
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Users className="text-blue-500" size={22} />
                            Employee Leave Summary
                        </h3>
                        <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-wider">Historical breakdown per category</p>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search staff or dept..."
                            className="bg-slate-50 border-none rounded-2xl px-5 py-3 pl-12 text-sm focus:ring-4 focus:ring-blue-100 min-w-[320px] font-medium transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50/70 text-slate-400 uppercase text-[10px] font-black tracking-[0.15em] border-b border-slate-100">
                                <th className="px-8 py-5 text-left w-[25%] font-black uppercase tracking-widest text-slate-400">Employee</th>
                                <th className="px-6 py-5 text-center font-black uppercase tracking-widest text-slate-400">Allocated</th>
                                <th className="px-6 py-5 text-center font-black uppercase tracking-widest text-slate-400 italic">Paid</th>
                                <th className="px-6 py-5 text-center font-black uppercase tracking-widest text-slate-400">Extra Time</th>
                                <th className="px-6 py-4 text-center font-black uppercase tracking-widest text-slate-400">Unpaid</th>
                                <th className="px-6 py-4 text-center font-black uppercase tracking-widest text-slate-400">Half Day</th>
                                <th className="px-6 py-5 text-center font-black uppercase tracking-widest text-slate-400">Remaining</th>
                                <th className="px-8 py-5 text-right font-black uppercase tracking-widest text-slate-400">History</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {employeeLeaveStats.map(stat => (
                                <tr key={stat.id} className="hover:bg-blue-50/40 transition-all duration-200 group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-black text-sm ring-4 ring-white shadow-sm">
                                                {stat.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-base mb-0.5 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{stat.name}</p>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{stat.department}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className="font-black text-slate-700 bg-slate-50 border border-slate-100 px-4 py-1.5 rounded-xl text-xs">{stat.allocated}</span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className="font-black text-rose-600 bg-rose-50/50 border border-rose-100 px-4 py-1.5 rounded-xl text-xs">{stat.usedPaidLeaves}</span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className={`font-black px-4 py-1.5 rounded-xl text-xs border ${(stat.categorySummaries[LeaveCategory.EXTRA_TIME] || 0) > 0
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50'
                                            }`}>
                                            {stat.categorySummaries[LeaveCategory.EXTRA_TIME] || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className={`font-black px-4 py-1.5 rounded-xl text-xs border ${(stat.categorySummaries[LeaveCategory.UNPAID] || 0) > 0
                                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                                            : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50'
                                            }`}>
                                            {stat.categorySummaries[LeaveCategory.UNPAID] || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className={`font-black px-4 py-1.5 rounded-xl text-xs border ${(stat.categorySummaries[LeaveCategory.HALF_DAY] || 0) > 0
                                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                                            : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50'
                                            }`}>
                                            {stat.categorySummaries[LeaveCategory.HALF_DAY] || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className={`font-black px-4 py-1.5 rounded-xl text-xs shadow-sm border ${stat.remaining > 5 ? 'bg-blue-600 text-white border-blue-400' :
                                            stat.remaining > 2 ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-600 text-white border-rose-400'
                                            }`}>
                                            {stat.remaining}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <button
                                            onClick={() => { setSelectedHistoryUser(stat); setIsHistoryModalOpen(true); }}
                                            className="bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                                        >
                                            History
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {employeeLeaveStats.length === 0 && (
                        <div className="text-center py-20 bg-slate-50/30">
                            <div className="h-20 w-20 bg-white border-2 border-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200">
                                <Search size={32} />
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No matching employee records</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Allocation Modal */}
            {isAllocationModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-lg border-none shadow-2xl overflow-hidden bg-white animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-slate-900 p-6 py-6 text-white relative">
                            <button
                                onClick={() => setIsAllocationModalOpen(false)}
                                className="absolute top-5 right-6 h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 hover:rotate-90 transition-all duration-300 group"
                            >
                                <X size={18} className="text-slate-400 group-hover:text-white transition-colors" />
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-4 ring-blue-600/10">
                                    <PlusCircle className="text-white" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold uppercase tracking-tight">Allocate Paid Leave</h2>
                                    <p className="text-slate-400 text-[9px] font-bold mt-0.5 uppercase tracking-wider">Adjustment Center • HR Panel</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleAllocationSubmit} className="p-6 pt-8 space-y-6 bg-white">
                            {/* Employee Selection */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Target Employee</label>
                                <div className="relative group">
                                    <select
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-bold text-slate-800 appearance-none cursor-pointer text-sm"
                                        value={selectedUserForAllocation}
                                        onChange={(e) => setSelectedUserForAllocation(e.target.value)}
                                        required
                                    >
                                        <option value="">Select an employee...</option>
                                        {users.filter(u => u.role !== Role.ADMIN).map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.department})</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
                                        <ArrowRight size={16} />
                                    </div>
                                </div>
                            </div>

                            {/* Action Toggle */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Allocation Type</label>
                                <div className="flex p-1 bg-slate-50 rounded-[16px] border border-slate-100/50">
                                    <button
                                        type="button"
                                        onClick={() => setAllocationAction('add')}
                                        className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${allocationAction === 'add'
                                            ? 'bg-white text-blue-600 shadow-sm shadow-slate-200/50 ring-1 ring-slate-100'
                                            : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                    >
                                        Increment Balance
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAllocationAction('set')}
                                        className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${allocationAction === 'set'
                                            ? 'bg-white text-blue-600 shadow-sm shadow-slate-200/50 ring-1 ring-slate-100'
                                            : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                    >
                                        Override Total
                                    </button>
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                    {allocationAction === 'add' ? 'Increment Amount (Days)' : 'Absolute Total (Days)'}
                                </label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 pl-14 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-bold text-xl text-slate-900"
                                        placeholder="0.0"
                                        value={allocationAmount}
                                        onChange={(e) => setAllocationAmount(e.target.value)}
                                        required
                                    />
                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-focus-within:bg-blue-600 group-focus-within:text-white transition-all duration-300">
                                        <Calendar size={16} />
                                    </div>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold ml-1 italic">* Fractional values like 0.5 are supported</p>
                            </div>

                            {/* Submit Button */}
                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-blue-500/10 transition-all hover:translate-y-[-2px] hover:shadow-xl hover:shadow-blue-500/20 active:scale-95 disabled:opacity-50 relative overflow-hidden group"
                                    disabled={isSubmitting}
                                >
                                    <span className="relative z-10">{isSubmitting ? 'Syncing Records...' : 'Execute Allocation'}</span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* History Modal */}
            {isHistoryModalOpen && selectedHistoryUser && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2">Employee Activity Log</p>
                                <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                                    <History className="text-white opacity-40" size={24} />
                                    {selectedHistoryUser.name}
                                </h2>
                                <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-wider">{selectedHistoryUser.department} • {selectedHistoryUser.role}</p>
                            </div>
                            <button
                                onClick={() => setIsHistoryModalOpen(false)}
                                className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all active:scale-90"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 max-h-[55vh] overflow-y-auto bg-slate-50/50 custom-scrollbar">
                            {selectedHistoryUser.leaveHistory.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                                    <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200">
                                        <Info size={32} />
                                    </div>
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No leave records found</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {selectedHistoryUser.leaveHistory.map((leave: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-2xl p-6 border border-slate-100 flex gap-6 transition-all hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/50 group">
                                            <div className={`h-14 w-14 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${leave.category === LeaveCategory.PAID ? 'bg-blue-600 text-white shadow-blue-100' :
                                                leave.category === LeaveCategory.HALF_DAY ? 'bg-amber-500 text-white shadow-amber-100' :
                                                    leave.category === LeaveCategory.EXTRA_TIME ? 'bg-emerald-500 text-white shadow-emerald-100' :
                                                        'bg-purple-600 text-white shadow-purple-100'
                                                }`}>
                                                <Calendar size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-black text-slate-900 text-base uppercase tracking-tight">{leave.category}</span>
                                                    <div className="bg-slate-900 text-white px-3 py-1 rounded-lg text-[10px] font-black tracking-widest">
                                                        {leave.daysCount} DAY{leave.daysCount !== 1 ? 'S' : ''}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                                                    <p className="text-xs font-black text-blue-600 tracking-tight italic">
                                                        {formatDate(leave.startDate)} {leave.startDate !== leave.endDate && `— ${formatDate(leave.endDate)}`}
                                                        {leave.startTime && (
                                                            <span className="ml-2 font-bold text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-tighter not-italic">
                                                                • {leave.startTime}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 italic">Submission Reason</p>
                                                    <p className="text-sm text-slate-700 font-bold leading-relaxed">"{leave.reason}"</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-8 bg-white border-t border-slate-100 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 italic">Total Approved Days</span>
                                <span className="text-lg font-black text-slate-900 tracking-tight">
                                    {selectedHistoryUser.leaveHistory.reduce((s: number, l: any) => s + l.daysCount, 0)} Record Found
                                </span>
                            </div>
                            <Button
                                onClick={() => setIsHistoryModalOpen(false)}
                                className="px-10 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all hover:translate-y-[-2px] active:scale-95"
                            >
                                Close View
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
