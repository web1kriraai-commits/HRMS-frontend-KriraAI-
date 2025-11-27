import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Role } from '../types';
import { LayoutDashboard, Users, Settings, LogOut, CheckSquare, Calendar } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { auth, logout } = useApp();
  const user = auth.user;

  if (!user) return null;

  return (
    <div className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col shadow-xl">
      <div className="p-6 border-b border-slate-800 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white">K</div>
        <span className="text-xl font-bold tracking-tight">KriraAI HRMS</span>
      </div>

      <div className="flex-1 py-6 px-3 space-y-1">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Menu</p>
        
        <NavLink to="/" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        {user.role !== Role.EMPLOYEE && (
          <>
             <NavLink to="/hr-approvals" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              <CheckSquare size={18} />
              Approvals
            </NavLink>
            <NavLink to="/hr-today" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Calendar size={18} />
              Today
            </NavLink>
          </>
        )}

      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs">
            {user.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-slate-400">{user.role}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-lg transition-colors">
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};