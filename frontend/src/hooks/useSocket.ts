import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

let socketInstance: Socket | null = null;

export const getSocket = () => {
  if (!socketInstance) {
    const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080';
    socketInstance = io(url, {
      autoConnect: false,
    });
  }
  return socketInstance;
};

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    if (user && !s.connected) {
      s.connect();
    }

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [user]);

  return { socket, isConnected };
}
