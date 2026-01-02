/**
 * Salary Breakdown Utilities
 * Handles calculation of monthly salary breakdown based on bonds and joining dates
 */

export interface SalaryBreakdownRow {
    month: number; // 1-12
    year: number;
    startDate: string; // dd-mm-yyyy
    endDate: string; // dd-mm-yyyy
    bondType: 'Internship' | 'Job' | 'Other';
    isPartialMonth: boolean;
    salary: number;
    displayLabel: string; // e.g., "Jan 2025" or "Jan 10-31, 2025"
}

/**
 * Parse date from various formats to Date object
 */
export function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
        // Check if it's yyyy-mm-dd format (HTML date input)
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        // Check if it's dd-mm-yyyy format
        if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [day, month, year] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        // Try parsing as ISO string
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch (error) {
        console.error('Error parsing date:', error);
    }

    return null;
}

/**
 * Format date to dd-mm-yyyy
 */
export function formatToDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Check if a date is after the 1st of the month
 */
export function isPartialMonth(date: Date): boolean {
    return date.getDate() > 1;
}

/**
 * Get the last day of a month
 */
export function getMonthEndDate(year: number, month: number): Date {
    // month is 1-12, but Date constructor expects 0-11
    // Setting day to 0 gets the last day of the previous month
    return new Date(year, month, 0);
}

/**
 * Get month name from month number (1-12)
 */
export function getMonthName(month: number): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || '';
}

/**
 * Calculate salary breakdown rows based on bonds and joining date
 * 
 * Rules:
 * - If joining after 1st of month, first row is partial month (not counted in bond)
 * - Each bond period is calculated in full months
 * - Subsequent bonds start the day after previous bond ends
 */
export function calculateSalaryBreakdown(
    joiningDate: string, // yyyy-mm-dd or dd-mm-yyyy
    bonds: Array<{ type: string; periodMonths: number; salary?: number }>
): SalaryBreakdownRow[] {
    if (!joiningDate || !bonds || bonds.length === 0) {
        return [];
    }

    const rows: SalaryBreakdownRow[] = [];
    const startDate = parseDate(joiningDate);

    if (!startDate) {
        console.error('Invalid joining date:', joiningDate);
        return [];
    }

    let currentDate = new Date(startDate);
    const hasPartialMonth = isPartialMonth(startDate);

    // Add partial month row if joining after 1st
    if (hasPartialMonth) {
        const monthEnd = getMonthEndDate(currentDate.getFullYear(), currentDate.getMonth() + 1);

        rows.push({
            month: currentDate.getMonth() + 1,
            year: currentDate.getFullYear(),
            startDate: formatToDDMMYYYY(currentDate),
            endDate: formatToDDMMYYYY(monthEnd),
            bondType: bonds[0]?.type as any || 'Internship',
            isPartialMonth: true,
            salary: bonds[0]?.salary || 0,
            displayLabel: `${getMonthName(currentDate.getMonth() + 1)} ${currentDate.getDate()}-${monthEnd.getDate()}, ${currentDate.getFullYear()}`
        });

        // Move to next month for bond calculation
        currentDate = new Date(monthEnd);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Process each bond
    for (let bondIndex = 0; bondIndex < bonds.length; bondIndex++) {
        const bond = bonds[bondIndex];
        const periodMonths = parseInt(bond.periodMonths as any) || 0;

        if (periodMonths <= 0) continue;

        // Add rows for each month in the bond period
        for (let monthOffset = 0; monthOffset < periodMonths; monthOffset++) {
            const monthStart = new Date(currentDate);
            const monthEnd = getMonthEndDate(monthStart.getFullYear(), monthStart.getMonth() + 1);

            rows.push({
                month: monthStart.getMonth() + 1,
                year: monthStart.getFullYear(),
                startDate: formatToDDMMYYYY(monthStart),
                endDate: formatToDDMMYYYY(monthEnd),
                bondType: bond.type as any,
                isPartialMonth: false,
                salary: bond.salary || 0,
                displayLabel: `${getMonthName(monthStart.getMonth() + 1)} ${monthStart.getFullYear()}`
            });

            // Move to next month
            currentDate = new Date(monthEnd);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    return rows;
}

/**
 * Convert yyyy-mm-dd to dd-mm-yyyy
 */
export function convertToDDMMYYYY(dateStr: string): string {
    const date = parseDate(dateStr);
    return date ? formatToDDMMYYYY(date) : dateStr;
}

/**
 * Convert dd-mm-yyyy to yyyy-mm-dd (for HTML date inputs)
 */
export function convertToYYYYMMDD(dateStr: string): string {
    if (!dateStr) return '';

    // If already in yyyy-mm-dd format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
    }

    // If in dd-mm-yyyy format
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = dateStr.split('-');
        return `${year}-${month}-${day}`;
    }

    const date = parseDate(dateStr);
    if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return dateStr;
}
