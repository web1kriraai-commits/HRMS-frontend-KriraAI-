import { LeaveCategory, LeaveRequest, LeaveStatus, User, SalarySlipRecord } from '../types';
import { calculateBondRemaining, calculateLeaveDays, getEffectiveLeaveCategory, parseDDMMYYYY } from './utils';
import {
  SalarySlipFormData,
  createDefaultFormData,
  formatPayDate,
  getDaysInMonth,
} from './salarySlipDefaults';

/** Average days per month: 365 / 12 */
export const DAYS_PER_MONTH = 30.42;
export const MONTHS_PER_YEAR = 12;

/** Standard annual CTC for all employees (3.72 lakh INR) */
export const DEFAULT_ANNUAL_PACKAGE = 372000;

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Annual CTC → monthly salary */
export const getMonthlySalary = (annualPackage: number) =>
  Number.isFinite(annualPackage) && annualPackage > 0 ? annualPackage / MONTHS_PER_YEAR : 0;

/** Monthly salary → one day salary for LOP deduction */
export const getDailySalaryFromMonthly = (monthlySalary: number) =>
  monthlySalary > 0 ? monthlySalary / DAYS_PER_MONTH : 0;

/** Monthly salary → one day salary for LOP deduction */
export const getDailySalary = (annualPackage: number) => {
  const monthly = getMonthlySalary(annualPackage);
  return getDailySalaryFromMonthly(monthly);
};

/** LOP deduction for a number of unpaid leave days at the given annual package. */
export const getLopDeductionForDays = (annualPackage: number, lopDays: number) =>
  roundMoney(getDailySalary(annualPackage) * lopDays);

export const getLopDeductionForMonthlySalary = (monthlySalary: number, lopDays: number) =>
  roundMoney(getDailySalaryFromMonthly(monthlySalary) * lopDays);

export interface BondSalaryContext {
  monthlyAmount: number;
  bondType: string | null;
  bondLabel: string | null;
  isWithinBondPeriod: boolean;
  isPartialMonth: boolean;
  designation: string;
}

