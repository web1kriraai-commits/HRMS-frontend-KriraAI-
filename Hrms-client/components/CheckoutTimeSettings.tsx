import React, { useEffect, useState } from 'react';
import { SystemSettings } from '../types';
import { Button } from './ui/Button';
import { formatCheckoutTimeLabel, parseCheckoutTime, getDateStrInTimezone } from '../services/utils';
import { Trash2 } from 'lucide-react';
import { appAlert } from '../services/appAlert';

type Props = {
  systemSettings: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings> & {
    setCheckoutOverride?: { date: string; time: string };
    removeCheckoutOverrideDate?: string;
  }) => Promise<void>;
};

export const CheckoutTimeSettings: React.FC<Props> = ({ systemSettings, updateSystemSettings }) => {
  const [defaultTime, setDefaultTime] = useState(systemSettings.defaultCheckoutTime || '17:30');
  const companyToday = getDateStrInTimezone(new Date(), systemSettings.timezone);
  const [overrideDate, setOverrideDate] = useState(companyToday);
  const [overrideTime, setOverrideTime] = useState('17:30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultTime(systemSettings.defaultCheckoutTime || '17:30');
  }, [systemSettings.defaultCheckoutTime]);

  const overrides = systemSettings.checkoutTimeOverrides || {};
  const sortedOverrideDates = Object.keys(overrides)
    .filter((date) => date >= companyToday)
    .sort();

  const handleSaveDefault = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({ defaultCheckoutTime: defaultTime });
      appAlert('Default checkout time saved.');
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
        setCheckoutOverride: { date: overrideDate, time: overrideTime }
      });
      appAlert(
        `Checkout for ${overrideDate} set to ${overrideTime}. All employees can check out after that time. Low time will not be counted for that day.`
      );
      setOverrideDate('');
    } catch (e: any) {
      appAlert(e.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOverride = async (date: string) => {
    if (!confirm(`Remove custom checkout time for ${date}? That day will use the default (${defaultTime}).`)) return;
    setSaving(true);
    try {
      await updateSystemSettings({ removeCheckoutOverrideDate: date });
    } catch (e: any) {
      appAlert(e.message || 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const { hour, minute } = parseCheckoutTime(defaultTime);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Default checkout time</label>
        <p className="text-xs text-gray-500 mb-3">
          Used every day unless you set an override below. Current default unlocks checkout at{' '}
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
        <label className="block text-sm font-bold text-gray-700 mb-1">Checkout time for a specific day</label>
        <p className="text-xs text-gray-500 mb-3">
          On this date only, all employees can check out after the time you choose ({systemSettings.timezone}).
          Early leave on that day is <span className="font-semibold">not counted as low time</span> for anyone.
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
            <span className="text-[10px] font-bold text-gray-500 uppercase">Checkout from</span>
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
              const t = parseCheckoutTime(overrides[date]);
              return (
                <li
                  key={date}
                  className="flex items-center justify-between gap-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-sm"
                >
                  <span>
                    <span className="font-bold text-gray-800">{date}</span>
                    <span className="text-gray-500"> → checkout from </span>
                    <span className="font-mono font-semibold text-indigo-700">
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
