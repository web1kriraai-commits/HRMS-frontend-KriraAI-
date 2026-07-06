import React, { useEffect, useState } from 'react';
import { SystemSettings } from '../types';
import { Button } from './ui/Button';
import { formatCheckoutTimeLabel, parseCheckInTime, getDateStrInTimezone } from '../services/utils';
import { Trash2 } from 'lucide-react';
import { appAlert } from '../services/appAlert';

type Props = {
  systemSettings: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings> & {
    setCheckInOverride?: { date: string; time: string };
    removeCheckInOverrideDate?: string;
  }) => Promise<void>;
};

export const CheckInTimeSettings: React.FC<Props> = ({ systemSettings, updateSystemSettings }) => {
  const [defaultTime, setDefaultTime] = useState(systemSettings.defaultCheckInTime || '08:30');
  const companyToday = getDateStrInTimezone(new Date(), systemSettings.timezone);
  const [overrideDate, setOverrideDate] = useState(companyToday);
  const [overrideTime, setOverrideTime] = useState('08:30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultTime(systemSettings.defaultCheckInTime || '08:30');
  }, [systemSettings.defaultCheckInTime]);

  const overrides = systemSettings.checkInTimeOverrides || {};
  const sortedOverrideDates = Object.keys(overrides)
    .filter((date) => date >= companyToday)
    .sort();

  const handleSaveDefault = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({ defaultCheckInTime: defaultTime });
      appAlert('Default check-in time saved.');
    } catch (e: any) {
      appAlert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSetOverride = async () => {
    if (!overrideDate) {
      appAlert('Please select a date.');
      return;
    }
    setSaving(true);
    try {
      await updateSystemSettings({
        setCheckInOverride: { date: overrideDate, time: overrideTime }
      });
      appAlert(
        `Check-in for ${overrideDate} set to ${overrideTime}. All employees can check in from that time on that day.`
      );
      setOverrideDate(companyToday);
    } catch (e: any) {
      appAlert(e.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOverride = async (date: string) => {
    if (!confirm(`Remove custom check-in time for ${date}? That day will use the default (${defaultTime}).`)) return;
    setSaving(true);
    try {
      await updateSystemSettings({ removeCheckInOverrideDate: date });
    } catch (e: any) {
      appAlert(e.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const { hour, minute } = parseCheckInTime(defaultTime);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Default check-in time</label>
        <p className="text-xs text-gray-500 mb-3">
          Used every day unless you set an override below. Current default unlocks check-in at{' '}
          <span className="font-semibold">{formatCheckoutTimeLabel(hour, minute)}</span> (24h: {defaultTime}).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="time"
            value={defaultTime}
            onChange={(e) => setDefaultTime(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm"
          />
          <Button onClick={handleSaveDefault} disabled={saving} size="sm">
            Save default
          </Button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <label className="block text-sm font-bold text-gray-700 mb-1">Check-in time for a specific day</label>
        <p className="text-xs text-gray-500 mb-3">
          On this date only, all employees can check in from the time you choose ({systemSettings.timezone}).
          Holidays still allow check-in at any time.
          Use <span className="font-mono font-semibold">{companyToday}</span> for today (wrong year will not apply).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase">Date</span>
            <input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase">Check-in from</span>
            <input
              type="time"
              value={overrideTime}
              onChange={(e) => setOverrideTime(e.target.value)}
              className="block mt-1 p-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <Button onClick={handleSetOverride} disabled={saving} size="sm" className="mb-0.5">
            Apply for this day
          </Button>
        </div>
      </div>

      {sortedOverrideDates.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Scheduled overrides</p>
          <ul className="space-y-2">
            {sortedOverrideDates.map((date) => {
              const t = parseCheckInTime(overrides[date]);
              return (
                <li
                  key={date}
                  className="flex items-center justify-between gap-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-sm"
                >
                  <span>
                    <span className="font-bold text-gray-800">{date}</span>
                    <span className="text-gray-500"> → check-in from </span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {overrides[date]} ({formatCheckoutTimeLabel(t.hour, t.minute)})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOverride(date)}
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
        </div>
      )}
    </div>
  );
};
