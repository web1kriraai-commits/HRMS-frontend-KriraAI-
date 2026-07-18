export interface SalarySlipFormData {
  companyName: string;
  companyAddress: string;
  preparedByName: string;
  preparedByTitle: string;
  selectedEmployeeId: string;
  empName: string;
  empNo: string;
  department: string;
  doj: string;
  bank: string;
  bankAccountNo: string;
  designation: string;
  pfNo: string;
  esicNo: string;
  stdDays: number;
  workedDays: number;
  leaveBalance: number;
  month: number;
  year: number;
  basic: number;
  da: number;
  totalWage: number;
  hra: number;
  medicalReimbursement: number;
  conveyance: number;
  lta: number;
  education: number;
  specialAllowance: number;
  pf: number;
  esic: number;
  pTax: number;
  lwf: number;
  tds: number;
  advance: number;
  exGratia: number;
  lessAdvance: number;
}

export const DEFAULT_COMPANY = {
  companyName: 'KriraAI Pvt. Ltd.',
  companyAddress:
    'C2-1310, Pragati IT Park, opp. AR Mall, Mota Varachha Road, Uttran, Surat',
  preparedByName: 'Divyang Mandani',
  preparedByTitle: 'CEO at KriraAI Pvt. Ltd.',
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const getDaysInMonth = (month: number, year: number) =>
  new Date(year, month, 0).getDate();

export const createDefaultFormData = (): SalarySlipFormData => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = Math.min(2027, Math.max(2024, now.getFullYear()));

  return {
    ...DEFAULT_COMPANY,
    selectedEmployeeId: '',
    empName: '',
    empNo: '',
    department: '',
    doj: '',
    bank: '',
    bankAccountNo: '',
    designation: '',
    pfNo: 'NA',
    esicNo: 'NA',
    stdDays: getDaysInMonth(month, year),
    workedDays: 0,
    leaveBalance: 0,
    month,
    year,
    basic: 0,
    da: 0,
    totalWage: 0,
    hra: 0,
    medicalReimbursement: 0,
    conveyance: 0,
    lta: 0,
    education: 0,
    specialAllowance: 0,
    pf: 0,
    esic: 0,
    pTax: 0,
    lwf: 0,
    tds: 0,
    advance: 0,
    exGratia: 0,
    lessAdvance: 0,
  };
};

export const calculateGrossEarnings = (form: SalarySlipFormData) => {
  const wageBase = form.totalWage || form.basic + form.da;
  return (
    wageBase +
    form.hra +
    form.medicalReimbursement +
    form.conveyance +
    form.lta +
    form.education +
    form.specialAllowance
  );
};

export const calculateGrossDeductions = (form: SalarySlipFormData) =>
  form.pf + form.esic + form.pTax + form.lwf + form.tds + form.advance;

export const calculateNetSalary = (form: SalarySlipFormData) =>
  calculateGrossEarnings(form) -
  calculateGrossDeductions(form) +
  form.exGratia -
  form.lessAdvance;

export const formatSlipAmount = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('en-IN') : '0';

/** Map a saved slip record + optional employee info into form data for preview */
export const slipRecordToFormData = (
  slip: Partial<SalarySlipFormData> & { month: number; year: number },
  overrides?: Partial<SalarySlipFormData>
): SalarySlipFormData => {
  const base = createDefaultFormData();
  return {
    ...base,
    ...slip,
    month: slip.month,
    year: slip.year,
    companyName: slip.companyName ?? base.companyName,
    companyAddress: slip.companyAddress ?? base.companyAddress,
    preparedByName: slip.preparedByName ?? base.preparedByName,
    preparedByTitle: slip.preparedByTitle ?? base.preparedByTitle,
    selectedEmployeeId: overrides?.selectedEmployeeId ?? '',
    empName: slip.empName ?? '',
    empNo: slip.empNo ?? '',
    department: slip.department ?? '',
    doj: slip.doj ?? '',
    bank: slip.bank ?? '',
    bankAccountNo: slip.bankAccountNo ?? '',
    designation: slip.designation ?? '',
    pfNo: slip.pfNo ?? 'NA',
    esicNo: slip.esicNo ?? 'NA',
    stdDays: Number(slip.stdDays) || getDaysInMonth(slip.month, slip.year),
    workedDays: Number(slip.workedDays) || 0,
    leaveBalance: Number(slip.leaveBalance) || 0,
    basic: Number(slip.basic) || 0,
    da: Number(slip.da) || 0,
    totalWage: Number(slip.totalWage) || 0,
    hra: Number(slip.hra) || 0,
    medicalReimbursement: Number(slip.medicalReimbursement) || 0,
    conveyance: Number(slip.conveyance) || 0,
    lta: Number(slip.lta) || 0,
    education: Number(slip.education) || 0,
    specialAllowance: Number(slip.specialAllowance) || 0,
    pf: Number(slip.pf) || 0,
    esic: Number(slip.esic) || 0,
    pTax: Number(slip.pTax) || 0,
    lwf: Number(slip.lwf) || 0,
    tds: Number(slip.tds) || 0,
    advance: Number(slip.advance) || 0,
    exGratia: Number(slip.exGratia) || 0,
    lessAdvance: Number(slip.lessAdvance) || 0,
    ...overrides,
  };
};

/** Payload sent to API when Admin/HR saves a slip (excludes UI-only fields) */
export const formDataToSlipPayload = (form: SalarySlipFormData) => ({
  month: form.month,
  year: form.year,
  companyName: form.companyName,
  companyAddress: form.companyAddress,
  preparedByName: form.preparedByName,
  preparedByTitle: form.preparedByTitle,
  empName: form.empName,
  empNo: form.empNo,
  department: form.department,
  doj: form.doj,
  bank: form.bank,
  bankAccountNo: form.bankAccountNo,
  designation: form.designation,
  pfNo: form.pfNo,
  esicNo: form.esicNo,
  stdDays: form.stdDays,
  workedDays: form.workedDays,
  leaveBalance: form.leaveBalance,
  basic: form.basic,
  da: form.da,
  totalWage: form.totalWage,
  hra: form.hra,
  medicalReimbursement: form.medicalReimbursement,
  conveyance: form.conveyance,
  lta: form.lta,
  education: form.education,
  specialAllowance: form.specialAllowance,
  pf: form.pf,
  esic: form.esic,
  pTax: form.pTax,
  lwf: form.lwf,
  tds: form.tds,
  advance: form.advance,
  exGratia: form.exGratia,
  lessAdvance: form.lessAdvance,
});