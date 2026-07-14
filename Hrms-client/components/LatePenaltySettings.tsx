import React, { useEffect, useState } from 'react';
import { SystemSettings } from '../types';
import { Button } from './ui/Button';
import { formatCheckoutTimeLabel, parseCheckInTime } from '../services/utils';
import { appAlert } from '../services/appAlert';

type Props = {
  systemSettings: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings>) => Promise<void>;
};

export const LatePenaltySettings: React.FC<Props> = ({ systemSettings, updateSystemSettings }) => {
  const [penaltyStartTime, setPenaltyStartTime] = useState(systemSettings.latePenaltyStartTime || '09:15');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPenaltyStartTime(systemSettings.latePenaltyStartTime || '09:15');
  }, [systemSettings.latePenaltyStartTime]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemSettings({ latePenaltyStartTime: penaltyStartTime });
      appAlert('Late check-in penalty start time saved.');
    } catch (e: any) {
      appAlert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const { hour, minute } = parseCheckInTime(penaltyStartTime);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">Penalty starts from</label>
        <p className="text-xs text-gray-500 mb-3">
          Employees who check in after this time are penalized. From the cutoff through the next 10
          minutes (e.g. 09:05–09:15) a flat <span className="font-semibold">15 minutes</span> is
          deducted. After that, penalty equals exact minutes past the cutoff (e.g. 09:25 → 20m,
          09:30 → 25m). Check-in at or before this time is not penalized. Applies from 6 Jul 2026
          onward; earlier dates used 09:00. Current cutoff:{' '}
          <span className="font-semibold">{formatCheckoutTimeLabel(hour, minute)}</span> (24h: {penaltyStartTime}).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="time"
            value={penaltyStartTime}
            onChange={(e) => setPenaltyStartTime(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm"
          />
          <Button onClick={handleSave} disabled={saving} size="sm">
            Save penalty time
          </Button>
        </div>
      </div>
    </div>
  );
};
