import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { AlertOptions, AlertVariant, detectAlertVariant, registerAlertHandler } from '../services/appAlert';
import { Button } from '../components/ui/Button';

interface AlertState {
  message: string;
  variant: AlertVariant;
  title: string;
}

interface AlertContextType {
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

const variantConfig: Record<
  AlertVariant,
  { title: string; icon: React.ReactNode; accent: string; iconBg: string }
> = {
  success: {
    title: 'Success',
    icon: <CheckCircle2 size={22} className="text-emerald-600" />,
    accent: 'border-emerald-500',
    iconBg: 'bg-emerald-50',
  },
  error: {
    title: 'Error',
    icon: <XCircle size={22} className="text-red-600" />,
    accent: 'border-red-500',
    iconBg: 'bg-red-50',
  },
  warning: {
    title: 'Warning',
    icon: <AlertCircle size={22} className="text-amber-600" />,
    accent: 'border-amber-500',
    iconBg: 'bg-amber-50',
  },
  info: {
    title: 'Notice',
    icon: <Info size={22} className="text-blue-600" />,
    accent: 'border-blue-500',
    iconBg: 'bg-blue-50',
  },
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    const variant = options?.variant ?? detectAlertVariant(message);
    const title = options?.title ?? variantConfig[variant].title;

    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setAlertState({ message, variant, title });
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(null);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  useEffect(() => {
    registerAlertHandler(showAlert);
    return () => registerAlertHandler(async (message) => {
      window.alert(message);
    });
  }, [showAlert]);

  useEffect(() => {
    if (!alertState) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        closeAlert();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alertState, closeAlert]);

  const config = alertState ? variantConfig[alertState.variant] : null;

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}

      {alertState && config && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[200]"
            onClick={closeAlert}
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center px-4 pointer-events-none">
            <div
              className={`pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl border-t-4 ${config.accent} overflow-hidden`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="app-alert-title"
              aria-describedby="app-alert-message"
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg}`}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 id="app-alert-title" className="text-base font-bold text-gray-900">
                        {alertState.title}
                      </h3>
                      <button
                        onClick={closeAlert}
                        className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                        aria-label="Close"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <p
                      id="app-alert-message"
                      className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-line"
                    >
                      {alertState.message}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button size="sm" onClick={closeAlert} className="min-w-[72px]">
                    OK
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
};
