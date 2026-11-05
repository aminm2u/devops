import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPreferences, getUnreadCount } from '@/api/notifications';
import type { Notification, NotificationPreferences } from '@/types';
import { useSocket } from '@/hooks/useSocket';
import { playNotificationChime, unlockNotificationSound } from '@/shared/lib/notificationSound';

/**
 * Live notifications.
 *
 * One socket for the tab; every `notification:new` frame updates the unread
 * badge and the list cache immediately, so the bell is no longer correct-only
 * after a 30-second poll. The polling is kept as a slow fallback for the case
 * where the websocket never connects (proxy in the way, browser suspended).
 *
 * Sound is synthesised, not shipped as an asset — see `notificationSound.ts` —
 * and obeys the user's preference from Digital Me.
 */

interface NotificationContextValue {
  unreadCount: number;
  /** Sound is on and the audio context has been unlocked by a gesture. */
  soundEnabled: boolean;
  setSoundEnabled: (next: boolean) => void;
  /** Chime once, e.g. from a "test sound" button in settings. */
  playTestChime: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const FALLBACK_POLL_MS = 5 * 60 * 1000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const [soundOverride, setSoundOverride] = useState<boolean | null>(null);

  const { data: prefs } = useQuery<NotificationPreferences>({
    queryKey: ['notification-preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  });

  const { data: serverUnread = 0 } = useQuery<number>({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadCount,
    refetchInterval: socket?.connected ? false : FALLBACK_POLL_MS,
    refetchOnWindowFocus: true,
  });

  // Local delta so a frame that arrives between refetches still shows at once.
  const [localUnread, setLocalUnread] = useState<number | null>(null);
  const unreadCount = localUnread ?? serverUnread;

  useEffect(() => {
    if (localUnread !== null && serverUnread === localUnread) setLocalUnread(null);
  }, [serverUnread, localUnread]);

  const soundEnabled = soundOverride ?? prefs?.sound ?? true;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  // Autoplay policies require a gesture before audio can play. Any first
  // interaction unlocks it for the rest of the session.
  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const handleNew = useCallback(
    (notification: Notification) => {
      setLocalUnread((current) => (current ?? serverUnread) + 1);

      // Seed/refresh the bell's first page so the dropdown is right the moment
      // it is opened, rather than showing yesterday's list.
      queryClient.setQueryData<{ data: Notification[] }>(['notifications', 'recent'], (old) => {
        if (!old) return old;
        return { ...old, data: [notification, ...old.data].slice(0, 10) };
      });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'page'] });

      if (soundRef.current) playNotificationChime();
    },
    [queryClient, serverUnread]
  );

  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', handleNew);
    return () => {
      socket.off('notification:new', handleNew);
    };
  }, [socket, handleNew]);

  const setSoundEnabled = useCallback(
    (next: boolean) => {
      setSoundOverride(next);
      if (next) {
        unlockNotificationSound();
        playNotificationChime();
      }
    },
    []
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      soundEnabled,
      setSoundEnabled,
      playTestChime: () => playNotificationChime(),
    }),
    [unreadCount, soundEnabled, setSoundEnabled]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside <NotificationProvider>');
  }
  return context;
}
