import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, IndianRupee } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SalarySlipPreview } from '../components/SalarySlipPreview';
import { Role } from '../types';
import { formatDate } from '../services/utils';
import { appAlert } from '../services/appAlert';
import {
  SalarySlipFormData,
  MONTH_NAMES,
  createDefaultFormData,
  getDaysInMonth,
} from '../services/salarySlipDefaults';

const textFields: Array<{ key: keyof SalarySlipFormData; label: string }> = [
  { key: 'companyName', label: 'Company Name' },
  { key: 'companyAddress', label: 'Company Address' },
  { key: 'preparedByName', label: 'Prepared By Name' },
  { key: 'preparedByTitle', label: 'Prepared By Title' },
  { key: 'empName', label: 'Employee Name' },
  { key: 'empNo', label: 'Employee No' },
  { key: 'department', label: 'Department' },
  { key: 'doj', label: 'Date of Joining' },
  { key: 'bank', label: 'Bank Name' },
  { key: 'bankAccountNo', label: 'Bank Account No' },
  { key: 'designation', label: 'Designation' },
  { key: 'pfNo', label: 'PF No' },
  { key: 'esicNo', label: 'ESIC No' },
];

const earningFields: Array<{ key: keyof SalarySlipFormData; label: string }> = [
  { key: 'basic', label: 'Basic' },
  { key: 'da', label: 'DA' },
  { key: 'totalWage', label: 'Total Wage' },
  { key: 'hra', label: 'HRA' },
  { key: 'medicalReimbursement', label: 'Medical Reimbursement' },
  { key: 'conveyance', label: 'Conveyance' },
  { key: 'lta', label: 'LTA' },
  { key: 'education', label: 'Education' },
  { key: 'specialAllowance', label: 'Special Allow.' },
];

const deductionFields: Array<{ key: keyof SalarySlipFormData; label: string }> = [
  { key: 'pf', label: 'P.F (12%)' },
  { key: 'esic', label: 'ESIC (1.75%)' },
  { key: 'pTax', label: 'P.Tax' },
  { key: 'lwf', label: 'LWF' },
  { key: 'tds', label: 'T.D.S' },
  { key: 'advance', label: 'Advance' },
  { key: 'exGratia', label: 'Ex-Gratia Payment' },
  { key: 'lessAdvance', label: 'Less: Advance etc' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export const SalaryManagement: React.FC = () => {
  const { users } = useApp();
  const previewRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<SalarySlipFormData>(createDefaultFormData);
  const [isDownloading, setIsDownloading] = useState(false);

  const employees = useMemo(
    () =>
      users
        .filter((user) => user.role === Role.EMPLOYEE && user.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const updateField = <K extends keyof SalarySlipFormData>(key: K, value: SalarySlipFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'month' || key === 'year') {
        const month = key === 'month' ? (value as number) : prev.month;
        const year = key === 'year' ? (value as number) : prev.year;
        next.stdDays = getDaysInMonth(month, year);
      }

      return next;
    });
  };

  const handleEmployeeChange = (employeeId: string) => {
    const employee = employees.find((user) => user.id === employeeId);

    if (!employee) {
      setForm((prev) => ({
        ...prev,
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
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      selectedEmployeeId: employee.id,
      empName: employee.name,
      empNo: employee.username || '',
      department: employee.department || '',
      doj: employee.joiningDate ? formatDate(employee.joiningDate) : '',
      bank: employee.bankName || 'NA',
      bankAccountNo: employee.bankAccountNumber || 'NA',
      designation: prev.designation || 'NA',
      pfNo: 'NA',
      esicNo: 'NA',
    }));
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;

    if (!form.empName.trim()) {
      appAlert('Please select an employee before downloading the salary slip.');
      return;
    }

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
      const safeName = form.empName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ');
      pdf.save(`SALARYSLIP KriraAI ${safeName} ${monthLabel} ${form.year}.pdf`);
    } catch (error) {
      console.error('Failed to generate salary slip PDF:', error);
      appAlert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const yearOptions = useMemo(() => [2024, 2025, 2026, 2027], []);

  const payPeriodSelectors = (
    <>
      <div>
        <label className={labelClass}>Month</label>
        <select
          className={inputClass}
          value={form.month}
          onChange={(event) => updateField('month', Number(event.target.value))}
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
          value={form.year}
          onChange={(event) => updateField('year', Number(event.target.value))}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <IndianRupee size={24} className="text-blue-600" />
            Salary Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate and download employee salary slips in PDF format.
          </p>
        </div>
      </div>

      <Card title="Salary Slip Selection" bodyClassName="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Select Employee</label>
            <select
              className={inputClass}
              value={form.selectedEmployeeId}
              onChange={(event) => handleEmployeeChange(event.target.value)}
            >
              <option value="">Choose employee...</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.username})
                </option>
              ))}
            </select>
          </div>
          {payPeriodSelectors}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title="Salary Slip Form" className="h-full">
          <div className="space-y-6 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Company Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {textFields.slice(0, 4).map(({ key, label }) => (
                  <div key={key} className={key === 'companyAddress' ? 'md:col-span-2' : ''}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={inputClass}
                      value={String(form[key])}
                      onChange={(event) => updateField(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Employee Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {textFields.slice(4).map(({ key, label }) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={inputClass}
                      value={String(form[key])}
                      onChange={(event) => updateField(key, event.target.value)}
                    />
                  </div>
                ))}
                {(['stdDays', 'workedDays', 'leaveBalance'] as const).map((key) => (
                  <div key={key}>
                    <label className={labelClass}>
                      {key === 'stdDays'
                        ? 'STD Days'
                        : key === 'workedDays'
                          ? 'Worked Days'
                          : 'Leave Balance'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={form[key]}
                      onChange={(event) => updateField(key, Number(event.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Earnings (Rs.)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {earningFields.map(({ key, label }) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={form[key]}
                      onChange={(event) => updateField(key, Number(event.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Deductions & Adjustments (Rs.)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {deductionFields.map(({ key, label }) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={form[key]}
                      onChange={(event) => updateField(key, Number(event.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title="Salary Slip Preview"
            bodyClassName="p-4 bg-white"
            action={
              <div className="flex items-end gap-2">
                <div>
                  <label className={labelClass}>Month</label>
                  <select
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.month}
                    onChange={(event) => updateField('month', Number(event.target.value))}
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
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.year}
                    onChange={(event) => updateField('year', Number(event.target.value))}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            }
          >
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
      </div>
    </div>
  );
};
