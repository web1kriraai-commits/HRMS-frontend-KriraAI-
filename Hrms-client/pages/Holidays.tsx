import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { formatDate } from '../services/utils';
import { Calendar, Filter, X, Plus, Edit2, Trash2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Role } from '../types';

export const Holidays: React.FC = () => {
  const { companyHolidays } = useApp();

  const [yearFilter, setYearFilter] = useState<string>(() => {
    const currentYear = new Date().getFullYear();
    return currentYear.toString();
  });
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');

  // Holiday Management State
  const { auth, addHoliday, updateHoliday, deleteHoliday, autoAddSundays, refreshData } = useApp();
  const isAdmin = auth.user?.role === Role.ADMIN || auth.user?.role === Role.HR;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openAddModal) {
      handleOpenModal();
      // Clear state to avoid reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Form State
  const [formData, setFormData] = useState({
    date: '',
    description: ''
  });

  // Get unique years from holidays
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    companyHolidays.forEach(holiday => {
      const year = new Date(holiday.date).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [companyHolidays]);

  // Total Real Holidays (absolute total in system)
  const totalRealCount = companyHolidays.length;

  // Real Holidays for the selected year
  const yearRealCount = useMemo(() => {
    if (!yearFilter) return totalRealCount;
    const year = parseInt(yearFilter);
    return companyHolidays.filter(h => new Date(h.date).getFullYear() === year).length;
  }, [companyHolidays, yearFilter]);

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

  const handleOpenModal = (holiday?: any) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setFormData({
        date: holiday.date,
        description: holiday.description
      });
    } else {
      setEditingHoliday(null);
      setFormData({
        date: '',
        description: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleAutoAddSundays = async () => {
    setIsSubmitting(true);
    try {
      await autoAddSundays();
      setIsModalOpen(false);
      await refreshData();
    } catch (error) {
      console.error('Error auto-adding Sundays:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, formData);
      } else {
        await addHoliday(formData.date, formData.description);
      }
      setIsModalOpen(false);
      await refreshData();
    } catch (error) {
      console.error('Error saving holiday:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this holiday?')) {
      try {
        await deleteHoliday(id);
        await refreshData();
      } catch (error) {
        console.error('Error deleting holiday:', error);
      }
    }
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
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-6 py-6 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 active:scale-95 transition-all"
            >
              <Plus size={18} />
              Add Holiday
            </Button>
          )}
          <div className="text-right">
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-6 py-4">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Total Holidays</p>
              <p className="text-3xl font-bold text-purple-700 mt-1">{yearRealCount}</p>
              <p className="text-xs text-purple-600 mt-1">
                {yearFilter ? `in ${yearFilter}` : 'in system'}
              </p>
            </div>
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
              Total: <span className="font-semibold">{yearRealCount}</span> {yearFilter ? `holiday(s) in ${yearFilter}` : 'holiday(s)'}
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
                      className={`p-4 rounded-xl border-2 transition-all hover:shadow-md relative group ${isToday
                        ? 'bg-purple-50 border-purple-300 shadow-sm'
                        : isPast
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-blue-50 border-blue-200'
                        }`}
                    >
                      {/* Admin Actions on Hover */}
                      {isAdmin && holiday.id.indexOf('sunday') === -1 && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenModal(holiday)}
                            className="p-1.5 bg-white rounded-lg text-blue-600 hover:bg-blue-50 shadow-sm border border-slate-100"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(holiday.id)}
                            className="p-1.5 bg-white rounded-lg text-red-600 hover:bg-red-50 shadow-sm border border-slate-100"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm ${isToday
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
                                    <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${holiday.createdByRole === 'Admin'
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
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <Card className="w-full max-w-lg border-none shadow-2xl overflow-hidden bg-white animate-in zoom-in-95 duration-200 rounded-[1.5rem]">
            {/* Modal Header */}
            <div className="bg-[#111827] p-6 py-6 text-white relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-5 right-6 h-8 w-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 hover:rotate-90 transition-all duration-300 group z-10"
              >
                <X size={16} className="text-white/70 group-hover:text-white transition-colors" />
              </button>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-[#9333ea] rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/40">
                  <Plus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-bold uppercase tracking-tight">
                    {editingHoliday ? 'Edit Holiday' : 'Add Company Holiday'}
                  </h2>
                  <p className="text-slate-400 text-[8px] font-bold mt-0.5 uppercase tracking-[0.2em]">Plan Center • HR Panel</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 pt-8 space-y-6 bg-white">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Holiday Date */}
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[#94a3b8]">Holiday Date</label>
                  <div className="relative group">
                    <input
                      type="date"
                      className="w-full bg-[#f8fafc] border-2 border-[#f1f5f9] rounded-[0.75rem] px-5 py-3 pl-14 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all font-semibold text-slate-800 text-sm"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-[#f5f3ff] flex items-center justify-center text-[#9333ea] transition-all duration-300">
                      <Calendar size={16} />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[#94a3b8]">Description</label>
                  <div className="relative group">
                    <input
                      type="text"
                      className="w-full bg-[#f8fafc] border-2 border-[#f1f5f9] rounded-[0.75rem] px-5 py-3 pl-14 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all font-semibold text-slate-800 text-sm"
                      placeholder="e.g. Independence Day"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-[#f5f3ff] flex items-center justify-center text-[#9333ea] transition-all duration-300">
                      <AlertCircle size={16} />
                    </div>
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full py-3.5 rounded-[0.75rem] font-bold uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-blue-500/10 transition-all hover:translate-y-[-2px] active:scale-[0.98] disabled:opacity-50 bg-[#2563eb] border-none text-white flex items-center justify-center gap-2"
                    disabled={isSubmitting}
                  >
                    <Plus size={14} strokeWidth={3} />
                    {isSubmitting ? 'Syncing...' : editingHoliday ? 'Save Changes' : 'Post Holiday'}
                  </Button>
                </div>
              </form>

              {/* Auto-Add Sundays Section */}
              {!editingHoliday && (
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <Button
                    onClick={handleAutoAddSundays}
                    className="w-full py-4 rounded-[0.75rem] font-bold uppercase tracking-[0.15em] text-[9px] transition-all hover:translate-y-[-2px] active:scale-[0.98] disabled:opacity-50 bg-gradient-to-r from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20"
                    disabled={isSubmitting}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Calendar size={16} />
                      Auto Add All Sundays (Current Month)
                    </span>
                  </Button>
                  <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest leading-relaxed px-4">
                    Adds all Sundays of the current month as holidays
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};


