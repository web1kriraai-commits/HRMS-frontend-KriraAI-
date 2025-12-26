import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Login } from './pages/Login';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { HRDashboard } from './pages/HRDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { TodayAttendance } from './pages/TodayAttendance';
import { Holidays } from './pages/Holidays';
import { Profile } from './pages/Profile';
import { Sidebar } from './components/Sidebar';
import { Role } from './types';

const PrivateRoute: React.FC<{ children: React.ReactNode; roles?: Role[] }> = ({ children, roles }) => {
  const { auth, checkingAuth } = useApp();

  // Wait for auth check to complete before redirecting
  if (checkingAuth) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  if (!auth.isAuthenticated || !auth.user) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(auth.user.role)) {
    return <Navigate to="/" />; // Redirect to home if not authorized
  }

  return <>{children}</>;
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useApp();
  if (!auth.isAuthenticated) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="ml-64 flex-1 p-8 overflow-y-auto h-screen">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

// Home dashboard based on role
const HomeDashboard = () => {
  const { auth } = useApp();
  if (auth.user?.role === Role.ADMIN) {
    return <AdminDashboard />;
  }
  return <EmployeeDashboard />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <PrivateRoute>
          <AppLayout>
            <HomeDashboard />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="/profile" element={
        <PrivateRoute>
          <AppLayout>
            <Profile />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="/hr-approvals" element={
        <PrivateRoute roles={[Role.HR, Role.ADMIN]}>
          <AppLayout>
            <HRDashboard />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="/hr-today" element={
        <PrivateRoute roles={[Role.HR, Role.ADMIN]}>
          <AppLayout>
            <TodayAttendance />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="/admin-settings" element={
        <PrivateRoute roles={[Role.ADMIN]}>
          <AppLayout>
            <AdminDashboard />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="/holidays" element={
        <PrivateRoute>
          <AppLayout>
            <Holidays />
          </AppLayout>
        </PrivateRoute>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AppProvider>
  );
};

export default App;
