import React, { useEffect, useState } from 'react';
import { Shield, Monitor, LogOut, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Loader } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import apiClient from '@/lib/api';
import { useNotificationStore } from '@/store/notificationStore';

interface Session {
  id: string;
  device_info: string | null;
  ip_address: string | null;
  user_agent: string | null;
  last_active: string;
  created_at: string;
  is_active: boolean;
  is_current: boolean;
}

function PasswordValidation({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map(({ label, ok }) => (
        <div key={label} className="flex items-center gap-1.5">
          {ok ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" />
          )}
          <span className={`text-xs ${ok ? 'text-green-600' : 'text-neutral-400'}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const { add: addNotification } = useNotificationStore();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await apiClient.get('/settings/sessions');
      setSessions(res.data);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      addNotification({ type: 'error', title: 'Validation', message: 'All password fields are required' });
      return;
    }
    if (newPassword !== confirmPassword) {
      addNotification({ type: 'error', title: 'Validation', message: 'New passwords do not match' });
      return;
    }
    setPwLoading(true);
    try {
      await apiClient.post('/settings/security/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      addNotification({ type: 'success', title: 'Success', message: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to change password';
      addNotification({ type: 'error', title: 'Error', message: msg });
    } finally {
      setPwLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await apiClient.delete(`/settings/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      addNotification({ type: 'success', title: 'Session Revoked', message: 'Session has been terminated' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to revoke session' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setRevokingAll(true);
    try {
      await apiClient.post('/settings/sessions/revoke-all-others');
      addNotification({ type: 'success', title: 'Sessions Revoked', message: 'All other sessions have been terminated' });
      await loadSessions();
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Failed to revoke sessions' });
    } finally {
      setRevokingAll(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Change Password" subtitle="Update your account password" />
        <div className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
          <div>
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
            <PasswordValidation password={newPassword} />
          </div>
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            error={confirmPassword && newPassword !== confirmPassword ? "Passwords do not match" : undefined}
          />
          <div className="flex justify-end">
            <Button onClick={handleChangePassword} loading={pwLoading}>
              Change Password
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Password Policy" subtitle="Current platform password requirements" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Minimum Length', value: '8 characters' },
            { label: 'Complexity', value: 'Mixed case + numbers recommended' },
            { label: 'Expiry', value: 'No forced expiry' },
            { label: 'History', value: 'Previous passwords allowed' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-3 py-2.5 bg-neutral-50 rounded-xl">
              <span className="text-sm text-neutral-600">{label}</span>
              <span className="text-sm font-medium text-neutral-800">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Active Sessions</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Manage devices currently signed in to your account</p>
          </div>
          {otherSessions.length > 0 && (
            <Button variant="danger" size="sm" onClick={handleRevokeAllOthers} loading={revokingAll} icon={<LogOut className="w-3.5 h-3.5" />}>
              Revoke All Others
            </Button>
          )}
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-sm">No active sessions found</div>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${session.is_current ? 'border-primary-200 bg-primary-50' : 'border-neutral-100 bg-neutral-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${session.is_current ? 'bg-primary-100' : 'bg-neutral-200'}`}>
                    <Monitor className={`w-4 h-4 ${session.is_current ? 'text-primary-600' : 'text-neutral-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-neutral-800">
                        {session.device_info || 'Unknown Device'}
                      </p>
                      {session.is_current && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-md font-medium">Current</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">
                      {session.ip_address ? `${session.ip_address} · ` : ''}
                      Last active {formatDate(session.last_active)}
                    </p>
                  </div>
                </div>
                {!session.is_current && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleRevokeSession(session.id)}
                    loading={revokingId === session.id}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Multi-Factor Authentication" subtitle="Additional layer of account security" />
        <div className="flex items-center justify-between px-4 py-3.5 bg-neutral-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center">
              <Shield className="w-4 h-4 text-neutral-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">Authenticator App (TOTP)</p>
              <p className="text-xs text-neutral-400">Time-based one-time passwords via authenticator app</p>
            </div>
          </div>
          <span className="text-xs px-2 py-1 bg-neutral-200 text-neutral-500 rounded-lg font-medium">Coming Soon</span>
        </div>
      </Card>
    </div>
  );
}
