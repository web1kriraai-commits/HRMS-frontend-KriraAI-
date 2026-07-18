import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, IndianRupee } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SalarySlipPreview } from '../components/SalarySlipPreview';
import { formatDate } from '../services/utils';
import { appAlert } from '../services/appAlert';
import { User } from '../types';
import {
  SalarySlipFormData,
  MONTH_NAMES,
  DEFAULT_COMPANY,
  getDaysInMonth,
  createDefaultFormData,
} from '../services/salarySlipDefaults';

/** Temporary static monthly salary until payroll amounts are managed in the system */
const STATIC_MONTHLY_SALARY = 10000;

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

const buildEmployeeSlipForm = (user: User, month: number, year: number): SalarySlipFormData => {
  const base = createDefaultFormData();
  return {
    ...base,
    ...DEFAULT_COMPANY,
    selectedEmployeeId: user.id,
    empName: user.name || '',
    empNo: user.username || '',
    department: user.department || '',
    doj: user.joiningDate ? formatDate(user.joiningDate) : '',
    bank: user.bankName || 'NA',
    bankAccountNo: user.bankAccountNumber || 'NA',
    designation: 'NA',
    pfNo: 'NA',
    esicNo: 'NA',
    stdDays: getDaysInMonth(month, year),
    workedDays: getDaysInMonth(month, year),
    leaveBalance: 0,
    month,
    year,
    basic: STATIC_MONTHLY_SALARY,
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

export const EmployeeSalarySlip: React.FC = () => {
  const { auth } = useApp();
  const user = auth.user;
  const previewRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(Math.min(2027, Math.max(2024, now.getFullYear())));
  const [isDownloading, setIsDownloading] = useState(false);

  const yearOptions = useMemo(() => [2024, 2025, 2026, 2027], []);

  const form = useMemo(() => {
    if (!user) return null;
    return buildEmployeeSlipForm(user, month, year);
  }, [user, month, year]);

  const handleDownloadPdf = async () => {
    if (!previewRef.current || !form) return;

    setIsDownloading(true);
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const x = 10;
      const y = imgHeight > pageHeight - 20 ? 10 : (pageHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, Math.min(imgHeight, pageHeight - 20));

      const monthLabel = MONTH_NAMES[form.month - 1] || form.month;
      const safeName = (form.empName || 'Employee')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
      pdf.save(`SALARYSLIP KriraAI ${safeName} ${monthLabel} ${form.year}.pdf`);
    } catch (error) {
      console.error('Failed to generate salary slip PDF:', error);
      appAlert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">Please log in to view your salary slip.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <IndianRupee size={24} className="text-blue-600" />
          My Salary Slip
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a month and year to preview your salary slip. Details are read-only.
        </p>
      </div>

      <Card title="Select Period" bodyClassName="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className={labelClass}>Month</label>
            <select
              className={inputClass}
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Year</label>
            <select
              className={inputClass}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {form && (
        <div className="space-y-4">
          <Card title="Salary Slip Preview" bodyClassName="p-4 bg-white">
            <div className="overflow-x-auto flex justify-center">
              <SalarySlipPreview form={form} previewRef={previewRef} />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleDownloadPdf}
              isLoading={isDownloading}
              size="lg"
              className="gap-2"
            >
              <Download size={18} />
              Download Salary Slip (PDF)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
