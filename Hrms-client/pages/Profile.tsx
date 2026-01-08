import React from 'react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import {
    User,
    Mail,
    Building2,
    Calendar,
    CreditCard,
    UserCircle,
    Phone,
    FileText
} from 'lucide-react';
import { formatDate, calculateBondRemaining } from '../services/utils';

export const Profile: React.FC = () => {
    const { auth } = useApp();
    const user = auth.user;

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Please log in to view your profile.</p>
            </div>
        );
    }

    // Bond information
    const allBonds = user.bonds || [];

    // Actual joining date
    const actualJoiningDate =
        user.salaryBreakdown && user.salaryBreakdown.length > 0
            ? user.salaryBreakdown[0].startDate
            : user.joiningDate;

    // Actual bond end date
    const actualBondEndDate =
        user.salaryBreakdown && user.salaryBreakdown.length > 0
            ? user.salaryBreakdown[user.salaryBreakdown.length - 1].endDate
            : null;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            </div>

            {/* Employee Details */}
            <Card title="Employee Details">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ProfileItem icon={<User />} label="Full Name" value={user.name} />
                    <ProfileItem icon={<Mail />} label="Email" value={user.email} />
                    <ProfileItem icon={<Building2 />} label="Department" value={user.department} />
                    <ProfileItem
                        icon={<Calendar />}
                        label="Joining Date"
                        value={actualJoiningDate ? formatDate(actualJoiningDate) : 'N/A'}
                    />
                    <ProfileItem
                        icon={<CreditCard />}
                        label="Aadhaar Number"
                        value={user.aadhaarNumber || 'Not Provided'}
                        muted={!user.aadhaarNumber}
                    />
                    <ProfileItem
                        icon={<UserCircle />}
                        label="Guardian Name"
                        value={user.guardianName || 'Not Provided'}
                        muted={!user.guardianName}
                    />
                    <ProfileItem
                        icon={<Phone />}
                        label="Mobile Number"
                        value={user.mobileNumber || 'Not Provided'}
                        muted={!user.mobileNumber}
                    />
                    <ProfileItem
                        icon={<Phone />}
                        label="Guardian Mobile Number"
                        value={user.guardianMobileNumber || 'Not Provided'}
                        muted={!user.guardianMobileNumber}
                    />
                </div>
            </Card>

            {/* Bond Details */}
            {allBonds.length > 0 ? (
                <Card title="Bond Details">
                    <div className="space-y-4">
                        {allBonds.map((bond, index) => {
                            const bondInfo = calculateBondRemaining([bond], bond.startDate);
                            const isActive = bondInfo?.currentBond !== null;
                            const remaining = bondInfo?.totalRemaining;

                            return (
                                <div
                                    key={index}
                                    className={`p-4 rounded-lg border-2 ${
                                        isActive
                                            ? 'bg-green-50 border-green-200'
                                            : 'bg-gray-50 border-gray-200'
                                    }`}
                                >
                                    <div className="flex gap-3">
                                        <div
                                            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                                isActive ? 'bg-green-100' : 'bg-gray-200'
                                            }`}
                                        >
                                            <FileText
                                                size={20}
                                                className={isActive ? 'text-green-600' : 'text-gray-500'}
                                            />
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-gray-900">
                                                    {bond.type} Bond
                                                </h3>
                                                {isActive && (
                                                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full">
                                                        Active
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                                <BondItem label="Period" value={`${bond.periodMonths} months`} />
                                                <BondItem
                                                    label="Start Date"
                                                    value={bond.startDate ? formatDate(bond.startDate) : 'N/A'}
                                                />
                                                <BondItem
                                                    label="End Date"
                                                    value={
                                                        index === allBonds.length - 1 && actualBondEndDate
                                                            ? formatDate(actualBondEndDate)
                                                            : bond.endDate
                                                            ? formatDate(bond.endDate)
                                                            : 'N/A'
                                                    }
                                                />
                                            </div>

                                            {isActive && remaining && (
                                                <div className="mt-3 p-3 bg-white rounded-md border border-green-200">
                                                    <p className="text-xs text-gray-600 font-semibold mb-1">
                                                        Remaining Period
                                                    </p>
                                                    <p className="text-sm font-bold text-green-700">
                                                        {remaining.display}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            ) : (
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

/* Helper Components */

const ProfileItem = ({
    icon,
    label,
    value,
    muted = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    muted?: boolean;
}) => (
    <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
            {icon}
        </div>
        <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                {label}
            </p>
            <p
                className={`text-base font-medium mt-1 ${
                    muted ? 'text-gray-400 italic' : 'text-gray-900'
                }`}
            >
                {value}
            </p>
        </div>
    </div>
);

const BondItem = ({ label, value }: { label: string; value: string }) => (
    <div>
        <p className="text-xs text-gray-500 font-semibold">{label}</p>
        <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
);
