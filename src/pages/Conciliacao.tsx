import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSearch,
  FileText,
  HelpCircle,
  Landmark,
  Loader2,
  PlusCircle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useContas, useLancamentosDaConta, usePersistirExtrato, useConciliarTransacao, useStatusConciliacaoTransacoes, useLancamentosConciliados } from '../hooks/useData';
import { useUIStore } from '../store/uiStore';
import ConciliarModal from '../components/Conciliacao/ConciliarModal';
import ProgressoExtrato from '../components/Conciliacao/ProgressoExtrato';
import MigracaoDados from '../components/Migracao/MigracaoDados';
import TransferenciasBancarias from '../components/Transferencias/TransferenciasBancarias';
import { compararExtrato, valorPrevistoParaConciliar } from '../services/extrato/comparacao';
import { lerExtrato } from '../services/extrato/motorLeitura';
import { reaproveitarExtratoImportado } from '../services/extrato/persistencia';
import { mensagemDoErro } from '../services/erros';
import type { ExtratoLido, ItemComparacao, LancamentoFinanceiro, ProgressoLeituraExtrato } from '../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dataComDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatarData(data: string | null): string {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

function dataUtc(data: string): Date {
  return new Date(`${data}T00:00:00Z`);
}

export default function Conciliacao() {
  const { data: contas = [] } = useContas();
  const { hasRole } = useAuth();
  const {
    setModalOpen,
    setSelectedLancamentoIdForModal,
    setSelectedRecorrenciaAction,
    setLancamentoFormDraft,
    setLancamentoPreset,
    setAvrPreset,
  } = useUIStore();
  const podeAgirNaConciliacao = hasRole(['master']);
  const [searchParams] = useSearchParams();
  const abaDaUrl = searchParams.get('aba');
  const [abaAtiva, setAbaAtiva] = useState<'conciliacao' | 'migracao' | 'transferencias'>(() => (
    abaDaUrl === 'migracao'
      ? 'migracao'
      : abaDaUrl === 'transferencias' && podeAgirNaConciliacao
        ? 'transferencias'
        : 'conciliacao'
  ));
  const [contaId, setContaId] = useState('');
  const [extrato, setExtrato] = useState<ExtratoLido | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [persistido, setPersistido] = useState<number | null>(null);
  const [reaproveitado, setReaproveitado] = useState(false);
  const [linhasNaoReconhecidas, setLinhasNaoReconhecidas] = useState(0);
  const [erroPersistencia, setErroPersistencia] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoLeituraExtrato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { persistir: persistirExtrato, isPersisting } = usePersistirExtrato();
  const { conciliar, isConciliando } = useConciliarTransacao();
  const [arrastando, setArrastando] = useState(false);
  const [mostrarNaoInterpretadas, setMostrarNaoInterpretadas] = useState(false);
  const [mostrarIgnoradas, setMostrarIgnoradas] = useState(false);
  const [conciliarItem, setConciliarItem] = useState<ItemComparacao | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aplicarMapeamentoDeTransacoes = (resultado: {
    transacoesPorHash: Map<string, string>;
    hashesPorLinha: Map<string, string>;
  }) => {
    setExtrato((atual) => atual ? {
      ...atual,
      linhas: atual.linhas.map((linha) => {
        const hash = resultado.hashesPorLinha.get(linha.id);
        const transacaoBancoId = hash ? resultado.transacoesPorHash.get(hash) : undefined;
        return transacaoBancoId ? { ...linha, transacaoBancoId } : linha;
      }),
    } : atual);
  };

  useEffect(() => {
    setAbaAtiva(
      abaDaUrl === 'migracao'
        ? 'migracao'
        : abaDaUrl === 'transferencias' && podeAgirNaConciliacao
          ? 'transferencias'
          : 'conciliacao',
    );
  }, [abaDaUrl, podeAgirNaConciliacao]);

  useEffect(() => {
    if (contas.length > 0 && !contaId) setContaId(contas[0].id);
  }, [contas, contaId]);

  const {
    data: lancamentos = [],
    totalCount,
    isLoading: carregandoLancamentos,
  } = useLancamentosDaConta(contaId || null, extrato?.dataInicio ?? null, extrato?.dataFim ?? null);
  const transacaoBancoIds = useMemo(
    () => Array.from(new Set((extrato?.linhas ?? []).map((linha) => linha.transacaoBancoId).filter((id): id is string => Boolean(id)))),
    [extrato],
  );
  const { data: statusConciliacao = {} } = useStatusConciliacaoTransacoes(transacaoBancoIds, podeAgirNaConciliacao);
  const lancamentoIds = useMemo(() => lancamentos.map((lancamento) => lancamento.id), [lancamentos]);
  const { data: lancamentosConciliados = new Set<string>(), isLoading: carregandoLancamentosConciliados } = useLancamentosConciliados(
    lancamentoIds,
    Boolean(conciliarItem && podeAgirNaConciliacao),
  );

  const resultado = useMemo(
    () => (extrato ? compararExtrato(extrato, lancamentos) : null),
    [extrato, lancamentos],
  );
  const linhasNaoPersistiveis = extrato
    ? extrato.linhas.filter((linha) => linha.confianca === 'baixa' || linha.pagina === null).length
    : 0;

  const handleArquivo = async (file: File) => {
    setErro(null);
    setProcessando(true);
    try {
      const extratoLido = await lerExtrato(file, setProgresso);
      setProgresso((prev) => prev
        ? { ...prev, etapa: 'comparando', linhasLidas: extratoLido.linhas.length }
        : {
            etapa: 'comparando',
            loteAtual: 0,
            totalLotes: 0,
            paginaInicio: null,
            paginaFim: null,
            totalPaginas: null,
            linhasLidas: extratoLido.linhas.length,
          });
      setArquivo(file);
      setPersistido(null);
      setErroPersistencia(null);
      setReaproveitado(false);
      setLinhasNaoReconhecidas(0);
      setExtrato(extratoLido);
      if (hasRole(['master', 'gerente']) && contaId) {
        try {
          const reuso = await reaproveitarExtratoImportado({ arquivo: file, contaId, extrato: extratoLido });
          if (reuso) {
            aplicarMapeamentoDeTransacoes(reuso);
            setPersistido(reuso.transacoesPorHash.size);
            setReaproveitado(true);
            setLinhasNaoReconhecidas(reuso.linhasNaoReconhecidas);
          }
        } catch {
          // Sem reaproveitamento: o extrato segue apenas em memória, como antes.
        }
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível ler o extrato.');
      setProgresso(null);
      setProcessando(false);
    }
  };

  useEffect(() => {
    if (progresso?.etapa === 'comparando' && !carregandoLancamentos) {
      setProgresso(null);
      setProcessando(false);
      setIsImportOpen(false);
    }
  }, [progresso?.etapa, carregandoLancamentos]);

  const selecionarArquivo = (file?: File) => {
    if (!file) return;
    if (!contaId) {
      setErro('Selecione a conta bancária antes de escolher o arquivo do extrato.');
      return;
    }
    void handleArquivo(file);
  };

  const importarParaConciliacao = async () => {
    // A leitura vive só na memória: se a página recarregar, o extrato e o arquivo
    // somem. Sem este aviso o clique simplesmente não faria nada.
    if (!arquivo || !extrato || !contaId) {
      setErroPersistencia('A leitura do extrato foi perdida porque a página recarregou. Escolha o arquivo do extrato novamente e clique em Importar para conciliação.');
      return;
    }
    setErroPersistencia(null);
    try {
      const reuso = await reaproveitarExtratoImportado({ arquivo, contaId, extrato });
      if (reuso) {
        aplicarMapeamentoDeTransacoes(reuso);
        setPersistido(reuso.transacoesPorHash.size);
        setReaproveitado(true);
        setLinhasNaoReconhecidas(reuso.linhasNaoReconhecidas);
        return;
      }
      const resultadoPersistencia = await persistirExtrato({ arquivo, contaId, extrato });
      aplicarMapeamentoDeTransacoes(resultadoPersistencia);
      setPersistido(resultadoPersistencia.transacoesPorHash.size);
    } catch (error) {
      try {
        const reuso = await reaproveitarExtratoImportado({ arquivo, contaId, extrato });
        if (reuso) {
          aplicarMapeamentoDeTransacoes(reuso);
          setPersistido(reuso.transacoesPorHash.size);
          setReaproveitado(true);
          setLinhasNaoReconhecidas(reuso.linhasNaoReconhecidas);
          return;
        }
      } catch {
        // Mantém a mensagem da falha original quando o reaproveitamento não é possível.
      }
      setErroPersistencia(mensagemDoErro(error, 'Não foi possível persistir o extrato.'));
    }
  };

  const formatarValorInput = (valor: number) =>
    valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  };

  // Abre o Novo Lançamento já preenchido com a linha do extrato; a gravação
  // do lançamento continua no fluxo existente do drawer.
  const abrirLancamentoDoExtrato = (item: ItemComparacao) => {
    const linha = item.linhaExtrato;
    if (!linha || !contaId) return;
    const valor = formatarValorInput(linha.valor);
    setLancamentoFormDraft({
      tipo: linha.direcao === 'entrada' ? 'entrada' : 'saida',
      valor_previsto: valor,
      data_emissao: linha.data,
      data_vencimento: linha.data,
      data_competencia: linha.data,
      data_pagamento: linha.data,
      conta_bancaria_id: contaId,
      entidade_id: '',
      centro_custo_id: '',
      categoria_id: '',
      recorrencia: false,
      recorrencia_com_entrada: false,
      recorrencia_repeat: false,
      periodicidade: 'mensal',
      periodicidade_customizada_dias: '30',
      quantidade_total_parcelas: '1',
      observacoes: item.descricao || 'Lançamento criado a partir do extrato',
      condicao: 'a_vista',
      ja_recebido: false,
      desconto_valor: '0,00',
      desconto_tipo: 'valor',
      motivo_desconto_id: '',
      acrescimo_valor: '0,00',
      acrescimo_tipo: 'valor',
      motivo_acrescimo_id: '',
      valor_recebido: '0,00',
    });
    setLancamentoPreset({ dataExtrato: linha.data, transacaoBancoId: linha.transacaoBancoId });
    setSelectedLancamentoIdForModal(null);
    setSelectedRecorrenciaAction(null);
    setModalOpen('isNovoLancamentoOpen', true);
  };

  const aplicarAVR = (lancamento: LancamentoFinanceiro) => {
    const valorExtrato = conciliarItem?.valorExtrato ?? 0;
    setAvrPreset({
      lancamentoId: lancamento.id,
      valor: formatarValorInput(valorPrevistoParaConciliar(lancamento, valorExtrato)),
    });
    setConciliarItem(null);
    setSelectedLancamentoIdForModal(lancamento.id);
    setSelectedRecorrenciaAction(null);
    setModalOpen('isNovoLancamentoOpen', true);
  };

  const confirmarConciliacao = async (lancamento: LancamentoFinanceiro) => {
    const transacaoBancoId = conciliarItem?.linhaExtrato?.transacaoBancoId;
    if (!transacaoBancoId) throw new Error('Importe o extrato para conciliação antes de conciliar.');
    await conciliar({ transacaoBancoId, lancamentoIds: [lancamento.id] });
    setConciliarItem(null);
    showToast('Transação conciliada com sucesso.');
  };

  const renderItem = (item: ItemComparacao) => {
    const status = {
      conciliado: { label: 'Par sugerido', icon: CheckCircle2, className: 'bg-bank-truth-green/10 text-bank-truth-green' },
      divergente: { label: 'Valor divergente', icon: AlertTriangle, className: 'bg-alert-red/10 text-alert-red' },
      pendente_banco: { label: 'Falta no ERP', icon: AlertTriangle, className: 'bg-pending-amber/10 text-pending-amber' },
      pendente_erp: { label: 'Falta no extrato', icon: AlertTriangle, className: 'bg-bpi-blue/10 text-bpi-blue' },
    }[item.status];
    const transacaoId = item.linhaExtrato?.transacaoBancoId;
    const conciliadaDeVerdade = Boolean(transacaoId && statusConciliacao[transacaoId]);
    const StatusIcon = conciliadaDeVerdade ? CheckCircle2 : status.icon;
    const valorPrincipal = item.valorExtrato ?? item.valorErp ?? 0;

    return (
      <div key={item.id} className="flex items-start justify-between gap-4 border-b border-surface-border/70 py-4 last:border-b-0">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {item.direcao === 'entrada'
            ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-bank-truth-green" />
            : <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-alert-red" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface" title={item.linhaExtrato?.textoOriginal || undefined}>{item.descricao || 'Movimentação sem descrição'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${conciliadaDeVerdade ? 'bg-bank-truth-green/10 text-bank-truth-green' : status.className}`}>
                <StatusIcon className="h-3 w-3" />{conciliadaDeVerdade ? 'Conciliado' : status.label}
              </span>
              {item.linhaExtrato?.confianca === 'baixa' && (
                <span title="A IA teve baixa certeza nesta linha; confira o texto original." className="inline-flex items-center rounded-full bg-pending-amber/10 px-2 py-1 text-[10px] font-bold text-pending-amber">confiança baixa</span>
              )}
            </div>
            {item.status === 'conciliado' && item.lancamento?.observacoes && (
              <p className="mt-1 text-xs text-on-surface-variant">ERP: {item.lancamento.observacoes}</p>
            )}
            {item.status === 'divergente' && item.valorExtrato !== null && item.valorErp !== null && (
              <p className="mt-1 text-xs text-on-surface-variant">
                ERP: {moeda.format(item.valorErp)} · diferença {moeda.format(item.valorExtrato - item.valorErp)}
              </p>
            )}
            {item.linhaExtrato && (
              <p className="mt-1 text-[10px] text-on-surface-variant">
                PDF p.{item.linhaExtrato.pagina ?? '?'}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className={`text-sm font-bold ${item.direcao === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
            {moeda.format(valorPrincipal)}
          </p>
          {podeAgirNaConciliacao && item.linhaExtrato && !conciliadaDeVerdade && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConciliarItem(item)}
                disabled={!item.linhaExtrato.transacaoBancoId}
                title={!item.linhaExtrato.transacaoBancoId ? 'Importe o extrato para conciliação antes de conciliar' : 'Vincular esta transação bancária a um lançamento do ERP'}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />Conciliar
              </button>
              {(item.status === 'pendente_banco' || item.status === 'divergente') && <button
                type="button"
                onClick={() => abrirLancamentoDoExtrato(item)}
                title="Criar um novo lançamento no ERP com os dados desta linha do extrato"
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/20"
              >
                <PlusCircle className="h-3.5 w-3.5" />Lançar
              </button>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const resumoTiles = resultado ? [
    { label: 'Entradas no extrato', valor: moeda.format(resultado.resumo.totalEntradas), cor: 'text-bank-truth-green' },
    { label: 'Saídas no extrato', valor: moeda.format(resultado.resumo.totalSaidas), cor: 'text-alert-red' },
    { label: 'Conciliados', valor: resultado.resumo.conciliados, cor: 'text-bank-truth-green' },
    { label: 'Divergentes', valor: resultado.resumo.divergentes, cor: 'text-alert-red' },
    { label: 'Falta no ERP', valor: resultado.resumo.pendentesBanco, cor: 'text-pending-amber' },
    { label: 'Falta no extrato', valor: resultado.resumo.pendentesErp, cor: 'text-bpi-blue' },
  ] : [];

  const seletorConta = (className: string) => (
    <label className={`flex items-center gap-3 rounded-2xl border border-surface-border bg-white px-4 dark:bg-surface ${className}`}>
      <Building className="h-4 w-4 shrink-0 text-secondary" />
      <select
        aria-label="Conta bancária"
        value={contaId}
        onChange={(event) => setContaId(event.target.value)}
        className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-on-surface outline-none"
      >
        <option value="">Selecione a conta</option>
        {contas.map((conta) => (
          <option key={conta.id} value={conta.id}>{conta.nome} · {conta.nome_banco}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5 pb-8 text-on-surface">
      <nav aria-label="Abas de conciliação" className="flex gap-2 border-b border-surface-border">
        <button type="button" aria-current={abaAtiva === 'conciliacao' ? 'page' : undefined} onClick={() => setAbaAtiva('conciliacao')} className={`border-b-2 px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${abaAtiva === 'conciliacao' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Conciliação Bancária</button>
        <button type="button" aria-current={abaAtiva === 'migracao' ? 'page' : undefined} onClick={() => setAbaAtiva('migracao')} className={`border-b-2 px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${abaAtiva === 'migracao' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Migração de Dados</button>
        {podeAgirNaConciliacao && <button type="button" aria-current={abaAtiva === 'transferencias' ? 'page' : undefined} onClick={() => setAbaAtiva('transferencias')} className={`border-b-2 px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${abaAtiva === 'transferencias' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Transferências</button>}
      </nav>
      <section hidden={abaAtiva !== 'conciliacao'}>
      <div className="space-y-6 pb-8 text-on-surface">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-on-surface sm:text-3xl">
            <Landmark className="h-7 w-7 text-primary" />Conciliação Bancária
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-secondary">Conferência do extrato com os lançamentos do ERP</p>
          <p className="mt-2 text-xs text-on-surface-variant">Leitura do PDF por IA · itens pendentes podem ser lançados no ERP direto desta tela</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {seletorConta('min-w-0 sm:min-w-[260px]')}
          <button
            type="button"
            onClick={() => { setErro(null); setIsImportOpen(true); }}
            disabled={!contaId}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />Importar Extrato
          </button>
        </div>
      </header>

      {!extrato ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex min-h-[360px] max-w-3xl flex-col items-center justify-center rounded-[32px] border border-surface-border bg-white px-6 py-12 text-center dark:bg-surface"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSearch className="h-8 w-8" /></div>
          <h2 className="text-xl font-bold">Nenhum extrato carregado</h2>
          <p className="mt-2 max-w-lg text-sm text-on-surface-variant">Escolha uma conta bancária e importe o PDF para comparar as movimentações em memória.</p>
          <p className="mt-2 text-xs text-on-surface-variant">A leitura do PDF é feita por IA (OpenAI) e o arquivo é apagado ao final do processamento.</p>
          <div className="my-6 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-surface-border p-4 text-sm"><span className="mr-2 font-bold text-primary">1.</span>Escolha a conta bancária</div>
            <div className="rounded-2xl border border-surface-border p-4 text-sm"><span className="mr-2 font-bold text-primary">2.</span>Importe o extrato em PDF</div>
          </div>
          <button
            type="button"
            onClick={() => { setErro(null); setIsImportOpen(true); }}
            disabled={!contaId}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          ><Upload className="h-4 w-4" />Importar Extrato</button>
        </motion.section>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key="extrato-carregado" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {resultado && extrato.linhas.length > 0 && (() => {
              const totalLinhas = extrato.linhas.length;
              const percentual = Math.min(100, Math.round((resultado.resumo.conciliados / totalLinhas) * 100));
              return (
                <section className="sticky top-0 z-30 rounded-2xl border border-surface-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:bg-surface/95">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="shrink-0 text-sm font-black text-on-surface">{percentual}%</span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-low">
                        <div className="h-full bg-bank-truth-green transition-all" style={{ width: `${percentual}%` }} />
                      </div>
                      <span className="shrink-0 text-xs text-on-surface-variant">{resultado.resumo.conciliados} de {totalLinhas} linhas</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
                      <span className="text-bank-truth-green">{resultado.resumo.conciliados} conciliados</span>
                      <span className="text-alert-red">{resultado.resumo.divergentes} divergentes</span>
                      <span className="text-pending-amber">{resultado.resumo.pendentesBanco} falta no ERP</span>
                      <span className="text-bpi-blue">{resultado.resumo.pendentesErp} falta no extrato</span>
                    </div>
                  </div>
                </section>
              );
            })()}
            <section className="flex flex-col justify-between gap-4 rounded-[28px] border border-surface-border bg-white p-5 dark:bg-surface sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-on-surface">{extrato.arquivoNome}</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Período: {formatarData(extrato.dataInicio)} – {formatarData(extrato.dataFim)} · {extrato.paginas} {extrato.paginas === 1 ? 'página' : 'páginas'} · {extrato.linhas.length} {extrato.linhas.length === 1 ? 'linha lida' : 'linhas lidas'}
                  </p>
                  {extrato.meta && [
                    extrato.meta.banco && `Banco ${extrato.meta.banco}`,
                    extrato.meta.agencia && `Agência ${extrato.meta.agencia}`,
                    extrato.meta.conta && `Conta ${extrato.meta.conta}`,
                  ].filter(Boolean).length > 0 && (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {[extrato.meta.banco && `Banco ${extrato.meta.banco}`, extrato.meta.agencia && `Agência ${extrato.meta.agencia}`, extrato.meta.conta && `Conta ${extrato.meta.conta}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <div className="mt-3 space-y-2">
                    {persistido !== null ? (
                      <div className="space-y-2">
                        <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-bank-truth-green/10 px-3 py-1.5 text-xs font-bold text-bank-truth-green">
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />{reaproveitado
                            ? `Extrato já importado · ${persistido} transações reaproveitadas para conciliação`
                            : `Importado para conciliação · ${persistido} ${persistido === 1 ? 'transação' : 'transações'}`}
                        </span>
                        {reaproveitado && linhasNaoReconhecidas > 0 && (
                          <p className="rounded-xl border border-pending-amber/30 bg-pending-amber/10 px-3 py-2 text-xs text-pending-amber">
                            {linhasNaoReconhecidas} linha(s) do arquivo não foram reconhecidas no extrato já importado e não poderão ser conciliadas por esta tela.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-semibold text-secondary">Somente leitura (memória)</span>
                        {hasRole(['master', 'gerente']) ? (
                          <button
                            type="button"
                            aria-label="Importar extrato para conciliação"
                            onClick={() => void importarParaConciliacao()}
                            disabled={!contaId || !arquivo || !extrato || isPersisting}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isPersisting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                            {isPersisting ? 'Importando...' : 'Importar para conciliação'}
                          </button>
                        ) : (
                          <p className="text-xs text-secondary">A persistência exige perfil Master ou Gerente.</p>
                        )}
                      </div>
                    )}
                    {erroPersistencia && <p role="alert" className="text-sm text-alert-red">{erroPersistencia}</p>}
                    {linhasNaoPersistiveis > 0 && (
                      <p className="rounded-xl border border-pending-amber/30 bg-pending-amber/10 px-3 py-2 text-xs text-pending-amber">
                        {linhasNaoPersistiveis} {linhasNaoPersistiveis === 1 ? 'linha não será persistida' : 'linhas não serão persistidas'} por confiança baixa ou por falta de página identificada. Elas continuam visíveis na comparação, mas não fazem parte da conciliação persistida.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => { setErro(null); setIsImportOpen(true); }} className="rounded-xl border border-surface-border px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface">Trocar arquivo</button>
                <button type="button" onClick={() => { setExtrato(null); setArquivo(null); setPersistido(null); setErroPersistencia(null); setReaproveitado(false); setLinhasNaoReconhecidas(0); }} className="inline-flex items-center gap-2 rounded-xl border border-alert-red/20 px-4 py-2 text-sm font-semibold text-alert-red hover:bg-alert-red/10"><Trash2 className="h-4 w-4" />Remover</button>
              </div>
            </section>

            {extrato.conferencia && (() => {
              const conferencia = extrato.conferencia;
              const status = {
                ok: { titulo: 'Saldos conferem', Icon: CheckCircle2, classes: 'border-bank-truth-green/30 bg-bank-truth-green/10 text-bank-truth-green', texto: 'Saldo inicial + entradas − saídas fecha com o saldo final informado no extrato.' },
                divergente: { titulo: 'Divergência entre saldos e movimentações', Icon: AlertTriangle, classes: 'border-alert-red/30 bg-alert-red/10 text-alert-red', texto: `A soma das movimentações não fecha com os saldos do extrato: diferença de ${conferencia.diferenca === null ? '—' : moeda.format(conferencia.diferenca)}. Pode haver linha não lida — confira as linhas duvidosas abaixo.` },
                nao_verificavel: { titulo: 'Conferência de saldos não disponível', Icon: HelpCircle, classes: 'border-surface-border bg-surface-container-low text-on-surface-variant', texto: 'O extrato não informa saldo inicial e/ou final, então não foi possível conferir a soma das movimentações.' },
              }[conferencia.status];
              const Icon = status.Icon;
              return (
                <section className={`rounded-2xl border p-4 ${status.classes}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold">{status.titulo}</h3>
                      <p className="mt-1 text-sm">{status.texto}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <p>Saldo inicial <span className="block font-bold">{conferencia.saldoInicial === null ? '—' : moeda.format(conferencia.saldoInicial)}</span></p>
                        <p>Entradas <span className="block font-bold">{moeda.format(conferencia.entradas)}</span></p>
                        <p>Saídas <span className="block font-bold">{moeda.format(conferencia.saidas)}</span></p>
                        <p>Saldo final <span className="block font-bold">{conferencia.saldoFinal === null ? '—' : moeda.format(conferencia.saldoFinal)}</span></p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {extrato.linhas.length === 0 && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Nenhuma linha com data e valor foi identificada neste PDF. Se o arquivo for digitalizado (imagem) ou estiver protegido, a leitura por IA pode não conseguir extrair as movimentações.</div>}
            {totalCount > lancamentos.length && <div className="rounded-2xl border border-pending-amber/30 bg-pending-amber/10 p-4 text-sm text-pending-amber">Foram carregados 1000 de {totalCount} lançamentos; a comparação pode estar incompleta.</div>}
            {extrato.naoInterpretadas.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-pending-amber/30 bg-pending-amber/10">
                <button type="button" onClick={() => setMostrarNaoInterpretadas(!mostrarNaoInterpretadas)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-pending-amber">
                  <span>{extrato.naoInterpretadas.length} linhas que a IA não conseguiu interpretar</span>{mostrarNaoInterpretadas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {mostrarNaoInterpretadas && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="space-y-2 border-t border-pending-amber/20 px-4 py-3">
                      {extrato.naoInterpretadas.map((linha, index) => {
                        const motivos = {
                          sem_data: 'Linha sem data',
                          direcao_indefinida: 'Entrada/saída não identificada',
                          sem_valor: 'Linha sem valor',
                          valor_ilegivel: 'Valor ilegível',
                          data_impossivel: 'Data inválida',
                        };
                        return (
                          <li key={`${linha.pagina}-${index}`} className="text-xs text-on-surface">
                            <span className="font-bold">p.{linha.pagina ?? '?'}</span> · {linha.texto} <span className="text-pending-amber">({motivos[linha.motivo]})</span>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>}
                </AnimatePresence>
              </section>
            )}

            {!!extrato.linhasIgnoradas?.length && (
              <section className="overflow-hidden rounded-2xl border border-bpi-blue/30 bg-bpi-blue/10">
                <button type="button" onClick={() => setMostrarIgnoradas(!mostrarIgnoradas)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-bpi-blue">
                  <span>{extrato.linhasIgnoradas.length} linhas ignoradas (saldos, totais, cabeçalhos)</span>{mostrarIgnoradas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <p className="px-4 pb-3 text-xs text-on-surface-variant">Estas linhas não são transações e ficaram fora da conciliação.</p>
                <AnimatePresence>
                  {mostrarIgnoradas && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="space-y-2 border-t border-bpi-blue/20 px-4 py-3">
                      {extrato.linhasIgnoradas.map((linha, index) => {
                        const motivos = { saldo: 'Saldo', totalizador: 'Totalizador', cabecalho: 'Cabeçalho', rodape: 'Rodapé', outro: 'Outro' };
                        return <li key={`${linha.pagina}-${index}`} className="text-xs text-on-surface"><span className="font-bold">p.{linha.pagina ?? '?'}</span> · {linha.texto} <span className="text-bpi-blue">({motivos[linha.motivo]})</span></li>;
                      })}
                    </ul>
                  </motion.div>}
                </AnimatePresence>
              </section>
            )}

            {carregandoLancamentos && <p className="text-sm text-on-surface-variant">Carregando lançamentos do ERP...</p>}
            {resultado && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resumoTiles.map((tile) => (
                  <section key={tile.label} className="rounded-2xl border border-surface-border bg-white p-4 dark:bg-surface">
                    <p className="text-xs font-semibold text-on-surface-variant">{tile.label}</p><p className={`mt-2 text-xl font-black ${tile.cor}`}>{tile.valor}</p>
                  </section>
                ))}
              </div>
              {resultado.dias.length === 0 ? (
                <div className="rounded-[28px] border border-surface-border bg-white p-10 text-center text-sm text-on-surface-variant dark:bg-surface">Nenhuma movimentação encontrada no período do extrato</div>
              ) : resultado.dias.map((dia) => (
                <section key={dia.data} className="overflow-hidden rounded-[28px] border border-surface-border bg-white dark:bg-surface">
                  <header className="flex flex-col justify-between gap-3 border-b border-surface-border bg-surface-container-low px-5 py-4 sm:flex-row sm:items-center">
                    <h3 className="font-bold capitalize text-on-surface">{dataComDia.format(dataUtc(dia.data))}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <span className="text-bank-truth-green">Entradas {moeda.format(dia.totalEntradas)}</span>
                      <span className="text-alert-red">Saídas {moeda.format(dia.totalSaidas)}</span>
                      <span>{dia.conciliados} conciliados</span><span>{dia.divergentes} divergentes</span><span>{dia.pendentes} pendentes</span>
                    </div>
                  </header>
                  <div className="grid grid-cols-1 divide-y divide-surface-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                    {(['entradas', 'saidas'] as const).map((direcao) => {
                      const itens = dia[direcao];
                      return (
                        <div key={direcao} className="p-5">
                          <h4 className={`mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider ${direcao === 'entradas' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                            {direcao === 'entradas' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                            {direcao === 'entradas' ? 'Entradas' : 'Saídas'}
                          </h4>
                          {itens.length ? itens.map(renderItem) : <p className="py-4 text-sm text-on-surface-variant">Nenhuma movimentação</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>}
          </motion.div>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {isImportOpen && <motion.div key="conciliacao-importar" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            role="dialog" aria-modal="true" aria-labelledby="import-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl dark:bg-surface sm:p-8"
          >
            <header className="mb-6 flex items-start justify-between gap-4">
              <div><h2 id="import-title" className="text-xl font-black text-on-surface">Importar Extrato</h2><p className="mt-1 text-sm text-on-surface-variant">Selecione a conta e carregue seu arquivo PDF.</p></div>
              <button type="button" onClick={() => setIsImportOpen(false)} aria-label="Fechar" disabled={processando} className="rounded-full p-2 text-on-surface-variant hover:bg-surface disabled:opacity-50"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-4">
              {seletorConta('w-full')}
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { selecionarArquivo(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button
                type="button"
                disabled={!contaId || processando}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(event) => { event.preventDefault(); setArrastando(false); selecionarArquivo(event.dataTransfer.files[0]); }}
                className={`flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${arrastando ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-primary/60'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {processando
                  ? <ProgressoExtrato progresso={progresso} />
                  : <><Upload className="mb-3 h-8 w-8 text-secondary" /><span className="font-bold text-on-surface">Arraste o PDF para cá ou clique para selecionar</span><span className="mt-2 text-xs text-on-surface-variant">Apenas arquivos PDF</span></>}
              </button>
              {!processando && <div className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-container-low p-3 text-xs text-on-surface-variant"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" /><p>A leitura é feita por IA (OpenAI). O PDF é enviado temporariamente e apagado do servidor ao final do processamento.</p></div>}
              {erro && <p role="alert" className="rounded-xl bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}
              <footer className="flex justify-end pt-2">
                <button type="button" disabled={processando} onClick={() => setIsImportOpen(false)} className="rounded-xl border border-surface-border px-5 py-2.5 text-sm font-bold text-on-surface hover:bg-surface disabled:opacity-50">Cancelar</button>
              </footer>
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      </div>
      </section>
      <section hidden={abaAtiva !== 'migracao'}><MigracaoDados /></section>
      {podeAgirNaConciliacao && <section hidden={abaAtiva !== 'transferencias'}><TransferenciasBancarias /></section>}
      <ConciliarModal
        aberto={Boolean(conciliarItem)}
        item={conciliarItem}
        lancamentos={lancamentos}
        lancamentosConciliados={lancamentosConciliados}
        carregandoLancamentosConciliados={carregandoLancamentosConciliados}
        podeConciliar={Boolean(conciliarItem?.linhaExtrato?.transacaoBancoId)}
        onFechar={() => setConciliarItem(null)}
        onConfirmar={confirmarConciliacao}
        onFazerAVR={aplicarAVR}
        isConciliando={isConciliando}
      />
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[500] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div key={toast.id} role="status" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} className={`rounded-2xl border bg-white p-4 text-sm font-bold shadow-xl dark:bg-surface ${toast.type === 'success' ? 'border-bank-truth-green/30 text-bank-truth-green' : 'border-alert-red/30 text-alert-red'}`}>
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
