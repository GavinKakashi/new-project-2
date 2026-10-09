import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { createApi, normalizeServerUrl, type Api, type User } from './api';
import { storage } from './storage';

interface Session {
  ready: boolean;
  serverUrl: string;
  user: User | null;
  api: Api;
  setServerUrl: (url: string) => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

function defaultServerUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return normalizeServerUrl(process.env.EXPO_PUBLIC_API_URL);
  // The web build is usually served by the Agentry server itself.
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrlState] = useState(defaultServerUrl());
  const [user, setUser] = useState<User | null>(null);
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    queryClient.clear();
    await Promise.all([storage.set('token', null), storage.set('user', null)]);
  }, [queryClient]);

  const api = useMemo(() => createApi(serverUrl, () => tokenRef.current, () => void signOut()), [serverUrl, signOut]);

  useEffect(() => {
    (async () => {
      const [url, token, userJson] = await Promise.all([storage.get('serverUrl'), storage.get('token'), storage.get('user')]);
      if (url) setServerUrlState(url);
      if (token && userJson) {
        tokenRef.current = token;
        try {
          setUser(JSON.parse(userJson));
        } catch {}
      }
      setReady(true);
    })();
  }, []);

  const value: Session = {
    ready,
    serverUrl,
    user,
    api,
    setServerUrl: async (url) => {
      const u = normalizeServerUrl(url);
      setServerUrlState(u);
      await storage.set('serverUrl', u);
    },
    signIn: async (token, u) => {
      tokenRef.current = token;
      setUser(u);
      await Promise.all([storage.set('token', token), storage.set('user', JSON.stringify(u))]);
    },
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export const useApi = () => useSession().api;
