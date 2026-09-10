import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Splash } from './components/Bits';
import { AppLayout } from './components/Layout';
import LandingPage from './pages/Landing';
import { SigninPage, SignupPage } from './pages/Auth';
import OnboardingPage from './pages/Onboarding';
import OverviewPage from './pages/Overview';
import MarketsPage from './pages/Markets';
import TerminalPage from './pages/Terminal';
import PortfolioPage from './pages/Portfolio';
import TimeMachinePage from './pages/TimeMachine';
import AdminPage from './pages/Admin';

function Protected({ children }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status !== 'auth') return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  return children;
}

function GuestOnly({ children }) {
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <Splash />;
  if (status === 'auth') return <Navigate to="/app" replace />;
  return children;
}

function AdminOnly({ children }) {
  const isAdmin = useAuth((s) => !!s.user?.isAdmin);
  if (!isAdmin) return <Navigate to="/app" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<GuestOnly><SigninPage /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
      <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />

      <Route path="/app" element={<Protected><AppLayout /></Protected>}>
        <Route index element={<OverviewPage />} />
        <Route path="markets" element={<MarketsPage />} />
        <Route path="trade" element={<TerminalPage />} />
        <Route path="trade/:symbol" element={<TerminalPage />} />
        <Route path="timemachine" element={<TimeMachinePage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
