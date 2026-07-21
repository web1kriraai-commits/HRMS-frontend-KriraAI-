import React from 'react';
import { Plus, X } from 'lucide-react';
import {
  BondFormEntry,
  calculatePeriodMonthsFromDates,
  computeEndDateFromStartAndMonths,
  convertToDDMMYYYY,
  convertToYYYYMMDD,
  createEmptyBondFormEntry,
  parseDDMMYYYY
} from '../services/utils';

interface BondPeriodFormProps {
  bonds: BondFormEntry[];
  onChange: (bonds: BondFormEntry[]) => void;
  joiningDate?: string;
  compact?: boolean;
}

const getNextBondStartDate = (bonds: BondFormEntry[], index: number, joiningDate?: string): string => {
  if (index === 0) {
    return joiningDate ? convertToYYYYMMDD(joiningDate) : '';
  }
  const prevBond = bonds[index - 1];
  if (!prevBond?.endDate) return '';
  const prevEnd = parseDDMMYYYY(prevBond.endDate) || new Date(prevBond.endDate);
  if (isNaN(prevEnd.getTime())) return '';
  prevEnd.setDate(prevEnd.getDate() + 1);
  return convertToYYYYMMDD(prevEnd);
};

export const BondPeriodForm: React.FC<BondPeriodFormProps> = ({
  bonds,
  onChange,
  joiningDate,
  compact = false
}) => {
  const updateBond = (index: number, updates: Partial<BondFormEntry>) => {
    const updated = [...bonds];
    const current = { ...updated[index], ...updates };

    if (updates.startDate !== undefined || updates.endDate !== undefined) {
      if (current.startDate && current.endDate) {
        current.periodMonths = calculatePeriodMonthsFromDates(
          convertToDDMMYYYY(current.startDate),
          convertToDDMMYYYY(current.endDate)
        ).toString();
      }
    } else if (updates.periodMonths !== undefined && current.startDate && current.periodMonths) {
      const months = parseInt(current.periodMonths) || 0;
      if (months > 0) {
        current.endDate = convertToYYYYMMDD(
          computeEndDateFromStartAndMonths(convertToDDMMYYYY(current.startDate), months)
        );
      }
    }

    updated[index] = current;
    onChange(updated);
  };

  const addBond = () => {
    const nextBond = createEmptyBondFormEntry();
    const nextIndex = bonds.length;
    nextBond.startDate = getNextBondStartDate(bonds, nextIndex, joiningDate);
    onChange([...bonds, nextBond]);
  };

  const inputClass = compact
    ? 'w-full p-2 border border-gray-200 rounded text-xs'
    : 'w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all';

  const labelClass = compact
    ? 'block text-xs text-gray-600 mb-1'
    : 'block text-xs text-gray-500 uppercase font-semibold mb-1';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-gray-600 uppercase">Bond Periods</label>
        <button
          type="button"
          onClick={addBond}
          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          <Plus size={14} /> Add Bond
        </button>
      </div>

      {bonds.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No bonds added. Click &quot;Add Bond&quot; to add bond periods.</p>
      ) : (
        <div className="space-y-2">
          {bonds.map((bond, index) => (
            <div key={index} className={`p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2 ${compact ? '' : 'bg-white rounded-xl shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">Bond {index + 1}</span>
                <button
                  type="button"
                  onClick={() => onChange(bonds.filter((_, i) => i !== index))}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    className={inputClass}
                    value={bond.type}
                    onChange={e => updateBond(index, { type: e.target.value })}
                  >
                    <option value="Internship">Internship</option>
                    <option value="Job">Job</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Period (Months)</label>
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={bond.periodMonths}
                    onChange={e => updateBond(index, { periodMonths: e.target.value })}
                    placeholder="e.g., 6"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Start Date (DD-MM-YYYY)</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={bond.startDate}
                    onChange={e => updateBond(index, { startDate: e.target.value })}
                  />
                  {bond.startDate && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{convertToDDMMYYYY(bond.startDate)}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>End Date (DD-MM-YYYY)</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={bond.endDate}
                    onChange={e => updateBond(index, { endDate: e.target.value })}
                  />
                  {bond.endDate && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{convertToDDMMYYYY(bond.endDate)}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  {bond.type === 'Internship' ? 'Stipend' : bond.type === 'Job' ? 'Salary' : 'Amount'} (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={bond.salary || ''}
                  onChange={e => updateBond(index, { salary: e.target.value })}
                  placeholder={bond.type === 'Internship' ? 'e.g., 10000' : 'e.g., 25000'}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">Set start and end dates directly, or enter months to auto-calculate end date.</p>
    </div>
  );
};
