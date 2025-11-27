import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Lock, Key, Mail, ArrowLeft } from 'lucide-react';
import { authAPI } from '../services/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'login' | 'change_password' | 'reset_password'>('login');
  const [loading, setLoading] = useState(false);
  
  // Reset password states
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  
  const { auth, checkingAuth, login, changePassword } = useApp();
  const navigate = useNavigate();

  // Redirect if already authenticated (but not if password change is required)
  React.useEffect(() => {
    if (!checkingAuth && auth.isAuthenticated && !auth.requiresPasswordChange) {
      navigate('/');
    }
  }, [auth.isAuthenticated, auth.requiresPasswordChange, checkingAuth, navigate]);

  // Show password change screen if required
  React.useEffect(() => {
    if (auth.requiresPasswordChange && auth.isAuthenticated) {
      setMode('change_password');
    }
  }, [auth.requiresPasswordChange, auth.isAuthenticated]);

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
        navigate('/');
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
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!resetEmail.trim()) {
      setError('Please enter your email');
      return;
    }
    if (resetNewPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword(resetEmail, resetNewPassword);
      setSuccess('Password reset successfully! You can now login.');
      setTimeout(() => {
        setMode('login');
        setResetEmail('');
        setResetNewPassword('');
        setSuccess('');
      }, 1500);
    } catch (error: any) {
      setError(error.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setMode('login');
    setError('');
    setSuccess('');
    setResetEmail('');
    setResetNewPassword('');
  };

  if (mode === 'change_password') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
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
      );
  }

  // Reset Password - Enter Email and New Password
  if (mode === 'reset_password') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-purple-200">
              <Key className="text-white" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
            <p className="text-gray-500 mt-2">Enter your registered email and new password</p>
          </div>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Enter your registered email"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Enter new password"
                required
              />
            </div>
            {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
            {success && <div className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</div>}
            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" size="lg" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
            <button
              type="button"
              onClick={goBackToLogin}
              className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-800 mt-2"
            >
              <ArrowLeft size={16} /> Back to Login
            </button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
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
            Forgot Password?
          </button>

          <div className="text-xs text-center text-gray-400 mt-4">
            Have a Good Day
          </div>
        </form>
      </Card>
    </div>
  );
};
