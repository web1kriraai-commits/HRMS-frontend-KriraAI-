export type SalaryCompanyKey = 'kriraai' | 'ondial';

export const SALARY_COMPANIES: Record<
  SalaryCompanyKey,
  {
    label: string;
    companyName: string;
    companyAddress: string;
    logoSrc: string;
    pdfPrefix: string;
  }
> = {
  kriraai: {
    label: 'KriraAI',
    companyName: 'KriraAI Pvt. Ltd.',
    companyAddress:
      'C2-1310, Pragati IT Park, opp. AR Mall, Mota Varachha Road, Uttran, Surat',
    logoSrc: '/images/kriraai-logo.svg',
    pdfPrefix: 'KriraAI',
  },
  ondial: {
    label: 'Ondial',
    companyName: 'Ondial Pvt. Ltd.',
    companyAddress:
      'C2-1310, Pragati IT Park, opp. AR Mall, Mota Varachha Road, Uttran, Surat',
    // Icon paths sourced from https://www.ondial.ai/fav.svg
    logoSrc: '/images/ondial-logo.svg',
    pdfPrefix: 'Ondial',
  },
};

export const SALARY_COMPANY_OPTIONS = (Object.keys(SALARY_COMPANIES) as SalaryCompanyKey[]).map(
  (key) => ({ key, label: SALARY_COMPANIES[key].label })
);

const SALARY_COMPANY_STORAGE_PREFIX = 'hrms_salary_slip_company_';

export const getStoredSalaryCompany = (userId: string): SalaryCompanyKey => {
  try {
    const stored = localStorage.getItem(`${SALARY_COMPANY_STORAGE_PREFIX}${userId}`);
    if (stored === 'ondial' || stored === 'kriraai') return stored;
  } catch {
    // ignore
  }
  return 'kriraai';
};

export const setStoredSalaryCompany = (userId: string, companyKey: SalaryCompanyKey) => {
  try {
    localStorage.setItem(`${SALARY_COMPANY_STORAGE_PREFIX}${userId}`, companyKey);
  } catch {
    // ignore
  }
};

export const resolveCompanyKeyFromForm = (
  form: Pick<SalarySlipFormData, 'companyKey' | 'companyName'>
): SalaryCompanyKey => {
  if (form.companyKey && form.companyKey in SALARY_COMPANIES) {
    return form.companyKey;
  }
  const nameLower = (form.companyName || '').toLowerCase();
  if (nameLower.includes('ondial')) return 'ondial';
  return 'kriraai';
};

export const applyCompanyToForm = (
  form: SalarySlipFormData,
  companyKey: SalaryCompanyKey
): SalarySlipFormData => {
  const company = SALARY_COMPANIES[companyKey];
  return {
    ...form,
    companyKey,
    companyName: company.companyName,
    companyAddress: company.companyAddress,
  };
};

export const getSalaryPdfFilename = (form: SalarySlipFormData) => {
  const company = SALARY_COMPANIES[resolveCompanyKeyFromForm(form)];
  const monthLabel = MONTH_NAMES[form.month - 1] || form.month;
  const safeName = (form.empName || 'Employee')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return `SALARYSLIP ${company.pdfPrefix} ${safeName} ${monthLabel} ${form.year}.pdf`;
};

export interface SalarySlipFormData {
  companyKey?: SalaryCompanyKey;
  companyName: string;
  companyAddress: string;
  selectedEmployeeId: string;
  empName: string;
  empNo: string;
  designation: string;
  doj: string;
  payDate: string;
  pfNo: string;
  uan: string;
  paidDays: number;
  lopDays: number;
  month: number;
  year: number;
  basic: number;
  ytdBasic: number;
  fixedAllowance: number;
  ytdFixedAllowance: number;
  lopDeduction: number;
  ytdLopDeduction: number;
  pTax: number;
  ytdPTax: number;
  tds: number;
  ytdTds: number;
  bondType?: string;
  isWithinBondPeriod?: boolean;
  isPartialBondMonth?: boolean;
}

export const DEFAULT_COMPANY = {
  companyKey: 'kriraai' as SalaryCompanyKey,
  companyName: SALARY_COMPANIES.kriraai.companyName,
  companyAddress: SALARY_COMPANIES.kriraai.companyAddress,
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

export const isFutureSalaryPeriod = (month: number, year: number, referenceDate = new Date()) => {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  return year > currentYear || (year === currentYear && month > currentMonth);
};

export const formatPayDate = (month: number, year: number) => {
  const lastDay = getDaysInMonth(month, year);
  const day = String(lastDay).padStart(2, '0');
  const mon = String(month).padStart(2, '0');
  return `${day}/${mon}/${year}`;
};

export const createDefaultFormData = (): SalarySlipFormData => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = Math.min(2027, Math.max(2024, now.getFullYear()));

  return {
    ...DEFAULT_COMPANY,
    selectedEmployeeId: '',
    empName: '',
    empNo: '',
    designation: '',
    doj: '',
    payDate: formatPayDate(month, year),
    pfNo: 'NA',
    uan: 'NA',
    paidDays: getDaysInMonth(month, year),
    lopDays: 0,
    month,
    year,
    basic: 0,
    ytdBasic: 0,
    fixedAllowance: 0,
    ytdFixedAllowance: 0,
    lopDeduction: 0,
    ytdLopDeduction: 0,
    pTax: 0,
    ytdPTax: 0,
    tds: 0,
    ytdTds: 0,
  };
};

