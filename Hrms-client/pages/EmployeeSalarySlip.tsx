import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, IndianRupee } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SalarySlipPreview } from '../components/SalarySlipPreview';
import { appAlert } from '../services/appAlert';
import { userAPI } from '../services/api';
import { formatDate } from '../services/utils';
import {
  SalarySlipFormData,
  SalaryCompanyKey,
  MONTH_NAMES,
  SALARY_COMPANY_OPTIONS,
  applyCompanyToForm,
  getSalaryPdfFilename,
  getStoredSalaryCompany,
  isFutureSalaryPeriod,
  setStoredSalaryCompany,
} from '../services/salarySlipDefaults';
import { buildAutoSalarySlipForm } from '../services/salarySlipCalc';
import { downloadSalarySlipPdf } from '../services/salarySlipPdf';
import { SalarySlipRecord } from '../types';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export const EmployeeSalarySlip: React.FC = () => {
  const { auth, leaveRequests, companyHolidays } = useApp();
  const user = auth.user;
  const previewRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(Math.min(2027, Math.max(2024, currentYear)));
  const [companyKey, setCompanyKey] = useState<SalaryCompanyKey>(() =>
    user ? getStoredSalaryCompany(user.id) : 'kriraai'
  );
  const companyKeyRef = useRef(companyKey);
  companyKeyRef.current = companyKey;
  const [form, setForm] = useState<SalarySlipFormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFuturePeriod, setIsFuturePeriod] = useState(false);
  const [isOutsideBondPeriod, setIsOutsideBondPeriod] = useState(false);
  const [noSlipFound, setNoSlipFound] = useState(false);

  const yearOptions = useMemo(
    () => [2024, 2025, 2026, 2027].filter((y) => y <= currentYear),
    [currentYear]
  );

  const availableMonths = useMemo(() => {
    return MONTH_NAMES.map((name, index) => {
      const value = index + 1;
      const disabled = isFutureSalaryPeriod(value, year);
      return { name, value, disabled };
    }).filter((item) => !item.disabled);
  }, [year]);

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

  useEffect(() => {
    if (isFutureSalaryPeriod(month, year)) {
      const latestMonth = year === currentYear ? currentMonth : 12;
      setMonth(latestMonth);
    }
  }, [year, month, currentYear, currentMonth]);

  useEffect(() => {
    if (!user) return;

    const loadSlip = async () => {
      if (isFutureSalaryPeriod(month, year)) {
        setForm(null);
        setIsFuturePeriod(true);
        setNoSlipFound(false);
        return;
      }

      setIsLoading(true);
      setNoSlipFound(false);
      setIsFuturePeriod(false);
      setIsOutsideBondPeriod(false);
      setForm(null);

      try {
        let savedSlip: SalarySlipRecord | null = null;
        try {
          const response = await userAPI.getMySalarySlip(month, year);
          savedSlip = response.salarySlip || null;
        } catch {
          savedSlip = null;
        }

        let priorSlips: SalarySlipRecord[] = user.salarySlips || [];
        try {
          const allSlips = await userAPI.getMySalarySlips();
          priorSlips = (allSlips.salarySlips || []) as SalarySlipRecord[];
        } catch {
          // use profile slips
        }

        const autoForm = buildAutoSalarySlipForm({
          employee: user,
          month,
          year,
          leaveRequests,
          holidayDateSet,
          priorSlips,
          savedSlip,
        });

        if (autoForm.isWithinBondPeriod === false) {
          setIsOutsideBondPeriod(true);
          return;
        }

        if (!savedSlip && !autoForm.basic && autoForm.lopDays === 0) {
          setNoSlipFound(true);
          return;
        }

        setForm(
          applyCompanyToForm(
            {
              ...autoForm,
              doj: user.joiningDate ? formatDate(user.joiningDate) : autoForm.doj,
            },
            companyKeyRef.current
          )
        );
      } catch (error: any) {
        if (error?.message?.includes('future')) {
          setIsFuturePeriod(true);
          setNoSlipFound(false);
        } else {
          setNoSlipFound(true);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSlip();
  }, [user, month, year, leaveRequests, holidayDateSet]);

  const handleCompanyChange = (nextCompanyKey: SalaryCompanyKey) => {
    setCompanyKey(nextCompanyKey);
    if (user) {
      setStoredSalaryCompany(user.id, nextCompanyKey);
    }
    setForm((prev) => (prev ? applyCompanyToForm(prev, nextCompanyKey) : null));
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current || !form || isFutureSalaryPeriod(month, year)) {
      appAlert('Salary slips for future periods cannot be downloaded.');
      return;
    }

    setIsDownloading(true);
    try {
      await downloadSalarySlipPdf(previewRef.current, getSalaryPdfFilename(form));
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
          Select a month and year to preview and download your salary slip.
        </p>
      </div>

      <Card title="Select Period" bodyClassName="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
          <div>
            <label className={labelClass}>Company</label>
            <select
              className={inputClass}
              value={companyKey}
              onChange={(event) => handleCompanyChange(event.target.value as SalaryCompanyKey)}
            >
              {SALARY_COMPANY_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Month</label>
            <select
              className={inputClass}
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {availableMonths.map(({ name, value }) => (
                <option key={name} value={value}>
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

      {isLoading && (
        <div className="flex items-center justify-center min-h-[20vh]">
          <p className="text-gray-500">Loading salary slip...</p>
        </div>
      )}

      {!isLoading && isFuturePeriod && (
        <Card bodyClassName="p-8 text-center">
          <p className="text-gray-500">
            Salary slips for future months are not available.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Please select the current month or an earlier period.
          </p>
        </Card>
      )}

      {!isLoading && isOutsideBondPeriod && (
        <Card bodyClassName="p-8 text-center">
          <p className="text-gray-500">
            No salary slip available for {MONTH_NAMES[month - 1]} {year}.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            This month is outside your bond period. Salary slips are only available during your active bond dates.
          </p>
        </Card>
      )}

      {!isLoading && !isFuturePeriod && !isOutsideBondPeriod && noSlipFound && (
        <Card bodyClassName="p-8 text-center">
          <p className="text-gray-500">
            No salary slip found for {MONTH_NAMES[month - 1]} {year}.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Please contact HR or Admin if you believe this is an error.
          </p>
        </Card>
      )}

      {!isLoading && !isFuturePeriod && !isOutsideBondPeriod && form && (
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
