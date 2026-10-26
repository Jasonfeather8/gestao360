import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, PenLine, X } from 'lucide-react';
import { dataReferenciaLancamento, direcaoLancamento, valorEfetivoLancamento } from '../../services/extrato/comparacao';
import { mensagemDoErro } from '../../services/erros';
import type { ItemComparacao, LancamentoFinanceiro, StatusPagamento } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** Títulos que podem receber vínculo bancário: em aberto ou já baixados (inclusive pendentes do gestor). */
const STATUS_CONCILIAVEIS: readonly StatusPagamento[] = ['aberto', 'pago', 'pago_parcial', 'quitação_pendente'];

function formatarData(data: string | null): string {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

function situacaoLancamento(lancamento: LancamentoFinanceiro, conciliados: Set<string>): string {
  if (conciliados.has(lancamento.id)) return 'Já conciliado';
  if (lancamento.status_pagamento === 'aberto') return 'Em aberto';
  if (lancamento.status_pagamento === 'quitação_pendente') return 'Pendente do gestor';
  if (lancamento.status_pagamento === 'pago' || lancamento.status_pagamento === 'pago_parcial') return 'Já baixado no ERP';
  return 'Não disponível para conciliação';
}

interface ConciliarModalProps {
  aberto: boolean;
  item: ItemComparacao | null;
  lancamentos: LancamentoFinanceiro[];
  lancamentosConciliados: Set<string>;
  carregandoLancamentosConciliados: boolean;
  podeConciliar: boolean;
  onFechar: () => void;
  onConfirmar: (lancamento: LancamentoFinanceiro) => void | Promise<void>;
  onFazerAVR: (lancamento: LancamentoFinanceiro) => void;
  isConciliando: boolean;
}

export default function ConciliarModal({
  aberto,
  item,
  lancamentos,
  lancamentosConciliados,
  carregandoLancamentosConciliados,
  podeConciliar,
  onFechar,
  onConfirmar,
  onFazerAVR,
  isConciliando,
}: ConciliarModalProps) {
  const [lancamentoSelecionadoId, setLancamentoSelecionadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setLancamentoSelecionadoId(item?.lancamento?.id ?? null);
    setErro(null);
  }, [item, aberto]);

  const candidatos = useMemo(() => {
    if (!item?.linhaExtrato) return [];
    const dataExtrato = new Date(`${item.linhaExtrato.data}T00:00:00Z`).getTime();
    const valorExtratoCentavos = Math.round(item.linhaExtrato.valor * 100);
    return lancamentos
      .filter((lancamento) => {
        const dataReferencia = dataReferenciaLancamento(lancamento);
        if (!dataReferencia || direcaoLancamento(lancamento) !== item.linhaExtrato?.direcao) return false;
        const distanciaDias = Math.abs(new Date(`${dataReferencia}T00:00:00Z`).getTime() - dataExtrato) / 86400000;
        return distanciaDias <= 7;
      })
      .sort((a, b) => {
        const diferencaValorA = Math.abs(Math.round(valorEfetivoLancamento(a) * 100) - valorExtratoCentavos);
        const diferencaValorB = Math.abs(Math.round(valorEfetivoLancamento(b) * 100) - valorExtratoCentavos);
        if (diferencaValorA === 0 && diferencaValorB !== 0) return -1;
        if (diferencaValorB === 0 && diferencaValorA !== 0) return 1;
        const distanciaA = Math.abs(new Date(`${dataReferenciaLancamento(a)}T00:00:00Z`).getTime() - dataExtrato);
        const distanciaB = Math.abs(new Date(`${dataReferenciaLancamento(b)}T00:00:00Z`).getTime() - dataExtrato);
        return distanciaA - distanciaB;
      });
  }, [item, lancamentos]);

  if (!aberto || !item?.linhaExtrato) return null;

  const linha = item.linhaExtrato;
  const lancamentoSelecionado = lancamentos.find((lancamento) => lancamento.id === lancamentoSelecionadoId)
    ?? (item.lancamento?.id === lancamentoSelecionadoId ? item.lancamento : null);
  const valorExtratoCentavos = Math.round(linha.valor * 100);
  const valorErpCentavos = lancamentoSelecionado ? Math.round(valorEfetivoLancamento(lancamentoSelecionado) * 100) : null;
  const diferencaCentavos = valorErpCentavos === null ? null : valorExtratoCentavos - valorErpCentavos;
  const valorBate = diferencaCentavos === 0;
  const selecionadoConciliado = lancamentoSelecionado ? lancamentosConciliados.has(lancamentoSelecionado.id) : false;
  const statusElegivel = lancamentoSelecionado && STATUS_CONCILIAVEIS.includes(lancamentoSelecionado.status_pagamento);
  const podeConfirmar = Boolean(podeConciliar && lancamentoSelecionado && valorBate && statusElegivel && !selecionadoConciliado && !carregandoLancamentosConciliados && !isConciliando);

  const confirmar = async () => {
    if (!lancamentoSelecionado || !podeConfirmar) return;
    setErro(null);
    try {
      await onConfirmar(lancamentoSelecionado);
    } catch (error) {
      setErro(mensagemDoErro(error, 'Não foi possível conciliar a transação.'));
    }
  };

  const fazerAVR = () => {
    if (lancamentoSelecionado?.status_pagamento === 'aberto') onFazerAVR(lancamentoSelecionado);
  };

  const ErpDirectionIcon = linha.direcao === 'entrada' ? ArrowUpRight : ArrowDownLeft;
  const statusSelecionado = lancamentoSelecionado ? situacaoLancamento(lancamentoSelecionado, lancamentosConciliados) : 'Selecione um lançamento';

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        role="dialog" aria-modal="true" aria-labelledby="conciliar-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="conciliar-title" className="text-xl font-black text-on-surface">Conciliar</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Confira os dados do extrato e vincule um lançamento do ERP.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full p-2 text-on-surface-variant hover:bg-surface"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-surface-border bg-surface-container-low p-4">
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-on-surface-variant">Extrato</h3>
            <div className="flex items-start gap-3">
              <ErpDirectionIcon className={`mt-0.5 h-5 w-5 shrink-0 ${linha.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">{formatarData(linha.data)}</p>
                <p className="mt-1 break-words text-sm text-on-surface-variant">{linha.descricao || linha.textoOriginal || 'Movimentação sem descrição'}</p>
                <p className="mt-2 text-xs text-on-surface-variant">Página do PDF: {linha.pagina ?? '—'}</p>
              </div>
              <p className={`shrink-0 text-sm font-black ${linha.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{moeda.format(linha.valor)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-surface-border p-4">
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-on-surface-variant">ERP</h3>
            {lancamentoSelecionado ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{formatarData(dataReferenciaLancamento(lancamentoSelecionado))}</p>
                  <p className="mt-1 break-words text-sm text-on-surface-variant">{lancamentoSelecionado.observacoes || 'Lançamento sem descrição'}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">Entidade: {lancamentoSelecionado.entidades_negocio?.nome_razao_social || 'Sem entidade'}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">Situação: {statusSelecionado}</p>
                </div>
                <p className={`shrink-0 text-sm font-black ${linha.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{moeda.format(valorEfetivoLancamento(lancamentoSelecionado))}</p>
              </div>
            ) : <p className="text-sm text-on-surface-variant">Selecione um lançamento para comparar.</p>}
          </section>
        </div>

        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-on-surface">Lançamentos candidatos · {linha.direcao === 'entrada' ? 'Entrada' : 'Saída'}</h3>
            <span className="text-xs text-on-surface-variant">{candidatos.length} {candidatos.length === 1 ? 'candidato' : 'candidatos'}</span>
          </div>
          {candidatos.length === 0 ? (
            <p className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Não há lançamentos do ERP na mesma conta e natureza nos ±7 dias desta linha do extrato.</p>
          ) : (
            <ul className="max-h-60 space-y-2 overflow-y-auto">
              {candidatos.map((lancamento) => {
                const conciliado = lancamentosConciliados.has(lancamento.id);
                const elegivel = STATUS_CONCILIAVEIS.includes(lancamento.status_pagamento);
                const desabilitado = conciliado || !elegivel || carregandoLancamentosConciliados;
                const situacao = carregandoLancamentosConciliados ? 'Verificando vínculo...' : situacaoLancamento(lancamento, lancamentosConciliados);
                const selecionado = lancamento.id === lancamentoSelecionadoId;
                return (
                  <li key={lancamento.id}>
                    <button
                      type="button"
                      disabled={desabilitado}
                      aria-pressed={selecionado}
                      onClick={() => { setLancamentoSelecionadoId(lancamento.id); setErro(null); }}
                      className={`w-full rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selecionado ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-primary/50'} ${desabilitado ? '' : 'hover:bg-primary/5'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{lancamento.observacoes || 'Lançamento sem descrição'}</p>
                          <p className="mt-1 truncate text-xs text-on-surface-variant">{lancamento.entidades_negocio?.nome_razao_social || 'Sem entidade'} · {formatarData(dataReferenciaLancamento(lancamento))}</p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${conciliado ? 'bg-bank-truth-green/10 text-bank-truth-green' : elegivel ? 'bg-surface-container-low text-on-surface-variant' : 'bg-alert-red/10 text-alert-red'}`}>{situacao}</span>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-on-surface">{moeda.format(valorEfetivoLancamento(lancamento))}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {lancamentoSelecionado && diferencaCentavos !== null && !valorBate && (
          <div className="mt-4 rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">
            Diferença de valor: {moeda.format(diferencaCentavos / 100)}. A conciliação exige valores exatamente iguais.
          </div>
        )}
        {lancamentoSelecionado && selecionadoConciliado && (
          <p className="mt-3 text-sm text-pending-amber">Este lançamento já está vinculado a uma transação bancária.</p>
        )}
        {lancamentoSelecionado && diferencaCentavos !== null && !valorBate && lancamentoSelecionado.status_pagamento !== 'aberto' && (
          <p className="mt-3 text-sm text-on-surface-variant">O AVR não se aplica a um lançamento já baixado. Ajuste o valor no ERP antes de conciliar.</p>
        )}
        {erro && <p role="alert" className="mt-4 rounded-xl bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}

        <footer className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {lancamentoSelecionado && diferencaCentavos !== null && !valorBate && lancamentoSelecionado.status_pagamento === 'aberto' && !selecionadoConciliado && (
            <button type="button" onClick={fazerAVR} className="inline-flex items-center gap-2 rounded-xl border border-surface-border px-4 py-2.5 text-sm font-bold text-on-surface-variant transition hover:bg-surface">
              <PenLine className="h-4 w-4" />Fazer AVR
            </button>
          )}
          <button type="button" onClick={onFechar} className="rounded-xl border border-surface-border px-4 py-2.5 text-sm font-bold text-on-surface hover:bg-surface">Cancelar</button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={!podeConfirmar}
            title={!podeConciliar ? 'Importe o extrato para conciliação antes de conciliar' : !lancamentoSelecionado ? 'Selecione um lançamento do ERP' : !valorBate ? 'Os valores precisam ser exatamente iguais' : undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isConciliando ? 'Conciliando...' : 'Conciliar'}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
