import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Filter,
  Download,
  Plus,
  Search,
  MoreVertical,
  X,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  History,
  Trash2,
  Edit,
  Receipt,
  FileText,
  User,
  Tag,
  Coins,
  XCircle,
  CreditCard,
  Layers,
  Repeat,
  Paperclip,
  Link2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLancamentos, useContas, useEntidades, useCategorias, useUsuarios, useCentrosCusto, useCategoriasAjuste, useContasSaldos, useSaldosLancamentos, useReordenarExtratoDia, useLancamentoAnexosByIds, useTransferencias } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { useDragScroll } from '../hooks/useDragScroll';
import { LancamentoFinanceiro } from '../types';
import { calculateAdjustmentAmount } from '../utils/adjustments';
import { motion, AnimatePresence } from 'motion/react';
import Button from '../components/Button';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import AccountFilterCards from '../components/Lancamentos/AccountFilterCards';
import LancamentoActionMenu from '../components/Lancamentos/LancamentoActionMenu';
import FinanceiroStatusFilter from '../components/Lancamentos/FinanceiroStatusFilter';
import ReciboModal from '../components/Lancamentos/ReciboModal';
import { idsContasDoPerfil, podeVerSaldos, SEM_CONTA_LIBERADA } from '../config/permissions';
import { ordenarCronologicamente } from '../services/extrato/ordemCronologica';

type LancamentoExibido = LancamentoFinanceiro & { transferenciaEspelhoIds?: string[] };

interface LancamentosProps {
  typeOverride?: 'entrada' | 'saida';
  titleOverride?: string;
  statusPagamentoOverride?: 'aberto' | 'pago' | 'pago_parcial' | 'bpi';
  statusAprovacaoOverride?: string;
  initialTypeFilter?: 'all' | 'entrada' | 'saida';
  initialStatusPagamento?: 'all' | 'aberto' | 'pago' | 'pago_parcial' | 'bpi' | 'quitação_pendente';
}

