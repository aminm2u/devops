import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * One socket for the whole tab.
 *
 * The server authenticates during the handshake and puts the connection in the
 * caller's own room, so the client no longer announces who it is. That also
 * means the token has to be re-supplied when it changes — otherwise a user who
 * logged out and back in as someone else kept the previous identity's room
 * membership until the page was reloaded.
 */

let socketInstance: Socket | null = null;

const socketUrl = (): string => import.meta.env.VITE_SOCKET_URL || window.location.origin;

export function getSocket(token?: string | null): Socket {
  const auth = { token: token ?? localStorage.getItem('token') ?? '' };

  if (!socketInstance) {
    socketInstance = io(socketUrl(), {
      autoConnect: false,
      auth,
      // Reconnect keeps working across a backend restart without the user
      // reloading the page.
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    return socketInstance;
  }

  socketInstance.auth = auth;
  return socketInstance;
}

/** Drop the shared socket — used on logout so the next login reconnects clean. */
export function disconnectSocket(): void {
  socketInstance?.disconnect();
  socketInstance = null;
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const s = getSocket(token);
    setSocket(s);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    setIsConnected(s.connected);
    if (!s.connected) s.connect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [token]);

  return { socket, isConnected };
}
