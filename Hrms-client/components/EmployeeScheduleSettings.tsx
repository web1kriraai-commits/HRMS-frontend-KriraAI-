import React, { useEffect, useMemo, useState } from 'react';
import { Role, SystemSettings, User } from '../types';
import { Button } from './ui/Button';
import {
  formatCheckoutTimeLabel,
  getDateStrInTimezone,
  parseCheckInTime,
  parseCheckoutTime
} from '../services/utils';
import { Trash2 } from 'lucide-react';
import { appAlert } from '../services/appAlert';

type ScheduleUpdates = {
  defaultCheckInTime?: string | null;
  defaultCheckoutTime?: string | null;
  setCheckInOverride?: { date: string; time: string };
  removeCheckInOverrideDate?: string;
  setCheckoutOverride?: { date: string; time: string };
  removeCheckoutOverrideDate?: string;
  clearCheckInSchedule?: boolean;
  clearCheckoutSchedule?: boolean;
};

type Props = {
  users: User[];
  systemSettings: SystemSettings;
  updateUser: (id: string, updates: ScheduleUpdates) => Promise<void>;
};

export const EmployeeScheduleSettings: React.FC<Props> = ({
  users,
  systemSettings,
  updateUser
}) => {
  const companyToday = getDateStrInTimezone(new Date(), systemSettings.timezone);
  const employeeOptions = useMemo(
    () =>
      users
        .filter((u) => u.role !== Role.ADMIN && u.isActive !== false)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const selectedEmployee = useMemo(
    () => employeeOptions.find((u) => u.id === selectedEmployeeId) || null,
    [employeeOptions, selectedEmployeeId]
  );

  const [checkInDefault, setCheckInDefault] = useState(
    systemSettings.defaultCheckInTime || '08:30'
  );
  const [checkoutDefault, setCheckoutDefault] = useState(
    systemSettings.defaultCheckoutTime || '17:30'
  );
  const [checkInOverrideDate, setCheckInOverrideDate] = useState(companyToday);
  const [checkInOverrideTime, setCheckInOverrideTime] = useState('08:30');
  const [checkoutOverrideDate, setCheckoutOverrideDate] = useState(companyToday);
  const [checkoutOverrideTime, setCheckoutOverrideTime] = useState('17:30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedEmployee) {
      setCheckInDefault(systemSettings.defaultCheckInTime || '08:30');
      setCheckoutDefault(systemSettings.defaultCheckoutTime || '17:30');
      return;
    }
    setCheckInDefault(
      selectedEmployee.defaultCheckInTime || systemSettings.defaultCheckInTime || '08:30'
    );
    setCheckoutDefault(
      selectedEmployee.defaultCheckoutTime || systemSettings.defaultCheckoutTime || '17:30'
    );
  }, [selectedEmployee, systemSettings.defaultCheckInTime, systemSettings.defaultCheckoutTime]);

  const checkInOverrides = selectedEmployee?.checkInTimeOverrides || {};
  const checkoutOverrides = selectedEmployee?.checkoutTimeOverrides || {};
  const sortedCheckInOverrideDates = Object.keys(checkInOverrides)
    .filter((date) => date >= companyToday)
    .sort();
  const sortedCheckoutOverrideDates = Object.keys(checkoutOverrides)
    .filter((date) => date >= companyToday)
    .sort();

  const requireEmployee = () => {
    if (!selectedEmployee) {
      appAlert('Please select an employee first.');
      return false;
    }
    return true;
  };

  const handleSaveCheckInDefault = async () => {
    if (!requireEmployee()) return;
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { defaultCheckInTime: checkInDefault });
      appAlert(`Check-in default saved for ${selectedEmployee!.name}.`);
    } catch (e: any) {
      appAlert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCheckIn = async () => {
    if (!requireEmployee()) return;
    if (
      !confirm(
        `Clear custom check-in schedule for ${selectedEmployee!.name}? They will use the company default.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { clearCheckInSchedule: true });
      appAlert(`Check-in schedule cleared for ${selectedEmployee!.name}.`);
    } catch (e: any) {
      appAlert(e.message || 'Failed to clear');
    } finally {
      setSaving(false);
    }
  };

  const handleSetCheckInOverride = async () => {
    if (!requireEmployee()) return;
    if (!checkInOverrideDate) {
      appAlert('Please select a date.');
      return;
    }
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, {
        setCheckInOverride: { date: checkInOverrideDate, time: checkInOverrideTime }
      });
      appAlert(
        `Check-in for ${selectedEmployee!.name} on ${checkInOverrideDate} set to ${checkInOverrideTime}.`
      );
      setCheckInOverrideDate(companyToday);
    } catch (e: any) {
      appAlert(e.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCheckInOverride = async (date: string) => {
    if (!requireEmployee()) return;
    if (!confirm(`Remove custom check-in time for ${selectedEmployee!.name} on ${date}?`)) return;
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { removeCheckInOverrideDate: date });
    } catch (e: any) {
      appAlert(e.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCheckoutDefault = async () => {
    if (!requireEmployee()) return;
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { defaultCheckoutTime: checkoutDefault });
      appAlert(`Checkout default saved for ${selectedEmployee!.name}.`);
    } catch (e: any) {
      appAlert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCheckout = async () => {
    if (!requireEmployee()) return;
    if (
      !confirm(
        `Clear custom checkout schedule for ${selectedEmployee!.name}? They will use the company default.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { clearCheckoutSchedule: true });
      appAlert(`Checkout schedule cleared for ${selectedEmployee!.name}.`);
    } catch (e: any) {
      appAlert(e.message || 'Failed to clear');
    } finally {
      setSaving(false);
    }
  };

  const handleSetCheckoutOverride = async () => {
    if (!requireEmployee()) return;
    if (!checkoutOverrideDate) {
      appAlert('Please select a date.');
      return;
    }
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, {
        setCheckoutOverride: { date: checkoutOverrideDate, time: checkoutOverrideTime }
      });
      appAlert(
        `Checkout for ${selectedEmployee!.name} on ${checkoutOverrideDate} set to ${checkoutOverrideTime}.`
      );
      setCheckoutOverrideDate(companyToday);
    } catch (e: any) {
      appAlert(e.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCheckoutOverride = async (date: string) => {
    if (!requireEmployee()) return;
    if (!confirm(`Remove custom checkout time for ${selectedEmployee!.name} on ${date}?`)) return;
    setSaving(true);
    try {
      await updateUser(selectedEmployee!.id, { removeCheckoutOverrideDate: date });
    } catch (e: any) {
      appAlert(e.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const checkInParsed = parseCheckInTime(checkInDefault);
  const checkoutParsed = parseCheckoutTime(checkoutDefault);
  const hasCustomCheckIn = Boolean(selectedEmployee?.defaultCheckInTime);
  const hasCustomCheckout = Boolean(selectedEmployee?.defaultCheckoutTime);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Select employee</label>
        <p className="text-xs text-gray-500 mb-3">
          Set check-in / checkout times for one person. Company-wide day overrides still apply unless
          this employee has a day-specific override of their own.
        </p>
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          aria-label="Select employee"
        >
          <option value="">Select employee…</option>
          {employeeOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.department ? ` (${u.department})` : ''}
              {u.defaultCheckInTime || u.defaultCheckoutTime ? ' — custom schedule' : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedEmployee ? (
        <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-4">
          Choose an employee to view or change their check-in and checkout times.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
            Editing schedule for <span className="font-semibold">{selectedEmployee.name}</span>
            {selectedEmployee.department ? ` · ${selectedEmployee.department}` : ''}
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Check-in column */}
            <div className="space-y-6 min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 sm:p-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Default check-in time
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  {hasCustomCheckIn ? (
                    <>
                      Custom default unlocks check-in at{' '}
                      <span className="font-semibold">
                        {formatCheckoutTimeLabel(checkInParsed.hour, checkInParsed.minute)}
                      </span>{' '}
                      (24h: {checkInDefault}).
                    </>
                  ) : (
                    <>
                      Using company default (
                      <span className="font-mono font-semibold">
                        {systemSettings.defaultCheckInTime || '08:30'}
                      </span>
                      ). Save below to set a personal default.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="time"
                    value={checkInDefault}
                    onChange={(e) => setCheckInDefault(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                  <Button onClick={handleSaveCheckInDefault} disabled={saving} size="sm">
                    Save check-in
                  </Button>
                  {(hasCustomCheckIn || sortedCheckInOverrideDates.length > 0) && (
                    <Button
                      onClick={handleClearCheckIn}
                      disabled={saving}
                      size="sm"
                      variant="outline"
                    >
                      Use company default
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-emerald-100 pt-5">
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Check-in time for a specific day
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  On this date only, {selectedEmployee.name} can check in from the time you choose (
                  {systemSettings.timezone}).
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Date</span>
                    <input
                      type="date"
                      value={checkInOverrideDate}
                      onChange={(e) => setCheckInOverrideDate(e.target.value)}
                      className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Check-in from</span>
                    <input
                      type="time"
                      value={checkInOverrideTime}
                      onChange={(e) => setCheckInOverrideTime(e.target.value)}
                      className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <Button onClick={handleSetCheckInOverride} disabled={saving} size="sm" className="mb-0.5">
                    Apply for this day
                  </Button>
                </div>
                {sortedCheckInOverrideDates.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {sortedCheckInOverrideDates.map((date) => {
                      const t = parseCheckInTime(checkInOverrides[date]);
                      return (
                        <li
                          key={date}
                          className="flex items-center justify-between gap-2 p-3 bg-white border border-emerald-100 rounded-lg text-sm"
                        >
                          <span>
                            <span className="font-bold text-gray-800">{date}</span>
                            <span className="text-gray-500"> → check-in from </span>
                            <span className="font-mono font-semibold text-emerald-700">
                              {checkInOverrides[date]} ({formatCheckoutTimeLabel(t.hour, t.minute)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCheckInOverride(date)}
                            disabled={saving}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Remove override"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Checkout column (right) */}
            <div className="space-y-6 min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/20 p-4 sm:p-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Default checkout time
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  {hasCustomCheckout ? (
                    <>
                      Custom default unlocks checkout at{' '}
                      <span className="font-semibold">
                        {formatCheckoutTimeLabel(checkoutParsed.hour, checkoutParsed.minute)}
                      </span>{' '}
                      (24h: {checkoutDefault}).
                    </>
                  ) : (
                    <>
                      Using company default (
                      <span className="font-mono font-semibold">
                        {systemSettings.defaultCheckoutTime || '17:30'}
                      </span>
                      ). Save below to set a personal default.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="time"
                    value={checkoutDefault}
                    onChange={(e) => setCheckoutDefault(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                  <Button onClick={handleSaveCheckoutDefault} disabled={saving} size="sm">
                    Save checkout
                  </Button>
                  {(hasCustomCheckout || sortedCheckoutOverrideDates.length > 0) && (
                    <Button
                      onClick={handleClearCheckout}
                      disabled={saving}
                      size="sm"
                      variant="outline"
                    >
                      Use company default
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-indigo-100 pt-5">
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Checkout time for a specific day
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  On this date only, {selectedEmployee.name} can check out after the time you choose (
                  {systemSettings.timezone}).
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Date</span>
                    <input
                      type="date"
                      value={checkoutOverrideDate}
                      onChange={(e) => setCheckoutOverrideDate(e.target.value)}
                      className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Checkout from</span>
                    <input
                      type="time"
                      value={checkoutOverrideTime}
                      onChange={(e) => setCheckoutOverrideTime(e.target.value)}
                      className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <Button
                    onClick={handleSetCheckoutOverride}
                    disabled={saving}
                    size="sm"
                    className="mb-0.5"
                  >
                    Apply for this day
                  </Button>
                </div>
                {sortedCheckoutOverrideDates.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {sortedCheckoutOverrideDates.map((date) => {
                      const t = parseCheckoutTime(checkoutOverrides[date]);
                      return (
                        <li
                          key={date}
                          className="flex items-center justify-between gap-2 p-3 bg-white border border-indigo-100 rounded-lg text-sm"
                        >
                          <span>
                            <span className="font-bold text-gray-800">{date}</span>
                            <span className="text-gray-500"> → checkout from </span>
                            <span className="font-mono font-semibold text-indigo-700">
                              {checkoutOverrides[date]} ({formatCheckoutTimeLabel(t.hour, t.minute)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCheckoutOverride(date)}
                            disabled={saving}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Remove override"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
