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
  contasLiberadas: string[] | null;
  contasBloqueadas: string[] | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  hasRole: (allowedRoles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('colaborador');
  const [contasLiberadas, setContasLiberadas] = useState<string[] | null>(null);
  const [contasBloqueadas, setContasBloqueadas] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const queryClient = useQueryClient();

  // Sync role helper
  const extractRole = async (currentUser: User | null, currentSession: Session | null) => {
    if (!currentUser) {
      setRole('colaborador');
      setContasLiberadas(null);
      setContasBloqueadas(null);
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

    const resolvedRole = userRole || 'colaborador';
    setRole(resolvedRole);
    // O Master nunca é limitado por conta bancária: só Gerente e Colaborador
    // carregam as listas de contas liberadas/bloqueadas (lidas antes de liberar
    // a tela, para não haver "flash" de contas que o perfil não pode acessar).
    if (resolvedRole === 'master') {
      setContasLiberadas(null);
      setContasBloqueadas(null);
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .select('contas_liberadas, contas_bloqueadas')
        .eq('id', currentUser.id)
        .single();
      setContasLiberadas(error ? [] : data?.contas_liberadas ?? []);
      setContasBloqueadas(error ? [] : data?.contas_bloqueadas ?? []);
    }
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
    setContasLiberadas(null);
    setContasBloqueadas(null);
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
    <AuthContext.Provider value={{ session, user, role, contasLiberadas, contasBloqueadas, isLoading, signOut, hasRole }}>
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
