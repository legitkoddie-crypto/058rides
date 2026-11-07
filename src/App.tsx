import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage, { AuthLoading, ProfileRecovery, SetupRequired } from "./auth/AuthPage";
import { AppRole, AuthProvider, routeForRole, useAuth } from "./auth/AuthContext";
import CustomerPage from "./pages/CustomerPage";
import DriverPage from "./pages/DriverPage";
import AdminPage from "./pages/AdminPage";
import AccountPage from "./pages/AccountPage";
import { isSupabaseConfigured } from "./supabase";

function HomeRoute() {
  const { ready, user, profile, profileError } = useAuth();
  if (!isSupabaseConfigured) return <SetupRequired />;
  if (!ready) return <AuthLoading />;
  if (user && !profile) return profileError ? <ProfileRecovery message={profileError} /> : <AuthLoading message="Preparing your account…" />;
  if (profile) return <Navigate to={routeForRole(profile.role)} replace />;
  return <AuthPage role="rider" />;
}

function RoleRoute({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const { ready, user, profile, profileError } = useAuth();
  if (!isSupabaseConfigured) return <SetupRequired />;
  if (!ready) return <AuthLoading />;
  if (!user) {
    if (role === "rider") return <Navigate to="/" replace />;
    return <AuthPage role={role} mode="login" />;
  }
  if (!profile) return profileError ? <ProfileRecovery message={profileError} /> : <AuthLoading message="Preparing your account…" />;
  if (profile.role !== role) return <Navigate to={routeForRole(profile.role)} replace />;
  return children;
}

function AccountRoute() {
  const { ready, user, profile, profileError } = useAuth();
  if (!isSupabaseConfigured) return <SetupRequired />;
  if (!ready) return <AuthLoading />;
  if (!user) return <Navigate to="/" replace />;
  if (!profile) return profileError ? <ProfileRecovery message={profileError} /> : <AuthLoading message="Preparing your account…" />;
  return <AccountPage />;
}

function ApplicationRoutes() {
  return <Routes>
    <Route path="/" element={<HomeRoute />} />
    <Route path="/ride" element={<RoleRoute role="rider"><CustomerPage /></RoleRoute>} />
    <Route path="/driver" element={<AuthPage role="driver" mode="signup" />} />
    <Route path="/driver-login" element={<RoleRoute role="driver"><DriverPage /></RoleRoute>} />
    <Route path="/ops-058-console" element={<RoleRoute role="admin"><AdminPage /></RoleRoute>} />
    <Route path="/account" element={<AccountRoute />} />
    <Route path="/admin" element={<Navigate to="/" replace />} />
    <Route path="/driver-signup" element={<Navigate to="/driver" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export default function App() {
  return <AuthProvider><ApplicationRoutes /></AuthProvider>;
}
