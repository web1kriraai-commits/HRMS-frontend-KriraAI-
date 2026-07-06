import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Briefcase, Check, X, MessageSquare, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import * as api from '../services/api';
import { Role } from '../types';

export interface PendingManagementOT {
  id: string;
  userId: string;
  userName: string;
  department?: string;
  date: string;
  durationMinutes: number;
  reason: string;
}

interface ManagementOvertimePanelProps {
  variant?: 'full' | 'compact' | 'table';
  maxItems?: number;
  showTitle?: boolean;
  className?: string;
}

export const ManagementOvertimePanel: React.FC<ManagementOvertimePanelProps> = ({
  variant = 'full',
  maxItems,
  showTitle = true,
  className = ''
}) => {
  const { users, reviewManagementOvertime, auth, refreshData } = useApp();
  const [pending, setPending] = useState<PendingManagementOT[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const canReview =
    auth.user?.role === Role.ADMIN || auth.user?.role === Role.HR;

  const loadPending = useCallback(async () => {
    if (!canReview) return;
    setLoading(true);
    try {
      const data = await api.attendanceAPI.getPendingOvertime();
      const mapped: PendingManagementOT[] = (Array.isArray(data) ? data : []).map(
        (r: any) => {
          const uid = r.userId?._id || r.userId?.id || r.userId;
          const user = users.find((u) => u.id === uid);
          return {
            id: r._id || r.id,
            userId: uid,
            userName: r.userId?.name || user?.name || 'Unknown',
            department: r.userId?.department || user?.department,
            date: r.date,
            durationMinutes: r.managementOvertime?.durationMinutes || 0,
            reason: r.managementOvertime?.reason || ''
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
    if (maxItems != null) return pending.slice(0, maxItems);
    return pending;
  }, [pending, maxItems]);

  const handleAction = async (
    recordId: string,
    status: 'Approved' | 'Rejected'
  ) => {
    setSubmittingId(recordId);
    try {
      await reviewManagementOvertime(recordId, status, comments[recordId]?.trim() || undefined);
      setComments((prev) => {
        const next = { ...prev };
        delete next[recordId];
        return next;
      });
      await loadPending();
      await refreshData(true);
    } catch (error: any) {
      alert(error.message || 'Failed to process management overtime request');
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
              <Briefcase size={18} className="text-violet-600" />
              <h3 className="text-lg font-bold text-gray-800">Pending Management OT</h3>
              <span className="bg-violet-100 text-violet-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {pending.length}
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
              <tr className="bg-violet-50/50 text-violet-700 uppercase text-xs font-bold">
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-center">Duration</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Note</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    No pending management overtime requests
                  </td>
                </tr>
              ) : (
                visible.map((req) => (
                  <tr key={req.id} className="hover:bg-violet-50/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{req.userName}</p>
                      {req.department && (
                        <p className="text-xs text-gray-400">{req.department}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{req.date}</td>
                    <td className="px-4 py-3 text-center font-bold text-violet-700">
                      {req.durationMinutes}m
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
        {maxItems != null && pending.length > maxItems && (
          <p className="text-xs text-gray-400 text-center mt-2">
            And {pending.length - maxItems} more pending request(s)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-violet-600" />
            <h3 className="text-lg font-bold text-gray-800">Management Overtime Requests</h3>
            <span className="bg-violet-100 text-violet-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {pending.length}
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
        <p className="text-gray-400 text-sm italic py-4">No pending management overtime requests.</p>
      ) : (
        <div
          className={
            variant === 'compact'
              ? 'space-y-2 max-h-[360px] overflow-y-auto'
              : 'grid grid-cols-1 md:grid-cols-2 gap-4'
          }
        >
          {visible.map((req) => (
            <Card key={req.id} className="border-l-4 border-l-violet-400">
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="font-bold text-gray-900">{req.userName}</h4>
                  {req.department && (
                    <p className="text-xs text-gray-500">{req.department}</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">
                    {req.date} · <span className="font-bold text-violet-700">{req.durationMinutes}m</span>
                  </p>
                  {req.reason && (
                    <div className="flex items-start gap-1.5 mt-2 bg-violet-50/50 p-2 rounded border border-violet-100/50">
                      <MessageSquare size={12} className="text-violet-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-violet-800 italic">"{req.reason}"</p>
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
