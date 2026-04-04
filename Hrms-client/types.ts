export enum Role {
  EMPLOYEE = 'Employee',
  HR = 'HR',
  ADMIN = 'Admin',
}

export enum LeaveStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  CANCELLED = 'Cancelled',
}

export enum LeaveCategory {
  PAID = 'Paid Leave',
  UNPAID = 'Unpaid Leave',
  HALF_DAY = 'Half Day Leave',
  EXTRA_TIME = 'Extra Time Leave',
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
  paidLeaveAllocation?: number | null; // Custom paid leave allocation (null = use default)
  extraTimeLeaveAllocation?: number | null; // Custom extra time leave allocation (null = 0 by default)
  paidLeaveLastAllocatedDate?: string; // ISO string - Last date when paid leave was allocated
  manualPaidLeaveAdjustment?: number;
  manualExtraTimeAdjustment?: number;
  manualUnpaidLeaveAdjustment?: number;
  manualHalfDayLeaveAdjustment?: number;
  joiningDate?: string; // dd-mm-yyyy format - Employee joining date
  bonds?: Bond[]; // Array of bonds
  aadhaarNumber?: string; // Aadhaar card number
  guardianName?: string; // Guardian/emergency contact name
  mobileNumber?: string; // Mobile/phone number
  guardianMobileNumber?: string; // Guardian mobile number
  salaryBreakdown?: Array<{
    month: number; // 1-12
    year: number;
    amount: number;
    bondType: 'Internship' | 'Job' | 'Other';
    startDate: string; // dd-mm-yyyy format
    endDate: string; // dd-mm-yyyy format
    isPartialMonth: boolean;
    isPaid?: boolean; // Payment status
    paidAt?: string; // ISO string - when it was marked as paid
    paidBy?: string; // Name of admin/HR who marked it as paid
  }>;
  lastForwardedMonth?: string; // Format "YYYY-MM" to track and prevent duplicate forwarding
  forwardedMonths?: Record<string, number>; // Maps month (YYYY-MM) to amount forwarded out (in seconds)
  forwardedInMonths?: Record<string, number>; // Maps month (YYYY-MM) to amount forwarded IN (in seconds)
  createdAt?: string; // ISO String
  updatedAt?: string; // ISO String
}

export interface Bond {
  type: 'Internship' | 'Job' | 'Other';
  periodMonths: number;
  startDate: string; // dd-mm-yyyy format
  order: number;
  salary?: number; // Salary for Job bond or Stipend for Internship bond
}

export interface Break {
  id: string;
  attendanceId: string;
  start: string; // ISO string
  end?: string; // ISO string
  type: BreakType;
  durationSeconds?: number;
  reason?: string; // Reason for extra break
}

export interface ManualHour {
  id: string;
  hours: number;
  type: 'Employee' | 'Admin';
  addedBy: string;
  note?: string;
  timestamp: string;
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
  penaltySeconds?: number;
  lateCheckIn?: boolean;
  isManualFlag?: boolean;
  isPenaltyDisabled?: boolean;
  manualHours?: ManualHour[];
  notes?: string;
  earlyLogoutRequest?: 'None' | 'Pending' | 'Approved' | 'Rejected';
  earlyLogoutRequestNote?: string;
  isCompulsoryBreakDisabled?: boolean;
  overtimeRequest?: {
    reason: string;
    durationMinutes: number;
    status: 'None' | 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
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
  startTime?: string; // HH:mm format for extra time leave and half day leave
  endTime?: string; // HH:mm format for extra time leave
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
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  status?: 'past' | 'upcoming'; // Calculated based on current date
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
