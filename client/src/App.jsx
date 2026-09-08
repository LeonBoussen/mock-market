import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from './store/auth';
import AppRoutes from './AppRoutes';
import { Toasts } from './components/Toasts';

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toasts />
    </BrowserRouter>
  );
}
