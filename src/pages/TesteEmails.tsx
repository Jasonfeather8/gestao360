import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type EmailResult = { type: 'success' | 'error'; message: string };
type Toast = { id: number; type: 'success' | 'error'; message: string };

export default function TesteEmails() {
  const [from, setFrom] = useState('onboarding@resend.dev');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: Toast['type']) => {
    const id = Date.now();
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!to.trim() || !subject.trim() || !html.trim()) {
      const message = 'Preencha o destinatário, o assunto e o conteúdo do email.';
      setResult({ type: 'error', message });
      showToast(message, 'error');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      const message = 'Informe um endereço de email válido para o destinatário.';
      setResult({ type: 'error', message });
      showToast(message, 'error');
      return;
    }

    setIsSending(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Token de autenticação não encontrado.');

      const response = await fetch('https://rfjolkadxfixxagpidws.supabase.co/functions/v1/enviar-email-teste', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ from, to: to.trim(), subject: subject.trim(), html }),
      });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody.error || 'Não foi possível enviar o email de teste.');

      const message = `Email enviado com sucesso. ID: ${responseBody.id ?? 'não informado'}`;
      setResult({ type: 'success', message });
      showToast('Email de teste enviado com sucesso!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar o email de teste.';
      setResult({ type: 'error', message });
      showToast(message, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const inputClassName = 'w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black text-neutral-900 outline-none focus:border-primary transition-all';
  const labelClassName = 'block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border-b border-neutral-100 pb-6">
        <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">Teste de emails</h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">
          Dispare emails reais via Resend para validar a integração.
        </p>
      </div>

      <div className="bg-neutral-50 border-2 border-neutral-100 rounded-3xl p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-neutral-600 leading-relaxed">
          A chave da API fica guardada como secret no Supabase com o nome <span className="font-black">RESEND_API_KEY</span> e nunca é digitada nesta tela.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white border-2 border-neutral-100 rounded-3xl shadow-sm p-6 md:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClassName} htmlFor="email-from">Remetente</label>
            <input
              id="email-from"
              data-testid="email-from"
              type="email"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={inputClassName}
            />
            <p className="text-[10px] font-bold text-neutral-400 mt-2">Para usar um domínio próprio, ele precisa estar verificado na Resend.</p>
          </div>
          <div>
            <label className={labelClassName} htmlFor="email-to">Destinatário</label>
            <input
              id="email-to"
              data-testid="email-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className={inputClassName}
              autoComplete="email"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClassName} htmlFor="email-subject">Assunto</label>
            <input
              id="email-subject"
              data-testid="email-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClassName} htmlFor="email-html">Conteúdo do email em HTML</label>
            <textarea
              id="email-html"
              data-testid="email-html"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              rows={9}
              className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-2xl p-5 text-xs font-mono text-neutral-900 outline-none focus:border-primary transition-all resize-y"
            />
          </div>
        </div>

        <button
          type="submit"
          data-testid="enviar-email-teste"
          disabled={isSending}
          className="px-8 py-3 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isSending ? 'Enviando...' : 'Enviar email de teste'}
        </button>
      </form>

      {result && (
        <div
          data-testid="email-resultado"
          role={result.type === 'error' ? 'alert' : 'status'}
          className={`rounded-3xl border-2 p-5 flex items-start gap-3 ${result.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}
        >
          {result.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <p className="text-xs font-black leading-relaxed">{result.message}</p>
        </div>
      )}

      <div className="fixed top-6 right-6 z-[100] space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-white text-xs font-black ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}
            >
              {toast.message}
              <button type="button" aria-label="Fechar notificação" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
