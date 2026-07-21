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
import { formatDate, getTodayStr, getEffectiveLeaveCategory, calculateAbsentDaysForMonth, calculateBondLeaveSummary } from '../services/utils';
import {
  getDailySalary,
  getLopDeductionForDays,
  getMonthlySalary,
} from '../services/salarySlipCalc';
import { resolveAnnualPackage } from '../services/salaryBreakdownUtils';
import { userAPI } from '../services/api';
import { appAlert } from '../services/appAlert';

const formatDisplayDays = (val: number) => {
    if (typeof val !== 'number') return val;
    // Format to 2 decimals max, removing trailing zeros
    return Math.round(val * 100) / 100;
};

export const LeaveManagement: React.FC = () => {
    const { users, leaveRequests, companyHolidays, attendanceRecords, refreshData, updateUser, updateLeaveStatus } = useApp();
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
    const [paidLeaveAccessEnabled, setPaidLeaveAccessEnabled] = useState(true);

    const currentMonthDefault = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const currentYearDefault = new Date().getFullYear();

    // Global History Filters & Pagination
    const [histStatusFilter, setHistStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');
    const [histStartDateFilter, setHistStartDateFilter] = useState('');
    const [histEndDateFilter, setHistEndDateFilter] = useState('');
    const [histMonthFilter, setHistMonthFilter] = useState(currentMonthDefault);
    const [histSearchQuery, setHistSearchQuery] = useState('');
    const [currentPageHist, setCurrentPageHist] = useState(1);
    const HIST_ITEMS_PER_PAGE = 10;

    // Employee summary month filter (defaults to current month)
    const [summaryMonthFilter, setSummaryMonthFilter] = useState(currentMonthDefault);
    const [historyYearFilter, setHistoryYearFilter] = useState(currentYearDefault);

    const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);

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
            setPaidLeaveAccessEnabled(user.paidLeaveAccess !== false);
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
        setPaidLeaveAccessEnabled(true);
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

    // Helper: check if leave overlaps a month (YYYY-MM)
    const leaveOverlapsMonth = (leave: { startDate: string; endDate: string }, monthStr: string) => {
        if (!monthStr) return true;
        const [y, m] = monthStr.split('-').map(Number);
        const mStart = `${monthStr}-01`;
        const mEnd = `${monthStr}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
        return leave.startDate <= mEnd && leave.endDate >= mStart;
    };

    // Process paid leave statistics for employees
    const employeeLeaveStats = useMemo(() => {
        return users
            .filter(u => u.role === Role.EMPLOYEE || u.role === Role.HR)
            .map(user => {
                const userLeaves = leaveRequests.filter(l => l.userId === user.id);

                // Detailed history for modal
                const leaveHistory = userLeaves
                    .filter(l => (l.status === 'Approved' || l.status === LeaveStatus.APPROVED))
                    .map(l => {
                        const effectiveCategory = getEffectiveLeaveCategory(l);
                        let daysCount = 0;
                        if (l.category === LeaveCategory.HALF_DAY) {
                            daysCount = 0.5;
                        } else {
                            daysCount = calculateLeaveDays(l.startDate, l.endDate);
                        }
                        return { ...l, daysCount, effectiveCategory };
                    })
                    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

                // Month-scoped approved leaves
                const monthApprovedLeaves = leaveHistory.filter(l => leaveOverlapsMonth(l, summaryMonthFilter));

                const usedPaidLeavesAllTime = leaveHistory
                    .filter(l => l.effectiveCategory === LeaveCategory.PAID)
                    .reduce((sum, l) => sum + l.daysCount, 0);

                const usedPaidLeavesInMonth = monthApprovedLeaves
                    .filter(l => l.effectiveCategory === LeaveCategory.PAID)
                    .reduce((sum, l) => sum + l.daysCount, 0);

                const usedLeaveInMonth = monthApprovedLeaves
                    .reduce((sum, l) => sum + l.daysCount, 0);

                const manualPaid = user.manualPaidLeaveAdjustment || 0;
                const manualHalfDay = user.manualHalfDayLeaveAdjustment || 0;
                const totalPaidUsed = usedPaidLeavesAllTime + manualPaid + manualHalfDay;

                const bondSummary = calculateBondLeaveSummary(
                    user,
                    leaveRequests,
                    attendanceRecords,
                    holidayDateSet,
                    {
                        paid: user.manualPaidLeaveAdjustment || 0,
                        halfDay: user.manualHalfDayLeaveAdjustment || 0,
                        unpaid: user.manualUnpaidLeaveAdjustment || 0,
                    }
                );

                const absentDays = calculateAbsentDaysForMonth(
                    user.id,
                    user,
                    summaryMonthFilter,
                    attendanceRecords,
                    leaveRequests,
                    holidayDateSet
                );

                const annualPackage = resolveAnnualPackage(user.package);
                const monthlySalary = getMonthlySalary(annualPackage);
                const dailySalary = getDailySalary(annualPackage);
                const unpaidLeaveDaysInMonth = monthApprovedLeaves
                    .filter(l => l.effectiveCategory === LeaveCategory.UNPAID)
                    .reduce((sum, l) => sum + l.daysCount, 0);
                const estimatedLop = getLopDeductionForDays(annualPackage, unpaidLeaveDaysInMonth);

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    department: user.department,
                    paidLeaveAccess: user.paidLeaveAccess !== false,
                    annualPackage,
                    monthlySalary,
                    dailySalary,
                    unpaidLeaveDaysInMonth,
                    estimatedLop,
                    paidAllocated: bondSummary.allocated,
                    usedLeaveBond: bondSummary.totalTaken,
                    usedLeaveFromPool: bondSummary.used,
                    remainingLeave: bondSummary.remaining,
                    extraLeave: bondSummary.extra,
                    appliedDays: bondSummary.appliedDays,
                    absentDaysBond: bondSummary.absentDays,
                    usedLeaveInMonth,
                    usedPaidLeaves: totalPaidUsed,
                    usedPaidInMonth: usedPaidLeavesInMonth,
                    absentDays,
                    leaveHistory,
                };
            })
            .filter(stat =>
                stat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                stat.department.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [users, leaveRequests, holidayDateSet, searchQuery, summaryMonthFilter, attendanceRecords]);

    // Reset pagination on search or month change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, summaryMonthFilter]);

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
                if (histStartDateFilter && histEndDateFilter) {
                    // Logic: Overlap with [histStartDateFilter, histEndDateFilter]
                    dateMatch = leave.startDate <= histEndDateFilter && leave.endDate >= histStartDateFilter;
                } else if (histStartDateFilter) {
                    dateMatch = leave.endDate >= histStartDateFilter;
                } else if (histEndDateFilter) {
                    dateMatch = leave.startDate <= histEndDateFilter;
                }

                let monthMatch = true;
                if (histMonthFilter) {
                    monthMatch = leave.startDate.startsWith(histMonthFilter) || leave.endDate.startsWith(histMonthFilter);
                }

                return statusMatch && searchMatch && dateMatch && monthMatch;
            })
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [leaveRequests, histStatusFilter, histSearchQuery, histStartDateFilter, histEndDateFilter, histMonthFilter]);

    const overviewData = useMemo(() => {
        const approvedLeaves = filteredGlobalLeaves.filter(l => l.status === 'Approved' || l.status === LeaveStatus.APPROVED);
        const summary: { [userName: string]: { fullDays: number; halfDays: number; totalDays: number; count: number } } = {};
        approvedLeaves.forEach(leave => {
            const name = leave.userName || 'Unknown User';
            if (!summary[name]) {
                summary[name] = { fullDays: 0, halfDays: 0, totalDays: 0, count: 0 };
            }
            if (leave.category === LeaveCategory.HALF_DAY) {
                summary[name].halfDays += 0.5;
                summary[name].totalDays += 0.5;
            } else {
                const days = calculateLeaveDays(leave.startDate, leave.endDate);
                summary[name].fullDays += days;
                summary[name].totalDays += days;
            }
            summary[name].count += 1;
        });
        return Object.entries(summary)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.totalDays - a.totalDays);
    }, [filteredGlobalLeaves, holidayDateSet]);

    // Reset history pagination on filter change
    useEffect(() => {
        setCurrentPageHist(1);
    }, [histStatusFilter, histSearchQuery, histStartDateFilter, histEndDateFilter, histMonthFilter]);

    const totalPagesHist = Math.ceil(filteredGlobalLeaves.length / HIST_ITEMS_PER_PAGE);
    const paginatedHistory = filteredGlobalLeaves.slice(
        (currentPageHist - 1) * HIST_ITEMS_PER_PAGE,
        currentPageHist * HIST_ITEMS_PER_PAGE
    );

    const historyYearOptions = useMemo(() => {
        const start = 2025;
        const end = new Date().getFullYear();
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }, []);

    const filteredHistoryForModal = useMemo(() => {
        if (!selectedHistoryUser) return [];
        return (selectedHistoryUser.leaveHistory || []).filter((l: any) => {
            const year = new Date(l.startDate).getFullYear();
            return year === historyYearFilter;
        });
    }, [selectedHistoryUser, historyYearFilter]);

    const openAllocationForUser = (stat: typeof employeeLeaveStats[0]) => {
        setSelectedUserForAllocation(stat.id);
        setAllocationAmount(stat.paidAllocated.toString());
        setExtraTimeAllocationAmount('0');
        setManualPaidAdjustment(stat.usedPaidLeaves.toString());
        setManualExtraTimeAdjustment('0');
        setManualUnpaidAdjustment('0');
        setManualHalfDayAdjustment('0');
        setAllocationAction('set');
        setPaidLeaveAccessEnabled(stat.paidLeaveAccess);
        setIsAllocationModalOpen(true);
    };

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
                paidLeaveAccess: paidLeaveAccessEnabled,
                manualPaidLeaveAdjustment: newPaidOffset,
                manualExtraTimeAdjustment: newExtraOffset,
                manualUnpaidLeaveAdjustment: newUnpaidOffset,
                manualHalfDayLeaveAdjustment: 0
            });

            appAlert(`Leave balances updated for employee.`);
            resetAllocationFields();
            setIsAllocationModalOpen(false);
            // No need for refreshData() here as context's updateUser already calls it
        } catch (error: any) {
            console.error('Allocation failed:', error);
            appAlert(error.message || 'Failed to allocate leave');
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
                    className="flex items-center gap-2 bg-blue-500 text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 active:scale-95"
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
                            {formatDisplayDays(employeeLeaveStats.reduce((sum, s) => sum + s.paidAllocated, 0))} <span className="text-xs text-slate-400 font-bold">Days</span>
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Total Used (Bond)</p>
                        <p className="text-2xl font-black text-rose-600">
                            {formatDisplayDays(employeeLeaveStats.reduce((sum, s) => sum + s.usedLeaveBond, 0))} <span className="text-xs text-rose-400 font-bold">Days</span>
                        </p>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Extra Leave (Beyond Bond)</p>
                        <p className="text-2xl font-black text-emerald-600">
                            {formatDisplayDays(employeeLeaveStats.reduce((sum, s) => sum + s.extraLeave, 0))} <span className="text-xs text-emerald-400 font-bold">Days</span>
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
            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                            <Users className="text-blue-400" size={22} />
                            Employee Leave Summary
                        </h3>
                        <p className="text-slate-400 text-xs font-medium mt-1">Bond leave: allocated, used, remaining &amp; extra (from Mar 2025)</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            type="month"
                            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 focus:ring-4 focus:ring-blue-50"
                            value={summaryMonthFilter}
                            onChange={(e) => setSummaryMonthFilter(e.target.value)}
                            title="Filter summary by month"
                        />
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search staff or dept..."
                                className="bg-slate-50 border border-slate-100 rounded-xl px-5 py-2.5 pl-11 text-sm focus:ring-4 focus:ring-blue-50 min-w-[240px] font-medium transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50/80 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-100">
                                <th className="px-6 py-4 text-left">Employee</th>
                                <th className="px-4 py-4 text-center">Allocated</th>
                                <th className="px-4 py-4 text-center">Used Leave</th>
                                <th className="px-4 py-4 text-center">Remaining</th>
                                <th className="px-4 py-4 text-center">Extra</th>
                                <th className="px-4 py-4 text-center">LOP (Month)</th>
                                <th className="px-6 py-4 text-center">History</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {paginatedStats.map(stat => (
                                <tr key={stat.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-blue-500 font-bold text-sm">
                                                {stat.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-700 group-hover:text-blue-500 transition-colors">{stat.name}</p>
                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{stat.department}</p>
                                                <p className="text-[9px] text-slate-400 mt-0.5">
                                                    ₹{stat.monthlySalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/mo · ₹{stat.dailySalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/day LOP
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <span className="font-bold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1 rounded-lg text-xs">{formatDisplayDays(stat.paidAllocated)}</span>
                                            <button
                                                onClick={() => openAllocationForUser(stat)}
                                                className="p-1 rounded-md bg-slate-50 text-slate-400 hover:bg-blue-100 hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100"
                                                title="Edit allocation"
                                            >
                                                <Pencil size={10} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className="font-bold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg text-xs">{formatDisplayDays(stat.usedLeaveBond)}</span>
                                        <p className="text-[9px] text-slate-400 mt-0.5">bond period · from Mar 2025</p>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold px-3 py-1 rounded-lg text-xs border ${stat.remainingLeave > 0 ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                            {formatDisplayDays(stat.remainingLeave)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold px-3 py-1 rounded-lg text-xs border ${stat.extraLeave > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                            {formatDisplayDays(stat.extraLeave)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`font-bold px-3 py-1 rounded-lg text-xs border ${stat.estimatedLop > 0 ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                                            {stat.unpaidLeaveDaysInMonth > 0
                                                ? `₹${stat.estimatedLop.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                                                : '—'}
                                        </span>
                                        {stat.unpaidLeaveDaysInMonth > 0 && (
                                            <p className="text-[9px] text-slate-400 mt-0.5">{formatDisplayDays(stat.unpaidLeaveDaysInMonth)} unpaid day(s)</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => {
                                                setSelectedHistoryUser(stat);
                                                setHistoryYearFilter(currentYearDefault);
                                                setIsHistoryModalOpen(true);
                                            }}
                                            className="bg-blue-50 text-blue-500 hover:bg-blue-100 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 inline-flex items-center gap-1.5"
                                        >
                                            <History size={14} />
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

                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                                value={histStartDateFilter}
                                onChange={(e) => setHistStartDateFilter(e.target.value)}
                                title="Start Date"
                            />
                            <span className="text-slate-400 font-bold text-xs">to</span>
                            <input
                                type="date"
                                className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                                value={histEndDateFilter}
                                onChange={(e) => setHistEndDateFilter(e.target.value)}
                                title="End Date"
                            />
                        </div>

                        <input
                            type="month"
                            className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 focus:ring-4 focus:ring-indigo-100"
                            value={histMonthFilter}
                            onChange={(e) => setHistMonthFilter(e.target.value)}
                            title="Filter by month"
                        />

                        <button
                            onClick={() => setIsOverviewModalOpen(true)}
                            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center gap-2"
                        >
                            <FileText size={16} />
                            Overview
                        </button>
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
                                            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                                                getEffectiveLeaveCategory(leave) === LeaveCategory.PAID ? 'bg-blue-50 text-blue-500' :
                                                getEffectiveLeaveCategory(leave) === LeaveCategory.UNPAID ? 'bg-rose-50 text-rose-500' :
                                                getEffectiveLeaveCategory(leave) === LeaveCategory.EXTRA_TIME ? 'bg-emerald-50 text-emerald-600' :
                                                'bg-amber-50 text-amber-600'
                                            }`}>
                                                {getEffectiveLeaveCategory(leave)}
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
                                                            appAlert('Leave reverted successfully');
                                                            await refreshData();
                                                        } catch (error: any) {
                                                            appAlert(error.message || 'Failed to revert leave');
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
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-400/30 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-lg border-none shadow-xl overflow-hidden bg-white animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-slate-100 relative">
                            <button
                                onClick={() => setIsAllocationModalOpen(false)}
                                className="absolute top-5 right-5 h-8 w-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-all group"
                            >
                                <X size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="h-11 w-11 bg-blue-100 rounded-xl flex items-center justify-center">
                                    <PlusCircle className="text-blue-500" size={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-700">Adjust Leave Balances</h2>
                                    <p className="text-slate-400 text-xs mt-0.5">Allocation & paid leave access</p>
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

                            {selectedUserForAllocation && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            checked={paidLeaveAccessEnabled}
                                            onChange={(e) => setPaidLeaveAccessEnabled(e.target.checked)}
                                        />
                                        <span>
                                            <span className="block text-sm font-bold text-slate-800">Allow paid leave requests</span>
                                            <span className="block text-[11px] text-slate-500 mt-1 leading-snug">
                                                Turn off so this employee can only request <strong className="text-slate-700">Unpaid Leave</strong> and half-day as <strong className="text-slate-700">unpaid</strong>. Existing approved paid history is unchanged.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            )}

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
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-400/30 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-slate-100">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">Leave History</p>
                                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                                        <History className="text-blue-400" size={22} />
                                        {selectedHistoryUser.name}
                                    </h2>
                                    <p className="text-slate-400 text-xs mt-1">{selectedHistoryUser.department}</p>
                                </div>
                                <button
                                    onClick={() => setIsHistoryModalOpen(false)}
                                    className="h-9 w-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-all text-slate-400"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 mt-4">
                                <label className="text-xs font-semibold text-slate-500">Year:</label>
                                <select
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-blue-100"
                                    value={historyYearFilter}
                                    onChange={(e) => setHistoryYearFilter(Number(e.target.value))}
                                >
                                    {historyYearOptions.map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                                <div className="flex gap-2 ml-auto">
                                    <div className="bg-white rounded-lg px-3 py-1.5 border border-slate-100 text-center">
                                        <p className="text-[9px] text-slate-400 font-semibold uppercase">Records</p>
                                        <p className="text-sm font-bold text-blue-500">{filteredHistoryForModal.length}</p>
                                    </div>
                                    <div className="bg-white rounded-lg px-3 py-1.5 border border-slate-100 text-center">
                                        <p className="text-[9px] text-slate-400 font-semibold uppercase">Total Days</p>
                                        <p className="text-sm font-bold text-rose-500">
                                            {formatDisplayDays(filteredHistoryForModal.reduce((s: number, l: any) => s + l.daysCount, 0))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 max-h-[50vh] overflow-y-auto bg-slate-50/30">
                            {filteredHistoryForModal.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                                    <Info size={28} className="mx-auto mb-3 text-slate-300" />
                                    <p className="text-slate-400 text-sm font-medium">No leave records for {historyYearFilter}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredHistoryForModal.map((leave: any, idx: number) => {
                                        const cat = leave.effectiveCategory || getEffectiveLeaveCategory(leave);
                                        const catColor = cat === LeaveCategory.PAID ? 'bg-blue-100 text-blue-600 border-blue-100' :
                                            cat === LeaveCategory.UNPAID ? 'bg-rose-100 text-rose-500 border-rose-100' :
                                                cat === LeaveCategory.EXTRA_TIME ? 'bg-emerald-100 text-emerald-600 border-emerald-100' :
                                                    'bg-amber-100 text-amber-600 border-amber-100';
                                        return (
                                            <div key={idx} className="bg-white rounded-xl p-4 border border-slate-100 hover:border-blue-100 hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${catColor}`}>{cat}</span>
                                                    <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                                        {leave.daysCount} {leave.daysCount === 1 ? 'day' : 'days'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                                    <Calendar size={12} className="text-blue-400" />
                                                    <span className="font-medium">
                                                        {formatDate(leave.startDate)}
                                                        {leave.startDate !== leave.endDate && ` — ${formatDate(leave.endDate)}`}
                                                    </span>
                                                    {leave.startTime && (
                                                        <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded font-medium">
                                                            {leave.startTime}{leave.endTime ? ` – ${leave.endTime}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                {leave.reason && (
                                                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                                                        {leave.reason.replace(/^\[(Paid Leave|Unpaid Leave|Extra Time Leave)\]\s*/, '')}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-5 bg-white border-t border-slate-100 flex items-center justify-between">
                            <p className="text-xs text-slate-400">
                                Showing <span className="font-semibold text-slate-600">{filteredHistoryForModal.length}</span> approved leave{filteredHistoryForModal.length !== 1 ? 's' : ''} in {historyYearFilter}
                            </p>
                            <Button
                                onClick={() => setIsHistoryModalOpen(false)}
                                className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-blue-50 text-blue-500 hover:bg-blue-100 border-0 shadow-none"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* Overview Modal */}
            {isOverviewModalOpen && (
                <div 
                    onClick={() => setIsOverviewModalOpen(false)}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-400/30 backdrop-blur-sm animate-in fade-in duration-300"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-[24px] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20 relative"
                    >
                        <div className="bg-indigo-600 p-6 text-white relative">
                            <button
                                onClick={() => setIsOverviewModalOpen(false)}
                                className="absolute top-5 right-5 h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all active:scale-90 z-[50] cursor-pointer group"
                                title="Close Report"
                            >
                                <X size={22} className="text-white group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                            <div className="relative z-10">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-100 mb-1">Consolidated Report</p>
                                <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                                    Leave Overview
                                </h2>
                                <div className="flex items-center gap-4 mt-4">
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-indigo-200 mb-0.5">Timeframe</p>
                                        <p className="text-[10px] font-black">
                                            {histStartDateFilter && histEndDateFilter 
                                                ? `${formatDate(histStartDateFilter)} - ${formatDate(histEndDateFilter)}`
                                                : histMonthFilter 
                                                    ? `Month: ${histMonthFilter}` 
                                                    : 'All Filtered History'}
                                        </p>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-indigo-200 mb-0.5">Total Employees</p>
                                        <p className="text-[10px] font-black">{overviewData.length} Staff</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 max-h-[45vh] overflow-y-auto bg-slate-50/50 custom-scrollbar">
                            {overviewData.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-100">
                                    <AlertCircle size={32} className="mx-auto mb-4 text-slate-200" />
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">No approved records</p>
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-[0.1em] border-b border-slate-100">
                                                <th className="px-5 py-4 text-left">Employee Name</th>
                                                <th className="px-4 py-4 text-center">Full Day Leave</th>
                                                <th className="px-5 py-4 text-right">Half Day Leave</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {overviewData.map((stat, idx) => (
                                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-black text-[10px] group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                                {stat.name.charAt(0)}
                                                            </div>
                                                            <p className="font-bold text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 transition-colors text-[11px]">{stat.name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-black text-[10px] border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                            {formatDisplayDays(stat.fullDays)}
                                                            <span className="text-[8px] opacity-70 uppercase">{stat.fullDays === 1 ? 'Day' : 'Days'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1 rounded-lg font-black text-[10px] border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-all">
                                                            {formatDisplayDays(stat.halfDays)}
                                                            <span className="text-[8px] opacity-70 uppercase">{stat.halfDays === 1 ? 'Day' : 'Days'}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-blue-50 text-slate-600">
                                                <td className="px-5 py-4 font-semibold uppercase tracking-wider text-[9px]">Grand Total</td>
                                                <td className="px-4 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1 text-[11px] font-black">
                                                        {formatDisplayDays(overviewData.reduce((sum, s) => sum + s.fullDays, 0))}
                                                        <span className="text-[8px] text-blue-400 uppercase">Days</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="inline-flex items-center gap-1 text-[11px] font-black">
                                                        {formatDisplayDays(overviewData.reduce((sum, s) => sum + s.halfDays, 0))}
                                                        <span className="text-[8px] text-blue-400 uppercase">Days</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-center">
                            <div className="flex items-center gap-2 text-slate-400">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.1em]">Live Aggregated Overview</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
