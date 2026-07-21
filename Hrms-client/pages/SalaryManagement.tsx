import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, IndianRupee, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SalarySlipPreview } from '../components/SalarySlipPreview';
import { Role, SalarySlipRecord } from '../types';
import { formatDate } from '../services/utils';
import { appAlert } from '../services/appAlert';
import { userAPI } from '../services/api';
import {
  SalarySlipFormData,
  MONTH_NAMES,
  createDefaultFormData,
  formatPayDate,
  formDataToSlipPayload,
} from '../services/salarySlipDefaults';
import { buildAutoSalarySlipForm, getMonthlySalary } from '../services/salarySlipCalc';

const textFields: Array<{ key: keyof SalarySlipFormData; label: string; span?: boolean }> = [
  { key: 'companyName', label: 'Company Name' },
  { key: 'companyAddress', label: 'Company Address', span: true },
  { key: 'empName', label: 'Employee Name' },
  { key: 'empNo', label: 'Employee ID' },
  { key: 'designation', label: 'Designation' },
  { key: 'doj', label: 'Date of Joining' },
  { key: 'payDate', label: 'Pay Date' },
  { key: 'pfNo', label: 'PF A/C Number' },
  { key: 'uan', label: 'UAN' },
];

const earningFields: Array<{ key: keyof SalarySlipFormData; ytdKey: keyof SalarySlipFormData; label: string }> = [
  { key: 'basic', ytdKey: 'ytdBasic', label: 'Basic (Package)' },
  { key: 'fixedAllowance', ytdKey: 'ytdFixedAllowance', label: 'Fixed Allowance' },
];

