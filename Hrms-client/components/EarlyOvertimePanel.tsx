import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, Check, X, MessageSquare, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import * as api from '../services/api';
import { Role } from '../types';
import { appAlert } from '../services/appAlert';
import { getTodayStr } from '../services/utils';

export interface PendingEarlyOT {
  id: string;
  userId: string;
  userName: string;
  department?: string;
  date: string;
  durationMinutes: number;
  reason: string;
}

interface EarlyOvertimePanelProps {
  variant?: 'full' | 'compact' | 'table';
  maxItems?: number;
  showTitle?: boolean;
  className?: string;
  /** When true, hide pending requests from previous months (popup uses this). */
  currentMonthOnly?: boolean;
  /** When true, show only today's pending requests (admin dashboard table). */
  todayOnly?: boolean;
}

const normalizeRequestDate = (date?: string) =>
  (date?.split('T')[0] || date || '').trim();

export const EarlyOvertimePanel: React.FC<EarlyOvertimePanelProps> = ({
  variant = 'full',
  maxItems,
  showTitle = true,
  className = '',
  currentMonthOnly = false,
  todayOnly = false
}) => {
  const { users, reviewEarlyCheckout, auth, refreshData } = useApp();
  const [pending, setPending] = useState<PendingEarlyOT[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const canReview =
    auth.user?.role === Role.ADMIN || auth.user?.role === Role.HR;

  const loadPending = useCallback(async () => {
    if (!canReview) return;
    setLoading(true);
    try {
      const data = await api.attendanceAPI.getPendingEarlyOvertime();
      const mapped: PendingEarlyOT[] = (Array.isArray(data) ? data : []).map(
        (r: any) => {
          const uid = r.userId?._id || r.userId?.id || r.userId;
          const user = users.find((u) => u.id === uid);
          return {
            id: r._id || r.id,
            userId: uid,
            userName: r.userId?.name || user?.name || 'Unknown',
            department: r.userId?.department || user?.department,
            date: r.date,
            durationMinutes: r.earlyOvertime?.durationMinutes || 0,
            reason: r.earlyOvertime?.reason || r.earlyLogoutRequestNote || ''
          };
        }
      );
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
    const today = getTodayStr();
    const monthKey = today.slice(0, 7);
    let list = pending;
    if (todayOnly) {
      list = list.filter((req) => normalizeRequestDate(req.date) === today);
    } else if (currentMonthOnly) {
      list = list.filter((req) => normalizeRequestDate(req.date).slice(0, 7) === monthKey);
    }
    if (maxItems != null) return list.slice(0, maxItems);
    return list;
  }, [pending, maxItems, currentMonthOnly, todayOnly]);

  const emptyMessage = todayOnly
    ? 'No pending early OT requests for today'
    : currentMonthOnly
      ? 'No pending early OT requests this month'
      : 'No pending early OT requests';

  const handleAction = async (
    recordId: string,
    status: 'Approved' | 'Rejected'
  ) => {
    setSubmittingId(recordId);
    try {
      await reviewEarlyCheckout(recordId, status, comments[recordId]?.trim() || undefined);
      setComments((prev) => {
        const next = { ...prev };
        delete next[recordId];
        return next;
      });
      await loadPending();
      await refreshData(true);
    } catch (error: any) {
      appAlert(error.message || 'Failed to process early OT request');
    } finally {
      setSubmittingId(null);
    }
  };

  if (!canReview) return null;

  if (variant === 'table') {
    return (
      <div className={className}>
        {showTitle && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-amber-600" />
              <h3 className="text-lg font-bold text-gray-800">Pending Early OT</h3>
              <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50/50 text-amber-700 uppercase text-xs font-bold">
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-center">OT on approve</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Note</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                visible.map((req) => (
                  <tr key={req.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{req.userName}</p>
                      {req.department && (
                        <p className="text-xs text-gray-400">{req.department}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{req.date}</td>
                    <td className="px-4 py-3 text-center text-xs font-medium text-amber-600">
                      Worked − 8h 15m
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={req.reason}>
                      {req.reason || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        className="w-full text-xs p-2 border rounded-lg"
                        placeholder="Optional note..."
                        value={comments[req.id] || ''}
                        onChange={(e) =>
                          setComments({ ...comments, [req.id]: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={submittingId === req.id}
                          onClick={() => handleAction(req.id, 'Approved')}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                          title="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={submittingId === req.id}
                          onClick={() => handleAction(req.id, 'Rejected')}
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-amber-600" />
            <h3 className="text-lg font-bold text-gray-800">Early OT Requests</h3>
            <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
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

      {visible.length === 0 ? (
        <p className="text-gray-400 text-sm italic py-4">{emptyMessage}.</p>
      ) : (
        <div
          className={
            variant === 'compact'
              ? 'space-y-2 max-h-[360px] overflow-y-auto'
              : 'grid grid-cols-1 md:grid-cols-2 gap-4'
          }
        >
          {visible.map((req) => (
            <Card key={req.id} className="border-l-4 border-l-amber-400">
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="font-bold text-gray-900">{req.userName}</h4>
                  {req.department && (
                    <p className="text-xs text-gray-500">{req.department}</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">
                    {req.date}
                    <> · <span className="font-bold text-amber-700">OT on approve</span></>
                  </p>
                  {req.reason && (
                    <div className="flex items-start gap-1.5 mt-2 bg-amber-50/50 p-2 rounded border border-amber-100/50">
                      <MessageSquare size={12} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-800 italic">"{req.reason}"</p>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  className="w-full text-xs p-2 border rounded-lg"
                  placeholder="Optional note for employee..."
                  value={comments[req.id] || ''}
                  onChange={(e) => setComments({ ...comments, [req.id]: e.target.value })}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={submittingId === req.id}
                    onClick={() => handleAction(req.id, 'Approved')}
                  >
                    <Check size={16} className="mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={submittingId === req.id}
                    onClick={() => handleAction(req.id, 'Rejected')}
                  >
                    <X size={16} className="mr-1" /> Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
