import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../stores/auth-store';
import { AuthShell } from './AuthShell';

export function RegisterPage() {
  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await register({
        email: String(form.get('email')),
        username: String(form.get('username')),
        displayName: String(form.get('displayName')),
        password: String(form.get('password')),
      });
      navigate('/chat');
    } catch {
      setError('Register gagal. Cek email, username, dan password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Register">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Display name</span>
          <Input name="displayName" placeholder="Nama yang tampil di profil" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Username</span>
          <Input name="username" placeholder="username" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Email</span>
          <Input name="email" type="email" placeholder="nama@email.com" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Password</span>
          <Input name="password" type="password" placeholder="Minimal 8 karakter" required />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Register'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-400">
        Sudah punya akun?{' '}
        <Link to="/login" className="font-semibold text-purple-300 transition hover:text-purple-200">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}