export const calculateGrossEarnings = (form: SalarySlipFormData) =>
  form.basic + form.fixedAllowance;

export const calculateTotalDeductions = (form: SalarySlipFormData) =>
  form.lopDeduction + form.pTax + form.tds;

export const calculateNetPay = (form: SalarySlipFormData) =>
  calculateGrossEarnings(form) - calculateTotalDeductions(form);

export const calculateYtdGross = (form: SalarySlipFormData) =>
  form.ytdBasic + form.ytdFixedAllowance;

export const calculateYtdDeductions = (form: SalarySlipFormData) =>
  form.ytdLopDeduction + form.ytdPTax + form.ytdTds;

export const formatSlipAmount = (value: number, withSymbol = false) => {
  if (!Number.isFinite(value)) return withSymbol ? '₹0.00' : '0.00';
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `₹${formatted}` : formatted;
};

const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigitWords = (n: number): string => {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
};

const threeDigitWords = (n: number): string => {
  if (n === 0) return '';
  if (n < 100) return twoDigitWords(n);
  return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigitWords(n % 100)}` : ''}`.trim();
};

const indianNumberWords = (n: number): string => {
  if (n === 0) return '';
  if (n < 1000) return threeDigitWords(n);

  if (n < 100000) {
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    return `${threeDigitWords(thousands)} Thousand${remainder ? ` ${indianNumberWords(remainder)}` : ''}`.trim();
  }

  if (n < 10000000) {
    const lakhs = Math.floor(n / 100000);
    const remainder = n % 100000;
    return `${threeDigitWords(lakhs)} Lakh${remainder ? ` ${indianNumberWords(remainder)}` : ''}`.trim();
  }

  const crores = Math.floor(n / 10000000);
  const remainder = n % 10000000;
  return `${threeDigitWords(crores)} Crore${remainder ? ` ${indianNumberWords(remainder)}` : ''}`.trim();
};

export const amountToWords = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return 'Indian Rupee Zero Only';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = `Indian Rupee ${indianNumberWords(rupees)}`;
  if (paise > 0) {
    words += ` and ${indianNumberWords(paise)} Paise`;
  }
  return `${words} Only`;
};

/** Map a saved slip record into form data for preview */
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
    companyKey: resolveCompanyKeyFromForm({
      companyKey: slip.companyKey,
      companyName: slip.companyName ?? base.companyName,
    }),
    selectedEmployeeId: overrides?.selectedEmployeeId ?? '',
    empName: slip.empName ?? '',
    empNo: slip.empNo ?? '',
    designation: slip.designation ?? '',
    doj: slip.doj ?? '',
    payDate: slip.payDate ?? formatPayDate(slip.month, slip.year),
    pfNo: slip.pfNo ?? 'NA',
    uan: slip.uan ?? 'NA',
    paidDays: Number(slip.paidDays) || getDaysInMonth(slip.month, slip.year),
    lopDays: Number(slip.lopDays) || 0,
    basic: Number(slip.basic) || 0,
    ytdBasic: Number(slip.ytdBasic) || 0,
    fixedAllowance: Number(slip.fixedAllowance) || 0,
    ytdFixedAllowance: Number(slip.ytdFixedAllowance) || 0,
    lopDeduction: Number(slip.lopDeduction) || 0,
    ytdLopDeduction: Number(slip.ytdLopDeduction) || 0,
    pTax: Number(slip.pTax) || 0,
    ytdPTax: Number(slip.ytdPTax) || 0,
    tds: Number(slip.tds) || 0,
    ytdTds: Number(slip.ytdTds) || 0,
    ...overrides,
  };
};

/** Payload sent to API when Admin/HR saves a slip (excludes UI-only fields) */
export const formDataToSlipPayload = (form: SalarySlipFormData) => ({
  month: form.month,
  year: form.year,
  companyName: form.companyName,
  companyAddress: form.companyAddress,
  empName: form.empName,
  empNo: form.empNo,
  designation: form.designation,
  doj: form.doj,
  payDate: form.payDate,
  pfNo: form.pfNo,
  uan: form.uan,
  paidDays: form.paidDays,
  lopDays: form.lopDays,
  basic: form.basic,
  ytdBasic: form.ytdBasic,
  fixedAllowance: form.fixedAllowance,
  ytdFixedAllowance: form.ytdFixedAllowance,
  lopDeduction: form.lopDeduction,
  ytdLopDeduction: form.ytdLopDeduction,
  pTax: form.pTax,
  ytdPTax: form.ytdPTax,
  tds: form.tds,
  ytdTds: form.ytdTds,
});
