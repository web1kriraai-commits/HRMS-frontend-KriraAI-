import { Role } from '../types';

export type RefreshScope = {
  today?: boolean;
  attendance?: boolean;
  users?: boolean;
  leaves?: boolean;
  holidays?: boolean;
  notifications?: boolean;
  settings?: boolean;
};

export const FULL_REFRESH_SCOPE: RefreshScope = {
  today: true,
  attendance: true,
  users: true,
  leaves: true,
  holidays: true,
  notifications: true,
  settings: true,
};

/** Which APIs to call when opening each route/tab */
export const getRefreshScopeForPath = (pathname: string, role: Role): RefreshScope => {
  const isHRorAdmin = role === Role.HR || role === Role.ADMIN;

  switch (pathname) {
    case '/admin-users':
      return { users: true };

    case '/admin-audit':
      return { users: true };

    case '/admin-settings':
      return { settings: true };

    case '/admin-bonds':
      return { users: true };

    case '/salary-management':
      return { users: true };

    case '/admin-guidance':
      return {};

    case '/admin-system':
      return { holidays: true, users: true, leaves: true };

    case '/admin-leaves':
      return { users: true, leaves: true, holidays: true };

    case '/admin-dashboard':
      return {
        today: true,
        attendance: true,
        users: true,
        leaves: true,
        holidays: true,
        notifications: true,
      };

    case '/admin-summary':
      return {
        today: true,
        attendance: true,
        users: true,
        leaves: true,
        holidays: true,
        notifications: true,
      };

    case '/hr-today':
      return {
        today: true,
        attendance: true,
        users: true,
        leaves: true,
        holidays: true,
        settings: true,
      };

    case '/hr-approvals':
      return {
        leaves: true,
        users: true,
        attendance: true,
        holidays: true,
        notifications: true,
      };

    case '/holidays':
      return { holidays: true, notifications: true };

    case '/profile':
      return role === Role.EMPLOYEE
        ? { today: true, notifications: true }
        : { notifications: true };

    case '/admin-analytics':
    case '/admin-monthly':
      return {
        attendance: true,
        users: true,
        leaves: true,
        holidays: true,
      };

    case '/':
      if (role === Role.ADMIN) {
        return {
          today: true,
          attendance: true,
          users: true,
          leaves: true,
          holidays: true,
          notifications: true,
          settings: true,
        };
      }
      return {
        today: true,
        attendance: true,
        leaves: true,
        holidays: true,
        notifications: true,
        settings: true,
      };

    default:
      return isHRorAdmin
        ? { notifications: true }
        : { today: true, notifications: true, settings: true };
  }
};
