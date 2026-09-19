import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) { socketRef.current?.disconnect(); return; }
    // Netlify redirects cannot carry WebSockets, so in production connect directly to the API host (VITE_API_URL).
    // In development the Vite proxy handles it on the same origin.
    const url = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '');
    const s = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: cb => cb({ token: localStorage.getItem('kp_token') }),
    });
    socketRef.current = s;
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); };
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
