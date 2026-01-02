import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Lock, Key, Mail, ArrowLeft, Search, User, PenSquare, X, LogOut } from 'lucide-react';
import { authAPI, userAPI, setToken } from '../services/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'login' | 'change_password' | 'reset_password' | 'user_list'>('login');
  const [loading, setLoading] = useState(false);

  // Reset password states
  const [resetEmail, setResetEmail] = useState('');
  const [resetUsername, setResetUsername] = useState('');
  const [resetOTP, setResetOTP] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');

  // User List (Admin OTP flow) states
  const [users, setUsers] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedUserForReset, setSelectedUserForReset] = useState<any | null>(null);
  const [adminResetNewPassword, setAdminResetNewPassword] = useState('');

  const { auth, checkingAuth, login, changePassword, manualLogin, logout } = useApp();
  const navigate = useNavigate();

  // Redirect if already authenticated (but not if password change is required or we are in user_list mode)
  // Redirect if already authenticated (but not if password change is required or we are in user_list mode)
  React.useEffect(() => {
    // If we were in OTP mode and refreshed (mode reset to 'login' but stuck in auth state), force logout to return to login page
    if (sessionStorage.getItem('otp_login') === 'true' && mode !== 'user_list') {
      sessionStorage.removeItem('otp_login');
      logout();
      return;
    }

    if (!checkingAuth && auth.isAuthenticated && !auth.requiresPasswordChange && mode !== 'user_list') {
      navigate('/');
    }
  }, [auth.isAuthenticated, auth.requiresPasswordChange, checkingAuth, navigate, mode, logout]);

  // Show password change screen if required
  React.useEffect(() => {
    if (auth.requiresPasswordChange && auth.isAuthenticated) {
      setMode('change_password');
    }
  }, [auth.requiresPasswordChange, auth.isAuthenticated]);

  // Fetch users when entering user_list mode
  React.useEffect(() => {
    if (mode === 'user_list') {
      fetchUsers();
    }
  }, [mode]);

  const fetchUsers = async () => {
    try {
      const data = await userAPI.getAllUsers();
      setUsers(data);
      setSuccess(''); // Clear the loading success message so it doesn't obstruct the view
    } catch (err) {
      console.error('Failed to fetch users', err);
      setError('Failed to fetch user list');
    }
  };

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);

      if (result === 'success') {
        navigate('/', { replace: true });
      } else if (result === 'change_password') {
        setMode('change_password');
        setError('');
      } else {
        setError('Invalid credentials. Please check your username and password.');
      }
    } catch (error: any) {
      setError(error.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      await changePassword(newPassword);
      navigate('/', { replace: true });
    } catch (error: any) {
      setError(error.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!resetEmail.trim()) {
      setError('Please enter admin email');
      return;
    }

    setLoading(true);
    try {
      const result = await authAPI.sendAdminLoginOTP(resetEmail.trim());
      setSuccess(result.message || 'OTP sent successfully!');
      setOtpSent(true);
      setOtpEmail(resetEmail.trim());
    } catch (error: any) {
      setError(error.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!resetOTP.trim()) {
      setError('Please enter OTP');
      return;
    }
    setLoading(true);
    try {
      const result = await authAPI.verifyAdminLoginOTP(otpEmail || resetEmail.trim(), resetOTP.trim());
      if (result.token) {
        setToken(result.token);
      } else {
        console.error('No token received from OTP verification');
      }

      manualLogin(result.user);
      manualLogin(result.user);
      setSuccess('Verified successfully! Loading User List...');
      sessionStorage.setItem('otp_login', 'true');

      // Explicitly set mode to user_list to bypass redirect
      setMode('user_list');
    } catch (error: any) {
      setError(error.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset || !adminResetNewPassword.trim()) return;

    if (adminResetNewPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);
    try {
      await userAPI.updateUser(selectedUserForReset._id, {
        password: adminResetNewPassword
      });
      setSuccess(`Password for ${selectedUserForReset.name} has been reset successfully.`);
      setSelectedUserForReset(null);
      setAdminResetNewPassword('');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Reset password error:', error);
      // Try to parse error message from response if available
      const errorMessage = error.message || 'Failed to reset password.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setMode('login');
    setError('');
    setSuccess('');
    setResetEmail('');
    setResetUsername('');
    setResetOTP('');
    setResetNewPassword('');
    setOtpSent(false);
    setOtpEmail('');
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchText.toLowerCase()) ||
    user.username.toLowerCase().includes(searchText.toLowerCase()) ||
    user.email.toLowerCase().includes(searchText.toLowerCase())
  );

  if (mode === 'change_password') {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-slate-100 to-blue-50 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-xl border-0">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-yellow-500 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-yellow-200">
                <Key className="text-white" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Setup New Password</h1>
              <p className="text-gray-500 mt-2">This is your first login. Please set a secure password.</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                  autoFocus
                />
              </div>
              {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Setting...' : 'Set Password & Continue'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // Admin User List for Password Reset
  if (mode === 'user_list') {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-slate-100 to-blue-50 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl shadow-xl border-0 h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-lg">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <p className="text-gray-500 text-sm">Reset user passwords</p>
              </div>
            </div>

            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search users by name, username or email..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">
              {success && <div className="mb-4 text-green-600 text-sm bg-green-50 p-3 rounded-lg flex items-center gap-2 border border-green-100">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                {success}
              </div>}

              {error && <div className="mb-4 text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                {error}
              </div>}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <div key={user._id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white flex flex-col">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <User className="text-blue-600" size={20} />
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'HR' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                          {user.role}
                        </span>
                      </div>

                      <h3 className="font-semibold text-gray-900 truncate" title={user.name}>{user.name}</h3>
                      <p className="text-sm text-gray-500 mb-1 truncate">@{user.username}</p>
                      <p className="text-xs text-gray-400 mb-4 truncate">{user.email}</p>

                      <Button
                        variant="outline"
                        className="mt-auto w-full text-sm py-1.5 flex items-center justify-center gap-2 hover:bg-gray-50"
                        onClick={() => {
                          setSelectedUserForReset(user);
                          setAdminResetNewPassword('');
                          setError('');
                          setSuccess('');
                        }}
                      >
                        <PenSquare size={14} /> Reset Password
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-10 text-gray-400">
                    No users found matching "{searchText}"
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Password Reset Modal */}
          {selectedUserForReset && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <Card className="w-full max-w-sm shadow-2xl border-0 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex justify-between items-center text-white">
                  <h3 className="font-semibold">Reset Password</h3>
                  <button
                    onClick={() => setSelectedUserForReset(null)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Setting new password for <strong>{selectedUserForReset.name}</strong> (@{selectedUserForReset.username})
                  </p>

                  <form onSubmit={handleAdminResetUserPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">New Password</label>
                      <input
                        type="password"
                        value={adminResetNewPassword}
                        onChange={(e) => setAdminResetNewPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="Enter new password"
                        autoFocus
                        required
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="flex-1"
                        onClick={() => setSelectedUserForReset(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : 'Save Password'}
                      </Button>
                    </div>
                  </form>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Admin Login - OTP Flow
  if (mode === 'reset_password') {
    return (
      <div className="h-screen w-full bg-gradient-to-br from-slate-100 to-blue-50 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-xl border-0">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-purple-200">
                <Key className="text-white" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
              <p className="text-gray-500 mt-2">
                {otpSent ? 'Enter OTP to verify and login' : 'Enter registered Admin Email to receive OTP'}
              </p>
            </div>

            {!otpSent ? (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="Enter admin email"
                    autoFocus
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">OTP will be sent to this email address</p>
                </div>

                {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
                {success && <div className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</div>}
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" size="lg" disabled={loading}>
                  {loading ? 'Sending...' : 'Send OTP'}
                </Button>
                <button
                  type="button"
                  onClick={goBackToLogin}
                  className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-800 mt-2"
                >
                  <ArrowLeft size={16} /> Back to Login
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>OTP sent to:</strong> {otpEmail}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Please check your email for the 6-digit OTP code</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OTP *</label>
                  <input
                    type="text"
                    value={resetOTP}
                    onChange={(e) => setResetOTP(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-center text-2xl tracking-widest font-mono"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                  />
                </div>
                {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
                {success && <div className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</div>}
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" size="lg" disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify OTP & Login'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setResetOTP('');
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-800 mt-2"
                >
                  <ArrowLeft size={16} /> Back to Send OTP
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-100 to-blue-50 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
              <Lock className="text-white" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
            <p className="text-gray-500 mt-2">Sign in to KriraAI HRMS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Enter your username"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="password"
              />
            </div>

            {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
            {success && <div className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</div>}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>

            <button
              type="button"
              onClick={() => { setMode('reset_password'); setError(''); setSuccess(''); }}
              className="w-full text-sm text-blue-600 hover:text-blue-800 mt-2"
            >
              Admin Login / Forgot Password?
            </button>

            <div className="text-xs text-center text-gray-400 mt-4">
              Have a Good Day
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
