export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertOptions {
  variant?: AlertVariant;
  title?: string;
}

type AlertHandler = (message: string, options?: AlertOptions) => Promise<void>;

let alertHandler: AlertHandler | null = null;

export function registerAlertHandler(handler: AlertHandler) {
  alertHandler = handler;
}

export function detectAlertVariant(message: string): AlertVariant {
  const lower = message.toLowerCase();
  if (lower.includes('failed') || lower.includes('error') || lower.includes('invalid')) {
    return 'error';
  }
  if (
    lower.includes('success') ||
    lower.includes('saved') ||
    lower.includes('sent successfully') ||
    lower.includes('updated') ||
    lower.includes('deleted successfully') ||
    lower.includes('marked as') ||
    lower.includes('complete') ||
    lower.includes('added ') ||
    lower.includes('reverted')
  ) {
    return 'success';
  }
  if (lower.includes('please') || lower.includes('must be') || lower.includes('not enabled')) {
    return 'warning';
  }
  return 'info';
}

export function appAlert(message: string, options?: AlertVariant | AlertOptions): Promise<void> {
  const resolvedOptions: AlertOptions =
    typeof options === 'string'
      ? { variant: options }
      : options ?? {};

  const variant = resolvedOptions.variant ?? detectAlertVariant(message);

  if (alertHandler) {
    return alertHandler(message, { ...resolvedOptions, variant });
  }

  window.alert(message);
  return Promise.resolve();
}
