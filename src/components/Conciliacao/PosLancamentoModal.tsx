import { motion } from 'motion/react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useLancamentos } from '../../hooks/useData';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatarData(data: string | null): string {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

export default function PosLancamentoModal() {
  const {
    conciliacaoPosLancamento,
    setConciliacaoPosLancamento,
    setBaixaPreset,
    setSelectedLancamentoIdForModal,
    setModalOpen,
  } = useUIStore();
  const { role } = useAuth();
  const { data: lancamentos = [] } = useLancamentos();

  if (!conciliacaoPosLancamento) return null;

  const { lancamentoId, dataExtrato } = conciliacaoPosLancamento;
  const lancamento = lancamentos.find(item => item.id === lancamentoId);
  const ehEntrada = lancamento?.tipo !== 'saida';

  const fechar = () => setConciliacaoPosLancamento(null);

  const darBaixa = (aprovarDepois: boolean) => {
    setBaixaPreset({ lancamentoId, dataPagamento: dataExtrato, aprovarDepois });
    setSelectedLancamentoIdForModal(lancamentoId);
    setConciliacaoPosLancamento(null);
    setModalOpen('isBaixaLancamentoOpen', true);
  };

  return (
    <motion.div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        role="dialog" aria-modal="true" aria-labelledby="pos-lancamento-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="w-full max-w-lg rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bank-truth-green/10 text-bank-truth-green">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="pos-lancamento-title" className="text-lg font-black text-on-surface">Lançamento criado em aberto.</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Deseja dar baixa neste valor?</p>
            </div>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full p-2 text-on-surface-variant hover:bg-surface"><X className="h-5 w-5" /></button>
        </header>

        {lancamento && (
          <div className="mb-5 rounded-2xl border border-surface-border bg-surface-container-low p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {ehEntrada
                  ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-bank-truth-green" />
                  : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-alert-red" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{lancamento.observacoes || 'Lançamento sem descrição'}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">Vencimento {formatarData(lancamento.data_vencimento)}</p>
                </div>
              </div>
              <p className={`shrink-0 text-sm font-bold ${ehEntrada ? 'text-bank-truth-green' : 'text-alert-red'}`}>{moeda.format(Number(lancamento.valor_previsto) || 0)}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => darBaixa(false)}
            className="w-full rounded-2xl bg-neutral-900 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-black"
          >
            Dar baixa
          </button>
          {role === 'master' && (
            <button
              type="button"
              onClick={() => darBaixa(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-bank-truth-green py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition hover:opacity-90"
            >
              <ShieldCheck className="h-4 w-4" />Dar baixa e aprovar
            </button>
          )}
          <button
            type="button"
            onClick={fechar}
            className="w-full rounded-2xl border border-surface-border py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant transition hover:bg-surface"
          >
            Agora não
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
