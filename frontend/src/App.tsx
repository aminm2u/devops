import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { AppRouter } from '@/app/router';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/loading/LoadingScreen';

function App() {
  const { fetchUser, token } = useAuth();
  const [initialLoad, setInitialLoad] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        await fetchUser();
      }
      setInitialLoad(false);
    };
    initAuth();
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return <LoadingScreen onComplete={handleSplashComplete} />;
  }

  if (initialLoad) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Routing lives in `app/router.tsx` with the table in `app/routes.config.tsx`,
  // so the sidebar and the guards read the same entries.
  return <AppRouter />;
}

export default App;