export default function Lancamentos({
  typeOverride,
  titleOverride,
  statusPagamentoOverride,
  statusAprovacaoOverride,
  initialTypeFilter,
  initialStatusPagamento
}: LancamentosProps) {
  const { role, contasLiberadas, contasBloqueadas } = useAuth();
  const {
    setModalOpen,
    setSelectedLancamentoIdForModal,
    setAvrPreset,
    selectedLancamentoIdsForBatch,
    setSelectedLancamentoIdsForBatch,
    setSelectedTransferenciaAprovacao,
    setActiveTab,
    isAprovacaoModalOpen
  } = useUIStore();

  const dragScrollTabs = useDragScroll();
  const tableScroll = useDragScroll();
  const mainTableRef = useRef<HTMLTableElement>(null);
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  // O Extrato tem tabela própria; ela também recebe uma barra horizontal fixa no rodapé.
  const extratoScroll = useDragScroll();
  const extratoMirrorRef = useRef<HTMLDivElement>(null);
  const [extratoLargura, setExtratoLargura] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isMaster = role === 'master';
  const isColaborador = role === 'colaborador';
  // Qualquer perfil que abra a tela pode marcar linhas (cálculo da seleção e relatório em
  // PDF do filtro); a aprovação em lote continua exclusiva do Master.
  // Em Contas a Pagar/Receber o Gerente tem acesso total: excluir título é
  // liberado para Master e Gerente. O estorno continua sendo ação do Financeiro,
  // exclusiva do Master.
  const podeExcluirTitulo = role === 'master' || role === 'gerente';
  const isFinanceiroView = !typeOverride && !titleOverride;
  const isOperationalView = !!typeOverride;

  // Abas de /lancamentos (Financeiro | Extrato). Pagar/Receber usam typeOverride e
  // continuam sem abas. A aba vive na URL (?aba=extrato) para o link direto cair no
  // lugar certo e para sobreviver a recarregamentos.
  const isExtratoView = isFinanceiroView && searchParams.get('aba') === 'extrato';
  // A reordenação manual é exclusiva do Extrato e de Master/Gerente (o banco reforça a regra).
  const podeReordenarExtrato = isExtratoView && (role === 'master' || role === 'gerente');
  const selecionarAba = (aba: 'financeiro' | 'extrato') => {
    const proximosParametros = new URLSearchParams(searchParams);
    if (aba === 'extrato') proximosParametros.set('aba', 'extrato');
    else proximosParametros.delete('aba');
    // As abas mostram listas diferentes: a seleção de uma não vale para a outra.
    setSelectedLancamentoIdsForBatch([]);
    setSearchParams(proximosParametros, { replace: true });
  };
  const abasFinanceiroExtrato = (
    <nav aria-label="Abas do Financeiro e do Extrato" className="flex gap-2 border-b border-neutral-100">
      <button
        type="button"
        data-testid="aba-financeiro"
        aria-current={!isExtratoView ? 'page' : undefined}
        onClick={() => selecionarAba('financeiro')}
        className={`border-b-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!isExtratoView ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
      >
        Financeiro
      </button>
      <button
        type="button"
        data-testid="aba-extrato"
        aria-current={isExtratoView ? 'page' : undefined}
        onClick={() => selecionarAba('extrato')}
        className={`border-b-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isExtratoView ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-700'}`}
      >
        Extrato
      </button>
    </nav>
  );

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [docSearchTerm, setDocSearchTerm] = useState('');

  useEffect(() => {
    if (searchTerm.length < 3) {
      setDebouncedSearchTerm('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  // Preset state
  const [datePreset, setDatePreset] = useState<'15' | '30' | '90' | 'custom'>('15');
  const [dateFilterActive, setDateFilterActive] = useState(!isFinanceiroView && !isOperationalView);

  // Search & Period States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const handlePresetChange = (preset: '15' | '30' | '90' | 'custom') => {
    setDatePreset(preset);
    setDateFilterActive(true);
    if (preset !== 'custom') {
      const today = new Date();
      const start = new Date();
      const end = new Date();

      start.setDate(today.getDate() - parseInt(preset));
      end.setDate(today.getDate());

      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<50 | 100 | 'all'>(50);
  const [contaExtratoId, setContaExtratoId] = useState('');
  const [extratoBpiAtivo, setExtratoBpiAtivo] = useState(false);

  // Advanced Filters
  const defaultStatusPagamento = initialStatusPagamento || statusPagamentoOverride || 'all';
  const defaultTypeFilter = initialTypeFilter || typeOverride || 'all';
  const [approvalStatus, setApprovalStatus] = useState('all');
  const [statusPagamento, setStatusPagamento] = useState<string[]>(defaultStatusPagamento === 'all' ? [] : [defaultStatusPagamento]);
  const [typeFilter, setTypeFilter] = useState<string[]>(defaultTypeFilter === 'all' ? [] : [defaultTypeFilter]);
  const [transferenciasOnly, setTransferenciasOnly] = useState(false);

  // Sincronizar o estado interno com as propriedades da rota ao navegar
  useEffect(() => {
    const nextStatus = initialStatusPagamento || statusPagamentoOverride || 'all';
    const nextType = initialTypeFilter || typeOverride || 'all';
    setStatusPagamento(nextStatus === 'all' ? [] : [nextStatus]);
    setTypeFilter(nextType === 'all' ? [] : [nextType]);
    setDateFilterActive(!isFinanceiroView && !isOperationalView);
    setSelectedLancamentoIdsForBatch([]);
  }, [initialStatusPagamento, initialTypeFilter, statusPagamentoOverride, typeOverride, titleOverride, isFinanceiroView]);

  const [authorIdFilter, setAuthorIdIdFilter] = useState<string[]>([]);

  const [categoryIdFilter, setCategoryIdFilter] = useState<string[]>([]);
  const [contaIdFilter, setContaIdFilter] = useState<string[]>([]);
  const [centroCustoIdFilter, setCentroCustoIdFilter] = useState<string[]>(() => {
    const cc = searchParams.get('centroCusto');
    return cc ? [cc] : [];
  });
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [condicaoFilter, setCondicaoFilter] = useState('all');
  const [temDescontoFilter, setTemDescontoFilter] = useState('all');
  const [temAcrescimoFilter, setTemAcrescimoFilter] = useState('all');
  const [motivoDescontoFilter, setMotivoDescontoFilter] = useState('all');
  const [motivoAcrescimoFilter, setMotivoAcrescimoFilter] = useState('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  // Qualquer mudança de filtro (inclusive o período personalizado) recomeça a listagem
  // na primeira página: sem isso a consulta continua pedindo uma página que deixou de
  // existir e a tabela aparece vazia mesmo havendo títulos que casam com o filtro.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchTerm,
    docSearchTerm,
    dateFilterActive,
    startDate,
    endDate,
    approvalStatus,
    statusPagamento,
    typeFilter,
    authorIdFilter,
    categoryIdFilter,
    contaIdFilter,
    centroCustoIdFilter,
    condicaoFilter,
    temDescontoFilter,
    temAcrescimoFilter,
    motivoDescontoFilter,
    motivoAcrescimoFilter,
    transferenciasOnly,
    selectedAccountIds
  ]);

  const selectionDiffersFromDefault = (selection: string[], defaultValue: string) => {
    const normalizedSelection = selection.filter(value => value !== 'all' && value !== '');
    const normalizedDefault = defaultValue === 'all' || defaultValue === '' ? [] : [defaultValue];
    return normalizedSelection.length !== normalizedDefault.length || normalizedSelection.some((value, index) => value !== normalizedDefault[index]);
  };

  const hasActiveFilters = debouncedSearchTerm !== '' || docSearchTerm !== '' || dateFilterActive || approvalStatus !== 'all' || transferenciasOnly || selectionDiffersFromDefault(statusPagamento, defaultStatusPagamento) || selectionDiffersFromDefault(typeFilter, defaultTypeFilter) || authorIdFilter.length > 0 || categoryIdFilter.length > 0 || contaIdFilter.length > 0 || centroCustoIdFilter.length > 0 || condicaoFilter !== 'all' || temDescontoFilter !== 'all' || temAcrescimoFilter !== 'all' || motivoDescontoFilter !== 'all' || motivoAcrescimoFilter !== 'all';

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedLogItem, setSelectedLogItem] = useState<LancamentoFinanceiro | null>(null);

  // `useContas` já entrega apenas as contas permitidas ao perfil. Vem antes da
  // consulta porque os IDs delimitam quais lançamentos o perfil pode ver.
  const { data: rawContas = [] } = useContas();
  const activeContas = useMemo(() => rawContas.filter((c: any) => c.status !== 'excluido'), [rawContas]);
  const idsContasPermitidas = useMemo(
    () => idsContasDoPerfil(role, contasLiberadas, contasBloqueadas, rawContas.map((c: any) => c.id)),
    [contasBloqueadas, contasLiberadas, rawContas, role]
  );

  // Contas que a listagem pode exibir: o dropdown de conta e os cards de conta
  // ("Filtrar por Conta") se combinam e são limitados às contas permitidas ao perfil.
  // Quando a combinação não sobra nenhuma conta, o sentinela garante lista vazia em vez
  // de remover o filtro e vazar títulos de outras contas.
  const contasEfetivas = useMemo(() => {
    const baseContaIds = contaIdFilter.length > 0 ? contaIdFilter : idsContasPermitidas;
    if (selectedAccountIds.length === 0) return baseContaIds;
    if (baseContaIds.length === 0) return selectedAccountIds;
    const matchingAccountIds = selectedAccountIds.filter(id => baseContaIds.includes(id));
    return matchingAccountIds.length > 0 ? matchingAccountIds : [SEM_CONTA_LIBERADA];
  }, [contaIdFilter, idsContasPermitidas, selectedAccountIds]);

  const {
    data: allLancamentos = [],
    totalCount = 0,
    batchApprove,
    estornarLancamento,
    estornarLancamentoDoExtrato,
    deleteLancamento,
    isBatchApproving,
    isLoading,
    isError
  } = useLancamentos({
    searchTerm: debouncedSearchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate: dateFilterActive ? startDate : undefined,
    endDate: dateFilterActive ? endDate : undefined,
    approvalStatus: isOperationalView ? statusAprovacaoOverride : approvalStatus,
    financialStatus: isFinanceiroView && !isExtratoView ? statusPagamento : undefined,
    statusPagamento: statusPagamento.length === 0 && !isFinanceiroView && !isOperationalView && isColaborador ? ['quitação_pendente'] : isFinanceiroView ? [] : statusPagamento,
    type: typeFilter,
    operationalView: isOperationalView,
    authorId: authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: isExtratoView ? (contaExtratoId ? [contaExtratoId] : [SEM_CONTA_LIBERADA]) : contasEfetivas,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView,
    view: isFinanceiroView ? (isExtratoView ? 'extrato' : 'financeiro') : undefined,
    baixaRegistradaOnly: isFinanceiroView && !isExtratoView,
    extratoBpiOnly: isExtratoView && extratoBpiAtivo,
    transferenciasOnly: isFinanceiroView && transferenciasOnly,
    page: currentPage,
    pageSize: pageSize === 'all' ? undefined : pageSize
  });
  const { reordenarExtratoDia, isReordenando } = useReordenarExtratoDia();

  // Sync scroll between mirror and table
  useEffect(() => {
    const table = tableScroll.ref.current;
    const mainTable = mainTableRef.current;
    const mirror = mirrorScrollRef.current;
    if (!table || !mainTable || !mirror) return;

    const handleTableScroll = () => {
      if (Math.abs(mirror.scrollLeft - table.scrollLeft) > 1) {
        mirror.scrollLeft = table.scrollLeft;
      }
    };

    const handleMirrorScroll = () => {
      if (Math.abs(table.scrollLeft - mirror.scrollLeft) > 1) {
        table.scrollLeft = mirror.scrollLeft;
      }
    };

    let frameId: number | null = null;
    const measureTable = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const headerCells = Array.from(mainTable.querySelectorAll('thead th')) as HTMLTableCellElement[];
        const widths = headerCells.map(cell => cell.getBoundingClientRect().width);

        if (widths.length > 0) {
          setColumnWidths(previousWidths => {
            const widthsUnchanged = previousWidths.length === widths.length && previousWidths.every((width, index) => width === widths[index]);
            return widthsUnchanged ? previousWidths : widths;
          });
        }
        setTableWidth(table.scrollWidth);
      });
    };

    table.addEventListener('scroll', handleTableScroll);
    mirror.addEventListener('scroll', handleMirrorScroll);

    // Initial width and column measurements
    measureTable();

    const observer = new ResizeObserver(measureTable);
    observer.observe(table);
    observer.observe(mainTable);

    return () => {
      table.removeEventListener('scroll', handleTableScroll);
      mirror.removeEventListener('scroll', handleMirrorScroll);
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [allLancamentos, typeOverride, tableScroll.ref]);

  // O Extrato usa uma tabela separada: mantém a barra horizontal do rodapé presa à tela
  // e sincronizada com a rolagem lateral da listagem.
  useEffect(() => {
    if (!isExtratoView) return;
    const lista = extratoScroll.ref.current;
    const barra = extratoMirrorRef.current;
    if (!lista || !barra) return;

    const handleListaScroll = () => {
      if (Math.abs(barra.scrollLeft - lista.scrollLeft) > 1) {
        barra.scrollLeft = lista.scrollLeft;
      }
    };

    const handleBarraScroll = () => {
      if (Math.abs(lista.scrollLeft - barra.scrollLeft) > 1) {
        lista.scrollLeft = barra.scrollLeft;
      }
    };

    let frameId: number | null = null;
    const measureLista = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setExtratoLargura(lista.scrollWidth);
      });
    };

    lista.addEventListener('scroll', handleListaScroll);
    barra.addEventListener('scroll', handleBarraScroll);
    measureLista();

    const observer = new ResizeObserver(measureLista);
    observer.observe(lista);

    return () => {
      lista.removeEventListener('scroll', handleListaScroll);
      barra.removeEventListener('scroll', handleBarraScroll);
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [isExtratoView, extratoScroll.ref, allLancamentos]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(Math.ceil(totalCount / pageSize), 1);

  // A janela de botões acompanha a página atual: a página ativa fica sempre visível e
  // alcançável, mesmo quando a lista tem mais páginas do que os 5 botões exibidos.
  const pageWindowStart = Math.min(Math.max(currentPage - 2, 1), Math.max(totalPages - 4, 1));
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => pageWindowStart + index);

  // Se a quantidade de registros diminuir (filtro aplicado, título excluído, baixa
  // registrada), a página corrente não pode continuar além da última página existente.
  // Durante o carregamento a contagem ainda não corresponde à página pedida, então o
  // ajuste é ignorado para não devolver a listagem para a primeira página ao navegar.
  useEffect(() => {
    if (isLoading) return;
    setCurrentPage(previousPage => Math.min(previousPage, totalPages));
  }, [isLoading, totalPages]);

  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: usuarios = [] } = useUsuarios();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const { categoriasAjuste = [] } = useCategoriasAjuste();

  useEffect(() => {
    const lancamentoId = searchParams.get('id');
    if (lancamentoId) {
      setSelectedLancamentoIdForModal(lancamentoId);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams, setSelectedLancamentoIdForModal, setModalOpen]);

  const { data: transferencias = [] } = useTransferencias();
  const transferenciasById = useMemo(() => new Map(transferencias.map(transferencia => [transferencia.id, transferencia])), [transferencias]);
  const lancamentosExtrato = useMemo(
    () => ordenarCronologicamente(allLancamentos, item => item.data_pagamento),
    [allLancamentos]
  );
  // Bloco do dia na ordem exibida: a reordenação manual nunca cruza a data, então o
  // que se move é sempre a sequência de títulos de um mesmo dia.
  const blocosDoDia = useMemo(() => {
    const blocos = new Map<string, { ids: string[]; inicio: number }>();
    lancamentosExtrato.forEach((item, index) => {
      if (!item.data_pagamento) return;
      const bloco = blocos.get(item.data_pagamento);
      if (bloco) {
        bloco.ids.push(item.id);
        return;
      }
      blocos.set(item.data_pagamento, { ids: [item.id], inicio: index });
    });
    return blocos;
  }, [lancamentosExtrato]);
  const displayedLancamentos = useMemo<LancamentoExibido[]>(() => {
    const grupos = new Map<string, LancamentoFinanceiro[]>();
    const ordem: Array<{ item: LancamentoFinanceiro } | { transferenciaId: string }> = [];

    allLancamentos.forEach(item => {
      const isTransferenciaEspelho = Boolean(item.transferencia_id)
        && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
      if (!isTransferenciaEspelho || !item.transferencia_id) {
        ordem.push({ item });
        return;
      }

      const grupo = grupos.get(item.transferencia_id);
      if (grupo) {
        grupo.push(item);
        return;
      }

      grupos.set(item.transferencia_id, [item]);
      ordem.push({ transferenciaId: item.transferencia_id });
    });

    return ordem.map(entrada => {
      if ('item' in entrada) return entrada.item;

      const grupo = grupos.get(entrada.transferenciaId) ?? [];
      // A linha única da transferência mostra sempre o lado de origem; se a origem já
      // estiver aprovada e a outra ponta ainda não, mostra a ponta pendente para que o
      // Master consiga concluir a aprovação.
      const representante = grupo.find(titulo => titulo.transferencia_lado === 'origem' && titulo.status_aprovacao !== 'confirmado_master')
        ?? grupo.find(titulo => titulo.status_aprovacao !== 'confirmado_master')
        ?? grupo.find(titulo => titulo.transferencia_lado === 'origem')
        ?? grupo[0];

      return { ...representante, transferenciaEspelhoIds: grupo.map(titulo => titulo.id) };
    });
  }, [allLancamentos]);
  // Toda linha exibida pode ser marcada — inclusive a de transferência entre contas. No
  // Extrato as linhas são as da lista do extrato; no Financeiro/Pagar/Receber são as linhas
  // exibidas (a transferência aparece uma única vez, como espelho das duas pontas).
  const selectableLancamentos: LancamentoFinanceiro[] = isExtratoView ? lancamentosExtrato : displayedLancamentos;

  const financeiroStatusFilters = useMemo(() => ({
    searchTerm: debouncedSearchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate: dateFilterActive ? startDate : undefined,
    endDate: dateFilterActive ? endDate : undefined,
    approvalStatus,
    type: typeFilter,
    authorId: authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: contasEfetivas,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView: true,
    baixaRegistradaOnly: true
  }), [approvalStatus, authorIdFilter, categoryIdFilter, centroCustoIdFilter, condicaoFilter, contasEfetivas, dateFilterActive, debouncedSearchTerm, docSearchTerm, endDate, isColaborador, motivoAcrescimoFilter, motivoDescontoFilter, startDate, temAcrescimoFilter, temDescontoFilter, typeFilter]);

  const valueFormatter = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getValorLiquido = (item: LancamentoFinanceiro): number => {
    if ((item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial') && item.valor_recebido) {
      return item.valor_recebido;
    }
    const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
    const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
    const liquido = item.valor_previsto - desconto + acrescimo;
    return liquido;
  };

  const getSaldoAPagar = (item: LancamentoFinanceiro): number => {
    const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
    const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
    const valorPago = Number(item.valor_recebido) || 0;
    return Math.max(0, item.valor_previsto - desconto + acrescimo - valorPago);
  };

  const hasAjuste = (item: LancamentoFinanceiro): boolean => {
    const desconto = Number((item as any).desconto_valor) || 0;
    const acrescimo = Number((item as any).acrescimo_valor) || 0;
    return desconto > 0 || acrescimo > 0;
  };

  const renderObservacoes = (item: LancamentoFinanceiro) => {
    if (!item.observacoes) return null;

    return (
      <div className="max-w-[240px]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedLogItem(item);
          }}
          className="mt-1 text-[8px] font-black uppercase tracking-widest text-primary hover:underline"
        >
          Ver logs completo
        </button>
      </div>
    );
  };

  // Painel de logs do título, aberto pelo link "Ver logs completo" da coluna Entidade.
  // É compartilhado pelas abas Financeiro e Extrato.
  const modalLogsCompletos = (
    <AnimatePresence>
      {selectedLogItem && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLogItem(null)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-10 w-full max-w-[560px] max-h-[80vh] bg-white rounded-3xl shadow-2xl overflow-hidden">
            <header className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Logs completos</h3>
                <p className="text-[9px] font-bold uppercase tracking-widest text-secondary mt-1">Registro {selectedLogItem.codigo_sequencial || selectedLogItem.id}</p>
              </div>
              <button type="button" aria-label="Fechar logs" onClick={() => setSelectedLogItem(null)} className="p-2 rounded-xl hover:bg-neutral-200"><X className="w-5 h-5 text-secondary" /></button>
            </header>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
              {(selectedLogItem.observacoes || 'Sem logs registrados.')
                .replace(/\\n/g, '\n')
                .split(/\r?\n/)
                .map(log => log.trim())
                .filter(Boolean)
                .map((log, index) => (
                  <div key={`${selectedLogItem.id}-log-${index}`} className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/70 px-4 py-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-black text-neutral-500">
                      {index + 1}
                    </span>
                    <p className="min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed font-bold text-neutral-700">{log}</p>
                  </div>
                ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const getTransferenciaContasLabel = (item: LancamentoFinanceiro): string => {
    const transferencia = item.transferencia_id ? transferenciasById.get(item.transferencia_id) : undefined;
    if (transferencia?.conta_origem?.nome && transferencia.conta_destino?.nome) {
      return `${transferencia.conta_origem.nome} → ${transferencia.conta_destino.nome}`;
    }
    const conta = activeContas.find(account => account.id === item.conta_bancaria_id);
    return conta?.nome || conta?.nome_banco || '';
  };

  const clearFiltersShortcut = () => {
    setSearchTerm('');
    setDocSearchTerm('');
    setApprovalStatus('all');
    setTransferenciasOnly(false);
    setStatusPagamento(defaultStatusPagamento === 'all' ? [] : [defaultStatusPagamento]);
    setTypeFilter(defaultTypeFilter === 'all' ? [] : [defaultTypeFilter]);
    setAuthorIdIdFilter([]);
    setCategoryIdFilter([]);
    setContaIdFilter([]);
    setCentroCustoIdFilter([]);
    setCondicaoFilter('all');
    setTemDescontoFilter('all');
    setTemAcrescimoFilter('all');
    setMotivoDescontoFilter('all');
    setMotivoAcrescimoFilter('all');
    setSelectedLancamentoIdsForBatch([]);
    setSelectedAccountIds([]);

    handlePresetChange('15');
    if (isFinanceiroView || isOperationalView) setDateFilterActive(false);
    setCurrentPage(1);
  };

  const toggleSelectAll = () => {
    if (selectedLancamentoIdsForBatch.length === selectableLancamentos.length) {
      setSelectedLancamentoIdsForBatch([]);
    } else {
      setSelectedLancamentoIdsForBatch(selectableLancamentos.map(l => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedLancamentoIdsForBatch(
      selectedLancamentoIdsForBatch.includes(id)
        ? selectedLancamentoIdsForBatch.filter(i => i !== id)
        : [...selectedLancamentoIdsForBatch, id]
    );
  };

  // A aprovação em lote continua sendo do Master e considera apenas títulos comuns: a
  // transferência entre contas tem fluxo próprio (o selo da linha aprova as duas pontas) e
  // aprovar um único lado deixaria a transferência pela metade.
  const aprovaveisEmLote = useMemo(() => {
    if (!isMaster) return [] as string[];
    return displayedLancamentos
      .filter(item => selectedLancamentoIdsForBatch.includes(item.id))
      .filter(item => item.transferencia_lado !== 'origem' && item.transferencia_lado !== 'destino')
      .filter(item => item.status_aprovacao !== 'confirmado_master' || item.status_pagamento === 'quitação_pendente')
      .map(item => item.id);
  }, [displayedLancamentos, isMaster, selectedLancamentoIdsForBatch]);

  const handleBatchApprove = () => {
    if (!isMaster || aprovaveisEmLote.length === 0) return;
    setSelectedLancamentoIdsForBatch(aprovaveisEmLote);
    setSelectedTransferenciaAprovacao(null);
    setModalOpen('isAprovacaoModalOpen', true);
  };

  const handleOpenBaixa = (id: string) => {
    setSelectedLancamentoIdForModal(id);
    setModalOpen('isComprovanteOpen', false);
    setModalOpen('isBaixaLancamentoOpen', true);
    setActiveMenuId(null);
  };

  const handleEstornar = async (id: string) => {
    if (!isMaster) return;
    if (confirm('Deseja estornar este lançamento? O saldo bancário será restaurado.')) {
      try {
        await estornarLancamento(id);
        setActiveMenuId(null);
      } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao estornar'); }
    }
  };

  const handleEstornarExtrato = async (id: string) => {
    if (!isMaster) return;
    if (confirm('Deseja estornar este lançamento? Ele volta para o Financeiro sem a confirmação e sem a conciliação, aguardando nova confirmação do Master.')) {
      try {
        await estornarLancamentoDoExtrato(id);
        setActiveMenuId(null);
      } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao estornar'); }
    }
  };

  // Com paginação, um dia pode ser cortado entre páginas. A primeira linha da página pode
  // ser a continuação de um dia que começou na anterior: reordenar esse pedaço gravaria
  // posições a partir de zero e jogaria o bloco para o topo do dia. Por isso o dia só é
  // reordenável quando começa na própria página. Quando o dia apenas continua na página
  // seguinte, o pedaço visível já é o início do bloco e ocupa as menores posições, então
  // reordená-lo não desloca o restante do dia.
  const blocoDoDiaReordenavel = (bloco: { inicio: number }) => !(bloco.inicio === 0 && currentPage > 1);

  const algumDiaBloqueadoParaReordenar = useMemo(
    () => Array.from(blocosDoDia.values()).some((bloco: { inicio: number }) => !blocoDoDiaReordenavel(bloco)),
    [blocosDoDia, currentPage]
  );

  const handleMoverTituloNoDia = async (item: LancamentoFinanceiro, direcao: 'cima' | 'baixo') => {
    const data = item.data_pagamento;
    if (!podeReordenarExtrato || !data) return;
    const bloco = blocosDoDia.get(data);
    if (!bloco || !blocoDoDiaReordenavel(bloco)) return;
    const indiceAtual = bloco.ids.indexOf(item.id);
    const indiceDestino = direcao === 'cima' ? indiceAtual - 1 : indiceAtual + 1;
    if (indiceAtual < 0 || indiceDestino < 0 || indiceDestino >= bloco.ids.length) return;
    const novaOrdem = [...bloco.ids];
    [novaOrdem[indiceAtual], novaOrdem[indiceDestino]] = [novaOrdem[indiceDestino], novaOrdem[indiceAtual]];
    try {
      await reordenarExtratoDia({ data, ids: novaOrdem });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao reordenar o extrato');
    }
  };

  const handleEdit = (l: LancamentoFinanceiro) => {
    setSelectedLancamentoIdForModal(l.id);
    setAvrPreset(isOperationalView ? null : { lancamentoId: l.id, travarValores: true });
    setModalOpen('isNovoLancamentoOpen', true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id: string) => {
    if (!podeExcluirTitulo) return;
    if (confirm('Excluir este lançamento permanentemente?')) {
      try {
        await deleteLancamento({ id });
        setActiveMenuId(null);
      } catch (err) { alert('Erro ao excluir'); }
    }
  };

  const { data: contasSaldos = [] } = useContasSaldos();
  const idsExibidos = useMemo(
    () => (isExtratoView ? allLancamentos : displayedLancamentos).map(item => item.id),
    [allLancamentos, displayedLancamentos, isExtratoView]
  );
  const { data: saldosLancamentos = [] } = useSaldosLancamentos(idsExibidos);
  const { data: anexosDosLancamentos = [] } = useLancamentoAnexosByIds(idsExibidos);
  const anexosPorLancamento = useMemo(() => {
    const contagem = new Map<string, number>();
    anexosDosLancamentos.forEach(anexo => {
      contagem.set(anexo.lancamento_id, (contagem.get(anexo.lancamento_id) || 0) + 1);
    });
    return contagem;
  }, [anexosDosLancamentos]);
  const temComprovante = (item: LancamentoFinanceiro) => (anexosPorLancamento.get(item.id) || 0) > 0 || Boolean(item.comprovante_url);
  const [reciboLancamento, setReciboLancamento] = useState<LancamentoFinanceiro | null>(null);
  const saldosLancamentosPorId = useMemo(
    () => new Map(saldosLancamentos.map(saldo => [saldo.lancamento_id, saldo.saldo_apos])),
    [saldosLancamentos]
  );

  const accountCardsData = useMemo(() => {
    return activeContas.map(acc => {
      const saldoObj = contasSaldos.find(s => s.conta_id === acc.id);
      return {
        ...acc,
        auditadoBalance: saldoObj ? Number(saldoObj.saldo_confirmado) : (acc.saldo_inicial || 0),
        operacionalBalance: saldoObj ? Number(saldoObj.saldo_operacional) : (acc.saldo_inicial || 0)
      };
    });
  }, [activeContas, contasSaldos]);

  useEffect(() => {
    if (!isExtratoView || accountCardsData.some(account => account.id === contaExtratoId)) return;
    if (accountCardsData.length > 0) setContaExtratoId(accountCardsData[0].id);
  }, [accountCardsData, contaExtratoId, isExtratoView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [isExtratoView, contaExtratoId]);

  // Linhas marcadas na tela atual: no Extrato são as linhas do extrato e, nas demais telas,
  // as linhas exibidas (a transferência aparece uma única vez).
  const selectedPrintLancamentos: LancamentoFinanceiro[] = (isExtratoView ? lancamentosExtrato : displayedLancamentos)
    .filter(item => selectedLancamentoIdsForBatch.includes(item.id));
  const selectedOperationalLancamentos = isOperationalView ? selectedPrintLancamentos : [];
  const operationalDocumentCodes = new Set<number>();
  const operationalTotals = selectedOperationalLancamentos.reduce(
    (totals, item) => {
      const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
      const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
      const valorPago = item.valor_recebido || 0;
      const hasDocumentCode = item.codigo_sequencial != null;
      // Totais assinados pela natureza do fluxo: entradas somam e saídas subtraem.
      const sinal = item.tipo === 'entrada' ? 1 : -1;

      if (!hasDocumentCode || !operationalDocumentCodes.has(item.codigo_sequencial)) {
        totals.valorDocOriginal += sinal * (item.valor_original || item.valor_previsto);
        if (hasDocumentCode) operationalDocumentCodes.add(item.codigo_sequencial);
      }
      totals.valorParcOriginal += sinal * item.valor_previsto;
      totals.desconto += sinal * desconto;
      totals.acrescimo += sinal * acrescimo;
      totals.valorPago += sinal * valorPago;
      totals.aPagar += sinal * Math.max(0, item.valor_previsto - desconto + acrescimo - valorPago);
      return totals;
    },
    { valorDocOriginal: 0, valorParcOriginal: 0, desconto: 0, acrescimo: 0, valorPago: 0, aPagar: 0 }
  );
  const printTotals = selectedPrintLancamentos.reduce(
    (totals, item) => {
      if (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino') return totals;
      const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
      const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
      const valorPago = item.valor_recebido || 0;
      const liquido = getValorLiquido(item);

      totals.valorPrevisto += item.valor_previsto;
      totals.desconto += desconto;
      totals.acrescimo += acrescimo;
      totals.valorPago += valorPago;
      // O Total é líquido: entradas somam e saídas subtraem.
      totals.liquido += item.tipo === 'entrada' ? liquido : -liquido;
      totals.aPagar += Math.max(0, item.valor_previsto - desconto + acrescimo - valorPago);
      if (item.tipo === 'entrada') totals.entradas += liquido;
      if (item.tipo === 'saida') totals.saidas += liquido;
      return totals;
    },
    { valorPrevisto: 0, desconto: 0, acrescimo: 0, valorPago: 0, liquido: 0, aPagar: 0, entradas: 0, saidas: 0 }
  );

  // Cálculo da seleção, compartilhado pelo Financeiro e pelo Extrato: entradas somam e
  // saídas subtraem (líquido = entradas − saídas). No Extrato cada ponta da transferência é
  // uma linha própria; no Financeiro a transferência aparece como uma única linha e por isso
  // vale pelas duas pontas (saída na origem e entrada no destino), para o líquido não
  // distorcer o caixa.
  const lancamentosDaSelecao = useMemo(() => {
    if (isExtratoView) {
      return lancamentosExtrato.filter(item => selectedLancamentoIdsForBatch.includes(item.id));
    }
    const porId = new Map(allLancamentos.map(item => [item.id, item]));
    return displayedLancamentos
      .filter(item => selectedLancamentoIdsForBatch.includes(item.id))
      .flatMap(item => (item.transferenciaEspelhoIds ?? [item.id])
        .map(id => porId.get(id))
        .filter((lancamento): lancamento is LancamentoFinanceiro => Boolean(lancamento)));
  }, [allLancamentos, displayedLancamentos, isExtratoView, lancamentosExtrato, selectedLancamentoIdsForBatch]);

  const totaisDaSelecao = lancamentosDaSelecao.reduce(
    (totals, item) => {
      const liquido = getValorLiquido(item);
      if (item.tipo === 'entrada') {
        totals.entradas += liquido;
      } else {
        totals.saidas += liquido;
      }
      totals.liquido = totals.entradas - totals.saidas;
      return totals;
    },
    { liquido: 0, entradas: 0, saidas: 0 }
  );

  const mirrorColumnCount = isOperationalView ? 15 : 12;
  const hasMeasuredMirrorColumns = columnWidths.length === mirrorColumnCount;
  const mirrorGridWidth = hasMeasuredMirrorColumns
    ? `${columnWidths.reduce((total, width) => total + width, 0)}px`
    : `${Math.max(tableWidth, 1200)}px`;
  const mirrorGridTemplateColumns = hasMeasuredMirrorColumns
    ? columnWidths.map(width => `${width}px`).join(' ')
    : `repeat(${mirrorColumnCount}, minmax(0, 1fr))`;

  const formatPrintDate = (dateStr: string | null | undefined) => dateStr ? dateStr.slice(0, 10).split('-').reverse().join('/') : '-';
  const isPartialPayment = (item: LancamentoFinanceiro) =>
    item.status_pagamento === 'pago_parcial'
    || (item.status_pagamento === 'quitação_pendente'
      && (Boolean((item as any).vinculo_residuo_id) || (Number(item.valor_recebido) > 0 && getSaldoAPagar(item) > 0.005)));
  const getPrintStatus = (item: LancamentoFinanceiro) => {
    if (item.status_pagamento === 'pago') return 'Liquidado, Pago';
    if (isPartialPayment(item)) return 'Pago Parcial';
    if (item.status_pagamento === 'quitação_pendente') return 'Quitação pendente';
    if (item.status_pagamento === 'bpi') return 'BPI';
    return item.status_aprovacao === 'reprovado' ? 'Reprovado' : 'Em aberto';
  };
  const handlePrintSelected = () => {
    if (selectedLancamentoIdsForBatch.length === 0 || selectedPrintLancamentos.length === 0) return;

    document.body.classList.add('printing-lancamentos-report');
    const cleanupPrintMode = () => document.body.classList.remove('printing-lancamentos-report');
    window.addEventListener('afterprint', cleanupPrintMode, { once: true });
    window.print();
  };

  const getDaysOverdue = (dateStr: string): number => {
    if (!dateStr) return -1;
    const today = new Date();
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    const dueAtMidnight = new Date(year, month - 1, day);
    const diffTime = todayAtMidnight.getTime() - dueAtMidnight.getTime();
    return Math.floor(diffTime / (1000 * 3600 * 24));
  };

  const ehTransferenciaEspelho = (item: LancamentoFinanceiro) => Boolean(item.transferencia_id)
    && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
  // A linha de transferência não é entrada nem saída isolada: o relatório mostra a natureza
  // dela e as contas envolvidas em vez do fluxo e da entidade.
  const rotuloFluxoImpressao = (item: LancamentoFinanceiro) => ehTransferenciaEspelho(item)
    ? 'Transferência entre contas'
    : item.tipo === 'entrada' ? 'Entrada' : 'Saída';
  const rotuloEntidadeImpressao = (item: LancamentoFinanceiro) => ehTransferenciaEspelho(item)
    ? getTransferenciaContasLabel(item)
    : entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A';

  const renderStatusBadge = (item: LancamentoFinanceiro) => {
   const isTransferenciaEspelho = Boolean(item.transferencia_id)
     && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
   if (item.status_pagamento === 'bpi') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-900 text-white font-black border border-neutral-950 text-[9px] uppercase tracking-tighter">
         BPI
       </span>
     );
   }
   if (isFinanceiroView && item.status_aprovacao !== 'confirmado_master') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Pend. Gestor
       </span>
     );
   }
   if (item.status_aprovacao === 'confirmado_master' && item.status_pagamento === 'pago') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 text-bank-truth-green font-black border border-emerald-200 text-[9px] uppercase tracking-tighter">
         Confirmado
       </span>
     );
   }
   if (item.status_pagamento === 'pago') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 text-bank-truth-green font-black border border-emerald-200 text-[9px] uppercase tracking-tighter">
         Liquidado, Pago
       </span>
     );
   }
   if (isPartialPayment(item)) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Pago Parcial
       </span>
     );
   }
   const days = getDaysOverdue(item.data_vencimento);
   if (days > 0) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-red-50 text-alert-red font-black border border-red-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Vencido
       </span>
     );
   }
   if (item.status_pagamento === 'quitação_pendente') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         {isTransferenciaEspelho ? (isMaster ? 'Confirme Aprovação' : 'Pend. Gestor') : (isMaster ? 'Confirme Baixa' : 'Pendente Gestor')}
       </span>
     );
   }
   if (item.status_aprovacao === 'reprovado') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-red-50 text-alert-red font-black border border-red-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Reprovado
       </span>
     );
   }

   if (days === 0) {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-100 text-orange-700 font-black border-2 border-orange-400 text-[9px] uppercase tracking-tighter animate-bounce">
         Vence Hoje
       </span>
     );
   } else {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold border border-blue-200 text-[9px] uppercase tracking-tighter">
         A Vencer
       </span>
     );
   }
 };

  const renderConciliadoBadge = (item: LancamentoFinanceiro) => {
    const conciliacao = item.conciliacoes?.[0];
    if (!conciliacao) return null;
    const data = conciliacao.data_conciliacao?.slice(0, 10).split('-').reverse().join('/');
    const label = data ? `Conciliado com o extrato em ${data}` : 'Conciliado com o extrato';

    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/30"
        title={label}
        role="img"
        aria-label={label}
      >
        <Link2 className="w-3 h-3" aria-hidden="true" />
      </span>
    );
  };

  const renderBancoCell = (item: LancamentoFinanceiro) => {
    const conta = activeContas.find(account => account.id === item.conta_bancaria_id);
    const isTransferenciaEspelho = Boolean(item.transferencia_id)
      && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
    const transferencia = item.transferencia_id ? transferenciasById.get(item.transferencia_id) : undefined;
    const bankName = isTransferenciaEspelho
      ? transferencia?.conta_origem?.nome && transferencia.conta_destino?.nome
        ? `${transferencia.conta_origem.nome} → ${transferencia.conta_destino.nome}`
        : conta?.nome || conta?.nome_banco || 'Conta bancária não identificada'
      : conta?.nome_banco || conta?.nome || 'Conta bancária não identificada';

    return (
      <td className="py-3 px-4 text-center" title={bankName} aria-label={bankName}>
        {isTransferenciaEspelho ? (
          <span className="text-[9px] font-black uppercase tracking-wide text-secondary">{bankName}</span>
        ) : (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 text-neutral-500" title={bankName} aria-label={bankName}>
            {conta?.logo_url ? (
              <img src={conta.logo_url} alt={bankName} title={bankName} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <CreditCard className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
        )}
      </td>
    );
  };

  const painelEFiltros = (
    <>
      {isFilterPanelOpen && (
        <div className="bg-white border-2 border-neutral-100 p-5 rounded-3xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-900">Filtros adicionais</h2>
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Refine sua busca no histórico</p>
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && <span className="text-[9px] font-black uppercase tracking-widest text-primary">Filtros ativos</span>}
              <button
                type="button"
                onClick={clearFiltersShortcut}
                className="text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                data-testid="hide-filters"
                onClick={() => { setIsFilterPanelOpen(false); setCurrentPage(1); }}
                className="h-9 px-3 rounded-lg border border-neutral-200 text-[9px] font-black uppercase tracking-widest text-secondary hover:border-primary hover:text-primary transition-all"
              >
                Ocultar filtros
              </button>
            </div>
          </div>

          <div className={isFinanceiroView || isExtratoView ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
            {typeOverride !== 'entrada' && typeOverride !== 'saida' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Natureza do Fluxo
                </label>
                <div className="flex bg-neutral-100 p-1 rounded-xl h-11">
                  <button type="button" onClick={() => setTypeFilter([])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.length === 0 ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}>Todos</button>
                  <button type="button" onClick={() => setTypeFilter(current => current.includes('entrada') ? current.filter(value => value !== 'entrada') : [...current, 'entrada'])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.includes('entrada') ? 'bg-white text-bank-truth-green shadow-sm' : 'text-neutral-400'}`}>Entradas</button>
                  <button type="button" onClick={() => setTypeFilter(current => current.includes('saida') ? current.filter(value => value !== 'saida') : [...current, 'saida'])} className={`flex-1 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter.includes('saida') ? 'bg-white text-alert-red shadow-sm' : 'text-neutral-400'}`}>Saídas</button>
                </div>
              </div>
            )}

            {isFinanceiroView && !isExtratoView ? (
              <FinanceiroStatusFilter
                value={statusPagamento}
                onChange={setStatusPagamento}
                filters={financeiroStatusFilters}
              />
            ) : !isExtratoView ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Status de Pagamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(typeOverride === 'entrada' || typeOverride === 'saida'
                    ? [
                        { id: 'all', label: 'Todos' },
                        { id: 'atrasadas', label: 'Atrasadas' },
                        { id: 'aberto', label: 'À Vencer' },
                      ]
                    : [
                        { id: 'all', label: 'Todos' },
                        { id: 'pago', label: 'Liquidados' },
                        { id: 'aberto', label: 'Contas em Aberto' },
                        { id: 'atrasadas', label: 'Atrasadas' },
                        { id: 'quitação_pendente', label: 'Pend. Gestor' },
                        { id: 'bpi', label: 'BPI (Inatividade)' },
                      ]).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`status-filter-${opt.id}`}
                      onClick={() => opt.id === 'all'
                        ? setStatusPagamento([])
                        : setStatusPagamento(current => current.includes(opt.id) ? current.filter(value => value !== opt.id) : [...current, opt.id])}
                      className={`px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all text-left flex items-center justify-between ${
                        (opt.id === 'all' ? statusPagamento.length === 0 : statusPagamento.includes(opt.id)) ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-100 bg-neutral-50 text-secondary hover:border-neutral-200'
                      }`}
                    >
                      {opt.label}
                      {((opt.id === 'all' && statusPagamento.length === 0) || (opt.id !== 'all' && statusPagamento.includes(opt.id))) && <div className="w-2 h-2 bg-primary rounded-full shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className={isExtratoView ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : isFinanceiroView ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'}>
            {role !== 'colaborador' && (
              <div className="space-y-2" data-testid="filter-responsavel">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <User className="w-4 h-4" /> Responsável
                </label>
                <MultiSelectDropdown
                  value={authorIdFilter}
                  onChange={setAuthorIdIdFilter}
                  allLabel="Todos os Usuários"
                  options={usuarios.map(u => ({ id: u.id, label: u.nome || u.email }))}
                />
              </div>
            )}

            <div className="space-y-2" data-testid="filter-categoria">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                <Tag className="w-4 h-4" /> Categoria
              </label>
              <MultiSelectDropdown
                value={categoryIdFilter}
                onChange={setCategoryIdFilter}
                allLabel="Todas as Categorias"
                options={categorias.map(c => ({ id: c.id, label: c.nome }))}
              />
            </div>

            {!isExtratoView && (
              <div className="space-y-2" data-testid="filter-conta">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Conta Bancária
                </label>
                <MultiSelectDropdown
                  value={contaIdFilter}
                  onChange={setContaIdFilter}
                  allLabel="Todas as Contas"
                  options={activeContas.map(c => ({ id: c.id, label: c.nome_banco || c.nome }))}
                />
              </div>
            )}

            <div className="space-y-2" data-testid="filter-centro-custo">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
                <Layers className="w-4 h-4" /> Centro de Custo
              </label>
              <MultiSelectDropdown
                value={centroCustoIdFilter}
                onChange={setCentroCustoIdFilter}
                allLabel="Todos os Centros"
                options={centrosCusto.filter((cc: any) => cc.status !== 'excluido').map(cc => ({ id: cc.id, label: cc.nome }))}
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl flex flex-col lg:flex-row gap-4 shadow-sm items-center">
        <button
          type="button"
          data-testid="toggle-filters"
          onClick={() => setIsFilterPanelOpen(prev => !prev)}
          title={isFilterPanelOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
          className={`h-12 w-12 flex items-center justify-center rounded-xl border-2 transition-all relative shrink-0 ${
            hasActiveFilters ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-neutral-100 text-neutral-400 hover:border-neutral-200'
          }`}
        >
          <Filter className="w-5 h-5" />
          {hasActiveFilters && <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-white" />}
        </button>

        <div className="flex gap-3 w-full lg:w-auto">
          <div className="relative w-32 shrink-0">
            <FileText className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              type="text"
              placeholder="Cód. Doc"
              value={docSearchTerm}
              onChange={(e) => setDocSearchTerm(e.target.value)}
              className="w-full h-12 pl-10 pr-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-bold focus:border-primary outline-none transition-all"
            />
          </div>
          
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              type="text"
              placeholder="Pesquisar por entidade ou observação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-bold focus:border-primary outline-none transition-all"
            />
          </div>
        </div>

        {(isFinanceiroView || isExtratoView) && (
          <button
            type="button"
            onClick={() => {
              setTransferenciasOnly(current => !current);
              setSelectedLancamentoIdsForBatch([]);
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all shrink-0 ${
              transferenciasOnly
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-neutral-100 bg-neutral-50 text-secondary'
            }`}
          >
            Transferências
          </button>
        )}

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <select
            data-testid="date-preset"
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value as '15' | '30' | '90' | 'custom')}
            className="h-12 bg-neutral-100 border-none rounded-xl px-3 text-[9px] font-black uppercase tracking-tighter text-neutral-600 outline-none shrink-0"
          >
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="custom">Personalizado</option>
          </select>

          <div className={`flex bg-neutral-100 p-1 rounded-xl h-12 transition-all ${datePreset === 'custom' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <input
              type="date"
              data-testid="date-start"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
            <div className="w-px h-4 bg-neutral-200 self-center" />
            <input
              type="date"
              data-testid="date-end"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
          </div>

          <select
            data-testid="page-size"
            value={pageSize}
            onChange={(event) => {
              const value = event.target.value;
              const nextPageSize: 50 | 100 | 'all' = value === 'all' ? 'all' : value === '100' ? 100 : 50;
              setPageSize(nextPageSize);
              setCurrentPage(1);
              setSelectedLancamentoIdsForBatch([]);
            }}
            className="h-10 rounded-xl border-2 border-neutral-100 bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500 outline-none transition-all hover:bg-neutral-50"
          >
            <option value="50">50 títulos</option>
            <option value="100">100 títulos</option>
            <option value="all">Todos</option>
          </select>

        </div>
      </div>
    </>
  );

  // Documento de impressão da seleção: o mesmo relatório é usado pelas abas Financeiro e
  // Extrato e pelas telas de Pagar/Receber, cada uma com o seu título e o seu resumo.
  const relatorioImpressao = (
        <div className="lancamentos-print-report" aria-label="Relatório dos lançamentos selecionados">
          <div className="lancamentos-print-report__sheet">
            <header className="lancamentos-print-report__header">
              <div>
                <h1>{isExtratoView ? 'Extrato' : (titleOverride || 'Financeiro')}</h1>
                <p>Relatório dos lançamentos selecionados</p>
              </div>
              <div className="lancamentos-print-report__meta">
                <strong>Emissão: {new Date().toLocaleDateString('pt-BR')}</strong>
                <span>{selectedPrintLancamentos.length} lançamento{selectedPrintLancamentos.length === 1 ? '' : 's'}</span>
              </div>
            </header>

            <section className="lancamentos-print-report__summary" aria-label="Resultado do cálculo">
              <strong>Resultado do cálculo</strong>
              {isOperationalView ? (
                <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-summary">
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor documento original</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorDocOriginal)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor parcela original</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorParcOriginal)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Desconto</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.desconto)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Acréscimo</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.acrescimo)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor pago</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.valorPago)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">A pagar</span><span className="lancamentos-print-report__value">{valueFormatter(operationalTotals.aPagar)}</span></div>
                </div>
              ) : (
                <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-summary">
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor previsto</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.valorPrevisto)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Desconto</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.desconto)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Acréscimo</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.acrescimo)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor exibido</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.liquido)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Entradas</span><span className="lancamentos-print-report__value">{valueFormatter(totaisDaSelecao.entradas)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Saídas</span><span className="lancamentos-print-report__value">{valueFormatter(totaisDaSelecao.saidas)}</span></div>
                  <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor líquido exibido</span><span className="lancamentos-print-report__value">{valueFormatter(totaisDaSelecao.liquido)}</span></div>
                </div>
              )}
            </section>

            {isOperationalView ? (
              <section className="lancamentos-print-report__items" aria-label="Lançamentos operacionais">
                {selectedPrintLancamentos.map(item => (
                  <article className="lancamentos-print-report__item" key={`print-${item.id}`}>
                    <section className="lancamentos-print-report__block">
                      <h2>Identificação</h2>
                      <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-identification">
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Documento</span>
                          <span className="lancamentos-print-report__value">{item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Entidade</span>
                          <span className="lancamentos-print-report__value">{entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Vencimento / referência</span>
                          <span className="lancamentos-print-report__value">
                            {formatPrintDate(item.data_vencimento)}
                            <small>{getDaysOverdue(item.data_vencimento) > 0 ? `${getDaysOverdue(item.data_vencimento)} dia(s)` : getDaysOverdue(item.data_vencimento) === 0 ? 'Hoje' : '-'}</small>
                          </span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Data do documento</span>
                          <span className="lancamentos-print-report__value">{formatPrintDate(item.data_emissao)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Status</span>
                          <span className="lancamentos-print-report__value">{getPrintStatus(item)}</span>
                        </div>
                      </div>
                    </section>

                    <section className="lancamentos-print-report__block">
                      <h2>Memória do cálculo</h2>
                      <div className="lancamentos-print-report__grid lancamentos-print-report__grid--operational-values">
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Valor documento original</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(item.valor_original || item.valor_previsto)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Valor parcela original</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(item.valor_previsto)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Desconto</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Acréscimo</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Valor pago</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(item.valor_recebido || 0)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">A pagar</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(getSaldoAPagar(item))}</span>
                        </div>
                      </div>
                    </section>
                  </article>
                ))}
              </section>
            ) : (
              <section className="lancamentos-print-report__items" aria-label="Lançamentos financeiros">
                {selectedPrintLancamentos.map(item => (
                  <article className="lancamentos-print-report__item" key={`print-${item.id}`}>
                    <section className="lancamentos-print-report__block">
                      <h2>Identificação</h2>
                      <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-identification">
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Documento</span>
                          <span className="lancamentos-print-report__value">{item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Fluxo</span>
                          <span className="lancamentos-print-report__value">{rotuloFluxoImpressao(item)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Entidade</span>
                          <span className="lancamentos-print-report__value">{rotuloEntidadeImpressao(item)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Vencimento</span>
                          <span className="lancamentos-print-report__value">{formatPrintDate(item.data_vencimento)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Pagamento</span>
                          <span className="lancamentos-print-report__value">{formatPrintDate(item.data_pagamento)}</span>
                        </div>
                      </div>
                    </section>

                    <section className="lancamentos-print-report__block">
                      <h2>Valores</h2>
                      <div className="lancamentos-print-report__grid lancamentos-print-report__grid--financial-values">
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Valor previsto</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(item.valor_previsto)}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Desconto</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Acréscimo</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}</span>
                        </div>
                        <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number">
                          <span className="lancamentos-print-report__label">Valor exibido</span>
                          <span className="lancamentos-print-report__value">{valueFormatter(getValorLiquido(item))}</span>
                        </div>
                        <div className="lancamentos-print-report__cell">
                          <span className="lancamentos-print-report__label">Status</span>
                          <span className="lancamentos-print-report__value">{getPrintStatus(item)}</span>
                        </div>
                      </div>
                    </section>
                  </article>
                ))}
              </section>
            )}

          </div>
        </div>
  );

  // Aplica à lista do Extrato a mesma normalização cronológica usada pela Conciliação.
  if (isExtratoView) {
    return (
      <div className="lancamentos-page space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
        {abasFinanceiroExtrato}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 flex items-center gap-3">
              <Receipt className="w-8 h-8 text-primary" />
              Extrato
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">
              Títulos confirmados e conciliados, na ordem cronológica do extrato
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handlePrintSelected}
              disabled={selectedLancamentoIdsForBatch.length === 0 || selectedPrintLancamentos.length === 0}
              title="Imprimir relatório somente dos lançamentos selecionados"
            >
              <Download className="w-4 h-4" />
              Gerar PDF do Filtro
            </Button>
            {selectedPrintLancamentos.length > 0 && (
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                {selectedPrintLancamentos.length} selecionado{selectedPrintLancamentos.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
          Conta do extrato
          <select
            data-testid="extrato-conta"
            value={contaExtratoId}
            onChange={(event) => setContaExtratoId(event.target.value)}
            className="h-12 w-full rounded-xl border-2 border-neutral-100 bg-white px-4 text-xs font-bold normal-case tracking-normal text-neutral-700 outline-none transition-all hover:bg-neutral-50"
          >
            <option value="">Selecione a conta</option>
            {accountCardsData.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.nome} · {acc.nome_banco}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Situação</span>
          <button
            type="button"
            data-testid="extrato-filtro-bpi"
            aria-pressed={extratoBpiAtivo}
            onClick={() => {
              setExtratoBpiAtivo(active => !active);
              setCurrentPage(1);
            }}
            className={`flex min-h-[39px] items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest transition ${extratoBpiAtivo ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-100 bg-white text-neutral-400 hover:bg-neutral-50'}`}
          >
            {extratoBpiAtivo && <span className="w-2 h-2 rounded-full bg-primary" />}
            BPI (Inatividade)
          </button>
        </div>

        {painelEFiltros}

        <AccountFilterCards
          accounts={accountCardsData}
          selectedIds={contaExtratoId ? [contaExtratoId] : []}
          onSelect={(ids) => ids[0] && setContaExtratoId(ids[0])}
          singleSelect
          dragScrollProps={dragScrollTabs.props}
          dragScrollRef={dragScrollTabs.ref}
          valueFormatter={valueFormatter}
          showBalances={podeVerSaldos(role)}
        />

        <div className="bg-white border-2 border-neutral-100 rounded-[32px] shadow-sm relative">
          <div
            ref={extratoScroll.ref}
            {...extratoScroll.props}
            className="overflow-x-auto scrollbar-none select-none rounded-t-[32px]"
          >
          {isLoading ? (
            <div className="py-24 text-center">
              <div className="flex flex-col items-center gap-3 opacity-40">
                <Clock className="w-10 h-10 animate-spin text-primary" />
                <p className="font-black uppercase text-[10px] tracking-widest">Carregando extrato...</p>
              </div>
            </div>
          ) : accountCardsData.length === 0 && role !== 'master' ? (
            <div className="py-12 text-center">
              <div data-testid="sem-bancos-liberados" className="font-bold text-sm text-secondary">
                Nenhuma conta bancária liberada para o seu usuário. Solicite ao Master a liberação.
              </div>
            </div>
          ) : allLancamentos.length === 0 ? (
            <div className="py-24 text-center">
              <div className="flex flex-col items-center gap-3 opacity-20">
                <Receipt className="w-12 h-12" />
                <p className="font-black uppercase text-[10px] tracking-widest">{extratoBpiAtivo ? 'Nenhum BPI confirmado nesta conta' : 'Nenhum título confirmado e conciliado'}</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/60">
                  <th className="py-4 px-5 w-10 text-center">
                    {selectableLancamentos.length > 0 && (
                      <input
                        type="checkbox"
                        checked={selectedLancamentoIdsForBatch.length === selectableLancamentos.length}
                        onChange={toggleSelectAll}
                        className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                      />
                    )}
                  </th>
                  <th className="py-4 px-5 text-[9px] font-black uppercase tracking-widest text-neutral-400">Data</th>
                  <th className="py-4 px-5 text-[9px] font-black uppercase tracking-widest text-neutral-400">Fluxo</th>
                  <th className="py-4 px-5 text-[9px] font-black uppercase tracking-widest text-neutral-400">Documento</th>
                  <th className="py-4 px-5 text-[9px] font-black uppercase tracking-widest text-neutral-400">Entidade</th>
                  <th className="py-4 px-5 text-right text-[9px] font-black uppercase tracking-widest text-neutral-400">Valor</th>
                  <th className="py-4 px-5 text-right text-[9px] font-black uppercase tracking-widest text-neutral-400">Total dia</th>
                  <th className="py-4 px-5 text-center text-[9px] font-black uppercase tracking-widest text-neutral-400">Conciliação</th>
                  {podeReordenarExtrato && (
                    <th className="py-4 px-5 text-center text-[9px] font-black uppercase tracking-widest text-neutral-400">Ordem</th>
                  )}
                  {isMaster && (<th className="py-4 px-5 text-center text-[9px] font-black uppercase tracking-widest text-neutral-400">Ações</th>)}
                </tr>
              </thead>
              <tbody className="text-[11px] font-bold">
                {lancamentosExtrato.map(item => {
                  const bloco = item.data_pagamento ? blocosDoDia.get(item.data_pagamento) : undefined;
                  const indiceNoDia = bloco ? bloco.ids.indexOf(item.id) : -1;
                  const podeMoverNoDia = Boolean(bloco) && !isReordenando && blocoDoDiaReordenavel(bloco!);
                  const podeSubir = podeMoverNoDia && indiceNoDia > 0;
                  const podeDescer = podeMoverNoDia && indiceNoDia >= 0 && indiceNoDia < (bloco?.ids.length ?? 0) - 1;
                  const isTransferenciaEspelho = item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino';
                  const isSelected = selectedLancamentoIdsForBatch.includes(item.id);
                  const fluxoLabel = isTransferenciaEspelho ? 'Transferência entre contas' : item.tipo === 'entrada' ? 'Entrada' : 'Saída';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setSelectedLancamentoIdForModal(item.id);
                        setModalOpen('isComprovanteOpen', true);
                      }}
                      className={`border-b border-neutral-50 hover:bg-neutral-50/50 transition-all cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-3 px-5 text-center" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(item.id)}
                          className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                        />
                      </td>
                      <td className="py-3 px-5 font-mono text-xs text-neutral-900 whitespace-nowrap">
                        <div>{formatPrintDate(item.data_pagamento)}</div>
                        {item.hora_pagamento && <div className="mt-1 text-[9px] text-neutral-400">{item.hora_pagamento}</div>}
                      </td>
                      <td className="py-3 px-5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${isTransferenciaEspelho ? 'bg-primary/5 text-primary' : item.tipo === 'entrada' ? 'bg-emerald-50 text-bank-truth-green' : 'bg-red-50 text-alert-red'}`}
                          role="img"
                          aria-label={fluxoLabel}
                          title={fluxoLabel}
                        >
                          {isTransferenciaEspelho ? <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> : item.tipo === 'entrada' ? <ArrowUpRight className="w-4 h-4" aria-hidden="true" /> : <ArrowDownLeft className="w-4 h-4" aria-hidden="true" />}
                        </div>
                      </td>
                      <td className="py-3 px-5 whitespace-nowrap text-neutral-900 font-black text-xs">
                        {item.codigo_sequencial != null ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex flex-col">
                          {isTransferenciaEspelho ? (
                            <>
                              <span className="w-fit rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-primary">Transferência entre contas</span>
                              {getTransferenciaContasLabel(item) && (
                                <span className="mt-1 max-w-[260px] truncate text-[10px] font-bold uppercase text-neutral-600">{getTransferenciaContasLabel(item)}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-neutral-900 font-black uppercase tracking-tighter truncate max-w-[200px]">{entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                          )}
                          {renderObservacoes(item)}
                        </div>
                      </td>
                      <td className={`py-3 px-5 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                        {valueFormatter(getValorLiquido(item))}
                      </td>
                      <td className="py-3 px-5 text-right font-black font-mono text-xs text-neutral-900">
                        {podeVerSaldos(role) && item.conta_bancaria_id && saldosLancamentosPorId.get(item.id) != null
                          ? valueFormatter(saldosLancamentosPorId.get(item.id)!)
                          : '—'}
                      </td>
                      <td className="py-3 px-5 text-center">{renderConciliadoBadge(item)}</td>
                      {podeReordenarExtrato && (
                        <td className="py-3 px-5 text-center" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              data-testid={`extrato-mover-cima-${item.id}`}
                              aria-label="Mover para cima dentro do dia"
                              title="Mover para cima dentro do dia"
                              disabled={!podeSubir}
                              onClick={() => handleMoverTituloNoDia(item, 'cima')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-neutral-100 text-neutral-500 transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid={`extrato-mover-baixo-${item.id}`}
                              aria-label="Mover para baixo dentro do dia"
                              title="Mover para baixo dentro do dia"
                              disabled={!podeDescer}
                              onClick={() => handleMoverTituloNoDia(item, 'baixo')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-neutral-100 text-neutral-500 transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                      {isMaster && (
                        <td className="py-3 px-5 text-center" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <LancamentoActionMenu
                              item={item}
                              podeExcluir={false}
                              podeEstornar={!item.transferencia_id}
                              isActive={activeMenuId === item.id}
                              isOperationalView={false}
                              onToggle={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                              onBaixa={() => {}}
                              onEstornar={handleEstornarExtrato}
                              onEdit={handleEdit}
                              onDelete={() => {}}
                              onVerTransferencia={() => navigate('/conciliacao?aba=transferencias')}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>

          {/* Barra de rolagem horizontal fixa: fica presa no rodapé da tela para não ser
              preciso descer a lista inteira só para andar para o lado. */}
          <div
            ref={extratoMirrorRef}
            className="sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50/90 backdrop-blur-md border-y border-neutral-200 flex h-5"
            style={{ marginBottom: '-1px' }}
          >
            <div className="h-full shrink-0" style={{ width: `${Math.max(extratoLargura, 1)}px` }} />
          </div>

          {!isLoading && allLancamentos.length > 0 && (
            <p className="px-5 md:px-8 py-3 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
              {extratoBpiAtivo
                ? 'A baixa por inatividade (BPI) não entra no saldo do banco.'
                : 'Total dia é o saldo do ERP após cada movimentação e só coincide com o extrato do banco quando todas as movimentações da conta estiverem conciliadas.'}
            </p>
          )}
          {podeReordenarExtrato && !isLoading && allLancamentos.length > 0 && algumDiaBloqueadoParaReordenar && (
            <p data-testid="extrato-reordenacao-bloqueada" className="px-5 md:px-8 pb-3 text-[9px] font-black uppercase tracking-wider text-orange-600">
              Este dia começou na página anterior: escolha "Todos" na quantidade de títulos para reordenar o dia inteiro.
            </p>
          )}

          <div className="bg-neutral-50/50 px-5 md:px-8 py-4 border-t border-neutral-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-b-[32px]">
            <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
              Exibindo {allLancamentos.length} de {totalCount} registros
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {pageSize !== 'all' && (
                <>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
                  >
                    Anterior
                  </button>
                  <div className="flex gap-1">
                    {pageWindowStart > 1 && <span className="flex items-end pb-2 text-neutral-400">...</span>}
                    {visiblePages.map(pageNum => (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                          currentPage === pageNum
                            ? 'bg-neutral-900 text-white shadow-md'
                            : 'border-2 border-neutral-100 text-neutral-400 hover:bg-neutral-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    {pageWindowStart + visiblePages.length - 1 < totalPages && <span className="flex items-end pb-2 text-neutral-400">...</span>}
                  </div>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
                  >
                    Próximo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Cálculo da seleção: barra flutuante fixa no rodapé da tela, como no Financeiro. */}
        {selectedPrintLancamentos.length > 0 && (
          <div
            data-testid="extrato-total-selecao"
            className="sticky bottom-5 z-[60] flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-neutral-200 bg-neutral-50/95 px-5 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.10)] backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-900">
                Total ({selectedPrintLancamentos.length} selecionado{selectedPrintLancamentos.length === 1 ? '' : 's'})
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                Entradas {valueFormatter(totaisDaSelecao.entradas)} · Saídas {valueFormatter(totaisDaSelecao.saidas)}
              </span>
            </div>
            <span className="font-black font-mono text-sm text-neutral-900">{valueFormatter(totaisDaSelecao.liquido)}</span>
          </div>
        )}

        {relatorioImpressao}
        {modalLogsCompletos}
      </div>
    );
  }

  return (
    <div className="lancamentos-page space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
      {isFinanceiroView && abasFinanceiroExtrato}

      <AccountFilterCards
        accounts={accountCardsData}
        selectedIds={selectedAccountIds}
        onSelect={setSelectedAccountIds}
        dragScrollProps={dragScrollTabs.props}
        dragScrollRef={dragScrollTabs.ref}
        valueFormatter={valueFormatter}
        showBalances={podeVerSaldos(role)}
      />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-primary" />
            {titleOverride || 'Financeiro'}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Gestão centralizada de movimentações e conciliação</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handlePrintSelected}
            disabled={selectedLancamentoIdsForBatch.length === 0 || selectedPrintLancamentos.length === 0}
            title="Imprimir relatório somente dos lançamentos selecionados"
          >
            <Download className="w-4 h-4" />
            Gerar PDF do Filtro
          </Button>
          {selectedPrintLancamentos.length > 0 && (
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
              {selectedPrintLancamentos.length} selecionado{selectedPrintLancamentos.length === 1 ? '' : 's'}
            </span>
          )}

          {isFinanceiroView && isMaster && (
            <Button
              onClick={() => handleBatchApprove()}
              disabled={aprovaveisEmLote.length === 0 || isBatchApproving}
            >
              <ShieldCheck className="w-4 h-4" />
              Aprovar ({aprovaveisEmLote.length})
            </Button>
          )}

        </div>
      </div>

      {painelEFiltros}

      <div className="bg-white border-2 border-neutral-100 rounded-[32px] shadow-sm relative">
        <div
          ref={tableScroll.ref}
          {...tableScroll.props}
          className="overflow-x-auto scrollbar-none select-none rounded-t-[32px]"
        >
          <table ref={mainTableRef} className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-neutral-50/50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest select-none">
                <th className="py-5 px-4 w-10 text-center">
                  {selectableLancamentos.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedLancamentoIdsForBatch.length === selectableLancamentos.length}
                      onChange={toggleSelectAll}
                      className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                    />
                  )}
                </th>

                <th className="py-5 px-4">Documento</th>
                {isOperationalView ? (
                  <>
                    <th className="py-5 px-4">{typeOverride === 'saida' ? 'Local / Fornecedor' : 'Local / Cliente'}</th>
                    <th className="py-5 px-4">Ven. Ref.</th>
                    <th className="py-5 px-4">Data Doc.</th>
                    <th className="py-5 px-4 text-right">Valor Doc. Original</th>
                    <th className="py-5 px-4 text-right">Valor Parc. Original</th>
                    <th className="py-5 px-4 text-right">Desconto</th>
                    <th className="py-5 px-4 text-right">Acréscimo</th>
                    <th className="py-5 px-4 text-right">Valor Pago</th>
                    <th className="py-5 px-4 text-right">A Pagar</th>
                    <th className="py-5 px-4 text-center">Status</th>
                    <th className="py-5 px-4 text-center">Banco</th>
                    <th className="py-5 px-3 text-center">Recibo</th>
                  </>
                ) : (
                  <>
                    <th className="py-5 px-4">Fluxo</th>
                    <th className="py-5 px-4">Entidade</th>
                    <th className="py-5 px-4">Vencimento</th>
                    <th className="py-5 px-4">Pagamento</th>
                    <th className="py-5 px-4 text-right">Valor</th>
                    {isFinanceiroView && <th className="py-5 px-4 text-right">Total dia</th>}
                    <th className="py-5 px-4 text-center">Aprovação</th>
                    <th className="py-5 px-4 text-center">Banco</th>
                    <th className="py-5 px-3 text-center">Recibo</th>
                  </>
                )}
                <th className="py-5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold">
              {isLoading ? (
                <tr><td colSpan={isOperationalView ? 15 : 12} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-40"><Clock className="w-10 h-10 animate-spin text-primary" /><p className="font-black uppercase text-[10px] tracking-widest">Sincronizando registros...</p></div></td></tr>
              ) : isError ? (
                <tr><td colSpan={isOperationalView ? 15 : 12} className="py-24 text-center"><div className="flex flex-col items-center gap-3 text-alert-red"><AlertTriangle className="w-10 h-10" /><p className="font-black uppercase text-[10px] tracking-widest">Erro ao carregar dados. Tente simplificar a busca.</p></div></td></tr>
              ) : role !== 'master' && activeContas.length === 0 ? (
                <tr><td colSpan={isOperationalView ? 15 : 12} className="py-12 text-center"><div data-testid="sem-bancos-liberados" className="font-bold text-sm text-secondary">Nenhuma conta bancária liberada para o seu usuário. Solicite ao Master a liberação.</div></td></tr>
              ) : displayedLancamentos.length === 0 ? (
                <tr><td colSpan={isOperationalView ? 15 : 12} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-20"><Receipt className="w-12 h-12" /><p className="font-black uppercase text-[10px] tracking-widest">Nenhum lançamento localizado</p></div></td></tr>
              ) : (
                <>
                  {displayedLancamentos.map((item, idx) => {
                  const isSelected = selectedLancamentoIdsForBatch.includes(item.id);
                  const isTransferenciaEspelho = Boolean(item.transferencia_id)
                    && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
                  const podeAprovarPeloSelo = isFinanceiroView && isMaster && item.status_aprovacao !== 'confirmado_master';
                  const days = getDaysOverdue(item.data_vencimento);
                  const saldoLancamento = saldosLancamentosPorId.get(item.id);

                  return (
                    <tr
                      key={`${item.id}-${idx}`}
                      onClick={() => {
                        setSelectedLancamentoIdForModal(item.id);
                        setModalOpen('isComprovanteOpen', true);
                      }}
                      className={`border-b border-neutral-50 hover:bg-neutral-50/50 transition-all cursor-pointer group ${isSelected ? 'bg-primary/5 border-primary/10' : ''}`}
                    >
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(item.id)}
                          className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                        />
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-neutral-900 font-black uppercase text-[10px]">
                            {item.codigo_sequencial ? `${item.codigo_sequencial}${item.numero_parcela ? `-${item.numero_parcela}` : ''}` : '-'}
                          </span>
                          {item.numero_parcela && (
                            <span className="text-[9px] text-neutral-400 font-bold whitespace-nowrap">
                              (par {item.numero_parcela}/{item.quantidade_total_parcelas || '?'})
                            </span>
                          )}
                        </div>
                      </td>
                      {isOperationalView ? (
                        <>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-neutral-900 font-black uppercase tracking-tighter truncate max-w-[200px]">
                                  {entidades.find(e => e.id === item.entidade_id)?.nome_razao_social || 'N/A'}
                                </span>
                              </div>
                              {renderObservacoes(item)}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                            {item.data_vencimento.split('-').reverse().join('/')}
                            <br />
                            {item.status_pagamento === 'pago' || item.status_pagamento === 'bpi' ? (
                              <span className="text-neutral-300 font-normal">-</span>
                            ) : (
                              days > 0 ? (
                                <span className="text-alert-red font-black">{days} dia(s)</span>
                              ) : days === 0 ? (
                                <span className="text-alert-red font-black">Hoje</span>
                              ) : (
                                <span className="text-blue-600 font-black">{Math.abs(days)} dia(s)</span>
                              )
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono">
                            {item.data_emissao.split('-').reverse().join('/')}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(item.valor_original || item.valor_previsto)}
                          </td>
                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            {valueFormatter(item.valor_previsto)}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto))}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto))}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                            {valueFormatter(item.valor_recebido || 0)}
                          </td>
                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            {valueFormatter(getSaldoAPagar(item))}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderStatusBadge(item)}
                          </td>
                          {renderBancoCell(item)}
                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setReciboLancamento(item)}
                              disabled={!temComprovante(item)}
                              className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center gap-1 ${temComprovante(item) ? 'hover:bg-neutral-100 text-bank-truth-green' : 'text-neutral-300 cursor-not-allowed'}`}
                              title={temComprovante(item) ? 'Ver recibo' : 'Sem comprovante anexado'}
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isTransferenciaEspelho ? 'bg-primary/5 text-primary' : item.tipo === 'entrada' ? 'bg-emerald-50 text-bank-truth-green' : 'bg-red-50 text-alert-red'}`}>
                              {isTransferenciaEspelho ? <ArrowLeftRight className="w-4 h-4" /> : item.tipo === 'entrada' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              {isTransferenciaEspelho ? (
                                <>
                                  <span className="w-fit rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-primary">Transferência entre contas</span>
                                  {getTransferenciaContasLabel(item) && (
                                    <span className="mt-1 max-w-[260px] truncate text-[10px] font-bold uppercase text-neutral-600">{getTransferenciaContasLabel(item)}</span>
                                  )}
                                  {renderObservacoes(item)}
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="text-neutral-900 font-black uppercase tracking-tighter truncate max-w-[200px]">{entidades.find(e => e.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
                                  </div>
                                  {renderObservacoes(item)}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono">{item.data_vencimento.split('-').reverse().join('/')}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {item.status_pagamento === 'pago' ? (
                              <div className="flex flex-col">
                                <span className="text-bank-truth-green font-black text-[9px] uppercase">Liquidado, Pago</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : isPartialPayment(item) ? (
                              <div className="flex flex-col">
                                <span className="text-orange-600 font-black text-[9px] uppercase">Pago Parcial</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : item.status_pagamento === 'quitação_pendente' ? (
                              <div className="flex flex-col">
                                <span className="text-amber-600 font-black text-[9px] uppercase">{isTransferenciaEspelho ? (isMaster ? 'Confirme Aprovação' : 'Pend. Gestor') : (isMaster ? 'Confirme Baixa' : 'Pendente Gestor')}</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.data_pagamento?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : item.status_pagamento === 'bpi' ? (
                              <div className="flex flex-col">
                                <span className="text-neutral-900 font-black text-[9px] uppercase">Baixa Inatividade</span>
                                <span className="text-[9px] text-neutral-400 font-mono">{item.bpi_em?.split('-').reverse().join('/')}</span>
                              </div>
                            ) : (
                              <span className="text-neutral-300 font-bold uppercase text-[9px] tracking-widest">Aguardando</span>
                            )}
                          </td>

                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                            <span className="flex flex-col items-end">
                              {valueFormatter(getValorLiquido(item))}
                              {hasAjuste(item) && (
                                <span className="text-[8px] font-bold text-secondary uppercase tracking-wider mt-0.5">
                                  Prev: {valueFormatter(item.valor_previsto)}
                                </span>
                              )}
                            </span>
                          </td>
                          {isFinanceiroView && (
                            <td className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                              {podeVerSaldos(role) && item.conta_bancaria_id && saldoLancamento != null
                                ? valueFormatter(saldoLancamento)
                                : '—'}
                            </td>
                          )}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {podeAprovarPeloSelo ? (
                              <button
                                type="button"
                                title="Clique para aprovar"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedLancamentoIdsForBatch(item.transferenciaEspelhoIds ?? [item.id]);
                                  setSelectedTransferenciaAprovacao(item.transferenciaEspelhoIds && item.transferencia_id
                                    ? { id: item.transferencia_id, rotulo: getTransferenciaContasLabel(item) }
                                    : null);
                                  setModalOpen('isAprovacaoModalOpen', true);
                                }}
                                className="cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                {renderStatusBadge(item)}
                              </button>
                            ) : renderStatusBadge(item)}
                          </td>
                          {renderBancoCell(item)}
                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setReciboLancamento(item)}
                              disabled={!temComprovante(item)}
                              className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center gap-1 ${temComprovante(item) ? 'hover:bg-neutral-100 text-bank-truth-green' : 'text-neutral-300 cursor-not-allowed'}`}
                              title={temComprovante(item) ? 'Ver recibo' : 'Sem comprovante anexado'}
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {isOperationalView && (
                            <div className="flex items-center gap-1.5 mr-2">
                              {(item.status_pagamento === 'aberto' || isPartialPayment(item)) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenBaixa(item.id)}
                                  className="px-3 py-1.5 bg-bank-truth-green text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Dar baixa
                                </button>
                              )}
                            </div>
                          )}

                          <LancamentoActionMenu
                            item={item}
                            podeExcluir={podeExcluirTitulo}
                            podeEstornar={isMaster && isFinanceiroView}
                            isActive={activeMenuId === item.id}
                            isOperationalView={isOperationalView}
                            onToggle={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                            onBaixa={handleOpenBaixa}
                            onEstornar={handleEstornar}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onVerTransferencia={() => navigate('/conciliacao?aba=transferencias')}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Floating Horizontal Scrollbar Mirror - Stays fixed at viewport bottom */}
        <div
          ref={mirrorScrollRef}
          className={
            selectedPrintLancamentos.length > 0
              ? 'sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50 border-y-2 border-neutral-200 shadow-[0_-2px_6px_rgba(0,0,0,0.08)] flex min-h-[52px]'
              : 'sticky bottom-0 z-[60] overflow-x-auto scrollbar-thin bg-neutral-50/90 backdrop-blur-md border-y border-neutral-200 flex h-5'
          }
          style={{ marginBottom: '-1px' }}
        >
          {selectedPrintLancamentos.length > 0 ? (
            <div
              className="grid min-w-[1200px] shrink-0 text-left"
              style={{
                width: mirrorGridWidth,
                gridTemplateColumns: mirrorGridTemplateColumns
              }}
            >
              {isOperationalView ? (
                <>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 font-black uppercase tracking-widest text-neutral-900">TOTAL</div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.valorDocOriginal)}
                  </div>
                  <div className={`py-3 px-4 text-right font-black font-mono text-xs ${typeOverride === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                    {valueFormatter(operationalTotals.valorParcOriginal)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.desconto)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.acrescimo)}
                  </div>
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(operationalTotals.valorPago)}
                  </div>
                  <div className={`py-3 px-4 text-right font-black font-mono text-xs ${typeOverride === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                    {valueFormatter(operationalTotals.aPagar)}
                  </div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-3" />
                  <div className="py-3 px-4" />
                </>
              ) : (
                <>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 font-black uppercase tracking-widest text-neutral-900">TOTAL</div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(printTotals.liquido)}
                  </div>
                  <div className="py-3 px-4" />
                  <div className="py-3 px-4" />
                  <div className="py-3 px-3" />
                  <div className="py-3 px-4" />
                </>
              )}
            </div>
          ) : (
            <div style={{ width: tableWidth, height: 1 }} className="shrink-0" />
          )}
        </div>

        {/* Pagination Bar */}
        <div className="bg-neutral-50/50 px-8 py-4 border-t border-neutral-100 flex items-center justify-between rounded-b-[32px]">
          <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
            Exibindo {displayedLancamentos.length} de {totalCount} registros
          </span>

          <div className="flex items-center gap-2">
            {pageSize !== 'all' && (
              <>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
                >
                  Anterior
                </button>
                <div className="flex gap-1">
                  {pageWindowStart > 1 && <span className="flex items-end pb-2 text-neutral-400">...</span>}
                  {visiblePages.map(pageNum => (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                        currentPage === pageNum
                          ? 'bg-neutral-900 text-white shadow-md'
                          : 'border-2 border-neutral-100 text-neutral-400 hover:bg-neutral-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  {pageWindowStart + visiblePages.length - 1 < totalPages && <span className="flex items-end pb-2 text-neutral-400">...</span>}
                </div>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
                >
                  Próximo
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cálculo da seleção: mesma barra flutuante do Extrato — entradas somam, saídas
          subtraem e o líquido é o resultado. */}
      {isFinanceiroView && !isExtratoView && selectedPrintLancamentos.length > 0 && (
        <div
          data-testid="financeiro-total-selecao"
          className="sticky bottom-5 z-[60] flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-neutral-200 bg-neutral-50/95 px-5 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.10)] backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-900">
              Total ({selectedPrintLancamentos.length} selecionado{selectedPrintLancamentos.length === 1 ? '' : 's'})
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              Entradas {valueFormatter(totaisDaSelecao.entradas)} · Saídas {valueFormatter(totaisDaSelecao.saidas)}
            </span>
          </div>
          <span className="font-black font-mono text-sm text-neutral-900">{valueFormatter(totaisDaSelecao.liquido)}</span>
        </div>
      )}

      {relatorioImpressao}

      {modalLogsCompletos}

      <ReciboModal lancamento={reciboLancamento} onClose={() => setReciboLancamento(null)} />
    </div>
  );
}