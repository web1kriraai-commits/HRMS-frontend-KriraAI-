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

/** Persisted salary slip details (Admin/HR enters; employee previews/downloads) */
export interface SalarySlipRecord {
  month: number;
  year: number;
  companyName?: string;
  companyAddress?: string;
  preparedByName?: string;
  preparedByTitle?: string;
  empName?: string;
  empNo?: string;
  department?: string;
  doj?: string;
  bank?: string;
  bankAccountNo?: string;
  designation?: string;
  pfNo?: string;
  esicNo?: string;
  stdDays?: number;
  workedDays?: number;
  leaveBalance?: number;
  basic?: number;
  da?: number;
  totalWage?: number;
  hra?: number;
  medicalReimbursement?: number;
  conveyance?: number;
  lta?: number;
  education?: number;
  specialAllowance?: number;
  pf?: number;
  esic?: number;
  pTax?: number;
  lwf?: number;
  tds?: number;
  advance?: number;
  exGratia?: number;
  lessAdvance?: number;
  savedAt?: string;
  savedBy?: string;
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
  /** false = employee may only use unpaid leave (set by Admin on Leave Management). */
  paidLeaveAccess?: boolean;
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
  bankName?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
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
  /** Detailed salary slips saved by Admin/HR for employee preview/download */
  salarySlips?: SalarySlipRecord[];
  lastForwardedMonth?: string; // Format "YYYY-MM" to track and prevent duplicate forwarding
  forwardedMonths?: Record<string, number>; // Maps month (YYYY-MM) to amount forwarded out (in seconds)
  forwardedInMonths?: Record<string, number>; // Maps month (YYYY-MM) to amount forwarded IN (in seconds)
  /** Employee-specific default check-in HH:mm; null = use company default */
  defaultCheckInTime?: string | null;
  /** Per-employee day check-in overrides YYYY-MM-DD → HH:mm */
  checkInTimeOverrides?: Record<string, string>;
  /** Employee-specific default checkout HH:mm; null = use company default */
  defaultCheckoutTime?: string | null;
  /** Per-employee day checkout overrides YYYY-MM-DD → HH:mm */
  checkoutTimeOverrides?: Record<string, string>;
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
  /** Auto-calculated OT above 8h 15m per day */
  generalOvertimeMinutes?: number;
  managementOvertime?: {
    reason: string;
    durationMinutes: number;
    status: 'None' | 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    completedMinutes?: number;
  };
  earlyOvertime?: {
    reason?: string;
    durationMinutes?: number;
    requestStatus?: 'None' | 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    deficitMinutes: number;
    coveredMinutes: number;
    completedMinutes?: number;
    status: 'None' | 'Pending' | 'Partial' | 'Covered';
  };
  /** Explicit request to repay a previous early-checkout deficit with extra minutes worked this day (current month only) */
  earlyOvertimeRepayment?: {
    requestedMinutes: number;
    reason?: string;
    status: 'None' | 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    appliedMinutes: number;
  };
  /**
   * Early Leave OT — surplus from completed working hours to checkout.
   * Admin/HR allocate via Manage (General / Management / Early Request / Custom).
   */
  overtimeManageRequest?: {
    status: 'None' | 'Pending' | 'Managed' | 'Rejected';
    requestedAt?: string;
    note?: string;
    extraMinutes?: number;
    managedBy?: string;
    managedAt?: string;
    allocationType?: 'None' | 'General' | 'Management' | 'EarlyRequest' | 'Custom';
    allocations?: {
      generalMinutes: number;
      managementMinutes: number;
      earlyRequestMinutes: number;
    };
    adminNote?: string;
  };
  /** @deprecated Legacy — mirrors general OT */
  overtimeRequest?: {
    reason: string;
    durationMinutes: number;
    status: 'None' | 'Pending' | 'Approved' | 'Rejected';
    requestedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    completedMinutes?: number;
    unfulfilledMinutes?: number;
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
  /** Default check-in time HH:mm (24h), e.g. 08:30 */
  defaultCheckInTime: string;
  /** Per-day check-in override YYYY-MM-DD → HH:mm */
  checkInTimeOverrides: Record<string, string>;
  /** Default checkout time HH:mm (24h), e.g. 17:30 */
  defaultCheckoutTime: string;
  /** Per-day checkout override YYYY-MM-DD → HH:mm */
  checkoutTimeOverrides: Record<string, string>;
  /** Late check-in penalty applies after this time HH:mm (24h), e.g. 09:15 */
  latePenaltyStartTime: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
}
