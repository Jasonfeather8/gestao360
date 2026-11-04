import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { rotaInicial } from '@/config/permissions';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { session, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      navigate(rotaInicial(role));
    }
  }, [session, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      navigate(rotaInicial(role));
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img
            src="/brand/mesquita-logo-vertical.jpg"
            alt="Mesquita Soluções Empresariais"
            className="h-28 w-auto mx-auto mix-blend-multiply"
          />
        </div>

        <div className="bg-surface p-8 rounded-2xl border border-surface-border shadow-xl">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-alert-red/10 border border-alert-red/20 text-alert-red text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary" htmlFor="email">
                Endereço de e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="Seu endereço de e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-secondary" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-secondary hover:text-primary transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary hover:bg-primary-fixed-dim text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-xs text-secondary font-medium">
            © {new Date().getFullYear()} Mesquita Soluções Empresariais - Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
