import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, X } from 'lucide-react';
import type { TransferenciaBancaria } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

interface DecisaoTransferenciaModalProps {
  modo: 'aprovar' | 'reprovar' | 'estornar' | null;
  transferencia: TransferenciaBancaria | null;
  processando: boolean;
  erro: string;
  onCancelar: () => void;
  onConfirmar: (justificativa: string) => void;
}

export default function DecisaoTransferenciaModal({
  modo,
  transferencia,
  processando,
  erro,
  onCancelar,
  onConfirmar,
}: DecisaoTransferenciaModalProps) {
  const [justificativa, setJustificativa] = useState('');

  useEffect(() => {
    setJustificativa('');
  }, [modo, transferencia?.id]);

  useEffect(() => {
    if (!modo || !transferencia) return;
    const fecharComEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processando) onCancelar();
    };
    window.addEventListener('keydown', fecharComEscape);
    return () => window.removeEventListener('keydown', fecharComEscape);
  }, [modo, transferencia, processando, onCancelar]);

  if (!modo || !transferencia) return null;

  const titulo = modo === 'aprovar' ? 'Aprovar transferência' : modo === 'reprovar' ? 'Reprovar transferência' : 'Estornar transferência';
  const obrigatoria = modo === 'reprovar' || modo === 'estornar';
  const confirmarDesabilitado = processando || (obrigatoria && !justificativa.trim());

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      onClick={() => { if (!processando) onCancelar(); }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-on-surface/60 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="decisao-transferencia-titulo"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-5 text-on-surface shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="decisao-transferencia-titulo" className="text-lg font-black text-on-surface">{titulo}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Revise os dados antes de confirmar.</p>
          </div>
          <button type="button" aria-label="Fechar" disabled={processando} onClick={onCancelar} className="rounded-lg p-2 text-secondary transition hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="rounded-xl border border-surface-border bg-surface-container-low p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-on-surface">
            <span>{transferencia.conta_origem?.nome || 'Conta de origem'}</span>
            <span aria-hidden="true" className="text-primary">→</span>
            <span>{transferencia.conta_destino?.nome || 'Conta de destino'}</span>
          </p>
          <p className="mt-2 text-sm font-black text-on-surface">{moeda.format(Number(transferencia.valor))}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{dataFormatada.format(new Date(`${transferencia.data_transferencia}T00:00:00Z`))}</p>
        </div>

        {modo === 'reprovar' && <p className="mt-4 text-sm text-on-surface-variant">A transferência voltará para Aberta e será necessária uma nova conciliação.</p>}
        {modo === 'estornar' && <p className="mt-4 text-sm text-on-surface-variant">Os espelhos e vínculos da transferência serão desfeitos. A justificativa é obrigatória.</p>}

        {obrigatoria && (
          <div className="mt-4">
            <label htmlFor="decisao-transferencia-justificativa" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-secondary">
              Justificativa <span className="normal-case text-alert-red">(obrigatória)</span>
            </label>
            <textarea
              id="decisao-transferencia-justificativa"
              aria-label="Justificativa"
              value={justificativa}
              onChange={(event) => setJustificativa(event.target.value)}
              disabled={processando}
              rows={3}
              className="w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-on-surface outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Informe a justificativa"
            />
          </div>
        )}

        {erro && <p role="alert" className="mt-4 rounded-lg bg-alert-red/10 p-3 text-sm font-semibold text-alert-red">{erro}</p>}

        <footer className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={processando} onClick={onCancelar} className="min-h-10 rounded-lg border border-surface-border px-4 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
          <button
            type="button"
            disabled={confirmarDesabilitado}
            onClick={() => onConfirmar(justificativa.trim())}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${modo === 'aprovar' ? 'bg-bank-truth-green' : 'bg-alert-red'}`}
          >
            {processando ? <><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Processando…</> : modo === 'aprovar' ? <><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Aprovar</> : modo === 'reprovar' ? 'Reprovar' : 'Estornar'}
          </button>
        </footer>
      </section>
    </div>
  );
}