const getMonthDateRange = (month: number, year: number) => {
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month - 1, getDaysInMonth(month, year));
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getOverlapDays = (
  rangeStart: Date,
  rangeEnd: Date,
  periodStart: Date,
  periodEnd: Date
) => {
  const overlapStart = new Date(Math.max(rangeStart.getTime(), periodStart.getTime()));
  const overlapEnd = new Date(Math.min(rangeEnd.getTime(), periodEnd.getTime()));
  if (overlapStart > overlapEnd) return 0;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

/** Resolve monthly pay and bond context for a calendar month. */
export const getBondSalaryContextForMonth = (
  employee: User,
  month: number,
  year: number
): BondSalaryContext => {
  const breakdownRow = employee.salaryBreakdown?.find(
    (row) => row.month === month && row.year === year
  );

  if (breakdownRow) {
    const breakdownAmount = roundMoney(Number(breakdownRow.amount) || 0);
    if (breakdownAmount > 0) {
      const bondType = breakdownRow.bondType || null;
      return {
        monthlyAmount: breakdownAmount,
        bondType,
        bondLabel: bondType ? `${bondType} Bond` : null,
        isWithinBondPeriod: true,
        isPartialMonth: Boolean(breakdownRow.isPartialMonth),
        designation:
          bondType === 'Internship'
            ? 'Internship'
            : bondType === 'Job'
              ? employee.department || 'Employee'
              : bondType || employee.department || 'Employee',
      };
    }
  }

  if (employee.bonds?.length) {
    const bondInfo = calculateBondRemaining(employee.bonds, employee.joiningDate);
    const { start: monthStart, end: monthEnd } = getMonthDateRange(month, year);
    const daysInMonth = getDaysInMonth(month, year);

    for (const bond of bondInfo.allBonds) {
      const bondStart = parseDDMMYYYY(bond.startDate);
      const bondEnd = bond.endDate;
      if (!bondStart || !bondEnd || isNaN(bondStart.getTime()) || isNaN(bondEnd.getTime())) {
        continue;
      }

      bondStart.setHours(0, 0, 0, 0);
      const overlapDays = getOverlapDays(monthStart, monthEnd, bondStart, bondEnd);
      if (overlapDays <= 0) continue;

      const packageFallback = getMonthlySalary(
        getEmployeeAnnualPackage(employee, month, year)
      );
      const fullMonthly = bond.salary && bond.salary > 0 ? bond.salary : packageFallback;
      const monthlyAmount =
        overlapDays < daysInMonth
          ? roundMoney((fullMonthly / daysInMonth) * overlapDays)
          : roundMoney(fullMonthly);

      return {
        monthlyAmount,
        bondType: bond.type,
        bondLabel: `${bond.type} Bond`,
        isWithinBondPeriod: true,
        isPartialMonth: overlapDays < daysInMonth,
        designation:
          bond.type === 'Internship'
            ? 'Internship'
            : bond.type === 'Job'
              ? employee.department || 'Employee'
              : bond.type,
      };
    }

    return {
      monthlyAmount: 0,
      bondType: null,
      bondLabel: null,
      isWithinBondPeriod: false,
      isPartialMonth: false,
      designation: 'NA',
    };
  }

  const annualPackage = getEmployeeAnnualPackage(employee, month, year);
  return {
    monthlyAmount: roundMoney(getMonthlySalary(annualPackage)),
    bondType: null,
    bondLabel: null,
    isWithinBondPeriod: true,
    isPartialMonth: false,
    designation: employee.department || 'Employee',
  };
};

export const leaveOverlapsMonth = (
  leave: { startDate: string; endDate: string },
  month: number,
  year: number
) => {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthStart = `${monthStr}-01`;
  const monthEnd = `${monthStr}-${String(getDaysInMonth(month, year)).padStart(2, '0')}`;
  return leave.startDate <= monthEnd && leave.endDate >= monthStart;
};

const matchesEmployee = (leaveUserId: string, employeeId: string) =>
  String(leaveUserId) === String(employeeId);

/** Annual package (CTC). Falls back to salary breakdown × 12, then company default. */
export const getEmployeeAnnualPackage = (employee: User, month: number, year: number) => {
  if (Number.isFinite(employee.package) && (employee.package ?? 0) > 0) {
    return employee.package as number;
  }
  const breakdown = employee.salaryBreakdown?.find(
    (row) => row.month === month && row.year === year
  );
  if (breakdown?.amount) return breakdown.amount * MONTHS_PER_YEAR;
  return DEFAULT_ANNUAL_PACKAGE;
};

const isUnpaidLeaveForLop = (leave: LeaveRequest) => {
  const effective = getEffectiveLeaveCategory(leave);
  return (
    effective === LeaveCategory.UNPAID ||
    effective === 'Unpaid Leave' ||
    effective === 'Loss Of Pay' ||
    (effective === LeaveCategory.HALF_DAY &&
      (leave.reason || '').includes('[Unpaid Leave]'))
  );
};

const countLeaveDaysInMonth = (
  leave: LeaveRequest,
  month: number,
  year: number,
  holidayDateSet: Set<string>
) => {
  if (!leaveOverlapsMonth(leave, month, year)) return 0;

  if (leave.category === LeaveCategory.HALF_DAY || leave.category === 'Half Day Leave') {
    return 0.5;
  }

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthStart = `${monthStr}-01`;
  const monthEnd = `${monthStr}-${String(getDaysInMonth(month, year)).padStart(2, '0')}`;
  const rangeStart = leave.startDate > monthStart ? leave.startDate : monthStart;
  const rangeEnd = leave.endDate < monthEnd ? leave.endDate : monthEnd;

  return calculateLeaveDays(rangeStart, rangeEnd, holidayDateSet);
};

/** Approved unpaid leave days in month that reduce salary. */
export const calculateLopDaysInMonth = (
  leaveRequests: LeaveRequest[],
  userId: string,
  month: number,
  year: number,
  holidayDateSet: Set<string>
) =>
  leaveRequests
    .filter(
      (leave) =>
        matchesEmployee(leave.userId, userId) &&
        (leave.status === 'Approved' || leave.status === LeaveStatus.APPROVED) &&
        isUnpaidLeaveForLop(leave)
    )
    .reduce(
      (sum, leave) => sum + countLeaveDaysInMonth(leave, month, year, holidayDateSet),
      0
    );

export const calculateYtdTotals = (
  slips: SalarySlipRecord[],
  month: number,
  year: number
) => {
  const priorSlips = slips.filter((slip) => slip.year === year && slip.month < month);

  return priorSlips.reduce(
    (acc, slip) => ({
      ytdBasic: acc.ytdBasic + (Number(slip.basic) || 0),
      ytdFixedAllowance: acc.ytdFixedAllowance + (Number(slip.fixedAllowance) || 0),
      ytdLopDeduction: acc.ytdLopDeduction + (Number(slip.lopDeduction) || 0),
      ytdPTax: acc.ytdPTax + (Number(slip.pTax) || 0),
      ytdTds: acc.ytdTds + (Number(slip.tds) || 0),
    }),
    {
      ytdBasic: 0,
      ytdFixedAllowance: 0,
      ytdLopDeduction: 0,
      ytdPTax: 0,
      ytdTds: 0,
    }
  );
};

export const buildAutoSalarySlipForm = (params: {
  employee: User;
  month: number;
  year: number;
  leaveRequests: LeaveRequest[];
  holidayDateSet: Set<string>;
  priorSlips?: SalarySlipRecord[];
  savedSlip?: Partial<SalarySlipRecord> | null;
}): SalarySlipFormData => {
  const { employee, month, year, leaveRequests, holidayDateSet, priorSlips = [], savedSlip } =
    params;
  const monthDays = getDaysInMonth(month, year);
  const bondContext = getBondSalaryContextForMonth(employee, month, year);
  const monthlySalary = bondContext.monthlyAmount;
  const lopDays = roundMoney(
    calculateLopDaysInMonth(leaveRequests, employee.id, month, year, holidayDateSet)
  );
  const paidDays = Math.max(0, roundMoney(monthDays - lopDays));
  const lopDeduction = getLopDeductionForMonthlySalary(monthlySalary, lopDays);
  const ytdBefore = calculateYtdTotals(priorSlips, month, year);

  const autoForm: SalarySlipFormData = {
    ...createDefaultFormData(),
    selectedEmployeeId: employee.id,
    empName: employee.name,
    empNo: employee.username || '',
    designation: savedSlip?.designation || bondContext.designation,
    doj: employee.joiningDate || '',
    payDate: formatPayDate(month, year),
    pfNo: savedSlip?.pfNo || 'NA',
    uan: savedSlip?.uan || 'NA',
    month,
    year,
    paidDays,
    lopDays,
    basic: roundMoney(monthlySalary),
    ytdBasic: roundMoney(ytdBefore.ytdBasic + monthlySalary),
    fixedAllowance: roundMoney(Number(savedSlip?.fixedAllowance) || 0),
    ytdFixedAllowance: roundMoney(
      ytdBefore.ytdFixedAllowance + (Number(savedSlip?.fixedAllowance) || 0)
    ),
    lopDeduction,
    ytdLopDeduction: roundMoney(ytdBefore.ytdLopDeduction + lopDeduction),
    pTax: roundMoney(Number(savedSlip?.pTax) || 0),
    ytdPTax: roundMoney(ytdBefore.ytdPTax + (Number(savedSlip?.pTax) || 0)),
    tds: roundMoney(Number(savedSlip?.tds) || 0),
    ytdTds: roundMoney(ytdBefore.ytdTds + (Number(savedSlip?.tds) || 0)),
    bondType: bondContext.bondType || undefined,
    isWithinBondPeriod: bondContext.isWithinBondPeriod,
    isPartialBondMonth: bondContext.isPartialMonth,
  };

  if (savedSlip) {
    const hasSavedAmounts = Number(savedSlip.basic) > 0;
    const savedFinancials = hasSavedAmounts
      ? {
          paidDays: Number(savedSlip.paidDays) || autoForm.paidDays,
          lopDays: Number(savedSlip.lopDays) || autoForm.lopDays,
          basic: roundMoney(Number(savedSlip.basic)),
          ytdBasic: roundMoney(Number(savedSlip.ytdBasic) || autoForm.ytdBasic),
          fixedAllowance: roundMoney(Number(savedSlip.fixedAllowance) || 0),
          ytdFixedAllowance: roundMoney(
            Number(savedSlip.ytdFixedAllowance) || autoForm.ytdFixedAllowance
          ),
          lopDeduction: roundMoney(Number(savedSlip.lopDeduction) || autoForm.lopDeduction),
          ytdLopDeduction: roundMoney(
            Number(savedSlip.ytdLopDeduction) || autoForm.ytdLopDeduction
          ),
          pTax: roundMoney(Number(savedSlip.pTax) || 0),
          ytdPTax: roundMoney(Number(savedSlip.ytdPTax) || autoForm.ytdPTax),
          tds: roundMoney(Number(savedSlip.tds) || 0),
          ytdTds: roundMoney(Number(savedSlip.ytdTds) || autoForm.ytdTds),
        }
      : {};

    return {
      ...autoForm,
      ...savedFinancials,
      companyName: savedSlip.companyName || autoForm.companyName,
      companyAddress: savedSlip.companyAddress || autoForm.companyAddress,
      empName: savedSlip.empName || autoForm.empName,
      empNo: savedSlip.empNo || autoForm.empNo,
      designation: savedSlip.designation || autoForm.designation,
      doj: savedSlip.doj || autoForm.doj,
      payDate: savedSlip.payDate || autoForm.payDate,
      pfNo: savedSlip.pfNo || autoForm.pfNo,
      uan: savedSlip.uan || autoForm.uan,
    };
  }

  return autoForm;
};
