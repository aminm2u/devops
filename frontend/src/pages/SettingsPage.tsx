import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Bell,
  Shield,
  Palette,
  Save,
  Loader2,
  Check,
  Monitor,
  Sun,
  Moon,
  Server,
  RefreshCw,
  Link,
  Unlink,
  Download,
  FileText,
  Mail,
  Calendar,
  Trash2,
  AlertTriangle,
  Video,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { FormDialog } from '@/components/ui/form-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import apiClient from '@/api/client';
import { profileApi } from '@/api/profile';
import { MicrosoftIntegration } from '@/components/settings/MicrosoftIntegration';
import { cn, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import * as notificationsApi from '@/api/notifications';

// ── Settings storage helpers ──────────────────────────────────────────────────
const SETTINGS_KEY = 'devops-platform-settings';

interface SettingsData {
  notifications: {
    email: boolean;
    push: boolean;
    incidentAlerts: boolean;
    deploymentUpdates: boolean;
    weeklyReport: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
  };
}

const defaultSettings: SettingsData = {
  notifications: {
    email: true,
    push: true,
    incidentAlerts: true,
    deploymentUpdates: true,
    weeklyReport: false,
  },
  appearance: {
    theme: 'system',
    language: 'en',
    timezone: 'UTC',
  },
};

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultSettings,
        ...parsed,
        notifications: { ...defaultSettings.notifications, ...parsed.notifications },
        appearance: { ...defaultSettings.appearance, ...parsed.appearance },
      };
    }
  } catch {}
  return defaultSettings;
}

