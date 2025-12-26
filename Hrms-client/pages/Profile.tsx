import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { User, Mail, Building2, Calendar, CreditCard, UserCircle, Phone, FileText, Eye, EyeOff, DollarSign } from 'lucide-react';
import { formatDate, calculateBondRemaining } from '../services/utils';

export const Profile: React.FC = () => {
    const { auth } = useApp();
    const user = auth.user;
    const [showSalary, setShowSalary] = useState(false);

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Please log in to view your profile.</p>
            </div>
        );
    }

    // Calculate bond information
    const bondInfo = calculateBondRemaining(user.bonds, user.joiningDate);
    const currentBond = bondInfo?.currentBond;
    const allBonds = user.bonds || [];

    // Get current salary from active bond
    const currentSalary = currentBond?.salary || 0;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            </div>

            {/* Employee Details Card */}
            <Card title="Employee Details">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <User className="text-blue-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Full Name</p>
                            <p className="text-base font-medium text-gray-900 mt-1">{user.name}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Mail className="text-purple-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Email</p>
                            <p className="text-base font-medium text-gray-900 mt-1">{user.email}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                            <Building2 className="text-green-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Department</p>
                            <p className="text-base font-medium text-gray-900 mt-1">{user.department}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <Calendar className="text-orange-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Joining Date</p>
                            <p className="text-base font-medium text-gray-900 mt-1">
                                {user.joiningDate ? formatDate(user.joiningDate) : 'N/A'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                            <CreditCard className="text-red-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Aadhaar Number</p>
                            <p className={`text-base font-medium mt-1 ${user.aadhaarNumber ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                                {user.aadhaarNumber || 'Not Provided'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <UserCircle className="text-indigo-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Guardian Name</p>
                            <p className={`text-base font-medium mt-1 ${user.guardianName ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                                {user.guardianName || 'Not Provided'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <Phone className="text-teal-600" size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Mobile Number</p>
                            <p className={`text-base font-medium mt-1 ${user.mobileNumber ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                                {user.mobileNumber || 'Not Provided'}
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Salary Information Card */}
            <Card title="Salary Information">
                <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <DollarSign className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 font-medium">Current Salary</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {showSalary ? (
                                    `₹${currentSalary.toLocaleString('en-IN')}`
                                ) : (
                                    <span className="tracking-wider">••••••••</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        onMouseDown={() => setShowSalary(true)}
                        onMouseUp={() => setShowSalary(false)}
                        onMouseLeave={() => setShowSalary(false)}
                        onTouchStart={() => setShowSalary(true)}
                        onTouchEnd={() => setShowSalary(false)}
                        className="h-12 w-12 rounded-full bg-white border-2 border-blue-200 hover:border-blue-400 flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm"
                        title="Hold to view salary"
                    >
                        {showSalary ? (
                            <Eye className="text-blue-600" size={20} />
                        ) : (
                            <EyeOff className="text-gray-400" size={20} />
                        )}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 italic">
                    💡 Hold the eye button to view your salary
                </p>
            </Card>

            {/* Bond Details Card */}
            {allBonds.length > 0 && (
                <Card title="Bond Details">
                    <div className="space-y-4">
                        {allBonds.map((bond, index) => {
                            const bondInfo = calculateBondRemaining([bond], bond.startDate);
                            const isActive = bondInfo?.currentBond !== null;
                            const remaining = bondInfo?.totalRemaining;

                            return (
                                <div
                                    key={index}
                                    className={`p-4 rounded-lg border-2 ${isActive
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-gray-50 border-gray-200'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1">
                                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-green-100' : 'bg-gray-200'
                                                }`}>
                                                <FileText className={isActive ? 'text-green-600' : 'text-gray-500'} size={20} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-gray-900">{bond.type} Bond</h3>
                                                    {isActive && (
                                                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                                    <div>
                                                        <p className="text-xs text-gray-500 font-semibold">Period</p>
                                                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                                                            {bond.periodMonths} months
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 font-semibold">Start Date</p>
                                                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                                                            {bond.startDate ? formatDate(bond.startDate) : 'N/A'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 font-semibold">End Date</p>
                                                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                                                            {bondInfo?.currentBond?.endDate ? formatDate(bondInfo.currentBond.endDate) : 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isActive && remaining && (
                                                    <div className="mt-3 p-3 bg-white rounded-md border border-green-200">
                                                        <p className="text-xs text-gray-600 font-semibold mb-1">Remaining Period</p>
                                                        <p className="text-sm font-bold text-green-700">
                                                            {remaining.display}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {allBonds.length === 0 && (
                <Card title="Bond Details">
                    <div className="text-center py-8">
                        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                            <FileText className="text-gray-400" size={24} />
                        </div>
                        <p className="text-gray-500 text-sm">No bond information available</p>
                    </div>
                </Card>
            )}
        </div>
    );
};
