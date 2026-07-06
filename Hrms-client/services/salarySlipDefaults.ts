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