function saveSettings(settings: SettingsData) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Main Component ────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user, setUser, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const { setTheme: setCurrentTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Profile state ──────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: profileApi.updateProfile,
    onSuccess: (response) => {
      setUser(response.data);
      toast.success('Profile updated successfully');
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: profileApi.updatePassword,
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    },
    onError: () => {
      toast.error('Failed to update password');
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: profileApi.deleteAccount,
    onSuccess: async () => {
      toast.success('Account deleted successfully');
      await logout();
      navigate('/login');
    },
    onError: () => {
      toast.error('Failed to delete account');
    },
  });

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ name, email });
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    updatePasswordMutation.mutate({
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: confirmPassword,
    });
  };

  const handleDeleteAccount = () => {
    if (!deletePassword) {
      toast.error('Please enter your password');
      return;
    }
    deleteAccountMutation.mutate(deletePassword);
  };

  const userInitials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  // Load persisted settings
  const [settings, setSettings] = useState<SettingsData>(loadSettings);

  // Load notification preferences from backend on mount
  useEffect(() => {
    notificationsApi.getPreferences()
      .then((backendPrefs) => {
        setSettings((prev) => ({
          ...prev,
          notifications: {
            email: backendPrefs.email,
            push: backendPrefs.push,
            incidentAlerts: backendPrefs.incidentAlerts,
            deploymentUpdates: backendPrefs.deploymentUpdates,
            weeklyReport: backendPrefs.weeklyReport,
          },
        }));
      })
      .catch(() => {
        // Backend unavailable, keep localStorage settings
      });
  }, []);

  const updateNotification = (key: keyof SettingsData['notifications'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  };

  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, theme },
    }));
    setCurrentTheme(theme);
  };

  const setLanguage = (language: string) => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, language },
    }));
  };

  const setTimezone = (timezone: string) => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, timezone },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to localStorage (appearance settings)
      saveSettings(settings);
      // Save notification preferences to backend
      await notificationsApi.updatePreferences(settings.notifications);
      setSaved(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

  const msQuery = new URLSearchParams(window.location.search).get('msconnect');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account, preferences and integrations</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <User className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="microsoft" className="gap-2">
            <Video className="h-4 w-4" />
            Microsoft Teams
          </TabsTrigger>
          {(hasRole('super-admin') || hasRole('devops-admin')) && (
            <TabsTrigger value="npm" className="gap-2">
              <Server className="h-4 w-4" />
              Nginx Proxy
            </TabsTrigger>
          )}
          {hasRole('super-admin') && (
            <TabsTrigger value="team" className="gap-2">
              <Shield className="h-4 w-4" />
              Team
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Profile tab ─────────────────────────────────────────────── */}
        <TabsContent value="profile" className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                  {userInitials}
                </div>
                <div>
                  <CardTitle>{user?.name}</CardTitle>
                  <CardDescription>{user?.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Member since {user?.createdAt ? formatDate(user.createdAt) : 'Unknown'}
                </span>
              </div>
              {user?.roles && user.roles.length > 0 && (
                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex flex-wrap gap-2">
                    {user.roles.map((role) => (
                      <Badge key={typeof role === 'string' ? role : role.id} variant="secondary">
                        {typeof role === 'string' ? role : role.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Profile */}
          <Card>
            <CardHeader>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email"
                  />
                </div>
                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
                <Button type="submit" disabled={updatePasswordMutation.isPending}>
                  {updatePasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions. Please be careful.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── General Settings ──────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Regional</CardTitle>
              <CardDescription>Language and timezone preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Language</Label>
                  <select
                    value={settings.appearance.language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="en">English</option>
                    <option value="ms">Bahasa Malaysia</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <select
                    value={settings.appearance.timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="UTC">UTC</option>
                    <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (GMT+8)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notification Settings ─────────────────────────────────────── */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {([
                { key: 'email' as const, label: 'Email Notifications', desc: 'Receive notifications via email' },
                { key: 'push' as const, label: 'Push Notifications', desc: 'Receive in-browser push notifications' },
                { key: 'incidentAlerts' as const, label: 'Incident Alerts', desc: 'Get alerted when incidents are created or updated' },
                { key: 'deploymentUpdates' as const, label: 'Deployment Updates', desc: 'Notify when deployments complete or fail' },
                { key: 'weeklyReport' as const, label: 'Weekly Report', desc: 'Receive a weekly summary of activity' },
              ]).map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={settings.notifications[item.key]}
                    onCheckedChange={(val) => updateNotification(item.key, val)}
                  />
                </div>
              ))}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Export Weekly Report
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Download the current weekly report as PDF
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch('/api/notifications/weekly-report/pdf', {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!res.ok) throw new Error('Failed to download');
                      const blob = await res.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `weekly-report-${new Date().toISOString().split('T')[0]}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      a.remove();
                      toast.success('Weekly report downloaded');
                    } catch {
                      toast.error('Failed to download weekly report');
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Appearance Settings ───────────────────────────────────────── */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize the look and feel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Theme</Label>
                <div className="grid grid-cols-3 gap-3">
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-muted-foreground/30',
                        settings.appearance.theme === value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-transparent hover:bg-muted/50'
                      )}
                    >
                      <Icon className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Sidebar</Label>
                <p className="text-xs text-muted-foreground">
                  Sidebar can be collapsed from the main navigation
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Microsoft Teams integration ──────────────────────────────── */}
        <TabsContent value="microsoft" className="space-y-6">
          <MicrosoftIntegration canManageApp={hasRole('super-admin')} />
          {msQuery && msQuery !== 'success' && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                Microsoft sign-in failed
                {msQuery === 'invalid_state' && ' (the link request expired — please try again)'}
                . Check the Entra ID app registration and redirect URI, then try connecting again.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Nginx Proxy Manager Settings ─────────────────────────────── */}
        {(hasRole('super-admin') || hasRole('devops-admin')) && (
          <TabsContent value="npm" className="space-y-6">
            <NpmSettings />
          </TabsContent>
        )}

        {/* ── Team Settings (Admin only) ────────────────────────────────── */}
        {hasRole('super-admin') && (
          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Management</CardTitle>
                <CardDescription>Manage team members and their roles</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Shield className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Team management coming soon</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invite members, assign roles, and manage permissions
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Save Button ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || saved}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <FormDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setDeletePassword('');
        }}
        title="Are you absolutely sure?"
        description="This action cannot be undone. This will permanently delete your account and remove all your data from our servers."
        onSubmit={handleDeleteAccount}
        submitLabel="Delete Account"
        isSubmitting={deleteAccountMutation.isPending}
        submitDisabled={!deletePassword}
      >
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">
            This action is irreversible. All your projects, settings, and data will be permanently deleted.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="deletePassword">Enter your password to confirm</Label>
          <Input
            id="deletePassword"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>
      </FormDialog>
    </div>
  );
}

// ── NPM Settings Component ───────────────────────────────────────────────────
function NpmSettings() {
  const [npmUrl, setNpmUrl] = useState('');
  const [npmToken, setNpmToken] = useState('');
  const [npmUserId, setNpmUserId] = useState('');
  const [npmEnabled, setNpmEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  // Load existing config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await apiClient.get('/npm/config');
        if (res.data?.data) {
          const config = res.data.data;
          setNpmUrl(config.url || '');
          setNpmEnabled(config.enabled || false);
          setNpmUserId(config.userId?.toString() || '');
          // Token is masked, so we keep the input empty
        }
      } catch (err) {
        // Config not found yet
      }
    };
    loadConfig();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Save config first if token is provided
      if (npmToken) {
        await apiClient.post('/npm/config', {
          url: npmUrl,
          apiToken: npmToken,
          userId: parseInt(npmUserId) || 1,
        });
      }
      await apiClient.post('/npm/test');
      toast.success('Connection successful!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/npm/config', {
        url: npmUrl,
        apiToken: npmToken || undefined,
        userId: parseInt(npmUserId) || 1,
        enabled: npmEnabled,
      });
      toast.success('NPM configuration saved');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiClient.post('/npm/sync');
      setSyncResult(res.data?.data);
      toast.success(res.data?.message || 'Sync complete');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Nginx Proxy Manager Integration
        </CardTitle>
        <CardDescription>
          Connect to your Nginx Proxy Manager instance to sync SSL certificates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {npmEnabled ? (
              <Link className="h-5 w-5 text-green-500" />
            ) : (
              <Unlink className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {npmEnabled ? 'Connected' : 'Not Connected'}
              </p>
              <p className="text-xs text-muted-foreground">
                {npmUrl || 'No URL configured'}
              </p>
            </div>
          </div>
          <Switch
            checked={npmEnabled}
            onCheckedChange={setNpmEnabled}
          />
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="npm-url">NPM URL</Label>
            <Input
              id="npm-url"
              value={npmUrl}
              onChange={(e) => setNpmUrl(e.target.value)}
              placeholder="http://192.168.1.20:81"
            />
            <p className="text-xs text-muted-foreground">
              The URL of your Nginx Proxy Manager instance
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="npm-token">API Token</Label>
            <Input
              id="npm-token"
              type="password"
              value={npmToken}
              onChange={(e) => setNpmToken(e.target.value)}
              placeholder="Enter your API token"
            />
            <p className="text-xs text-muted-foreground">
              Get this from NPM → Settings → API Tokens
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="npm-user">User ID</Label>
            <Input
              id="npm-user"
              type="number"
              value={npmUserId}
              onChange={(e) => setNpmUserId(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Your NPM user ID (found in My Account)
            </p>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !npmUrl}
          >
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>

          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing || !npmEnabled}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Certificates
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </div>

        {/* Sync Results */}
        {syncResult && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="font-medium mb-2">Last Sync Results:</p>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">✓ {syncResult.imported} imported</span>
              <span className="text-blue-600">↻ {syncResult.updated} updated</span>
              <span className="text-muted-foreground">– {syncResult.skipped} skipped</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
