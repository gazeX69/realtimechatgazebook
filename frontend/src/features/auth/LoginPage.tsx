import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../stores/auth-store';
import { AuthShell } from './AuthShell';

const SESSION_EXPIRED_REASON_KEY = 'realtime.sessionExpiredReason';

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [sessionMessage, setSessionMessage] = useState(() =>
    sessionStorage.getItem(SESSION_EXPIRED_REASON_KEY) ? 'Session expired. Please log in again.' : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSessionMessage('');
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await login(String(form.get('email')), String(form.get('password')));
      sessionStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
      navigate('/chat');
    } catch {
      setError('Email atau password tidak valid.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Login">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Email</span>
          <Input name="email" type="email" placeholder="nama@email.com" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Password</span>
          <Input name="password" type="password" placeholder="Masukkan password" required />
        </label>
        {sessionMessage ? <p className="text-sm text-amber-300">{sessionMessage}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-400">
        Belum punya akun?{' '}
        <Link to="/register" className="font-semibold text-purple-300 transition hover:text-purple-200">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
