import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getTodayStr } from '../services/utils';
import { Check, X, Clock, AlertCircle, ChevronRight, MessageSquare } from 'lucide-react';
import { Card } from './ui/Card';

export const EarlyLogoutPopup: React.FC = () => {
    const { attendanceRecords, users, reviewEarlyCheckout } = useApp();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [minimized, setMinimized] = useState(false);

    // Filter for pending early logout requests for today
    const pendingRequests = useMemo(() => {
        const today = getTodayStr();
        return attendanceRecords.filter(r => 
            r.date === today && 
            r.earlyLogoutRequest === 'Pending'
        ).map(record => {
            const user = users.find(u => u.id === record.userId);
            return {
                record,
                user
            };
        });
    }, [attendanceRecords, users]);

    const handleAction = async (recordId: string, status: 'Approved' | 'Rejected', userName: string) => {
        const adminNote = prompt(`Optional note for ${userName} (${status}):`);
        setIsSubmitting(true);
        try {
            await reviewEarlyCheckout(recordId, status, adminNote || undefined);
        } catch (error: any) {
            alert(error.message || 'Failed to process request');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (pendingRequests.length === 0) return null;

    if (minimized) {
        return (
            <button 
                onClick={() => setMinimized(false)}
                className="fixed bottom-6 right-6 z-50 bg-amber-500 text-white p-4 rounded-full shadow-2xl hover:bg-amber-600 transition-all animate-bounce flex items-center gap-2 border-2 border-white"
            >
                <Clock size={24} />
                <span className="font-bold">{pendingRequests.length}</span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-80 animate-slide-up">
            <Card className="border-2 border-amber-200 shadow-2xl overflow-hidden bg-white/95 backdrop-blur-sm">
                <div className="bg-amber-500 p-3 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} />
                        <h3 className="font-bold text-sm">Early Logout Requests</h3>
                    </div>
                    <button 
                        onClick={() => setMinimized(true)}
                        className="hover:bg-amber-600 p-1 rounded transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
                
                <div className="p-2 max-h-[400px] overflow-y-auto">
                    {pendingRequests.map(({ record, user }, index) => (
                        <div 
                            key={record.id} 
                            className={`p-3 rounded-lg ${index !== pendingRequests.length - 1 ? 'border-b border-gray-100 mb-2' : ''} hover:bg-gray-50 transition-colors`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">{user?.name || 'Unknown User'}</p>
                                    <p className="text-[10px] text-gray-500 font-medium uppercase">{user?.department || 'Staff'}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => handleAction(record.id, 'Approved', user?.name || 'User')}
                                        disabled={isSubmitting}
                                        className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 transition-colors shadow-sm disabled:opacity-50"
                                        title="Approve"
                                    >
                                        <Check size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleAction(record.id, 'Rejected', user?.name || 'User')}
                                        disabled={isSubmitting}
                                        className="p-1.5 bg-rose-100 text-rose-700 rounded-md hover:bg-rose-200 transition-colors shadow-sm disabled:opacity-50"
                                        title="Reject"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            {record.earlyLogoutRequestNote && (
                                <div className="flex items-start gap-1.5 bg-amber-50/50 p-2 rounded border border-amber-100/50 mt-1">
                                    <MessageSquare size={10} className="text-amber-500 mt-1 flex-shrink-0" />
                                    <p className="text-[11px] text-amber-800 leading-relaxed italic">
                                        "{record.earlyLogoutRequestNote}"
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                {pendingRequests.length > 1 && (
                    <div className="bg-gray-50 p-2 text-center border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            {pendingRequests.length} PENDING REQUESTS
                        </p>
                    </div>
                )}
            </Card>
        </div>
    );
};
