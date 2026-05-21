import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store';

export function ProtectedRoute() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
