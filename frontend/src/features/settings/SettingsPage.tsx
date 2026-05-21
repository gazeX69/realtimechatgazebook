import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { LogOut, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { Button } from '../../components/ui/Button';
import { apiClient, apiData } from '../../lib/api-client';
import { authStorage } from '../../lib/auth-storage';
import { resolveMedia } from '../../lib/media-resolver';
import { User, useAuthStore } from '../../stores/auth-store';
import { useChatStore } from '../../stores/chat-store';
import { useFeedStore } from '../../stores/feed-store';
import { useFollowStore } from '../../stores/follow-store';

type SessionItem = {
  id: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [profileForm, setProfileForm] = useState({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ? resolveMedia(user.avatarUrl) : null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [privacyForm, setPrivacyForm] = useState({ allowGroupInvite: user?.allowGroupInvite ?? 'friends_only' });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      displayName: user.displayName,
      username: user.username,
      bio: user.bio ?? '',
    });
    setAvatarPreview(user.avatarUrl ? resolveMedia(user.avatarUrl) : null);
    setPrivacyForm({ allowGroupInvite: user.allowGroupInvite ?? 'friends_only' });
  }, [user?.id]);

  useEffect(() => {
    if (!avatarFile) return;
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  useEffect(() => {
    if (!user?.id) return;
    void loadSessions();
  }, [user?.id]);

  if (!user) return null;

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = profileForm.displayName.trim();
    const username = profileForm.username.trim().toLowerCase();
    if (displayName.length < 2) {
      setProfileStatus('Display name minimal 2 karakter.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      setProfileStatus('Username harus 3-32 karakter dan hanya huruf, angka, atau underscore.');
      return;
    }

    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const avatarUrl = avatarFile ? await uploadAvatar(avatarFile) : undefined;
      const updated = await apiData<User>(apiClient.put('/me/profile', {
        displayName,
        username,
        bio: profileForm.bio,
        ...(avatarUrl ? { avatarUrl } : {}),
      }));
      setUser(updated);
      useFeedStore.getState().applyUserIdentity(updated);
      useChatStore.getState().applyUserIdentity(updated);
      useFollowStore.setState((state) => {
        const profile = state.profiles[updated.id];
        if (!profile) return state;
        return { profiles: { ...state.profiles, [updated.id]: { ...profile, ...updated } } };
      });
      setAvatarFile(null);
      setAvatarPreview(updated.avatarUrl ? resolveMedia(updated.avatarUrl) : null);
      setProfileStatus('Profile updated.');
    } catch (error) {
      setProfileStatus(errorMessage(error, 'Profile update failed.'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      setPasswordStatus('Password baru minimal 8 karakter.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus('Konfirmasi password tidak sama.');
      return;
    }

    setSavingPassword(true);
    setPasswordStatus(null);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordStatus('Password updated.');
    } catch (error) {
      setPasswordStatus(errorMessage(error, 'Password update failed.'));
    } finally {
      setSavingPassword(false);
    }
  }

  async function submitPrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPrivacy(true);
    setPrivacyStatus(null);
    try {
      const updated = await apiData<User>(apiClient.put('/me/profile', privacyForm));
      setUser(updated);
      setPrivacyStatus('Privacy updated.');
    } catch (error) {
      setPrivacyStatus(errorMessage(error, 'Privacy update failed.'));
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function loadSessions() {
    const refreshToken = authStorage.getRefreshToken();
    if (!refreshToken) return;
    setLoadingSessions(true);
    setSessionStatus(null);
    try {
      const loaded = await apiData<SessionItem[]>(apiClient.post('/auth/sessions', { refreshToken }));
      setSessions(loaded);
    } catch (error) {
      setSessionStatus(errorMessage(error, 'Failed to load sessions.'));
    } finally {
      setLoadingSessions(false);
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionStatus(null);
    try {
      await apiClient.post('/auth/sessions/revoke', { sessionId });
      setSessionStatus('Session revoked.');
      await loadSessions();
    } catch (error) {
      setSessionStatus(errorMessage(error, 'Failed to revoke session.'));
    }
  }

  async function revokeOtherSessions() {
    const refreshToken = authStorage.getRefreshToken();
    if (!refreshToken) return;
    setSessionStatus(null);
    try {
      await apiClient.post('/auth/sessions/revoke-others', { refreshToken });
      setSessionStatus('Other sessions logged out.');
      await loadSessions();
    } catch (error) {
      setSessionStatus(errorMessage(error, 'Failed to revoke other sessions.'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-x-hidden">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Account</p>
        <h1 className="mt-1 text-xl font-semibold text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your public identity and account security.</p>
      </section>

      <form className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon" onSubmit={submitProfile}>
        <SectionTitle title="Profile Info" />
        <div className="mt-4 grid gap-4">
          <Field label="Display Name">
            <input className={inputClassName} value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} maxLength={80} />
          </Field>
          <Field label="Username">
            <input className={inputClassName} value={profileForm.username} onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))} maxLength={32} />
          </Field>
          <Field label="Bio">
            <textarea className={`${inputClassName} min-h-24 resize-none py-3`} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} maxLength={200} />
          </Field>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <p className="text-sm font-medium text-gray-300">Avatar</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-500/20 text-2xl font-semibold text-purple-100 ring-1 ring-purple-500/30">
                {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : profileForm.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-gray-800 px-4 text-sm font-medium text-gray-100 transition duration-150 hover:bg-purple-600 active:scale-95">
                  Choose image
                  <input
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = '';
                      if (!file) return;
                      const error = validateAvatarFile(file);
                      if (error) {
                        setProfileStatus(error);
                        return;
                      }
                      setProfileStatus(null);
                      setAvatarFile(file);
                    }}
                  />
                </label>
                <p className="mt-2 text-xs text-gray-500">JPG, PNG, or WebP up to 5MB.</p>
              </div>
            </div>
          </div>
        </div>
        <FormFooter status={profileStatus}>
          <Button disabled={savingProfile} type="submit">
            <Save size={16} />
            {savingProfile ? 'Saving...' : 'Save profile'}
          </Button>
        </FormFooter>
      </form>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon">
        <SectionTitle title="Account Info" />
        <div className="mt-4 grid gap-3 text-sm">
          <ReadOnlyRow label="Email" value={user.email} />
          <ReadOnlyRow label="User ID" value={user.id} />
        </div>
      </section>

      <form className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon" onSubmit={submitPrivacy}>
        <SectionTitle title="Privacy" />
        <div className="mt-4 grid gap-4">
          <Field label="Group invites">
            <select
              className={inputClassName}
              value={privacyForm.allowGroupInvite}
              onChange={(event) => setPrivacyForm({ allowGroupInvite: event.target.value as 'friends_only' | 'nobody' })}
            >
              <option value="friends_only">Friends only</option>
              <option value="nobody">Nobody</option>
            </select>
          </Field>
        </div>
        <FormFooter status={privacyStatus}>
          <Button disabled={savingPrivacy} type="submit">
            {savingPrivacy ? 'Saving...' : 'Save privacy'}
          </Button>
        </FormFooter>
      </form>

      <form className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon" onSubmit={submitPassword}>
        <SectionTitle title="Security" />
        <div className="mt-4 grid gap-4">
          <Field label="Current Password">
            <input className={inputClassName} type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
          </Field>
          <Field label="New Password">
            <input className={inputClassName} type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
          </Field>
          <Field label="Confirm Password">
            <input className={inputClassName} type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
          </Field>
        </div>
        <FormFooter status={passwordStatus}>
          <Button disabled={savingPassword} type="submit">
            {savingPassword ? 'Updating...' : 'Change password'}
          </Button>
        </FormFooter>
      </form>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon">
        <SectionTitle title="Sessions" />
        <div className="mt-4 space-y-2">
          {loadingSessions ? <p className="text-sm text-gray-500">Loading sessions...</p> : null}
          {!loadingSessions && sessions.length === 0 ? <p className="text-sm text-gray-500">No active sessions found.</p> : null}
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-100">
                  {session.current ? 'Current session' : 'Active session'}
                  {session.current ? <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-100">Current</span> : null}
                </p>
                <p className="mt-1 text-xs text-gray-500">Created {formatSessionDate(session.createdAt)}</p>
                <p className="text-xs text-gray-500">Last active {formatSessionDate(session.lastActiveAt)}</p>
              </div>
              {session.current ? null : (
                <button
                  className="h-9 rounded-lg bg-red-500/10 px-3 text-sm font-medium text-red-200 hover:bg-red-500/20"
                  onClick={() => void revokeSession(session.id)}
                  type="button"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
        <FormFooter status={sessionStatus}>
          <Button className="bg-gray-800 shadow-none hover:bg-red-600" disabled={sessions.filter((session) => !session.current).length === 0} onClick={() => void revokeOtherSessions()} type="button">
            Logout other sessions
          </Button>
        </FormFooter>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-neon lg:hidden">
        <SectionTitle title="Actions" />
        <Button className="mt-4 w-full bg-gray-800 shadow-none hover:bg-purple-600" onClick={handleLogout} type="button">
          <LogOut size={16} />
          Logout
        </Button>
      </section>
    </div>
  );
}

const inputClassName = 'h-10 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition duration-150 placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20';

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-gray-300">
      {label}
      {children}
    </label>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 break-words text-gray-200">{value}</p>
    </div>
  );
}

function FormFooter({ status, children }: { status: string | null; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="min-h-5 text-sm text-gray-400">{status}</p>
      {children}
    </div>
  );
}

function validateAvatarFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Avatar harus JPG, PNG, atau WebP.';
  if (file.size > 5 * 1024 * 1024) return 'Avatar maksimal 5MB.';
  return null;
}

async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const uploaded = await apiData<{ avatarUrl: string }>(apiClient.post('/uploads/avatar', formData));
  return uploaded.avatarUrl;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
