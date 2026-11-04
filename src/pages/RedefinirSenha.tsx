import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type TelaState = 'verificando' | 'pronta' | 'invalida' | 'sucesso';

export default function RedefinirSenha() {
  const [tela, setTela] = useState<TelaState>('verificando');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const linkInvalido = window.location.hash.includes('error=');
    let active = true;
    let recoveryReady = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && !linkInvalido && (event === 'PASSWORD_RECOVERY' || session)) {
        recoveryReady = true;
        setTela('pronta');
      }
    });

    if (linkInvalido) {
      setTela('invalida');
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (active && !recoveryReady) setTela(session ? 'pronta' : 'invalida');
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (novaSenha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmacao) {
      setError('A confirmação deve ser igual à nova senha.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });
      if (updateError) throw updateError;
      setTela('sucesso');
      await signOut();
      navigate('/login', {
        state: { mensagem: 'Senha redefinida com sucesso! Faça login com a nova senha.' },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
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
          {tela === 'verificando' && (
            <div className="flex justify-center py-8" role="status" aria-label="Verificando link">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {tela === 'invalida' && (
            <div data-testid="link-invalido" className="space-y-4 text-center">
              <h1 className="text-xl font-bold text-on-surface">Link inválido ou expirado</h1>
              <p className="text-sm text-secondary">
                Este link de redefinição não é válido ou já expirou. Solicite um novo link para continuar.
              </p>
              <Link
                to="/esqueci-senha"
                className="inline-flex w-full justify-center py-3 bg-primary hover:bg-primary-fixed-dim text-white font-bold rounded-lg transition-all"
              >
                Solicitar novo link
              </Link>
              <Link to="/login" className="block text-sm font-semibold text-primary hover:underline">
                Voltar para o login
              </Link>
            </div>
          )}

          {tela === 'pronta' && (
            <>
              <h1 className="text-xl font-bold text-on-surface mb-2">Definir nova senha</h1>
              <p className="text-sm text-secondary mb-6">Escolha uma nova senha para sua conta.</p>
              <form onSubmit={handleSubmit} noValidate className="space-y-6">
                {error && (
                  <div role="alert" className="p-3 rounded-lg bg-alert-red/10 border border-alert-red/20 text-alert-red text-sm font-medium">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary" htmlFor="nova-senha">Nova senha</label>
                  <div className="relative">
                    <input
                      id="nova-senha"
                      data-testid="nova-senha"
                      type={mostrarSenha ? 'text' : 'password'}
                      required
                      value={novaSenha}
                      onChange={(event) => setNovaSenha(event.target.value)}
                      className="w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-12"
                    />
                    <button
                      type="button"
                      aria-label={mostrarSenha ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-secondary hover:text-primary transition-colors"
                    >
                      {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary" htmlFor="confirmar-nova-senha">Confirmar nova senha</label>
                  <div className="relative">
                    <input
                      id="confirmar-nova-senha"
                      data-testid="confirmar-nova-senha"
                      type={mostrarConfirmacao ? 'text' : 'password'}
                      required
                      value={confirmacao}
                      onChange={(event) => setConfirmacao(event.target.value)}
                      className="w-full px-4 py-3 bg-white border border-surface-border rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-12"
                    />
                    <button
                      type="button"
                      aria-label={mostrarConfirmacao ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                      onClick={() => setMostrarConfirmacao(!mostrarConfirmacao)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-secondary hover:text-primary transition-colors"
                    >
                      {mostrarConfirmacao ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="salvar-nova-senha"
                  disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary-fixed-dim text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Salvando...</> : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}

          {tela === 'sucesso' && (
            <p className="text-sm text-emerald-700 text-center">Senha redefinida com sucesso.</p>
          )}
        </div>
      </div>
    </div>
  );
}
