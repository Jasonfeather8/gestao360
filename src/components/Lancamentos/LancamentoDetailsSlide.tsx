"use client";

import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import {
  X,
  User,
  Tag,
  CreditCard,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle2,
  Clock,
  Info,
  Hash,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Printer,
  Building2,
  Banknote,
  Receipt,
  WalletCards,
  ClipboardCheck,
  CircleDollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Percent,
  BriefcaseBusiness,
  FileCheck2
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import {
  useLancamento,
  useLancamentoParcelas,
  useLancamentoAnexosByIds,
  useAuditoriaLogsByRegistroIds,
  useEntidades,
  useCategorias,
  useCategoriasAjuste,
  useCentrosCusto,
  useUsuarios,
  useLancamentos,
  useContas
} from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PrintDocumentSelector } from '../printing/PrintDocumentSelector';
import type { PrintableDocumentData } from '../printing/types';
import { calculateAdjustmentAmount } from '../../utils/adjustments';

export default function LancamentoDetailsSlide() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isComprovanteOpen,
    setModalOpen,
    selectedLancamentoIdForModal,
    setSelectedLancamentoIdForModal
  } = useUIStore();

  const { role } = useAuth();
  const { updateLancamento } = useLancamentos();
  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: categoriasAjuste = [] } = useCategoriasAjuste();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const { data: usuarios = [] } = useUsuarios();
  const { data: contas = [] } = useContas();
  const [isPrintOpen, setIsPrintOpen] = React.useState(false);
  const isMaster = role === 'master';

  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl !== selectedLancamentoIdForModal) {
      setSelectedLancamentoIdForModal(idFromUrl);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams]);

  const { data: lancamento, isLoading: loadingItem } = useLancamento(selectedLancamentoIdForModal);
  const { data: recurrenceParcelas = [], isLoading: loadingParcelas, isError: parcelasError } = useLancamentoParcelas(lancamento?.recorrencia_id || null);
  const parcelas = useMemo(
    () => recurrenceParcelas.length > 0 ? recurrenceParcelas : lancamento ? [lancamento] : [],
    [lancamento, recurrenceParcelas]
  );
  const parcelaIds = useMemo(() => parcelas.map(parcela => parcela.id).filter(Boolean), [parcelas]);
  const { data: anexos = [], isLoading: loadingAnexos, isError: anexosError } = useLancamentoAnexosByIds(parcelaIds);
  const { data: auditoriaLogs = [], isLoading: loadingAuditoria, isError: auditoriaError } = useAuditoriaLogsByRegistroIds(parcelaIds);

  const handleClose = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('id');
    setSearchParams(newParams);
    setModalOpen('isComprovanteOpen', false);
    setSelectedLancamentoIdForModal(null);
  };

  if (!isComprovanteOpen) return null;

  const getEntidadeName = (id: string) => entidades.find(e => e.id === id)?.nome_razao_social || 'Não informado';
  const getCategoriaName = (id: string) => categorias.find(c => c.id === id)?.nome || 'Sem categoria';
  const getUsuarioName = (id: string) => usuarios.find(u => u.id === id)?.nome || 'Sistema / Não informado';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });
    } catch { return dateStr; }
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch { return dateStr; }
  };

  const formatPaymentDateTime = (dateStr: string | null | undefined, timeStr: string | null | undefined) => {
    if (!dateStr) return '-';
    if (!timeStr) return formatDate(dateStr);
    return formatDateTime(`${dateStr}T${timeStr}`);
  };

  const getAccountName = (id: string | null | undefined) => {
    if (!id) return 'Não informado';
    const conta = contas.find(item => item.id === id);
    return conta?.nome_banco || conta?.nome || 'Conta não encontrada';
  };

  const getCentroCustoName = (id: string | null | undefined) => {
    if (!id) return 'Não informado';
    return centrosCusto.find(centro => centro.id === id)?.nome || 'Centro não encontrado';
  };

  const getAdjustmentReason = (id: string | null | undefined, fallback?: string | null) => {
    if (fallback) return fallback;
    if (!id) return 'Não informado';
    return categoriasAjuste.find(motivo => motivo.id === id)?.nome || 'Motivo não encontrado';
  };

  const formatAdjustment = (value: number | null | undefined, type: string | null | undefined, base: number) => {
    const numericValue = Number(value) || 0;
    if (type === 'porcentagem') {
      return `${numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% (${formatCurrency(calculateAdjustmentAmount(numericValue, type, base))})`;
    }
    return formatCurrency(numericValue);
  };

  const isSafeAttachmentUrl = (url: unknown): url is string => {
    if (typeof url !== 'string' || !url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const getParcelaAnexos = (parcelaId: string | null | undefined) => anexos.filter(anexo => anexo.lancamento_id === parcelaId);

  const handlePrintReceipt = () => {
    setIsPrintOpen(true);
  };

  const isQuitacaoPendente = lancamento?.status_pagamento === 'quitação_pendente';
  const quantidadeParcelas = lancamento?.quantidade_total_parcelas || parcelas.length || 1;
  const valorBaseConsolidado = parcelas.reduce((total, parcela) => total + (Number(parcela.valor_previsto) || 0), 0);
  const valorPrevistoConsolidado = valorBaseConsolidado || Number(lancamento?.valor_previsto) || 0;
  const valorOriginalConsolidado = lancamento && !lancamento.recorrencia_id
    ? Number(lancamento.valor_original) || valorPrevistoConsolidado
    : valorPrevistoConsolidado;
  const valorRecebidoConsolidado = parcelas.reduce((total, parcela) => total + (Number(parcela.valor_recebido) || 0), 0);
  const descontoConsolidado = parcelas.reduce((total, parcela) => {
    const base = Number(parcela.valor_previsto) || 0;
    return total + calculateAdjustmentAmount(parcela.desconto_valor, parcela.desconto_tipo, base);
  }, 0);
  const acrescimoConsolidado = parcelas.reduce((total, parcela) => {
    const base = Number(parcela.valor_previsto) || 0;
    return total + calculateAdjustmentAmount(parcela.acrescimo_valor, parcela.acrescimo_tipo, base);
  }, 0);
  const valorAjustado = Math.max(0, valorPrevistoConsolidado - descontoConsolidado + acrescimoConsolidado);
  const saldoPagar = Math.max(0, valorAjustado - valorRecebidoConsolidado);
  const printableData: PrintableDocumentData | null = lancamento ? {
    id: lancamento.id,
    documentNumber: lancamento.documento_numero || (lancamento.codigo_sequencial ? String(lancamento.codigo_sequencial) : undefined),
    recipient: getEntidadeName(lancamento.entidade_id),
    operation: lancamento.tipo,
    category: getCategoriaName(lancamento.categoria_id),
    account: getAccountName(lancamento.conta_bancaria_id),
    issuer: getUsuarioName(lancamento.usuario_criador_id),
    description: lancamento.observacoes,
    issueDate: lancamento.data_emissao,
    dueDate: lancamento.data_vencimento,
    paymentDate: lancamento.data_pagamento,
    amount: valorPrevistoConsolidado,
    receivedAmount: valorRecebidoConsolidado,
    adjustedAmount: valorAjustado,
    adjustments: [
      { label: 'Desconto', value: formatCurrency(descontoConsolidado) },
      { label: 'Acréscimo', value: formatCurrency(acrescimoConsolidado) }
    ],
    parcels: parcelas.map(parcela => ({
      number: parcela.numero_parcela || 1,
      dueDate: parcela.data_vencimento,
      amount: Number(parcela.valor_previsto) || 0,
      paidAmount: Number(parcela.valor_recebido) || 0,
      status: parcela.status_pagamento
    })),
    status: lancamento.status_pagamento,
    approvalStatus: lancamento.status_aprovacao === 'confirmado_master' ? 'Aprovado por Master' : 'Pendente de validação'
  } : null;

  return (
    <AnimatePresence>
      {printableData && <PrintDocumentSelector data={printableData} open={isPrintOpen} onClose={() => setIsPrintOpen(false)} />}
      {lancamento && (
        <div key="printable-receipt" className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[99999] text-black font-sans">
          <div className="max-w-2xl mx-auto border-2 border-black p-8 rounded-xl space-y-6">
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider">Comprovante de Lançamento</h1>
                <p className="text-xs uppercase font-bold text-gray-600">Gestão 360 - CFO ERP Headquarters</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold block">ID: #{lancamento.id.slice(0, 8)}</span>
                <span className="text-[10px] text-gray-500 block">Emissão: {new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Entidade / Destinatário:</span>
                <span className="font-black text-sm uppercase">{getEntidadeName(lancamento.entidade_id)}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Tipo de Operação:</span>
                <span className="font-black text-sm uppercase">{lancamento.tipo === 'entrada' ? 'Receita / Entrada' : 'Despesa / Saída'}</span>
              </div>
            </div>

            <div className="bg-gray-100 p-4 rounded-lg flex justify-between items-center">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Valor Efetivo / Líquido:</span>
                <span className="text-2xl font-black font-mono">
                  {formatCurrency(valorRecebidoConsolidado > 0 ? valorRecebidoConsolidado : valorAjustado)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold uppercase text-gray-500 block text-[9px]">Valor Original Consolidado:</span>
                <span className="text-sm font-bold font-mono text-gray-700">{formatCurrency(valorOriginalConsolidado)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs border-y border-gray-200 py-4">
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Vencimento:</span>
                <span className="font-bold">{formatDate(lancamento.data_vencimento)}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Data Pagamento:</span>
                <span className="font-bold">{formatDate(lancamento.data_pagamento) || '-'}</span>
              </div>
              <div>
                <span className="font-bold uppercase text-gray-500 block text-[10px]">Categoria:</span>
                <span className="font-bold uppercase">{getCategoriaName(lancamento.categoria_id)}</span>
              </div>
            </div>

            {lancamento.observacoes && (
              <div className="text-xs">
                <span className="font-bold uppercase text-gray-500 block text-[10px] mb-1">Histórico / Observações:</span>
                <p className="italic text-gray-700 bg-gray-50 p-3 rounded border border-gray-200">{lancamento.observacoes}</p>
              </div>
            )}

            <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="border-t border-black pt-2">
                <p className="font-bold uppercase text-[10px]">{getUsuarioName(lancamento.usuario_criador_id)}</p>
                <p className="text-[8px] uppercase text-gray-500">Operador / Emissor</p>
              </div>
              <div className="border-t border-black pt-2">
                <p className="font-bold uppercase text-[10px]">
                  {lancamento.status_aprovacao === 'confirmado_master' ? 'Aprovado por Master' : 'Pendente de Validação'}
                </p>
                <p className="text-[8px] uppercase text-gray-500">Autenticação do Gestor</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div key="details-drawer" className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-5 print:hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-neutral-900/45 backdrop-blur-xs"
        />

        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          className="bg-white w-full max-w-[1180px] max-h-[94vh] shadow-2xl relative z-10 flex flex-col border border-neutral-100 rounded-[28px] sm:rounded-[34px] overflow-hidden"
        >
          {loadingItem ? (
            <div className="flex-1 flex items-center justify-center p-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Localizando Lançamento...</p>
              </div>
            </div>
          ) : !lancamento ? (
            <div className="flex-1 flex items-center justify-center p-20 text-center">
              <div>
                <AlertTriangle className="w-12 h-12 text-alert-red mx-auto mb-4" />
                <h3 className="font-black uppercase text-neutral-900">Registro não encontrado</h3>
                <p className="text-xs text-secondary mt-2">O lançamento pode ter sido removido ou você não tem permissão para visualizá-lo.</p>
                <button onClick={handleClose} className="mt-6 px-6 py-2 bg-neutral-900 text-white text-[10px] font-black uppercase rounded-lg">Voltar</button>
              </div>
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-neutral-100 bg-white px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                        lancamento.tipo === 'entrada' ? 'bg-bank-truth-green/10 text-bank-truth-green' : 'bg-alert-red/10 text-alert-red'
                      }`}>
                        {lancamento.tipo === 'entrada' ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                        {lancamento.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-secondary">
                        <Hash className="h-3 w-3" />
                        {lancamento.codigo_sequencial ? `${lancamento.codigo_sequencial}${lancamento.numero_parcela ? `-${lancamento.numero_parcela}` : ''}` : lancamento.id.slice(0, 8)}
                      </span>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-black tracking-tight text-neutral-900 sm:text-xl">Detalhes da operação</h2>
                    <div className="mt-2 flex min-w-0 items-center gap-2 text-xs font-bold text-secondary">
                      <Building2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{getEntidadeName(lancamento.entidade_id)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-2 sm:gap-3">
                    <div className="hidden rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-right sm:block">
                      <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-secondary">Parcelamento</span>
                      <span className="mt-1 block text-xs font-black text-neutral-900">{quantidadeParcelas} {quantidadeParcelas === 1 ? 'parcela' : 'parcelas'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrintReceipt}
                      aria-label="Gerar PDF"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-neutral-700 transition-colors hover:border-primary hover:text-primary sm:px-3"
                    >
                      <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Gerar PDF</span>
                    </button>
                    <span role="checkbox" aria-checked="false" aria-label="Selecionar todas as parcelas" className="mt-2 h-4 w-4 rounded border border-neutral-300 bg-white" />
                    <button onClick={handleClose} aria-label="Fechar detalhes" className="rounded-xl p-2 text-secondary transition-colors hover:bg-neutral-100 hover:text-neutral-900">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.13em] text-secondary sm:hidden">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                  {quantidadeParcelas} {quantidadeParcelas === 1 ? 'parcela' : 'parcelas'} no título
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-[#fcfcfb] p-4 sm:p-6 lg:p-7 scrollbar-thin">
                <div className="mx-auto max-w-[1080px] space-y-6">
                  <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 ${
                      lancamento.tipo === 'entrada' ? 'border-bank-truth-green/20 bg-bank-truth-green/[0.06]' : 'border-alert-red/20 bg-alert-red/[0.05]'
                    }`}>
                      <div className={`absolute -right-12 -top-14 h-36 w-36 rounded-full opacity-10 ${lancamento.tipo === 'entrada' ? 'bg-bank-truth-green' : 'bg-alert-red'}`} />
                      <div className="relative flex items-start justify-between gap-4">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-secondary">Resumo financeiro</span>
                          <p className="mt-3 text-[11px] font-bold text-secondary">{lancamento.tipo === 'entrada' ? 'Total previsto / recebido' : 'Total previsto / pago'}</p>
                          <strong className={`mt-1 block text-3xl font-black tracking-tight sm:text-4xl ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                            {formatCurrency(valorPrevistoConsolidado)}
                          </strong>
                        </div>
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/75 ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                          <CircleDollarSign className="h-6 w-6" />
                        </div>
                      </div>
                      <div className="relative mt-5 flex flex-wrap gap-2">
                        <PaymentStatusBadge
                          status={lancamento.status_pagamento}
                          isMaster={isMaster}
                          hasResidual={Boolean((lancamento as any).vinculo_residuo_id)}
                          contextualPending
                        />
                        <ApprovalStatusBadge status={lancamento.status_aprovacao} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <SummaryMetric label="Valor original consolidado" value={formatCurrency(valorOriginalConsolidado)} icon={<Receipt className="h-4 w-4" />} />
                      <SummaryMetric label="Valor liquidado / recebido" value={formatCurrency(valorRecebidoConsolidado)} icon={<CheckCircle2 className="h-4 w-4" />} accent="green" />
                      <SummaryMetric label="Saldo a pagar" value={formatCurrency(saldoPagar)} icon={<Clock className="h-4 w-4" />} accent="amber" />
                      <SummaryMetric label="Desconto calculado" value={formatCurrency(descontoConsolidado)} icon={<ArrowDownToLine className="h-4 w-4" />} accent="amber" />
                      <SummaryMetric label="Acréscimo calculado" value={formatCurrency(acrescimoConsolidado)} icon={<ArrowUpFromLine className="h-4 w-4" />} accent="amber" />
                      <SummaryMetric label="Vencimento" value={formatDate(lancamento.data_vencimento)} icon={<Calendar className="h-4 w-4" />} />
                      <SummaryMetric label="Categoria" value={getCategoriaName(lancamento.categoria_id)} icon={<Tag className="h-4 w-4" />} />
                    </div>
                  </section>

                  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
                    <div className="min-w-0 space-y-6">
                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <SectionHeading icon={<Info className="h-4 w-4" />} title="Informações do lançamento" />
                        <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                          <DetailItem icon={<User className="h-3.5 w-3.5" />} label="Responsável / colaborador" value={getUsuarioName(lancamento.usuario_criador_id)} />
                          <DetailItem icon={<Building2 className="h-3.5 w-3.5" />} label="Entidade / cliente" value={getEntidadeName(lancamento.entidade_id)} />
                          <DetailItem icon={<FileText className="h-3.5 w-3.5" />} label="Categoria" value={getCategoriaName(lancamento.categoria_id)} />
                          <DetailItem icon={<BriefcaseBusiness className="h-3.5 w-3.5" />} label="Centro de custo" value={getCentroCustoName(lancamento.centro_custo_id)} />
                          <DetailItem icon={<WalletCards className="h-3.5 w-3.5" />} label="Banco / conta" value={getAccountName(lancamento.conta_bancaria_id)} />
                          <DetailItem icon={<Hash className="h-3.5 w-3.5" />} label="Documento" value={(lancamento as any).documento_numero || (lancamento.codigo_sequencial ? String(lancamento.codigo_sequencial) : 'Não informado')} />
                          <DetailItem icon={<CreditCard className="h-3.5 w-3.5" />} label="Condição" value={lancamento.condicao === 'a_vista' ? 'À vista' : lancamento.condicao === 'a_prazo' ? 'A prazo' : 'Não informado'} />
                          <DetailItem icon={<ArrowDownToLine className="h-3.5 w-3.5" />} label="Motivo do desconto" value={getAdjustmentReason(lancamento.motivo_desconto_id)} />
                          <DetailItem icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} label="Motivo do acréscimo" value={getAdjustmentReason(lancamento.motivo_acrescimo_id)} />
                          <DetailItem icon={<FileCheck2 className="h-3.5 w-3.5" />} label="Motivo do ajuste" value={getAdjustmentReason((lancamento as any).motivo_ajuste_id, lancamento.motivo_ajuste)} />
                          <DetailItem icon={<FileCheck2 className="h-3.5 w-3.5" />} label="Tipo de operação" value={lancamento.tipo === 'entrada' ? 'Receita / Entrada' : 'Despesa / Saída'} />
                        </div>
                      </section>

                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <SectionHeading icon={<Banknote className="h-4 w-4" />} title="Valores e datas" />
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                          <DetailItem icon={<DollarSign className="h-3.5 w-3.5" />} label="Valor original consolidado" value={formatCurrency(valorOriginalConsolidado)} highlight />
                          <DetailItem icon={<Banknote className="h-3.5 w-3.5" />} label="Valor ajustado" value={formatCurrency(valorAjustado)} highlight />
                          <DetailItem icon={<Clock className="h-3.5 w-3.5 text-orange-600" />} label="Saldo a pagar" value={formatCurrency(saldoPagar)} highlight />
                          <DetailItem icon={<CheckCircle2 className="h-3.5 w-3.5 text-bank-truth-green" />} label="Valor liquidado / recebido" value={formatCurrency(valorRecebidoConsolidado)} highlight />
                          <DetailItem icon={<Calendar className="h-3.5 w-3.5" />} label="Data de emissão" value={formatDate(lancamento.data_emissao)} />
                          <DetailItem icon={<Calendar className="h-3.5 w-3.5" />} label="Vencimento" value={formatDate(lancamento.data_vencimento)} />
                          <DetailItem icon={<Calendar className="h-3.5 w-3.5" />} label="Data competência" value={formatDate(lancamento.data_competencia)} />
                          <DetailItem icon={<Clock className="h-3.5 w-3.5" />} label="Registrado em" value={formatDateTime(lancamento.created_at)} />
                          <DetailItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Baixa realizada em" value={formatPaymentDateTime(lancamento.data_pagamento, lancamento.hora_pagamento)} />
                          <DetailItem icon={<Percent className="h-3.5 w-3.5" />} label="Desconto (tipo / calculado)" value={`${formatAdjustment(lancamento.desconto_valor, lancamento.desconto_tipo, Number(lancamento.valor_previsto) || 0)}${lancamento.desconto_valor ? ` · ${getAdjustmentReason(lancamento.motivo_desconto_id)}` : ''}`} />
                          <DetailItem icon={<Percent className="h-3.5 w-3.5" />} label="Acréscimo (tipo / calculado)" value={`${formatAdjustment(lancamento.acrescimo_valor, lancamento.acrescimo_tipo, Number(lancamento.valor_previsto) || 0)}${lancamento.acrescimo_valor ? ` · ${getAdjustmentReason(lancamento.motivo_acrescimo_id)}` : ''}`} />
                        </div>

                        {lancamento.status_pagamento === 'pago' && valorOriginalConsolidado !== valorRecebidoConsolidado && (
                          <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4">
                            <div className="flex items-center justify-between gap-3 border-b border-primary/10 pb-3">
                              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-secondary">Memória de cálculo (AVR)</span>
                              <span className="rounded bg-primary px-2 py-1 text-[8px] font-black uppercase text-white">Ajustado</span>
                            </div>
                            <div className="mt-3 space-y-2.5">
                              <ValueLine label="Valor original consolidado" value={formatCurrency(valorOriginalConsolidado)} />
                              <ValueLine label="Valor quitado" value={formatCurrency(valorRecebidoConsolidado)} valueClass="text-bank-truth-green" />
                              <ValueLine label="Saldo aberto (diferença)" value={formatCurrency(Math.max(0, valorOriginalConsolidado - valorRecebidoConsolidado))} valueClass="text-alert-red" strong />
                            </div>
                          </div>
                        )}
                      </section>

                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <SectionHeading icon={<CreditCard className="h-4 w-4" />} title="Resumo do parcelamento" />
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-secondary">{quantidadeParcelas} {quantidadeParcelas === 1 ? 'parcela' : 'parcelas'}</span>
                        </div>
                        {loadingParcelas && <p className="mt-3 text-[10px] font-bold text-secondary">Localizando as demais parcelas...</p>}
                        {parcelasError && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-[10px] font-bold text-secondary">Não foi possível carregar as demais parcelas. Exibindo os dados disponíveis.</p>}
                        <div className="mt-5 overflow-x-auto rounded-2xl border border-neutral-100">
                          <table className="w-full min-w-[650px] text-left">
                            <thead className="bg-neutral-50">
                              <tr className="text-[8px] font-black uppercase tracking-[0.14em] text-secondary">
                                <th className="px-4 py-3">Parcela</th>
                                <th className="px-4 py-3">Entidade / cliente</th>
                                <th className="px-4 py-3">Vencimento</th>
                                <th className="px-4 py-3">Valor original</th>
                                <th className="px-4 py-3">Valor pago</th>
                                <th className="px-4 py-3">Saldo a pagar</th>
                                <th className="px-4 py-3">Conta / banco</th>
                                <th className="px-4 py-3 text-right">Status / aprovação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {parcelas.map((parcela, index) => {
                                const parcelaValorOriginal = Number(parcela.valor_previsto) || 0;
                                const parcelaValorPago = Number(parcela.valor_recebido) || 0;
                                const parcelaDesconto = calculateAdjustmentAmount(parcela.desconto_valor, parcela.desconto_tipo, parcelaValorOriginal);
                                const parcelaAcrescimo = calculateAdjustmentAmount(parcela.acrescimo_valor, parcela.acrescimo_tipo, parcelaValorOriginal);
                                const parcelaValorAPagar = Math.max(0, parcelaValorOriginal - parcelaDesconto + parcelaAcrescimo - parcelaValorPago);
                                return (
                                  <tr key={`parcela-resumo-${parcela.id || 'item'}-${index}`} className="text-[10px] font-bold text-neutral-900">
                                    <td className="px-4 py-3 font-black">{parcela.numero_parcela || index + 1}</td>
                                    <td className="max-w-[170px] truncate px-4 py-3 text-secondary">{getEntidadeName(parcela.entidade_id || lancamento.entidade_id)}</td>
                                    <td className="px-4 py-3 text-secondary">{formatDate(parcela.data_vencimento)}</td>
                                    <td className="px-4 py-3 font-black">{formatCurrency(parcelaValorOriginal)}</td>
                                    <td className="px-4 py-3 font-black text-bank-truth-green">{formatCurrency(parcelaValorPago)}</td>
                                    <td className={`px-4 py-3 font-black ${parcelaValorAPagar > 0 ? 'text-alert-red' : 'text-bank-truth-green'}`}>{formatCurrency(parcelaValorAPagar)}</td>
                                    <td className="max-w-[170px] truncate px-4 py-3 text-secondary">{getAccountName(parcela.conta_bancaria_id || lancamento.conta_bancaria_id)}</td>
                                    <td className="px-4 py-3 text-right"><div className="flex min-w-[140px] flex-col items-end gap-1"><PaymentStatusBadge status={parcela.status_pagamento} isMaster={isMaster} compact /><ApprovalStatusBadge status={parcela.status_aprovacao} compact /></div></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          {parcelas.map((parcela, index) => {
                            const pago = parcela.status_pagamento === 'pago';
                            const pendente = parcela.status_pagamento === 'quitação_pendente';
                            return (
                              <article key={`parcela-detalhe-${parcela.id || 'item'}-${index}`} className="rounded-2xl border border-neutral-100 bg-[#fcfcfb] p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-secondary">Detalhe da parcela</span>
                                    <h4 className="mt-1 text-sm font-black text-neutral-900">Parcela {parcela.numero_parcela || index + 1}</h4>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <PaymentStatusBadge status={parcela.status_pagamento} isMaster={isMaster} compact />
                                    <span role="checkbox" aria-checked="false" aria-label={`Selecionar parcela ${parcela.numero_parcela || index + 1}`} className="h-4 w-4 rounded border border-neutral-300 bg-white" />
                                  </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                                  <MiniValue label="Entidade / cliente" value={getEntidadeName(parcela.entidade_id || lancamento.entidade_id)} />
                                  <MiniValue label="Valor previsto" value={formatCurrency(Number(parcela.valor_previsto) || 0)} />
                                  <MiniValue label="Valor recebido / pago" value={formatCurrency(Number(parcela.valor_recebido) || 0)} valueClass={pago ? 'text-bank-truth-green' : undefined} />
                                  <MiniValue
                                    label="Saldo a pagar"
                                    value={formatCurrency(Math.max(0, (Number(parcela.valor_previsto) || 0) - calculateAdjustmentAmount(parcela.desconto_valor, parcela.desconto_tipo, Number(parcela.valor_previsto) || 0) + calculateAdjustmentAmount(parcela.acrescimo_valor, parcela.acrescimo_tipo, Number(parcela.valor_previsto) || 0) - (Number(parcela.valor_recebido) || 0)))}
                                    valueClass="text-alert-red"
                                  />
                                  <MiniValue label="Vencimento" value={formatDate(parcela.data_vencimento)} />
                                  <MiniValue label="Data de emissão" value={formatDate(parcela.data_emissao)} />
                                  <MiniValue label="Data competência" value={formatDate(parcela.data_competencia)} />
                                  <MiniValue label="Documento" value={(parcela as any).documento_numero || (parcela.codigo_sequencial ? String(parcela.codigo_sequencial) : 'Não informado')} />
                                  <MiniValue label="Condição" value={parcela.condicao === 'a_vista' ? 'À vista' : parcela.condicao === 'a_prazo' ? 'A prazo' : 'Não informado'} />
                                  <MiniValue label="Centro de custo" value={getCentroCustoName(parcela.centro_custo_id || lancamento.centro_custo_id)} />
                                  <MiniValue label="Conta / banco" value={getAccountName(parcela.conta_bancaria_id || lancamento.conta_bancaria_id)} />
                                  <MiniValue label="Desconto (tipo / calculado)" value={formatAdjustment(parcela.desconto_valor, parcela.desconto_tipo, Number(parcela.valor_previsto) || 0)} />
                                  <MiniValue label="Acréscimo (tipo / calculado)" value={formatAdjustment(parcela.acrescimo_valor, parcela.acrescimo_tipo, Number(parcela.valor_previsto) || 0)} />
                                  <MiniValue label="Motivo do desconto" value={getAdjustmentReason(parcela.motivo_desconto_id)} />
                                  <MiniValue label="Motivo do acréscimo" value={getAdjustmentReason(parcela.motivo_acrescimo_id)} />
                                  <MiniValue label="Motivo do ajuste" value={getAdjustmentReason((parcela as any).motivo_ajuste_id, parcela.motivo_ajuste)} />
                                  <MiniValue label="Registrada" value={formatDateTime(parcela.created_at)} />
                                  <MiniValue label="Baixa" value={formatPaymentDateTime(parcela.data_pagamento, parcela.hora_pagamento)} valueClass={pago ? 'text-bank-truth-green' : pendente ? 'text-orange-600' : undefined} />
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <SectionHeading icon={<ClipboardCheck className="h-4 w-4" />} title="Auditoria detalhada por parcela" />
                        <div className="mt-5 space-y-4">
                          {loadingAuditoria ? (
                            <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Consultando auditoria...</div>
                          ) : auditoriaError ? (
                            <p className="rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold text-secondary">Auditoria indisponível para este perfil ou lançamento.</p>
                          ) : parcelas.map((parcela, index) => {
                            const logsDaParcela = auditoriaLogs.filter(log => log.registro_id === parcela.id);
                            return (
                              <article key={`auditoria-parcela-${parcela.id || index}`} className="rounded-2xl border border-neutral-100 bg-[#fcfcfb] p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-secondary">Rastreabilidade</span>
                                    <h4 className="mt-1 text-sm font-black text-neutral-900">Parcela {parcela.numero_parcela || index + 1}</h4>
                                  </div>
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    <PaymentStatusBadge status={parcela.status_pagamento} isMaster={isMaster} compact />
                                    <ApprovalStatusBadge status={parcela.status_aprovacao} compact />
                                  </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                                  <MiniValue label="Registrada" value={formatDateTime(parcela.created_at)} />
                                  <MiniValue label="Colaborador" value={getUsuarioName(parcela.usuario_criador_id)} />
                                  <MiniValue label="Valor" value={formatCurrency(Number(parcela.valor_previsto) || 0)} />
                                  <MiniValue label="Comprovante" value={parcela.comprovante_url || getParcelaAnexos(parcela.id).length > 0 ? 'Disponível' : 'Não informado'} />
                                  <MiniValue label="Status da conta" value={parcela.status_pagamento === 'pago' ? 'Liquidada' : parcela.status_pagamento === 'pago_parcial' ? 'Pago parcial' : 'Em aberto'} />
                                  <MiniValue label="Banco / conta" value={getAccountName(parcela.conta_bancaria_id || lancamento.conta_bancaria_id)} />
                                  <MiniValue label="Status Master" value={parcela.status_aprovacao === 'confirmado_master' ? 'Confirmado Master' : 'Pendente'} />
                                  <MiniValue label="Aprovado por" value={(parcela as any).usuario_aprovador_id ? getUsuarioName((parcela as any).usuario_aprovador_id) : 'Não informado'} />
                                  <MiniValue label="Aprovado em" value={formatDateTime((parcela as any).data_aprovacao)} />
                                  <MiniValue label="Baixa" value={formatPaymentDateTime(parcela.data_pagamento, parcela.hora_pagamento)} />
                                </div>
                                <div className="mt-4 border-t border-neutral-100 pt-3">
                                  <span className="text-[8px] font-black uppercase tracking-[0.12em] text-secondary">Eventos registrados</span>
                                  {logsDaParcela.length > 0 ? (
                                    <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-100">
                                      <div className="min-w-[760px]">
                                        <div className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.9fr_1fr_1.1fr_1fr_1.1fr] gap-3 bg-neutral-50 px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-secondary">
                                          <span>Registrada</span><span>Colaborador</span><span>Valor</span><span>Comprovante</span><span>Status da conta</span><span>Banco</span><span>Status Master</span><span>Baixa</span>
                                        </div>
                                        <div className="divide-y divide-neutral-100">
                                          {logsDaParcela.map((log, logIndex) => {
                                            const dadosEvento = (log.dados_novos || log.dados_anteriores || {}) as Record<string, any>;
                                            const valorEvento = dadosEvento.valor_recebido ?? dadosEvento.valor_pago ?? dadosEvento.valor_previsto;
                                            const comprovanteEvento = Boolean(dadosEvento.comprovante_url) || getParcelaAnexos(parcela.id).length > 0;
                                            const statusEvento = dadosEvento.status_pagamento || parcela.status_pagamento;
                                            const statusMasterEvento = dadosEvento.status_aprovacao || parcela.status_aprovacao;
                                            return (
                                              <div key={`audit-${parcela.id}-${log.id || logIndex}`} className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.9fr_1fr_1.1fr_1fr_1.1fr] gap-3 px-3 py-2.5 text-[9px] font-bold text-neutral-700">
                                                <span>{formatDateTime(log.data_hora)}</span>
                                                <span className="font-black">{log.profiles?.nome || getUsuarioName(log.usuario_id)}</span>
                                                <span>{valorEvento !== undefined && valorEvento !== null ? formatCurrency(Number(valorEvento) || 0) : '-'}</span>
                                                <span className={comprovanteEvento ? 'text-bank-truth-green' : 'text-secondary'}>{comprovanteEvento ? 'Disponível' : 'Não informado'}</span>
                                                <span>{statusEvento === 'pago' ? 'Liquidada' : statusEvento === 'pago_parcial' ? 'Pago parcial' : statusEvento === 'quitação_pendente' ? 'Pendente' : 'Em aberto'}</span>
                                                <span className="truncate">{getAccountName(dadosEvento.conta_bancaria_id || parcela.conta_bancaria_id || lancamento.conta_bancaria_id)}</span>
                                                <span>{statusMasterEvento === 'confirmado_master' ? 'Confirmado' : statusMasterEvento === 'reprovado' ? 'Reprovado' : 'Pendente'}</span>
                                                <span>{formatPaymentDateTime(dadosEvento.data_pagamento || parcela.data_pagamento, dadosEvento.hora_pagamento || parcela.hora_pagamento)}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-[10px] font-bold text-secondary">Nenhum evento de auditoria disponível para esta parcela.</p>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                          <SectionHeading icon={<ExternalLink className="h-4 w-4" />} title="Anexos e comprovantes" />
                          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-secondary">{anexos.length} arquivo{anexos.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {loadingAnexos ? (
                            <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Consultando anexos...</div>
                          ) : anexosError ? (
                            <p className="rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold text-secondary">Não foi possível consultar os anexos deste lançamento.</p>
                          ) : anexos.length > 0 ? (
                            anexos.map((anexo, index) => (
                              <div key={`anexo-${anexo.id || index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                                  <div className="min-w-0">
                                    <span className="block truncate text-[10px] font-black text-neutral-900">{anexo.nome || anexo.file_name || anexo.name || `Comprovante ${index + 1}`}</span>
                                    <span className="block text-[9px] font-bold text-secondary">Parcela {parcelas.find(parcela => parcela.id === anexo.lancamento_id)?.numero_parcela || 'única'}</span>
                                  </div>
                                </div>
                                {isSafeAttachmentUrl(anexo.url) ? (
                                  <a href={anexo.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase text-primary hover:border-primary"><ExternalLink className="h-3 w-3" /> Abrir</a>
                                ) : <span className="text-[9px] font-bold text-secondary">Arquivo sem link disponível</span>}
                              </div>
                            ))
                          ) : (
                            <p className="rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold text-secondary">Nenhum anexo ou comprovante registrado.</p>
                          )}
                          {parcelas.some(parcela => Boolean(parcela.comprovante_url)) && (
                            <div className="space-y-2 border-t border-neutral-100 pt-3">
                              <span className="text-[8px] font-black uppercase tracking-[0.12em] text-secondary">Comprovantes vinculados ao lançamento</span>
                              {parcelas.filter(parcela => Boolean(parcela.comprovante_url)).map((parcela, index) => (
                                <div key={`comprovante-url-${parcela.id || index}`} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
                                  <span className="text-[10px] font-black text-neutral-900">Parcela {parcela.numero_parcela || index + 1}</span>
                                  {isSafeAttachmentUrl(parcela.comprovante_url) ? <a href={parcela.comprovante_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-primary"><ExternalLink className="h-3 w-3" /> Abrir comprovante</a> : <span className="text-[9px] font-bold text-secondary">Link indisponível</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="rounded-3xl border border-neutral-100 bg-white p-5 sm:p-6">
                        <SectionHeading icon={<FileText className="h-4 w-4" />} title="Observações" />
                        <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs font-bold leading-relaxed text-secondary">
                          {lancamento.observacoes || 'Sem observações registradas.'}
                        </div>
                      </section>
                    </div>

                    <aside className="space-y-5 xl:sticky xl:top-0">
                      <section className="rounded-3xl border border-neutral-100 bg-white p-5">
                        <SectionHeading icon={<ClipboardCheck className="h-4 w-4" />} title="Operações e auditoria" />
                        <div className="mt-5 space-y-3">
                          <div className="rounded-2xl bg-neutral-50 p-4">
                            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-secondary">Status da aprovação</span>
                            <div className="mt-2"><ApprovalStatusBadge status={lancamento.status_aprovacao} /></div>
                          </div>
                          <div className="rounded-2xl bg-neutral-50 p-4">
                            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-secondary">Status do pagamento</span>
                            <div className="mt-2"><PaymentStatusBadge status={lancamento.status_pagamento} isMaster={isMaster} hasResidual={Boolean((lancamento as any).vinculo_residuo_id)} contextualPending /></div>
                          </div>
                          <div className="rounded-2xl bg-neutral-900 p-4 text-white">
                            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/45">Confirmação Master</span>
                            <p className="mt-2 text-xs font-black">
                              {lancamento.status_aprovacao === 'confirmado_master'
                                ? ((lancamento as any).data_aprovacao ? formatDateTime((lancamento as any).data_aprovacao) : 'Sem registro')
                                : 'Aguardando aprovação'}
                            </p>
                            {(lancamento as any).usuario_aprovador_id && (
                              <p className="mt-2 border-t border-white/10 pt-2 text-[10px] font-bold text-white/65">Aprovado por: <span className="font-black text-white">{getUsuarioName((lancamento as any).usuario_aprovador_id)}</span></p>
                            )}
                          </div>
                        </div>
                      </section>

                      {isMaster && (lancamento.status_aprovacao !== 'confirmado_master' || isQuitacaoPendente) && (
                        <section className="rounded-3xl border border-primary/15 bg-primary/[0.045] p-5">
                          <div className="flex items-center gap-2">
                            <TrendingUp className={`h-4 w-4 ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`} />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-secondary">{isQuitacaoPendente ? 'Impacto no saldo real' : 'Impacto no saldo confirmado'}</span>
                          </div>
                          <p className={`mt-4 text-2xl font-black font-mono ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                            {lancamento.tipo === 'entrada' ? '+' : '-'} {formatCurrency((lancamento as any).tipo_baixa === 'avr' ? valorOriginalConsolidado : valorPrevistoConsolidado)}
                          </p>
                        </section>
                      )}

                      <button
                        type="button"
                        onClick={handlePrintReceipt}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-[10px] font-black uppercase tracking-[0.15em] text-neutral-900 shadow-sm transition-all hover:border-primary hover:text-primary"
                      >
                        <Printer className="h-4 w-4" /> Pré-visualizar / Imprimir
                      </button>
                    </aside>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function PaymentStatusBadge({ status, isMaster, hasResidual = false, contextualPending = false, compact = false }: { status?: string | null, isMaster: boolean, hasResidual?: boolean, contextualPending?: boolean, compact?: boolean }) {
  const baseClass = compact ? 'px-1.5 py-1 text-[8px]' : 'px-2.5 py-1.5 text-[9px]';
  if (compact) {
    const label = status === 'pago' ? 'Paga' : status === 'pago_parcial' ? 'Pago parcial' : status === 'bpi' ? 'BPI' : status === 'quitação_pendente' ? 'Pendente' : 'Em aberto';
    const color = status === 'pago' ? 'bg-bank-truth-green/10 text-bank-truth-green' : status === 'pago_parcial' ? 'bg-orange-50 text-orange-600' : status === 'quitação_pendente' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-secondary';
    return <span className={`inline-flex items-center rounded font-black uppercase ${color} ${baseClass}`}>{label}</span>;
  }
  if (status === 'bpi') {
    return <span className={`inline-flex items-center gap-1 rounded-full bg-neutral-100 font-black uppercase tracking-[0.08em] text-neutral-700 ${baseClass}`}><AlertTriangle className="h-3 w-3" /> BPI</span>;
  }
  if (status === 'pago_parcial' || (status === 'quitação_pendente' && hasResidual)) {
    return <span className={`inline-flex items-center gap-1 rounded-full bg-orange-50 font-black uppercase tracking-[0.08em] text-orange-600 ring-1 ring-inset ring-orange-200 ${baseClass}`}><Clock className="h-3 w-3" /> Pago Parcial</span>;
  }
  if (status === 'quitação_pendente') {
    return <span className={`inline-flex items-center gap-1 rounded-full bg-amber-50 font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-inset ring-amber-200 ${baseClass}`}><Clock className="h-3 w-3" /> {contextualPending ? (isMaster ? 'Confirme Baixa' : 'Pendente Gestor') : 'Pendente'}</span>;
  }
  if (status === 'pago') {
    return <span className={`inline-flex items-center gap-1 rounded-full bg-bank-truth-green/10 font-black uppercase tracking-[0.08em] text-bank-truth-green ${baseClass}`}><CheckCircle2 className="h-3 w-3" /> Liquidado, Pago</span>;
  }
  return <span className={`inline-flex items-center gap-1 rounded-full bg-alert-red/10 font-black uppercase tracking-[0.08em] text-alert-red ${baseClass}`}><Clock className="h-3 w-3" /> Em Aberto</span>;
}

function ApprovalStatusBadge({ status, compact = false }: { status?: string | null, compact?: boolean }) {
  const className = compact ? 'gap-1 rounded px-1.5 py-1 text-[8px]' : 'gap-1.5 rounded-full px-2.5 py-1.5 text-[9px]';
  if (status === 'confirmado_master') {
    return <span className={`inline-flex items-center font-black uppercase tracking-[0.08em] text-white ${className} bg-neutral-900`}><ShieldCheck className="h-3 w-3" /> {compact ? 'Master' : 'Lançamento aprovado'}</span>;
  }
  if (status === 'reprovado') {
    return <span className={`inline-flex items-center font-black uppercase tracking-[0.08em] text-alert-red ${className} bg-alert-red/10`}><AlertTriangle className="h-3 w-3" /> Reprovado</span>;
  }
  if (status === 'digital') {
    return <span className={`inline-flex items-center font-black uppercase tracking-[0.08em] text-primary ${className} bg-primary/10`}><ShieldCheck className="h-3 w-3" /> Digital</span>;
  }
  return (
    <span className={`inline-flex items-center font-black uppercase tracking-[0.08em] text-secondary ${className} bg-neutral-100`}><Info className="h-3 w-3" /> {compact ? 'Pendente' : 'Lançamento pendente'}</span>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode, title: string }) {
  return <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary"><span className="text-primary">{icon}</span>{title}</h3>;
}

function SummaryMetric({ label, value, icon, accent }: { label: string, value: string, icon: React.ReactNode, accent?: 'green' | 'amber' }) {
  const color = accent === 'green' ? 'text-bank-truth-green' : accent === 'amber' ? 'text-orange-600' : 'text-primary';
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-50 ${color}`}>{icon}</div>
      <span className="mt-3 block text-[8px] font-black uppercase tracking-[0.13em] text-secondary">{label}</span>
      <strong className={`mt-1 block truncate text-xs font-black ${accent ? color : 'text-neutral-900'}`}>{value}</strong>
    </div>
  );
}

function ValueLine({ label, value, valueClass = 'text-neutral-900', strong = false }: { label: string, value: string, valueClass?: string, strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 text-[10px] ${strong ? 'border-t border-primary/10 pt-2 font-black' : 'font-bold'}`}><span className="text-secondary">{label}</span><span className={valueClass}>{value}</span></div>;
}

function MiniValue({ label, value, valueClass }: { label: string, value: string, valueClass?: string }) {
  return <div className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.1em] text-secondary">{label}</span><span className={`mt-1 block truncate text-[10px] font-black ${valueClass || 'text-neutral-900'}`}>{value}</span></div>;
}

function DetailItem({ icon, label, value, highlight = false }: { icon: React.ReactNode, label: string, value: string, highlight?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${highlight ? 'bg-primary/10 text-primary' : 'bg-neutral-50 text-secondary'}`}>{icon}</div>
      <div className="min-w-0">
        <span className="block text-[8px] font-black uppercase tracking-[0.12em] text-secondary">{label}</span>
        <span className={`mt-1 block truncate text-[11px] font-black ${highlight ? 'text-primary' : 'text-neutral-900'}`}>{value}</span>
      </div>
    </div>
  );
}