const deductionFields: Array<{ key: keyof SalarySlipFormData; ytdKey: keyof SalarySlipFormData; label: string }> = [
  { key: 'lopDeduction', ytdKey: 'ytdLopDeduction', label: 'LOP Deduction' },
  { key: 'pTax', ytdKey: 'ytdPTax', label: 'Professional Tax' },
  { key: 'tds', ytdKey: 'ytdTds', label: 'TDS' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export const SalaryManagement: React.FC = () => {
  const { users, leaveRequests, companyHolidays } = useApp();
  const previewRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<SalarySlipFormData>(createDefaultFormData);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const employees = useMemo(
    () =>
      users
        .filter((user) => user.role === Role.EMPLOYEE && user.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const holidayDateSet = useMemo(
    () =>
      new Set(
        companyHolidays.map((holiday) =>
          typeof holiday.date === 'string'
            ? holiday.date.split('T')[0]
            : new Date(holiday.date).toISOString().split('T')[0]
        )
      ),
    [companyHolidays]
  );

  const loadSlipForPeriod = useCallback(
    async (employeeId: string, month: number, year: number) => {
      if (!employeeId) return;
      const employee = employees.find((user) => user.id === employeeId);
      if (!employee) return;

      setIsLoading(true);
      try {
        const response = await userAPI.getUserSalarySlips(employeeId);
        const slips = (response.salarySlips || []) as SalarySlipRecord[];
        const saved = slips.find((slip) => slip.month === month && slip.year === year);

        const autoForm = buildAutoSalarySlipForm({
          employee,
          month,
          year,
          leaveRequests,
          holidayDateSet,
          priorSlips: slips,
          savedSlip: saved || null,
        });

        setForm({
          ...autoForm,
          doj: employee.joiningDate ? formatDate(employee.joiningDate) : autoForm.doj,
        });
      } catch {
        const autoForm = buildAutoSalarySlipForm({
          employee,
          month,
          year,
          leaveRequests,
          holidayDateSet,
        });
        setForm({
          ...autoForm,
          doj: employee.joiningDate ? formatDate(employee.joiningDate) : autoForm.doj,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [employees, leaveRequests, holidayDateSet]
  );

  const handleEmployeeChange = (employeeId: string) => {
    if (!employeeId) {
      setForm((prev) => ({
        ...createDefaultFormData(),
        month: prev.month,
        year: prev.year,
        payDate: formatPayDate(prev.month, prev.year),
      }));
      return;
    }

    loadSlipForPeriod(employeeId, form.month, form.year);
  };

  useEffect(() => {
    if (form.selectedEmployeeId) {
      loadSlipForPeriod(form.selectedEmployeeId, form.month, form.year);
    }
  }, [form.selectedEmployeeId, form.month, form.year, loadSlipForPeriod]);

  const handleSave = async () => {
    if (!form.selectedEmployeeId) {
      appAlert('Please select an employee before saving the salary slip.');
      return;
    }
    if (!form.empName.trim()) {
      appAlert('Employee name is required.');
      return;
    }

    setIsSaving(true);
    try {
      await userAPI.saveSalarySlip(form.selectedEmployeeId, formDataToSlipPayload(form));
      appAlert('Salary slip saved successfully.');
    } catch (error) {
      console.error('Failed to save salary slip:', error);
      appAlert('Failed to save salary slip. Please try again.');
    } finally {
      setIsSaving(false);
    }
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
  const selectedEmployee = employees.find((user) => user.id === form.selectedEmployeeId);

  const payPeriodSelectors = (
    <>
      <div>
        <label className={labelClass}>Month</label>
        <select
          className={inputClass}
          value={form.month}
          onChange={(event) => {
            const month = Number(event.target.value);
            setForm((prev) => ({
              ...prev,
              month,
              payDate: formatPayDate(month, prev.year),
            }));
          }}
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
          onChange={(event) => {
            const year = Number(event.target.value);
            setForm((prev) => ({
              ...prev,
              year,
              payDate: formatPayDate(prev.month, year),
            }));
          }}
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
            Salary is calculated from annual package. Monthly = Package / 12. LOP deduction = (Monthly / 30.42) x unpaid leave days.
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
        {selectedEmployee && (
          <p className="text-xs text-gray-500 mt-3">
            Annual package: <strong>₹{(selectedEmployee.package || 0).toLocaleString('en-IN')}</strong>
            {' · '}
            Monthly salary: <strong>₹{getMonthlySalary(selectedEmployee.package || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
            {!selectedEmployee.package && (
              <span className="text-amber-600 ml-2">Set annual package in employee profile (e.g. 372000).</span>
            )}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title="Salary Slip Form" className="h-full">
          <div className="space-y-6 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {isLoading && (
              <p className="text-sm text-blue-600">Calculating salary slip...</p>
            )}

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Company Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {textFields.slice(0, 2).map(({ key, label, span }) => (
                  <div key={key} className={span ? 'md:col-span-2' : ''}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={inputClass}
                      value={String(form[key])}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, [key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Employee Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {textFields.slice(2).map(({ key, label }) => (
                  <div key={key}>
                    <label className={labelClass}>{label}</label>
                    <input
                      className={inputClass}
                      value={String(form[key])}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, [key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
                {(['paidDays', 'lopDays'] as const).map((key) => (
                  <div key={key}>
                    <label className={labelClass}>
                      {key === 'paidDays' ? 'Paid Days' : 'LOP Days'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      className={`${inputClass} bg-gray-50`}
                      value={form[key]}
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Earnings (Rs.)</h4>
              <div className="space-y-3">
                {earningFields.map(({ key, ytdKey, label }) => (
                  <div key={key} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>{label}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={form[key]}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [key]: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{label} YTD</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={form[ytdKey]}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [ytdKey]: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Deductions (Rs.)</h4>
              <div className="space-y-3">
                {deductionFields.map(({ key, ytdKey, label }) => (
                  <div key={key} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>{label}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={key === 'lopDeduction' ? `${inputClass} bg-gray-50` : inputClass}
                        value={form[key]}
                        readOnly={key === 'lopDeduction'}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [key]: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{label} YTD</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={key === 'lopDeduction' ? `${inputClass} bg-gray-50` : inputClass}
                        value={form[ytdKey]}
                        readOnly={key === 'lopDeduction'}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [ytdKey]: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
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
            action={payPeriodSelectors}
          >
            <div className="overflow-x-auto flex justify-center">
              <SalarySlipPreview form={form} previewRef={previewRef} />
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              onClick={handleSave}
              isLoading={isSaving}
              size="lg"
              variant="secondary"
              className="gap-2"
            >
              <Save size={18} />
              Save Salary Slip
            </Button>
            <Button
              onClick={handleDownloadPdf}
              isLoading={isDownloading}
              size="lg"
              className="gap-2"
            >
              <Download size={18} />
              Download PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
