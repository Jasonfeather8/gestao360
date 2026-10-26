import { useState } from 'react';
import { CheckCircle2, LoaderCircle, Link2 } from 'lucide-react';
import { useCategorias, useCentrosCusto, useConciliarTransferencia, useTransacoesCandidatas } from '../../hooks/useData';
import { mensagemDoErro } from '../../services/erros';
import type { TransacaoBancoCandidata, TransferenciaBancaria } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const rotulosStatus: Record<TransferenciaBancaria['status'], string> = {
  aberta: 'Aberta',
  aguardando_destino: 'Aguardando destino',
  conciliada_pendente_master: 'Conciliada — aguardando Master',
  conciliada: 'Concluída',
  estornada: 'Estornada',
};

function formatarData(data: string): string {
  return dataFormatada.format(new Date(`${data}T00:00:00Z`));
}

interface LadoProps {
  transferencia: TransferenciaBancaria;
  lado: 'origem' | 'destino';
  conciliada: boolean;
  bloquearAcoes: boolean;
  transacao?: TransferenciaBancaria['transacao_origem'];
}

function LadoTransferencia({ transferencia, lado, conciliada, bloquearAcoes, transacao }: LadoProps) {
  const { data: candidatas = [], isLoading, isError } = useTransacoesCandidatas(transferencia, lado);
  const { conciliarTransferencia, isConciliando } = useConciliarTransferencia();
  const [erro, setErro] = useState('');
  const ladoLabel = lado === 'origem' ? 'origem' : 'destino';

  const conciliar = async (candidata: TransacaoBancoCandidata) => {
    setErro('');
    try {
      await conciliarTransferencia({ transferenciaId: transferencia.id, transacaoId: candidata.id, lado });
    } catch (error) {
      setErro(mensagemDoErro(error, 'Não foi possível conciliar esta transação.'));
    }
  };

  return (
    <section className="rounded-xl border border-surface-border p-4">
      <h4 className="text-sm font-bold capitalize text-on-surface">
        {ladoLabel}: {conciliada && transacao
          ? <span className="font-medium text-bank-truth-green">conciliada em {formatarData(transacao.data_transacao)} · {transacao.descricao_banco}</span>
          : <span className="font-medium text-on-surface-variant">pendente</span>}
      </h4>
      {!conciliada && !bloquearAcoes && (
        <div className="mt-3 space-y-2">
          {isLoading ? <p role="status" className="text-xs text-on-surface-variant">Buscando transações candidatas…</p>
            : isError ? <p role="alert" className="text-xs text-alert-red">Não foi possível carregar as transações candidatas.</p>
              : candidatas.length === 0 ? <p className="text-xs text-on-surface-variant">Nenhuma transação de extrato da conta {lado === 'origem' ? transferencia.conta_origem?.nome || 'de origem' : transferencia.conta_destino?.nome || 'de destino'} com o valor exato e dentro de ±7 dias. Importe o extrato do período para vincular este lado — isso não bloqueia a aprovação.</p>
              : candidatas.map((candidata) => (
                  <article key={candidata.id} className="rounded-lg bg-surface-container-low p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-on-surface">{formatarData(candidata.data_transacao)} · {candidata.descricao_banco}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{moeda.format(candidata.valor)}</p>
                        <span title={candidata.provenienciaCompleta ? 'Proveniência completa' : candidata.pendencias.join(' · ')} className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${candidata.provenienciaCompleta ? 'bg-bank-truth-green/10 text-bank-truth-green' : 'bg-pending-amber/10 text-pending-amber'}`}>
                          {candidata.provenienciaCompleta ? 'Proveniência completa' : 'Proveniência incompleta'}
                        </span>
                        {!candidata.provenienciaCompleta && <p className="mt-1 text-[11px] text-pending-amber">{candidata.pendencias.join(' · ')}</p>}
                      </div>
                      <button
                        type="button"
                        aria-label={`Conciliar transação de ${ladoLabel}: ${candidata.descricao_banco}`}
                        title={!candidata.provenienciaCompleta ? `A aprovação Master exige proveniência completa: ${candidata.pendencias.join(' · ')}` : `Conciliar ${ladoLabel}`}
                        disabled={!candidata.provenienciaCompleta || isConciliando}
                        onClick={() => void conciliar(candidata)}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isConciliando ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Link2 aria-hidden="true" className="h-3.5 w-3.5" />}
                        Conciliar {ladoLabel}
                      </button>
                    </div>
                  </article>
                ))}
          {erro && <p role="alert" className="rounded-lg bg-alert-red/10 p-2 text-xs font-semibold text-alert-red">{erro}</p>}
        </div>
      )}
    </section>
  );
}

export default function ConciliacaoTransferenciaPainel({ transferencia }: { transferencia: TransferenciaBancaria }) {
  const { data: categorias = [] } = useCategorias();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const bloquearConciliacao = transferencia.status === 'estornada'
    || transferencia.status === 'conciliada_pendente_master';
  const nomeCategoria = transferencia.tarifa?.categoria_id
    ? categorias.find((categoria) => categoria.id === transferencia.tarifa?.categoria_id)?.nome || '—'
    : '—';
  const nomeCentroCusto = transferencia.tarifa?.centro_custo_id
    ? centrosCusto.find((centro) => centro.id === transferencia.tarifa?.centro_custo_id)?.nome || '—'
    : '—';

  return (
    <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-secondary">Conciliação bancária</h3>
        <span className="text-xs font-bold text-on-surface-variant">{rotulosStatus[transferencia.status]}</span>
      </div>
      {transferencia.tarifa && <p className="rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">Tarifa bancária (despesa da transferência): {moeda.format(Number(transferencia.tarifa.valor_previsto))} · Categoria: {nomeCategoria} · Centro de custo: {nomeCentroCusto}</p>}
      {transferencia.status === 'conciliada' && <p className="rounded-lg bg-bank-truth-green/10 p-3 text-xs text-bank-truth-green">A transferência já foi aprovada. O vínculo com o extrato é retroativo e opcional e não desfaz a aprovação.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <LadoTransferencia transferencia={transferencia} lado="origem" conciliada={!!transferencia.transacao_origem_id} bloquearAcoes={bloquearConciliacao} transacao={transferencia.transacao_origem} />
        <LadoTransferencia transferencia={transferencia} lado="destino" conciliada={!!transferencia.transacao_destino_id} bloquearAcoes={bloquearConciliacao} transacao={transferencia.transacao_destino} />
      </div>
      {bloquearConciliacao && (
        <p className="flex items-center gap-2 text-xs text-on-surface-variant">
          <CheckCircle2 aria-hidden="true" className={`h-4 w-4 ${transferencia.status === 'estornada' ? 'text-alert-red' : 'text-bank-truth-green'}`} />
          {transferencia.status === 'estornada' ? 'Esta transferência foi estornada.' : 'Os dois lados estão conciliados e aguardam aprovação Master.'}
        </p>
      )}
    </div>
  );
}
