import React from 'react';
import {
  SalarySlipFormData,
  MONTH_NAMES,
  calculateGrossDeductions,
  calculateGrossEarnings,
  calculateNetSalary,
} from '../services/salarySlipDefaults';
import './SalarySlipPreview.css';

interface SalarySlipPreviewProps {
  form: SalarySlipFormData;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

const formatAmount = (value: number, blankIfZero = false) => {
  if (blankIfZero && (!value || value === 0)) return '';
  if (!Number.isFinite(value)) return '0';
  return String(value);
};

const getFieldValue = (form: SalarySlipFormData, key: keyof SalarySlipFormData) => {
  const value = form[key];
  if (typeof value === 'number') return String(value);
  return value || '';
};

const employeeRows: Array<
  [string, keyof SalarySlipFormData, string, keyof SalarySlipFormData]
> = [
  ['Emp Name', 'empName', 'Emp No', 'empNo'],
  ['Department', 'department', 'DOJ', 'doj'],
  ['Bank', 'bank', 'Bank A/c No', 'bankAccountNo'],
  ['Designation', 'designation', 'PF No', 'pfNo'],
  ['STD days', 'stdDays', 'ESIC No', 'esicNo'],
  ['Worked Days', 'workedDays', 'Leave Balance', 'leaveBalance'],
];

const salaryRows: Array<{
  earning: string;
  earningKey: keyof SalarySlipFormData;
  deduction?: string;
  deductionKey?: keyof SalarySlipFormData;
  deductionBlankIfZero?: boolean;
}> = [
  { earning: 'Basic', earningKey: 'basic', deduction: 'P.F (12%)', deductionKey: 'pf' },
  { earning: 'DA', earningKey: 'da', deduction: 'ESIC (1.75%)', deductionKey: 'esic' },
  { earning: 'Total Wage', earningKey: 'totalWage', deduction: 'P.Tax', deductionKey: 'pTax' },
  { earning: 'HRA', earningKey: 'hra', deduction: 'LWF', deductionKey: 'lwf' },
  {
    earning: 'Medical Reimbursement',
    earningKey: 'medicalReimbursement',
    deduction: 'T.D.S',
    deductionKey: 'tds',
  },
  {
    earning: 'Conveyance',
    earningKey: 'conveyance',
    deduction: 'Advance',
    deductionKey: 'advance',
    deductionBlankIfZero: true,
  },
  { earning: 'LTA', earningKey: 'lta' },
  { earning: 'Education', earningKey: 'education' },
  { earning: 'Special Allow.', earningKey: 'specialAllowance' },
];

const AuthorisedSignature = () => (
  <svg className="scribble" viewBox="0 0 90 46" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8,34 C14,18 18,40 24,26 C28,16 30,30 34,20 C38,10 40,32 46,22 C50,15 54,28 60,18 C64,12 66,24 72,16"
      fill="none"
      stroke="#000"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M20,30 C30,10 40,10 50,26 C56,14 66,14 74,24"
      fill="none"
      stroke="#000"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

const EmployeeSignature = () => (
  <svg className="scribble" viewBox="0 0 90 46" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10,10 C16,26 20,6 26,22 C30,32 34,8 40,20 C46,32 50,10 56,24 C60,34 64,14 70,26 C74,32 78,20 82,28"
      fill="none"
      stroke="#000"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path d="M14,36 L78,36" fill="none" stroke="#000" strokeWidth="1" />
  </svg>
);

export const SalarySlipPreview: React.FC<SalarySlipPreviewProps> = ({ form, previewRef }) => {
  const grossEarnings = calculateGrossEarnings(form);
  const grossDeductions = calculateGrossDeductions(form);
  const netSalary = calculateNetSalary(form);
  const monthLabel = MONTH_NAMES[form.month - 1] || '';

  return (
    <div ref={previewRef} className="payslip">
      <div className="box1">
        <p className="company-name">{form.companyName}</p>
        <p className="company-address">{form.companyAddress}</p>
        <p className="payslip-title">
          Payslip for {monthLabel} {form.year}
        </p>

        <table className="info-table">
          <tbody>
            {employeeRows.map(([leftLabel, leftKey, rightLabel, rightKey], index) => (
              <tr key={`${leftLabel}-${rightLabel}`} className={index === employeeRows.length - 1 ? 'last-row' : ''}>
                <td className="label">{leftLabel}</td>
                <td className="value">{getFieldValue(form, leftKey)}</td>
                <td className="label">{rightLabel}</td>
                <td className="value">{getFieldValue(form, rightKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gap" />

      <table className="earnings-table">
        <colgroup>
          <col className="c1" />
          <col className="c2" />
          <col className="c3" />
          <col className="c4" />
        </colgroup>
        <thead>
          <tr>
            <th className="c1">Earnings</th>
            <th className="c2 amt">Amount In Rs.</th>
            <th className="c3">Statutory Deduction</th>
            <th className="c4 amt">Amount In Rs.</th>
          </tr>
        </thead>
        <tbody>
          {salaryRows.map((row) => (
            <tr key={row.earning}>
              <td className="c1">{row.earning}</td>
              <td className="c2 amt">{formatAmount(form[row.earningKey] as number)}</td>
              <td className="c3">{row.deduction || ''}</td>
              <td className="c4 amt">
                {row.deductionKey
                  ? formatAmount(form[row.deductionKey] as number, row.deductionBlankIfZero)
                  : ''}
              </td>
            </tr>
          ))}

          <tr className="total-row">
            <td className="c1">GROSS EARNINGS</td>
            <td className="c2 amt">{formatAmount(grossEarnings)}</td>
            <td className="c3">GROSS DEDUCTIONS</td>
            <td className="c4 amt">{formatAmount(grossDeductions)}</td>
          </tr>

          <tr>
            <td className="c1">Add: Ex-Gratia Payment</td>
            <td className="c2 amt">{formatAmount(form.exGratia)}</td>
            <td className="c3">Less: Advance etc</td>
            <td className="c4 amt">{formatAmount(form.lessAdvance)}</td>
          </tr>

          <tr className="net-row">
            <td className="c1" />
            <td className="c2 amt" />
            <td className="c3 net-label">NET SALARY EARNED</td>
            <td className="c4 amt net-amt">{formatAmount(netSalary)}</td>
          </tr>
        </tbody>
      </table>

      <div className="gap2" />

      <div className="footer">
        <table className="footer-table">
          <tbody>
            <tr>
              <td style={{ width: '40%' }}>
                <p className="ceo-name">{form.preparedByName}</p>
                <p className="ceo-title">{form.preparedByTitle}</p>
                <p className="prepared-by">Prepared By</p>
              </td>
              <td className="sign-cell">
                <div className="sign-space">
                  <AuthorisedSignature />
                </div>
                <span className="sign-label">Authorised Sign.</span>
              </td>
              <td className="sign-cell">
                <div className="sign-space">
                  <EmployeeSignature />
                </div>
                <span className="sign-label">Employee Sign.</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
