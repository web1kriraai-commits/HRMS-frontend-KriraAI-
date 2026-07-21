import React from 'react';
import {
  SalarySlipFormData,
  MONTH_NAMES,
  calculateGrossEarnings,
  calculateTotalDeductions,
  calculateNetPay,
  formatSlipAmount,
  amountToWords,
} from '../services/salarySlipDefaults';
import './SalarySlipPreview.css';

interface SalarySlipPreviewProps {
  form: SalarySlipFormData;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

const earningRows: Array<{
  label: string;
  amountKey: keyof SalarySlipFormData;
  ytdKey: keyof SalarySlipFormData;
}> = [
  { label: 'Basic', amountKey: 'basic', ytdKey: 'ytdBasic' },
  { label: 'Fixed Allowance', amountKey: 'fixedAllowance', ytdKey: 'ytdFixedAllowance' },
];

const deductionRows: Array<{
  label: string;
  amountKey: keyof SalarySlipFormData;
  ytdKey: keyof SalarySlipFormData;
}> = [
  { label: 'LOP Deduction', amountKey: 'lopDeduction', ytdKey: 'ytdLopDeduction' },
  { label: 'Professional Tax', amountKey: 'pTax', ytdKey: 'ytdPTax' },
  { label: 'TDS', amountKey: 'tds', ytdKey: 'ytdTds' },
];

const KriraAILogo = () => (
  <img
    src="/images/kriraai-logo.svg"
    alt="KriraAI"
    className="company-logo"
  />
);

export const SalarySlipPreview: React.FC<SalarySlipPreviewProps> = ({ form, previewRef }) => {
  const grossEarnings = calculateGrossEarnings(form);
  const totalDeductions = calculateTotalDeductions(form);
  const netPay = calculateNetPay(form);
  const monthLabel = MONTH_NAMES[form.month - 1] || '';
  const payPeriod = `${monthLabel} ${form.year}`;
  const maxRows = Math.max(earningRows.length, deductionRows.length);

  return (
    <div ref={previewRef} className="payslip">
      <div className="payslip-header">
        <div className="header-left">
          <KriraAILogo />
          <div className="header-company">
            <p className="company-address">{form.companyAddress}</p>
          </div>
        </div>
        <div className="header-right">
          <p className="payslip-title-label">Payslip For the Month</p>
          <p className="payslip-title-month">
            {monthLabel} {form.year}
          </p>
        </div>
      </div>

      <div className="summary-section">
        <div className="employee-details">
          <div className="detail-row">
            <span className="detail-label">Employee Name</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{form.empName || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Designation</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{form.designation || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Employee ID</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{form.empNo || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Date of Joining</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{form.doj || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Pay Period</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{payPeriod}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Pay Date</span>
            <span className="detail-colon">:</span>
            <span className="detail-value">{form.payDate || '—'}</span>
          </div>
        </div>

        <div className="net-pay-card">
          <div className="net-pay-green">
            <p className="net-pay-amount">{formatSlipAmount(netPay, true)}</p>
            <p className="net-pay-label">Employee Net Pay</p>
          </div>
          <div className="net-pay-white">
            <div className="meta-row">
              <span className="meta-label">Paid Days</span>
              <span className="meta-value">{form.paidDays}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">LOP Days</span>
              <span className="meta-value">{form.lopDays}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="id-section">
        <div className="id-item">
          <span className="id-label">PF A/C Number</span>
          <span className="id-colon">:</span>
          <span className="id-value">{form.pfNo || 'NA'}</span>
        </div>
        <div className="id-item">
          <span className="id-label">UAN</span>
          <span className="id-colon">:</span>
          <span className="id-value">{form.uan || 'NA'}</span>
        </div>
      </div>

      <table className="salary-table">
        <thead>
          <tr>
            <th className="col-name th-earn">EARNINGS</th>
            <th className="col-amt">AMOUNT</th>
            <th className="col-ytd th-divider-right">YTD</th>
            <th className="col-name th-ded">DEDUCTIONS</th>
            <th className="col-amt">AMOUNT</th>
            <th className="col-ytd">YTD</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, index) => {
            const earning = earningRows[index];
            const deduction = deductionRows[index];
            return (
              <tr key={index}>
                <td className="col-name">{earning?.label || ''}</td>
                <td className="col-amt">
                  {earning ? formatSlipAmount(form[earning.amountKey] as number, true) : ''}
                </td>
                <td className="col-ytd td-divider-right">
                  {earning ? formatSlipAmount(form[earning.ytdKey] as number, true) : ''}
                </td>
                <td className="col-name">{deduction?.label || ''}</td>
                <td className="col-amt">
                  {deduction ? formatSlipAmount(form[deduction.amountKey] as number, true) : ''}
                </td>
                <td className="col-ytd">
                  {deduction ? formatSlipAmount(form[deduction.ytdKey] as number, true) : ''}
                </td>
              </tr>
            );
          })}

          <tr className="total-row">
            <td className="col-name total-label">Gross Earnings</td>
            <td className="col-amt total-amt">{formatSlipAmount(grossEarnings, true)}</td>
            <td className="col-ytd td-divider-right" />
            <td className="col-name total-label">Total Deductions</td>
            <td className="col-amt total-amt">{formatSlipAmount(totalDeductions, true)}</td>
            <td className="col-ytd" />
          </tr>
        </tbody>
      </table>

      <div className="net-payable-box">
        <div className="net-payable-left">
          <p className="net-payable-title">TOTAL NET PAYABLE</p>
          <p className="net-payable-sub">Gross Earnings - Total Deductions</p>
        </div>
        <div className="net-payable-right">
          <span className="net-payable-amt">{formatSlipAmount(netPay, true)}</span>
        </div>
      </div>

      <p className="amount-in-words">
        Amount In Words : <strong>{amountToWords(netPay)}</strong>
      </p>

      <p className="footer-note">
        -- This document has been automatically generated by KriraAI HRMS; therefore, a signature is
        not required. --
      </p>
    </div>
  );
};
