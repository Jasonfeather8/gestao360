import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import { mensagemDoErro } from '../../services/erros';
import type { LinhaExtrato, TransferenciaCandidataLinha } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

interface ConciliarTransferenciaModalProps {
  aberto: boolean;
  linha: LinhaExtrato | null;
  candidatas: TransferenciaCandidataLinha[];
  carregando: boolean;
  erroCarregamento: unknown;
  onFechar: () => void;
  onConfirmar: (candidata: TransferenciaCandidataLinha) => Promise<void>;
  isConciliando: boolean;
}

export default function ConciliarTransferenciaModal({
  aberto,
  linha,
  candidatas,
  carregando,
  erroCarregamento,
  onFechar,
  onConfirmar,
  isConciliando,
}: ConciliarTransferenciaModalProps) {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setErro(null);
  }, [linha, aberto]);

  if (!aberto || !linha) return null;

  const confirmar = async (candidata: TransferenciaCandidataLinha) => {
    if (isConciliando) return;
    setErro(null);
    try {
      await onConfirmar(candidata);
    } catch (error) {
      setErro(mensagemDoErro(error, 'Não foi possível conciliar a transferência.'));
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        role="dialog" aria-modal="true" aria-labelledby="conciliar-transferencia-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="conciliar-transferencia-title" className="text-xl font-black text-on-surface">Conciliar transferência</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Selecione uma transferência bancária compatível com esta linha do extrato.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" disabled={isConciliando} className="rounded-full p-2 text-on-surface-variant hover:bg-surface disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <section className="mb-5 rounded-2xl border border-surface-border bg-surface-container-low p-4">
          <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-on-surface-variant">Linha do extrato</h3>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">{dataFormatada.format(new Date(`${linha.data}T00:00:00Z`))}</p>
              <p className="mt-1 break-words text-sm text-on-surface-variant">{linha.descricao || linha.textoOriginal || 'Movimentação sem descrição'}</p>
            </div>
            <p className={`shrink-0 text-sm font-black ${linha.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{moeda.format(linha.valor)}</p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-on-surface">Transferências compatíveis</h3>
            {!carregando && !erroCarregamento && <span className="text-xs text-on-surface-variant">{candidatas.length} {candidatas.length === 1 ? 'candidata' : 'candidatas'}</span>}
          </div>
          {carregando ? (
            <p className="flex items-center gap-2 rounded-2xl border border-surface-border p-4 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" />Carregando transferências compatíveis...</p>
          ) : erroCarregamento ? (
            <p role="alert" className="rounded-2xl border border-alert-red/30 bg-alert-red/10 p-4 text-sm text-alert-red">{mensagemDoErro(erroCarregamento, 'Não foi possível carregar as transferências candidatas.')}</p>
          ) : candidatas.length === 0 ? (
            <p className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Não há transferência compatível com esta linha do extrato.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {candidatas.map(({ transferencia, lado }) => (
                <li key={transferencia.id} className="rounded-2xl border border-surface-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">{dataFormatada.format(new Date(`${transferencia.data_transferencia}T00:00:00Z`))}</p>
                        {transferencia.status === 'conciliada' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-bank-truth-green/10 px-2 py-1 text-[10px] font-bold text-bank-truth-green"><CheckCircle2 className="h-3 w-3" />Aprovada</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-pending-amber/10 px-2 py-1 text-[10px] font-bold text-pending-amber"><Clock className="h-3 w-3" />Pend. Gestor</span>
                        )}
                      </div>
                      <p className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
                        <span className="truncate">{transferencia.conta_origem?.nome || 'Conta de origem'}</span>
                        <span aria-hidden="true" className="shrink-0 text-primary">→</span>
                        <span className="truncate">{transferencia.conta_destino?.nome || 'Conta de destino'}</span>
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">Vínculo no lado {lado === 'origem' ? 'de saída' : 'de entrada'}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="text-sm font-black text-on-surface">{moeda.format(Number(transferencia.valor))}</p>
                      <button
                        type="button"
                        onClick={() => void confirmar({ transferencia, lado })}
                        disabled={isConciliando}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {isConciliando ? 'Conciliando...' : 'Conciliar'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {erro && <p role="alert" className="mt-4 rounded-xl bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}

        <footer className="mt-6 flex justify-end">
          <button type="button" onClick={onFechar} disabled={isConciliando} className="rounded-xl border border-surface-border px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
