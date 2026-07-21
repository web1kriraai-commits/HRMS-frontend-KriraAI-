import { LeaveCategory, LeaveRequest, LeaveStatus, User, SalarySlipRecord } from '../types';
import { calculateLeaveDays, getEffectiveLeaveCategory } from './utils';
import {
  SalarySlipFormData,
  createDefaultFormData,
  formatPayDate,
  getDaysInMonth,
} from './salarySlipDefaults';

/** Average days per month: 365 / 12 */
export const DAYS_PER_MONTH = 30.42;
export const MONTHS_PER_YEAR = 12;

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Annual CTC → monthly salary */
export const getMonthlySalary = (annualPackage: number) =>
  Number.isFinite(annualPackage) && annualPackage > 0 ? annualPackage / MONTHS_PER_YEAR : 0;

/** Monthly salary → one day salary for LOP deduction */
export const getDailySalary = (annualPackage: number) => {
  const monthly = getMonthlySalary(annualPackage);
  return monthly > 0 ? monthly / DAYS_PER_MONTH : 0;
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

/** Annual package (CTC). Falls back to salary breakdown × 12 if set monthly there. */
export const getEmployeeAnnualPackage = (employee: User, month: number, year: number) => {
  if (Number.isFinite(employee.package) && (employee.package ?? 0) > 0) {
    return employee.package as number;
  }
  const breakdown = employee.salaryBreakdown?.find(
    (row) => row.month === month && row.year === year
  );
  return breakdown?.amount ? breakdown.amount * MONTHS_PER_YEAR : 0;
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
  const annualPackage = getEmployeeAnnualPackage(employee, month, year);
  const monthlySalary = getMonthlySalary(annualPackage);
  const lopDays = roundMoney(
    calculateLopDaysInMonth(leaveRequests, employee.id, month, year, holidayDateSet)
  );
  const paidDays = Math.max(0, roundMoney(monthDays - lopDays));
  const dailySalary = getDailySalary(annualPackage);
  const lopDeduction = roundMoney(dailySalary * lopDays);
  const ytdBefore = calculateYtdTotals(priorSlips, month, year);

  const autoForm: SalarySlipFormData = {
    ...createDefaultFormData(),
    selectedEmployeeId: employee.id,
    empName: employee.name,
    empNo: employee.username || '',
    designation: savedSlip?.designation || 'NA',
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
  };

  if (savedSlip) {
    return {
      ...autoForm,
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
