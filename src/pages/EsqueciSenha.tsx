import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Informe seu endereço de e-mail.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: new URL('/redefinir-senha', window.location.origin).href,
      });
      if (resetError) throw resetError;
      setSentTo(normalizedEmail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o link de redefinição.');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-xl font-bold text-on-surface mb-2">Esqueci minha senha</h1>
          <p className="text-sm text-secondary mb-6">Informe seu e-mail para receber um link de redefinição.</p>

          {sentTo ? (
            <div
              data-testid="recuperacao-enviada"
              className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-sm font-medium"
            >
              Enviamos um link de redefinição para {sentTo}. Verifique sua caixa de entrada e o spam.
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {error && (
                <div role="alert" className="p-3 rounded-lg bg-alert-red/10 border border-alert-red/20 text-alert-red text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-secondary" htmlFor="email-recuperacao">
                  Endereço de e-mail
                </label>
                <input
                  id="email-recuperacao"
                  data-testid="email-recuperacao"
                  type="email"
                  required
                  placeholder="Seu endereço de e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <button
                type="submit"
                data-testid="enviar-link-redefinicao"
                disabled={loading}
                className="w-full py-3.5 bg-primary hover:bg-primary-fixed-dim text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Enviando...</> : 'Enviar link de redefinição'}
              </button>
              <p className="text-xs text-secondary text-center">
                O link expira. Se não chegar, verifique o spam ou solicite um novo link.
              </p>
            </form>
          )}

          <div className="text-center mt-6">
            <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
