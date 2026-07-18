import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, RefreshCw, Settings2, X } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import * as api from '../services/api';
import { Role } from '../types';
import { appAlert } from '../services/appAlert';
import { formatHoursMinutesShort, formatTime } from '../services/utils';

export interface PendingOvertimeManage {
  id: string;
  userId: string;
  userName: string;
  department?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  extraMinutes: number;
  note?: string;
  status: string;
}

type AllocationType = 'General' | 'Management' | 'EarlyRequest' | 'Custom';

interface OvertimeManagePanelProps {
  variant?: 'full' | 'compact' | 'table';
  maxItems?: number;
  showTitle?: boolean;
  className?: string;
}

const emptyCustom = { generalMinutes: 0, managementMinutes: 0, earlyRequestMinutes: 0 };

export const OvertimeManagePanel: React.FC<OvertimeManagePanelProps> = ({
  variant = 'full',
  maxItems,
  showTitle = true,
  className = ''
}) => {
  const { users, manageOvertimeRequest, auth, refreshData, systemSettings } = useApp();
  const [pending, setPending] = useState<PendingOvertimeManage[]>([]);
  const [loading, setLoading] = useState(false);
  const [managing, setManaging] = useState<PendingOvertimeManage | null>(null);
  const [allocationType, setAllocationType] = useState<AllocationType>('General');
  const [custom, setCustom] = useState(emptyCustom);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canReview =
    auth.user?.role === Role.ADMIN || auth.user?.role === Role.HR;

  const loadPending = useCallback(async () => {
    if (!canReview) return;
    setLoading(true);
    try {
      const data = await api.attendanceAPI.getPendingOvertimeManage();
      const mapped: PendingOvertimeManage[] = (Array.isArray(data) ? data : []).map((r: any) => {
        const uid = r.userId?._id || r.userId?.id || r.userId;
        const user = users.find((u) => u.id === uid);
        return {
          id: r._id || r.id,
          userId: uid,
          userName: r.userId?.name || user?.name || 'Unknown',
          department: r.userId?.department || user?.department,
          date: r.date,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          extraMinutes:
            r.overtimeManageRequest?.extraMinutes ||
            r.rawOvertimeSurplusMinutes ||
            0,
          note: r.overtimeManageRequest?.note || '',
          status: r.overtimeManageRequest?.status || 'Pending'
        };
      });
      setPending(mapped);
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [canReview, users]);

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 30000);
    return () => clearInterval(interval);
  }, [loadPending]);

  const visible = useMemo(() => {
    if (maxItems != null) return pending.slice(0, maxItems);
    return pending;
  }, [pending, maxItems]);

  const openManage = (req: PendingOvertimeManage) => {
    setManaging(req);
    setAllocationType('General');
    setCustom(emptyCustom);
    setAdminNote('');
  };

  const closeManage = () => {
    setManaging(null);
    setCustom(emptyCustom);
    setAdminNote('');
  };

  const customTotal =
    custom.generalMinutes + custom.managementMinutes + custom.earlyRequestMinutes;
  const extra = managing?.extraMinutes || 0;
  const customValid = allocationType !== 'Custom' || customTotal === extra;

  const handleSubmit = async () => {
    if (!managing) return;
    if (!managing.checkOut) {
      appAlert('Employee must check out before overtime can be managed');
      return;
    }
    if (extra <= 0) {
      appAlert('No overtime surplus available to allocate');
      return;
    }
    if (allocationType === 'Custom' && !customValid) {
      appAlert(
        `Custom OT must total exactly ${formatHoursMinutesShort(extra * 60)} (currently ${formatHoursMinutesShort(customTotal * 60)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      await manageOvertimeRequest(managing.id, {
        allocationType,
        allocations:
          allocationType === 'Custom'
            ? {
                generalMinutes: custom.generalMinutes,
                managementMinutes: custom.managementMinutes,
                earlyRequestMinutes: custom.earlyRequestMinutes
              }
            : undefined,
        adminNote: adminNote.trim() || undefined
      });
      closeManage();
      await loadPending();
      await refreshData(true);
    } catch (error: any) {
      appAlert(error.message || 'Failed to manage overtime request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canReview) return null;

  const renderTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-teal-50/50 text-teal-700 uppercase text-xs font-bold">
            <th className="px-4 py-3 text-left">Employee</th>
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-center">Extra Time</th>
            <th className="px-4 py-3 text-center">Check In</th>
            <th className="px-4 py-3 text-center">Check Out</th>
            <th className="px-4 py-3 text-center">Manage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visible.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                No pending overtime requests
              </td>
            </tr>
          ) : (
            visible.map((req) => (
              <tr key={req.id} className="hover:bg-teal-50/30">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{req.userName}</p>
                  {req.department && (
                    <p className="text-xs text-gray-400">{req.department}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">{req.date}</td>
                <td className="px-4 py-3 text-center font-bold text-teal-700">
                  {formatHoursMinutesShort(req.extraMinutes * 60)}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {formatTime(req.checkIn, systemSettings.timezone)}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {req.checkOut
                    ? formatTime(req.checkOut, systemSettings.timezone)
                    : <span className="text-amber-600 text-xs font-semibold">Still working</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <Button
                    size="sm"
                    disabled={!req.checkOut || req.extraMinutes <= 0}
                    onClick={() => openManage(req)}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Settings2 size={14} className="mr-1" /> Manage
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderCards = () =>
    visible.length === 0 ? (
      <p className="text-gray-400 text-sm italic py-4">No pending overtime requests.</p>
    ) : (
      <div
        className={
          variant === 'compact'
            ? 'space-y-2 max-h-[360px] overflow-y-auto'
            : 'grid grid-cols-1 md:grid-cols-2 gap-4'
        }
      >
        {visible.map((req) => (
          <Card key={req.id} className="border-l-4 border-l-teal-400">
            <div className="flex flex-col gap-3">
              <div>
                <h4 className="font-bold text-gray-900">{req.userName}</h4>
                {req.department && (
                  <p className="text-xs text-gray-500">{req.department}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">
                  {req.date} ·{' '}
                  <span className="font-bold text-teal-700">
                    {formatHoursMinutesShort(req.extraMinutes * 60)} extra
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  In {formatTime(req.checkIn, systemSettings.timezone)}
                  {' → '}
                  {req.checkOut
                    ? formatTime(req.checkOut, systemSettings.timezone)
                    : 'Still working'}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!req.checkOut || req.extraMinutes <= 0}
                  onClick={() => openManage(req)}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Settings2 size={14} className="mr-1" /> Manage
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );

  return (
    <div className={className}>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-teal-600" />
            <h3 className="text-lg font-bold text-gray-800">Overtime Requests</h3>
            <span className="bg-teal-100 text-teal-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {visible.length}
            </span>
          </div>
          <button
            type="button"
            onClick={loadPending}
            disabled={loading}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {variant === 'table' ? renderTable() : renderCards()}

      {managing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={closeManage} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Manage Overtime</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {managing.userName} · {managing.date}
                  </p>
                  <p className="text-sm font-bold text-teal-700 mt-1">
                    Extra time: {formatHoursMinutesShort(extra * 60)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Check in {formatTime(managing.checkIn, systemSettings.timezone)}
                    {' → '}
                    Check out {formatTime(managing.checkOut, systemSettings.timezone)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeManage}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Allocate to
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {(
                  [
                    { key: 'General', label: 'General OT' },
                    { key: 'Management', label: 'Management OT' },
                    { key: 'EarlyRequest', label: 'Early Request Overtime' },
                    { key: 'Custom', label: 'Custom OT' }
                  ] as { key: AllocationType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAllocationType(opt.key)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      allocationType === opt.key
                        ? 'border-teal-500 bg-teal-50 text-teal-800 ring-2 ring-teal-200'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                    {opt.key !== 'Custom' && (
                      <span className="block text-[10px] font-medium text-gray-400 mt-0.5">
                        All {formatHoursMinutesShort(extra * 60)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {allocationType === 'Custom' && (
                <div className="space-y-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500">
                    Distribute exactly {formatHoursMinutesShort(extra * 60)} across OT types
                    (minutes).
                  </p>
                  {(
                    [
                      { key: 'generalMinutes', label: 'General OT' },
                      { key: 'managementMinutes', label: 'Management OT' },
                      { key: 'earlyRequestMinutes', label: 'Early Request OT' }
                    ] as const
                  ).map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-gray-700">{field.label}</label>
                      <input
                        type="number"
                        min={0}
                        max={extra}
                        className="w-24 text-sm p-2 border rounded-lg text-right"
                        value={custom[field.key]}
                        onChange={(e) =>
                          setCustom({
                            ...custom,
                            [field.key]: Math.max(0, parseInt(e.target.value, 10) || 0)
                          })
                        }
                      />
                    </div>
                  ))}
                  <p
                    className={`text-xs font-bold ${
                      customValid ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    Total: {formatHoursMinutesShort(customTotal * 60)}
                    {!customValid && ` / need ${formatHoursMinutesShort(extra * 60)}`}
                  </p>
                </div>
              )}

              <input
                type="text"
                className="w-full text-sm p-2.5 border rounded-xl mb-4"
                placeholder="Optional note for employee..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="secondary" onClick={closeManage} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || !customValid}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {submitting ? 'Saving...' : 'Confirm Allocation'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
