import React, { useCallback, useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { Card } from './ui/Card';
import { EarlyOvertimePanel } from './EarlyOvertimePanel';
import * as api from '../services/api';
import { useApp } from '../context/AppContext';
import { Role } from '../types';

export const EarlyOvertimePopup: React.FC = () => {
  const { auth } = useApp();
  const [count, setCount] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const canReview =
    auth.user?.role === Role.ADMIN || auth.user?.role === Role.HR;

  const refreshCount = useCallback(async () => {
    if (!canReview) return;
    try {
      const data = await api.attendanceAPI.getPendingEarlyOvertime();
      setCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setCount(0);
    }
  }, [canReview]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  if (!canReview || count === 0) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 bg-amber-500 text-white p-4 rounded-full shadow-2xl hover:bg-amber-600 transition-all animate-bounce flex items-center gap-2 border-2 border-white"
      >
        <Clock size={24} />
        <span className="font-bold">{count}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[85vh] overflow-hidden animate-slide-up">
      <Card className="border-2 border-amber-200 shadow-2xl bg-white/95 backdrop-blur-sm flex flex-col max-h-[85vh]">
        <div className="bg-amber-500 p-3 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={18} />
            <h3 className="font-bold text-sm">Early OT — Approve / Reject</h3>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="hover:bg-amber-600 p-1 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-3 overflow-y-auto">
          <EarlyOvertimePanel variant="compact" showTitle={false} />
        </div>
      </Card>
    </div>
  );
};
