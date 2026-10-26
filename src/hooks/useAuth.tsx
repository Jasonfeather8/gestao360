import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useUIStore } from '../store/uiStore';
import { useQueryClient } from '@tanstack/react-query';

type Role = 'master' | 'gerente' | 'colaborador';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: Role;
  isLoading: boolean;
  signOut: () => Promise<void>;
  hasRole: (allowedRoles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('colaborador');
  const [isLoading, setIsLoading] = useState(true);

  const queryClient = useQueryClient();

  // Sync role helper
  const extractRole = async (currentUser: User | null, currentSession: Session | null) => {
    if (!currentUser) {
      setRole('colaborador');
      return;
    }

    // 1. Try to get it from JWT Custom Claims (Fastest, no DB call)
    let userRole = currentUser.app_metadata?.role as Role;

    // 2. Fallback: If not in JWT yet, fetch from DB
    if (!userRole) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();
      
      if (data?.role) {
        userRole = data.role as Role;
        // Optionally refresh session to update JWT
        await supabase.auth.refreshSession();
      }
    }

    setRole(userRole || 'colaborador');
    useUIStore.getState().setCurrentUserId(currentUser.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      extractRole(session?.user ?? null, session).then(() => setIsLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      await extractRole(session?.user ?? null, session);
      setIsLoading(false);
      
      if (event === 'SIGNED_OUT') {
        performDeepCleanup();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const performDeepCleanup = () => {
    // 1. Clear React Query Cache (removes all fetched data from memory)
    queryClient.clear();
    
    // 2. Reset Zustand UI Store to defaults
    useUIStore.getState().resetAllDrafts();
    
    // 3. Reset Context
    setSession(null);
    setUser(null);
    setRole('colaborador');
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      performDeepCleanup();
    }
  };

  const hasRole = (allowedRoles: Role[]) => allowedRoles.includes(role);

  return (
    <AuthContext.Provider value={{ session, user, role, isLoading, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
