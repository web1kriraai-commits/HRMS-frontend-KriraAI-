import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { formatDate } from '../services/utils';
import { Calendar, Filter, X } from 'lucide-react';

export const Holidays: React.FC = () => {
  const { companyHolidays } = useApp();
  
  const [yearFilter, setYearFilter] = useState<string>(() => {
    const currentYear = new Date().getFullYear();
    return currentYear.toString();
  });
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');

  // Get unique years from holidays
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    companyHolidays.forEach(holiday => {
      const year = new Date(holiday.date).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [companyHolidays]);

  // Filter holidays based on selected filters and add Sundays for complete weeks
  const filteredHolidays = useMemo(() => {
    let filtered = [...companyHolidays];

    // Year filter
    if (yearFilter) {
      const year = parseInt(yearFilter);
      filtered = filtered.filter(h => {
        const holidayYear = new Date(h.date).getFullYear();
        return holidayYear === year;
      });
    }

    // Month filter
    if (monthFilter) {
      const [year, month] = monthFilter.split('-').map(Number);
      filtered = filtered.filter(h => {
        const holidayDate = new Date(h.date);
        return holidayDate.getFullYear() === year && holidayDate.getMonth() === month - 1;
      });
    }

    // Date range filter
    if (dateRangeStart && dateRangeEnd) {
      const start = new Date(dateRangeStart);
      const end = new Date(dateRangeEnd);
      filtered = filtered.filter(h => {
        const holidayDate = new Date(h.date);
        return holidayDate >= start && holidayDate <= end;
      });
    }

    // Add Sundays for weeks where all 6 working days (Mon-Sat) are holidays
    const holidayDates = new Set(filtered.map(h => {
      const d = new Date(h.date);
      return d.toISOString().split('T')[0];
    }));

    const sundaysToAdd: Array<{ id: string; date: string; description: string; createdAt: string }> = [];
    const processedWeeks = new Set<string>();

    filtered.forEach(holiday => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      // If it's a Monday, check if the entire week (Mon-Sat) is covered
      if (dayOfWeek === 1) { // Monday
        const monday = new Date(holidayDate);
        const saturday = new Date(holidayDate);
        saturday.setDate(saturday.getDate() + 5); // Saturday

        // Create a unique key for this week
        const weekKey = monday.toISOString().split('T')[0];
        
        if (!processedWeeks.has(weekKey)) {
          processedWeeks.add(weekKey);

          // Check if all 6 working days (Mon-Sat) are holidays
          let allDaysCovered = true;
          for (let i = 0; i < 6; i++) {
            const checkDate = new Date(monday);
            checkDate.setDate(checkDate.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];
            if (!holidayDates.has(dateStr)) {
              allDaysCovered = false;
              break;
            }
          }

          // If all 6 working days are holidays, add the Sunday of that week
          if (allDaysCovered) {
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() - 1); // Sunday before Monday
            const sundayStr = sunday.toISOString().split('T')[0];

            // Only add if not already in the list
            if (!holidayDates.has(sundayStr)) {
              sundaysToAdd.push({
                id: `sunday-${sundayStr}`,
                date: sundayStr,
                description: 'Sunday (Complete Week Holiday)',
                createdAt: new Date().toISOString()
              });
            }
          }
        }
      }
    });

    // Combine original holidays with added Sundays
    const allHolidays = [...filtered, ...sundaysToAdd];

    // Sort by date (most recent first)
    return allHolidays.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [companyHolidays, yearFilter, monthFilter, dateRangeStart, dateRangeEnd]);

  // Group holidays by month for display
  const holidaysByMonth = useMemo(() => {
    const grouped: { [key: string]: typeof companyHolidays } = {};
    
    filteredHolidays.forEach(holiday => {
      const date = new Date(holiday.date);
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(holiday);
    });

    // Sort months chronologically (most recent first)
    const sortedMonths = Object.keys(grouped).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return sortedMonths.map(month => ({
      month,
      holidays: grouped[month].sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
    }));
  }, [filteredHolidays]);

  const clearFilters = () => {
    setYearFilter(new Date().getFullYear().toString());
    setMonthFilter('');
    setDateRangeStart('');
    setDateRangeEnd('');
  };

  const hasActiveFilters = monthFilter || dateRangeStart || dateRangeEnd;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
            Company Holidays
          </h1>
          <p className="text-gray-500 mt-2">View all company holidays and plan your schedule</p>
        </div>
        <div className="text-right">
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-6 py-4">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Total Holidays</p>
            <p className="text-3xl font-bold text-purple-700 mt-1">{filteredHolidays.length}</p>
            <p className="text-xs text-purple-600 mt-1">
              {companyHolidays.length !== filteredHolidays.length 
                ? `of ${companyHolidays.length} total` 
                : 'in system'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card title="Filters" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Year
            </label>
            <select
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
            >
              <option value="">All Years</option>
              {availableYears.map(year => (
                <option key={year} value={year.toString()}>{year}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Month
            </label>
            <input
              type="month"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              placeholder="Select month"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              From Date
            </label>
            <input
              type="date"
              className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              value={dateRangeStart}
              onChange={e => setDateRangeStart(e.target.value)}
              placeholder="Start date"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              To Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                value={dateRangeEnd}
                onChange={e => setDateRangeEnd(e.target.value)}
                placeholder="End date"
              />
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Clear filters"
                >
                  <X size={16} className="text-gray-600" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter size={16} />
              <span>
                Showing <span className="font-semibold text-gray-800">{filteredHolidays.length}</span> holiday(s)
                {yearFilter && ` in ${yearFilter}`}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Total: <span className="font-semibold">{filteredHolidays.length}</span> holiday(s)
            </div>
          </div>
        </div>
      </Card>

      {/* Holidays Display */}
      {filteredHolidays.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">No holidays found</p>
            <p className="text-gray-400 text-sm mt-2">
              {hasActiveFilters 
                ? 'Try adjusting your filters to see more results'
                : 'No holidays have been added yet'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {holidaysByMonth.map(({ month, holidays }) => (
            <Card key={month} title={month}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {holidays.map(holiday => {
                  const holidayDate = new Date(holiday.date);
                  const isPast = holidayDate < new Date();
                  const isToday = holidayDate.toDateString() === new Date().toDateString();
                  const isUpcoming = holidayDate > new Date();

                  return (
                    <div
                      key={holiday.id}
                      className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        isToday
                          ? 'bg-purple-50 border-purple-300 shadow-sm'
                          : isPast
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                              isToday
                                ? 'bg-purple-200 text-purple-700'
                                : isPast
                                ? 'bg-gray-200 text-gray-600'
                                : 'bg-blue-200 text-blue-700'
                            }`}>
                              {holidayDate.getDate()}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800">{holiday.description}</p>
                              <p className="text-xs text-gray-500">
                                {formatDate(holiday.date)} • {holidayDate.toLocaleDateString('en-US', { weekday: 'long' })}
                              </p>
                              {holiday.createdByName && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Added by <span className="font-semibold">{holiday.createdByName}</span>
                                  {holiday.createdByRole && (
                                    <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      holiday.createdByRole === 'Admin' 
                                        ? 'bg-purple-100 text-purple-700' 
                                        : holiday.createdByRole === 'HR'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {holiday.createdByRole}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {isToday && (
                            <span className="px-2 py-1 bg-purple-200 text-purple-700 text-xs font-bold rounded-full">
                              Today
                            </span>
                          )}
                          {isUpcoming && !isToday && (
                            <span className="px-2 py-1 bg-blue-200 text-blue-700 text-xs font-bold rounded-full">
                              Upcoming
                            </span>
                          )}
                          {isPast && (
                            <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded-full">
                              Past
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};


