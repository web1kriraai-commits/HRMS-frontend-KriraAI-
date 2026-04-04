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
    ArrowRight,
    Pencil,
    RotateCcw,
    Trash2,
    Filter
} from 'lucide-react';
import { formatDate, getTodayStr } from '../services/utils';
import { userAPI } from '../services/api';

const formatDisplayDays = (val: number) => {
    if (typeof val !== 'number') return val;
    // Format to 2 decimals max, removing trailing zeros
    return Math.round(val * 100) / 100;
};

export const LeaveManagement: React.FC = () => {
    const { users, leaveRequests, companyHolidays, refreshData, updateUser, updateLeaveStatus } = useApp();
    const [selectedUserForAllocation, setSelectedUserForAllocation] = useState('');
    const [allocationAmount, setAllocationAmount] = useState('');
    const [extraTimeAllocationAmount, setExtraTimeAllocationAmount] = useState('');
    const [allocationAction, setAllocationAction] = useState<'set' | 'add'>('add');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedHistoryUser, setSelectedHistoryUser] = useState<any>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // New states for manual adjustments
    const [manualPaidAdjustment, setManualPaidAdjustment] = useState('');
    const [manualExtraTimeAdjustment, setManualExtraTimeAdjustment] = useState('');
    const [manualUnpaidAdjustment, setManualUnpaidAdjustment] = useState('');
    const [manualHalfDayAdjustment, setManualHalfDayAdjustment] = useState('');

    // Global History Filters & Pagination
    const [histStatusFilter, setHistStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');
    const [histDateFilter, setHistDateFilter] = useState('');
    const [histMonthFilter, setHistMonthFilter] = useState('');
    const [histSearchQuery, setHistSearchQuery] = useState('');
    const [currentPageHist, setCurrentPageHist] = useState(1);
    const HIST_ITEMS_PER_PAGE = 10;

    const handleUserSelect = (userId: string) => {
        setSelectedUserForAllocation(userId);
        if (!userId) {
            setAllocationAmount('');
            setManualPaidAdjustment('');
            setManualExtraTimeAdjustment('');
            setManualUnpaidAdjustment('');
            setManualHalfDayAdjustment('');
            return;
        }

        const user = users.find(u => u.id === userId);
        if (user) {
            setAllocationAmount(user.paidLeaveAllocation?.toString() || '0');
            setExtraTimeAllocationAmount(user.extraTimeLeaveAllocation?.toString() || '0');

            const { basePaid, baseExtra, baseUnpaid } = getUserHistoryBase(userId);

            // Show Totals (History + Manual) in the modal
            const totalPaid = basePaid + (user.manualPaidLeaveAdjustment || 0) + (user.manualHalfDayLeaveAdjustment || 0);
            const totalExtra = baseExtra + (user.manualExtraTimeAdjustment || 0);
            const totalUnpaid = baseUnpaid + (user.manualUnpaidLeaveAdjustment || 0);

            setManualPaidAdjustment(totalPaid.toString());
            setManualExtraTimeAdjustment(totalExtra.toString());
            setManualUnpaidAdjustment(totalUnpaid.toString());
            setManualHalfDayAdjustment('0');
            setAllocationAction('set'); // Default to set for existing users
        }
    };

    const resetAllocationFields = () => {
        setSelectedUserForAllocation('');
        setAllocationAmount('');
        setExtraTimeAllocationAmount('');
        setManualPaidAdjustment('');
        setManualExtraTimeAdjustment('');
        setManualUnpaidAdjustment('');
        setManualHalfDayAdjustment('');
        setAllocationAction('add');
    };

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

    // Helper to get history-based totals (without manual adjustments)
    const getUserHistoryBase = (userId: string) => {
        const userLeaves = leaveRequests.filter(l => l.userId === userId && (l.status === 'Approved' || l.status === LeaveStatus.APPROVED));

        const basePaid = userLeaves
            .filter(l => l.category === LeaveCategory.PAID ||
                (l.category === LeaveCategory.HALF_DAY && !(l.reason || '').includes('[Extra Time Leave]') && !(l.reason || '').includes('[Unpaid Leave]')))
            .reduce((sum, l) => sum + (l.category === LeaveCategory.HALF_DAY ? 0.5 : calculateLeaveDays(l.startDate, l.endDate)), 0);

        const baseExtra = userLeaves
            .filter(l => l.category === LeaveCategory.EXTRA_TIME ||
                (l.category === LeaveCategory.HALF_DAY && (l.reason || '').includes('[Extra Time Leave]')))
            .reduce((sum, l) => sum + (l.category === LeaveCategory.HALF_DAY ? 0.5 : calculateLeaveDays(l.startDate, l.endDate)), 0);

        const baseUnpaid = userLeaves
            .filter(l => l.category === LeaveCategory.UNPAID ||
                (l.category === LeaveCategory.HALF_DAY && (l.reason || '').includes('[Unpaid Leave]')))
            .reduce((sum, l) => sum + (l.category === LeaveCategory.HALF_DAY ? 0.5 : calculateLeaveDays(l.startDate, l.endDate)), 0);

        return { basePaid, baseExtra, baseUnpaid };
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
                    .filter(l => l.category === LeaveCategory.PAID ||
                        (l.category === LeaveCategory.HALF_DAY && !(l.reason || '').includes('[Extra Time Leave]') && !(l.reason || '').includes('[Unpaid Leave]')))
                    .reduce((sum, l) => sum + l.daysCount, 0);

                // Calculate counts for all categories
                const categorySummaries = leaveHistory.reduce((acc: { [key: string]: number }, l) => {
                    let cat = l.category || 'Other';

                    // Correctly categorize half-day leaves based on reason tags
                    if (cat === LeaveCategory.HALF_DAY) {
                        const reason = l.reason || '';
                        if (reason.includes('[Extra Time Leave]')) {
                            cat = LeaveCategory.EXTRA_TIME;
                        } else if (reason.includes('[Unpaid Leave]')) {
                            cat = LeaveCategory.UNPAID;
                        } else {
                            cat = LeaveCategory.PAID;
                        }
                    }

                    acc[cat] = (acc[cat] || 0) + l.daysCount;
                    return acc;
                }, {});

                const allocated = user.paidLeaveAllocation || 0;

                // Incorporate manual adjustments
                const manualPaid = user.manualPaidLeaveAdjustment || 0;
                const manualExtraTime = user.manualExtraTimeAdjustment || 0;
                const manualUnpaid = user.manualUnpaidLeaveAdjustment || 0;
                const manualHalfDay = user.manualHalfDayLeaveAdjustment || 0;

                // Merge half day adjustments into paid total now that column is removed
                const totalPaid = usedPaidLeaves + manualPaid + manualHalfDay;
                const remainingPaid = Math.max(0, allocated - totalPaid);

                const extraTimeAllocated = user.extraTimeLeaveAllocation || 0;
                const totalExtraTime = (categorySummaries[LeaveCategory.EXTRA_TIME] || 0) + manualExtraTime;
                const remainingExtra = Math.max(0, extraTimeAllocated - totalExtraTime);

                const totalUnpaid = (categorySummaries[LeaveCategory.UNPAID] || 0) + manualUnpaid;
                const totalHalfDay = (categorySummaries[LeaveCategory.HALF_DAY] || 0) + manualHalfDay;

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    paidAllocated: allocated,
                    extraTimeAllocated,
                    usedPaidLeaves: totalPaid,
                    manualPaid,
                    manualExtraTime,
                    manualUnpaid,
                    manualHalfDay,
                    totalExtraTime,
                    totalUnpaid,
                    totalHalfDay,
                    remainingPaid,
                    remainingExtra,
                    leaveHistory,
                    categorySummaries
                };
            })
            .filter(stat =>
                stat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                stat.department.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [users, leaveRequests, holidayDateSet, searchQuery]);

    // Reset pagination on search
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const totalPages = Math.ceil(employeeLeaveStats.length / ITEMS_PER_PAGE);
    const paginatedStats = employeeLeaveStats.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Global History Filtering Logic
    const filteredGlobalLeaves = useMemo(() => {
        return leaveRequests
            .filter(leave => {
                const statusMatch = histStatusFilter === 'All' || (leave.status || '').trim() === histStatusFilter;
                const searchMatch = histSearchQuery === '' ||
                    (leave.userName || '').toLowerCase().includes(histSearchQuery.toLowerCase()) ||
                    (leave.reason || '').toLowerCase().includes(histSearchQuery.toLowerCase());

                let dateMatch = true;
                if (histDateFilter) {
                    dateMatch = leave.startDate === histDateFilter || leave.endDate === histDateFilter;
                }

                let monthMatch = true;
                if (histMonthFilter) {
                    monthMatch = leave.startDate.startsWith(histMonthFilter) || leave.endDate.startsWith(histMonthFilter);
                }

                return statusMatch && searchMatch && dateMatch && monthMatch;
            })
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [leaveRequests, histStatusFilter, histSearchQuery, histDateFilter, histMonthFilter]);

    // Reset history pagination on filter change
    useEffect(() => {
        setCurrentPageHist(1);
    }, [histStatusFilter, histSearchQuery, histDateFilter, histMonthFilter]);

    const totalPagesHist = Math.ceil(filteredGlobalLeaves.length / HIST_ITEMS_PER_PAGE);
    const paginatedHistory = filteredGlobalLeaves.slice(
        (currentPageHist - 1) * HIST_ITEMS_PER_PAGE,
        currentPageHist * HIST_ITEMS_PER_PAGE
    );

    const handleAllocationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUserForAllocation) return;

        setIsSubmitting(true);
        try {
            const { basePaid, baseExtra, baseUnpaid } = getUserHistoryBase(selectedUserForAllocation);

            // Calculate necessary offsets: Input Total - History Base
            const newPaidOffset = (manualPaidAdjustment === '' ? 0 : Number(manualPaidAdjustment)) - basePaid;
            const newExtraOffset = (manualExtraTimeAdjustment === '' ? 0 : Number(manualExtraTimeAdjustment)) - baseExtra;
            const newUnpaidOffset = (manualUnpaidAdjustment === '' ? 0 : Number(manualUnpaidAdjustment)) - baseUnpaid;

            await updateUser(selectedUserForAllocation, {
                ...(allocationAmount !== '' && { paidLeaveAllocation: Number(allocationAmount) }),
                paidLeaveAction: allocationAction,
                manualPaidLeaveAdjustment: newPaidOffset,
                manualExtraTimeAdjustment: newExtraOffset,
                manualUnpaidLeaveAdjustment: newUnpaidOffset,
                manualHalfDayLeaveAdjustment: 0
            });

            alert(`Leave balances updated for employee.`);
            resetAllocationFields();
            setIsAllocationModalOpen(false);
            // No need for refreshData() here as context's updateUser already calls it
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
                    <p className="text-slate-500 mt-2 ml-15 font-medium">leave tracking and paid leave allocation.</p>
                </div>
                <button
                    onClick={() => {
                        resetAllocationFields();
                        setIsAllocationModalOpen(true);
                    }}
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
                            {formatDisplayDays(users.reduce((sum, u) => sum + (u.paidLeaveAllocation || 0), 0))} <span className="text-xs text-slate-400 font-bold">Days</span>
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
                            {formatDisplayDays(employeeLeaveStats.reduce((sum, s) => sum + s.usedPaidLeaves, 0))} <span className="text-xs text-rose-400 font-bold">Days</span>
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
                            {formatDisplayDays(employeeLeaveStats.reduce((sum, s) => sum + s.totalExtraTime, 0))} <span className="text-xs text-emerald-400 font-bold">Days</span>
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
                                <th className="px-8 py-5 text-left w-[20%] font-black uppercase tracking-widest text-slate-400">Employee</th>
                                <th className="px-4 py-5 text-center font-black uppercase tracking-widest text-slate-400">Allocated</th>
                                <th className="px-4 py-5 text-center font-black uppercase tracking-widest text-slate-400">Paid</th>
                                <th className="px-4 py-5 text-center font-black uppercase tracking-widest text-slate-400">Extra Time</th>
                                <th className="px-4 py-5 text-center font-black uppercase tracking-widest text-slate-400">Unpaid</th>
                                <th className="px-6 py-5 text-center font-black uppercase tracking-widest text-slate-400">Remaining</th>
                                <th className="px-8 py-5 text-right font-black uppercase tracking-widest text-slate-400">History</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedStats.map(stat => (
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
                                    <td className="px-4 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2 group/palloc">
                                            <span className="font-black text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-xs">{formatDisplayDays(stat.paidAllocated)}</span>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserForAllocation(stat.id);
                                                    setAllocationAmount(stat.paidAllocated.toString());
                                                    setExtraTimeAllocationAmount(stat.extraTimeAllocated.toString());
                                                    setManualPaidAdjustment(stat.usedPaidLeaves.toString());
                                                    setManualExtraTimeAdjustment(stat.totalExtraTime.toString());
                                                    setManualUnpaidAdjustment(stat.totalUnpaid.toString());
                                                    setManualHalfDayAdjustment('0');
                                                    setAllocationAction('set');
                                                    setIsAllocationModalOpen(true);
                                                }}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition-all opacity-0 group-hover/palloc:opacity-100 shadow-sm"
                                                title="Edit Allocation"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2 group/paid">
                                            <span className="font-black text-rose-600 bg-rose-50/50 border border-rose-100 px-3 py-1.5 rounded-xl text-xs">{formatDisplayDays(stat.usedPaidLeaves)}</span>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserForAllocation(stat.id);
                                                    setAllocationAmount(stat.paidAllocated.toString());
                                                    setExtraTimeAllocationAmount(stat.extraTimeAllocated.toString());
                                                    setManualPaidAdjustment(stat.usedPaidLeaves.toString());
                                                    setManualExtraTimeAdjustment(stat.totalExtraTime.toString());
                                                    setManualUnpaidAdjustment(stat.totalUnpaid.toString());
                                                    setManualHalfDayAdjustment('0');
                                                    setAllocationAction('set');
                                                    setIsAllocationModalOpen(true);
                                                }}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-rose-600 hover:text-white transition-all opacity-0 group-hover/paid:opacity-100 shadow-sm"
                                                title="Adjust Paid Usage"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2 group/extra">
                                            <span className={`font-black px-3 py-1.5 rounded-xl text-xs border ${stat.totalExtraTime > 0
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50'
                                                }`}>
                                                {formatDisplayDays(stat.totalExtraTime)}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserForAllocation(stat.id);
                                                    setAllocationAmount(stat.paidAllocated.toString());
                                                    setExtraTimeAllocationAmount(stat.extraTimeAllocated.toString());
                                                    setManualPaidAdjustment(stat.usedPaidLeaves.toString());
                                                    setManualExtraTimeAdjustment(stat.totalExtraTime.toString());
                                                    setManualUnpaidAdjustment(stat.totalUnpaid.toString());
                                                    setManualHalfDayAdjustment('0');
                                                    setAllocationAction('set');
                                                    setIsAllocationModalOpen(true);
                                                }}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all opacity-0 group-hover/extra:opacity-100 shadow-sm"
                                                title="Adjust Extra Time"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2 group/unpaid">
                                            <span className={`font-black px-3 py-1.5 rounded-xl text-xs border ${stat.totalUnpaid > 0
                                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : 'bg-slate-50 text-slate-300 border-slate-100 opacity-50'
                                                }`}>
                                                {formatDisplayDays(stat.totalUnpaid)}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserForAllocation(stat.id);
                                                    setAllocationAmount(stat.paidAllocated.toString());
                                                    setExtraTimeAllocationAmount(stat.extraTimeAllocated.toString());
                                                    setManualPaidAdjustment(stat.usedPaidLeaves.toString());
                                                    setManualExtraTimeAdjustment(stat.totalExtraTime.toString());
                                                    setManualUnpaidAdjustment(stat.totalUnpaid.toString());
                                                    setManualHalfDayAdjustment('0');
                                                    setAllocationAction('set');
                                                    setIsAllocationModalOpen(true);
                                                }}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-rose-700 hover:text-white transition-all opacity-0 group-hover/unpaid:opacity-100 shadow-sm"
                                                title="Adjust Unpaid Usage"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex items-center justify-center gap-2 group/balance">
                                            <div className="flex items-center bg-blue-600 rounded-xl px-4 py-1.5 shadow-sm">
                                                <span className={`font-black text-xs text-white`}>
                                                    {formatDisplayDays(stat.remainingPaid)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserForAllocation(stat.id);
                                                    setAllocationAmount(stat.paidAllocated.toString());
                                                    setExtraTimeAllocationAmount(stat.extraTimeAllocated.toString());
                                                    setManualPaidAdjustment(stat.usedPaidLeaves.toString());
                                                    setManualExtraTimeAdjustment(stat.totalExtraTime.toString());
                                                    setManualUnpaidAdjustment(stat.totalUnpaid.toString());
                                                    setManualHalfDayAdjustment('0');
                                                    setAllocationAction('set');
                                                    setIsAllocationModalOpen(true);
                                                }}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-900 hover:text-white transition-all opacity-0 group-hover/balance:opacity-100 shadow-sm"
                                                title="Edit Balances"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
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

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Showing <span className="text-slate-900">{Math.min(employeeLeaveStats.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}</span> to <span className="text-slate-900">{Math.min(employeeLeaveStats.length, currentPage * ITEMS_PER_PAGE)}</span> of <span className="text-slate-900">{employeeLeaveStats.length}</span> results
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${currentPage === 1
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-slate-600 hover:bg-white hover:text-blue-600 hover:shadow-sm'
                                    }`}
                            >
                                <ChevronRight className="rotate-180" size={18} />
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                // show only current, first, last, and neighbors if many pages
                                if (totalPages > 7 && (page > 1 && page < totalPages && Math.abs(page - currentPage) > 1)) {
                                    if (page === 2 || page === totalPages - 1) return <span key={page} className="px-1 text-slate-300">...</span>;
                                    return null;
                                }
                                return (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`h-10 w-10 flex items-center justify-center rounded-xl text-xs font-black transition-all ${currentPage === page
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                            : 'text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                );
                            })}

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${currentPage === totalPages
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-slate-600 hover:bg-white hover:text-blue-600 hover:shadow-sm'
                                    }`}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Global Leave Requests History */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <History className="text-indigo-500" size={22} />
                            Leave Requests History
                        </h3>
                        <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-wider">All time audit log of leave permissions</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search requester or reason..."
                                className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 pl-10 text-xs font-medium focus:ring-4 focus:ring-indigo-100"
                                value={histSearchQuery}
                                onChange={(e) => setHistSearchQuery(e.target.value)}
                            />
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        </div>

                        <select
                            className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                            value={histStatusFilter}
                            onChange={(e) => setHistStatusFilter(e.target.value as any)}
                        >
                            <option value="All">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>

                        <input
                            type="date"
                            className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                            value={histDateFilter}
                            onChange={(e) => setHistDateFilter(e.target.value)}
                            title="Filter by day"
                        />

                        <input
                            type="month"
                            className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                            value={histMonthFilter}
                            onChange={(e) => setHistMonthFilter(e.target.value)}
                            title="Filter by month"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50/70 text-slate-400 uppercase text-[10px] font-black tracking-[0.15em] border-b border-slate-100">
                                <th className="px-8 py-5 text-left w-[25%]">Employee</th>
                                <th className="px-6 py-5 text-center">Date Range</th>
                                <th className="px-6 py-5 text-center">Category</th>
                                <th className="px-6 py-5 text-center">Status</th>
                                <th className="px-6 py-5 text-center">Days</th>
                                <th className="px-6 py-5 text-left">Reason</th>
                                <th className="px-8 py-5 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedHistory.map((leave: any) => {
                                const days = calculateLeaveDays(leave.startDate, leave.endDate);
                                const isApproved = leave.status === 'Approved' || leave.status === LeaveStatus.APPROVED;
                                const isRejected = leave.status === 'Rejected' || leave.status === LeaveStatus.REJECTED;

                                return (
                                    <tr key={leave.id} className="hover:bg-slate-50/60 transition-colors group/row">
                                        <td className="px-8 py-5">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm mb-0.5 uppercase tracking-tight">{leave.userName || 'Unknown User'}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <p className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                                {formatDate(leave.startDate)}
                                                {leave.startDate !== leave.endDate && (
                                                    <span className="text-slate-400 block sm:inline"> — {formatDate(leave.endDate)}</span>
                                                )}
                                            </p>
                                            {leave.startTime && (
                                                <p className="text-[10px] text-indigo-500 font-black mt-1">
                                                    {leave.startTime} {leave.endTime && `- ${leave.endTime}`}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-lg uppercase tracking-tight">
                                                {leave.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <span className={`px-2.5 py-1 text-[9px] rounded-full font-black uppercase tracking-widest
                                                ${isApproved ? 'bg-emerald-100 text-emerald-700' :
                                                    isRejected ? 'bg-rose-100 text-rose-700' :
                                                        'bg-amber-100 text-amber-700'}`}>
                                                {leave.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-center font-black text-slate-800">
                                            {days} <span className="text-[9px] text-slate-400 font-bold">{days === 1 ? 'DAY' : 'DAYS'}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs text-slate-600 max-w-[200px] truncate group-hover/row:whitespace-normal group-hover/row:overflow-visible group-hover/row:relative group-hover/row:z-10 bg-inherit" title={leave.reason}>
                                                {leave.reason}
                                            </p>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {(isApproved || isRejected) && (
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`Revert this ${leave.status.toLowerCase()} leave?`)) return;
                                                        try {
                                                            await updateLeaveStatus(leave.id, LeaveStatus.PENDING, `Reverted from ${leave.status} at global history`);
                                                            alert('Leave reverted successfully');
                                                            await refreshData();
                                                        } catch (error: any) {
                                                            alert(error.message || 'Failed to revert leave');
                                                        }
                                                    }}
                                                    className="p-2 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-xl transition-all shadow-sm active:scale-90"
                                                    title="Revert to Pending"
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredGlobalLeaves.length === 0 && (
                        <div className="text-center py-20 bg-slate-50/20">
                            <div className="h-16 w-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-200">
                                <History size={28} />
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No leave history matching filters</p>
                        </div>
                    )}
                </div>

                {/* History Pagination */}
                {totalPagesHist > 1 && (
                    <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                            Found <span className="text-slate-900">{filteredGlobalLeaves.length}</span> Records • Page <span className="text-slate-900">{currentPageHist}</span> of <span className="text-slate-900">{totalPagesHist}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPageHist(prev => Math.max(1, prev - 1))}
                                disabled={currentPageHist === 1}
                                className={`h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm transition-all ${currentPageHist === 1
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'text-slate-600 hover:border-indigo-200 hover:text-indigo-600 active:scale-90'
                                    }`}
                            >
                                <ChevronRight className="rotate-180" size={16} />
                            </button>

                            <div className="flex items-center bg-white border border-slate-100 rounded-xl px-2 shadow-sm h-9">
                                {Array.from({ length: totalPagesHist }, (_, i) => i + 1).map(page => {
                                    if (totalPagesHist > 5 && (page > 1 && page < totalPagesHist && Math.abs(page - currentPageHist) > 1)) {
                                        if (page === 2 || page === totalPagesHist - 1) return <span key={page} className="px-1 text-slate-300">.</span>;
                                        return null;
                                    }
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPageHist(page)}
                                            className={`h-6 min-w-[24px] px-1.5 flex items-center justify-center rounded-lg text-[9px] font-black transition-all ${currentPageHist === page
                                                ? 'bg-indigo-600 text-white shadow-md'
                                                : 'text-slate-400 hover:text-indigo-600'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPageHist(prev => Math.min(totalPagesHist, prev + 1))}
                                disabled={currentPageHist === totalPagesHist}
                                className={`h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm transition-all ${currentPageHist === totalPagesHist
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'text-slate-600 hover:border-indigo-200 hover:text-indigo-600 active:scale-90'
                                    }`}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
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
                                    <h2 className="text-lg font-bold uppercase tracking-tight">Adjust Leave Balances</h2>
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
                                        onChange={(e) => handleUserSelect(e.target.value)}
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

                            {/* Allocation Adjustment */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                                    Allocated {allocationAction === 'add' ? 'Increment' : 'Total'} (Days)
                                </label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 pl-12 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-bold text-lg text-slate-900"
                                        placeholder="0.0"
                                        value={allocationAmount}
                                        onChange={(e) => setAllocationAmount(e.target.value)}
                                        required={allocationAction === 'set'}
                                    />
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-focus-within:bg-blue-600 group-focus-within:text-white transition-all duration-300">
                                        <Calendar size={14} />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold ml-1 italic">* Fractional values like 0.5 are supported</p>

                            {/* Manual Adjustments Grid */}
                            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                                <div className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
                                    <div className="h-px w-8 bg-slate-100" />
                                    MANUAL TOTALS (INCL. HISTORY)
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {/* Manual Paid */}
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-500">
                                            <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                            Paid
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.5"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500/50 transition-all font-bold text-sm text-slate-900 shadow-sm"
                                                placeholder="0.0"
                                                value={manualPaidAdjustment}
                                                onChange={(e) => setManualPaidAdjustment(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Manual Extra Time */}
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-500">
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            Extra Time
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.5"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-bold text-sm text-slate-900 shadow-sm"
                                                placeholder="0.0"
                                                value={manualExtraTimeAdjustment}
                                                onChange={(e) => setManualExtraTimeAdjustment(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Manual Unpaid */}
                                    <div className="space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                                            <div className="h-1.5 w-1.5 rounded-full bg-rose-700" />
                                            Unpaid
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.5"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-4 focus:ring-rose-700/10 focus:border-rose-700/50 transition-all font-bold text-sm text-slate-900 shadow-sm"
                                                placeholder="0.0"
                                                value={manualUnpaidAdjustment}
                                                onChange={(e) => setManualUnpaidAdjustment(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-blue-500/10 transition-all hover:translate-y-[-2px] hover:shadow-xl hover:shadow-blue-500/20 active:scale-95 disabled:opacity-50 relative overflow-hidden group"
                                    disabled={isSubmitting}
                                >
                                    <span className="relative z-10">{isSubmitting ? 'Syncing Records...' : 'Execute Adjustments'}</span>
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
