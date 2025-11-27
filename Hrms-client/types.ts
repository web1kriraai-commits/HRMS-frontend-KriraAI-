export enum Role {
  EMPLOYEE = 'Employee',
  HR = 'HR',
  ADMIN = 'Admin',
}

export enum LeaveStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

export enum LeaveCategory {
  SICK = 'Sick Leave',
  CASUAL = 'Casual Leave',
  PAID = 'Paid Leave',
  HALF_DAY = 'Half Day',
}

export enum BreakType {
  STANDARD = 'Standard',
  EXTRA = 'Extra',
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  department: string;
  isActive: boolean;
  password?: string; // Simulated hashed password
  isFirstLogin: boolean;
  lastLogin?: string; // ISO String
}

export interface Break {
  id: string;
  attendanceId: string;
  start: string; // ISO string
  end?: string; // ISO string
  type: BreakType;
  durationSeconds?: number;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // ISO string
  checkOut?: string; // ISO string
  location?: string; // Captures location on check-in (FR5)
  breaks: Break[];
  totalWorkedSeconds: number;
  lowTimeFlag: boolean;
  extraTimeFlag: boolean;
  notes?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  category: LeaveCategory;
  reason: string;
  attachmentUrl?: string;
  status: LeaveStatus;
  hrComment?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string; 
  targetType: string; // 'USER', 'ATTENDANCE', 'LEAVE', 'SYSTEM'
  targetId: string;
  beforeData?: string; // JSON string
  afterData?: string; // JSON string
  details: string;
  timestamp: string;
}

export interface CompanyHoliday {
  id: string;
  date: string;
  description: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface SystemSettings {
  timezone: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
}