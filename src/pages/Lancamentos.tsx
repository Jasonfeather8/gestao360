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
import { useLancamentos, useContas, useEntidades, useCategorias, useUsuarios, useCentrosCusto, useCategoriasAjuste, useContasSaldos, useTransferencias } from '../hooks/useData';
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
  const { role } = useAuth();
  const {
    setModalOpen,
    setSelectedLancamentoIdForModal,
    selectedLancamentoIdsForBatch,
    setSelectedLancamentoIdsForBatch,
    setActiveTab,
    isAprovacaoModalOpen
  } = useUIStore();

  const dragScrollTabs = useDragScroll();
  const tableScroll = useDragScroll();
  const mainTableRef = useRef<HTMLTableElement>(null);
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isMaster = role === 'master';
  const isColaborador = role === 'colaborador';
  const isFinanceiroView = !typeOverride && !titleOverride;
  const isOperationalView = !!typeOverride;

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
  const [dateDirection, setDateDirection] = useState<'past' | 'future' | 'both'>('past');
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

  const handlePresetChange = (preset: '15' | '30' | '90' | 'custom', direction: 'past' | 'future' | 'both' = dateDirection) => {
    setDatePreset(preset);
    setDateFilterActive(true);
    if (preset !== 'custom') {
      const today = new Date();
      const start = new Date();
      const end = new Date();

      if (direction === 'future') {
        start.setDate(today.getDate() + 1);
        end.setDate(today.getDate() + parseInt(preset));
      } else if (direction === 'both') {
        start.setDate(today.getDate() - parseInt(preset));
        end.setDate(today.getDate() + parseInt(preset));
      } else {
        start.setDate(today.getDate() - parseInt(preset));
        end.setDate(today.getDate());
      }

      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const handleDateDirectionChange = (direction: 'past' | 'future' | 'both') => {
    setDateDirection(direction);
    if (datePreset !== 'custom') {
      handlePresetChange(datePreset, direction);
    }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<50 | 100 | 'all'>(50);

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
  const [centroCustoIdFilter, setCentroCustoIdFilter] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [condicaoFilter, setCondicaoFilter] = useState('all');
  const [temDescontoFilter, setTemDescontoFilter] = useState('all');
  const [temAcrescimoFilter, setTemAcrescimoFilter] = useState('all');
  const [motivoDescontoFilter, setMotivoDescontoFilter] = useState('all');
  const [motivoAcrescimoFilter, setMotivoAcrescimoFilter] = useState('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  const selectionDiffersFromDefault = (selection: string[], defaultValue: string) => {
    const normalizedSelection = selection.filter(value => value !== 'all' && value !== '');
    const normalizedDefault = defaultValue === 'all' || defaultValue === '' ? [] : [defaultValue];
    return normalizedSelection.length !== normalizedDefault.length || normalizedSelection.some((value, index) => value !== normalizedDefault[index]);
  };

  const hasActiveFilters = debouncedSearchTerm !== '' || docSearchTerm !== '' || approvalStatus !== 'all' || transferenciasOnly || selectionDiffersFromDefault(statusPagamento, defaultStatusPagamento) || selectionDiffersFromDefault(typeFilter, defaultTypeFilter) || authorIdFilter.length > 0 || categoryIdFilter.length > 0 || contaIdFilter.length > 0 || centroCustoIdFilter.length > 0 || condicaoFilter !== 'all' || temDescontoFilter !== 'all' || temAcrescimoFilter !== 'all' || motivoDescontoFilter !== 'all' || motivoAcrescimoFilter !== 'all';

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedLogItem, setSelectedLogItem] = useState<LancamentoFinanceiro | null>(null);

  const {
    data: allLancamentos = [],
    totalCount = 0,
    batchApprove,
    estornarLancamento,
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
    financialStatus: isFinanceiroView ? statusPagamento : undefined,
    statusPagamento: statusPagamento.length === 0 && !isFinanceiroView && !isOperationalView && isColaborador ? ['quitação_pendente'] : isFinanceiroView ? [] : statusPagamento,
    type: typeFilter,
    operationalView: isOperationalView,
    authorId: isColaborador ? useUIStore.getState().currentUserId : authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: contaIdFilter,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView,
    transferenciasOnly: isFinanceiroView && transferenciasOnly,
    page: currentPage,
    pageSize: pageSize === 'all' ? undefined : pageSize
  });

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

  const totalPages = pageSize === 'all' ? 1 : Math.max(Math.ceil(totalCount / pageSize), 1);

  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: usuarios = [] } = useUsuarios();
  const { data: rawContas = [] } = useContas();
  const { data: centrosCusto = [] } = useCentrosCusto();
  const { categoriasAjuste = [] } = useCategoriasAjuste();

  const activeContas = useMemo(() => rawContas.filter((c: any) => c.status !== 'excluido'), [rawContas]);

  useEffect(() => {
    const lancamentoId = searchParams.get('id');
    if (lancamentoId) {
      setSelectedLancamentoIdForModal(lancamentoId);
      setModalOpen('isComprovanteOpen', true);
    }
  }, [searchParams, setSelectedLancamentoIdForModal, setModalOpen]);

  const filteredLancamentos = useMemo(() => {
    return allLancamentos.filter(l => selectedAccountIds.length === 0 || selectedAccountIds.includes(l.conta_bancaria_id));
  }, [allLancamentos, selectedAccountIds]);

  const { data: transferencias = [] } = useTransferencias();
  const transferenciasById = useMemo(() => new Map(transferencias.map(transferencia => [transferencia.id, transferencia])), [transferencias]);
  const displayedLancamentos = useMemo(() => {
    const displayed: LancamentoFinanceiro[] = [];
    const indexesByTransferencia = new Map<string, number>();

    filteredLancamentos.forEach(item => {
      const isTransferenciaEspelho = Boolean(item.transferencia_id)
        && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
      if (!isTransferenciaEspelho || !item.transferencia_id) {
        displayed.push(item);
        return;
      }

      const existingIndex = indexesByTransferencia.get(item.transferencia_id);
      if (existingIndex === undefined) {
        indexesByTransferencia.set(item.transferencia_id, displayed.length);
        displayed.push(item);
      } else if (item.transferencia_lado === 'origem' && displayed[existingIndex].transferencia_lado === 'destino') {
        displayed[existingIndex] = item;
      }
    });

    return displayed;
  }, [filteredLancamentos]);
  const selectableLancamentos = useMemo(
    () => filteredLancamentos.filter(item => item.transferencia_lado !== 'origem' && item.transferencia_lado !== 'destino'),
    [filteredLancamentos]
  );

  const resolvedFinanceiroContaIds = useMemo(() => {
    if (selectedAccountIds.length === 0) return contaIdFilter;
    if (contaIdFilter.length === 0) return selectedAccountIds;
    const matchingAccountIds = selectedAccountIds.filter(id => contaIdFilter.includes(id));
    return matchingAccountIds.length > 0 ? matchingAccountIds : ['00000000-0000-0000-0000-000000000000'];
  }, [contaIdFilter, selectedAccountIds]);

  const financeiroStatusFilters = useMemo(() => ({
    searchTerm: debouncedSearchTerm,
    docCode: parseInt(docSearchTerm.split('-')[0]) || undefined,
    docParcel: parseInt(docSearchTerm.split('-')[1]) || undefined,
    startDate: dateFilterActive ? startDate : undefined,
    endDate: dateFilterActive ? endDate : undefined,
    approvalStatus,
    type: typeFilter,
    authorId: isColaborador ? useUIStore.getState().currentUserId : authorIdFilter,
    categoryId: categoryIdFilter,
    contaId: resolvedFinanceiroContaIds,
    centroCustoId: centroCustoIdFilter,
    condicao: condicaoFilter,
    temDesconto: temDescontoFilter,
    temAcrescimo: temAcrescimoFilter,
    motivoDescontoId: motivoDescontoFilter,
    motivoAcrescimoId: motivoAcrescimoFilter,
    isFinanceiroView: true
  }), [approvalStatus, authorIdFilter, categoryIdFilter, centroCustoIdFilter, condicaoFilter, dateFilterActive, debouncedSearchTerm, docSearchTerm, endDate, isColaborador, motivoAcrescimoFilter, motivoDescontoFilter, resolvedFinanceiroContaIds, startDate, temAcrescimoFilter, temDescontoFilter, typeFilter]);

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
    setDateDirection('past');

    handlePresetChange('15', 'past');
    if (isFinanceiroView || isOperationalView) setDateFilterActive(false);
    setCurrentPage(1);
  };

  const toggleSelectAll = () => {
    if (!isMaster) return;
    if (selectedLancamentoIdsForBatch.length === selectableLancamentos.length) {
      setSelectedLancamentoIdsForBatch([]);
    } else {
      setSelectedLancamentoIdsForBatch(selectableLancamentos.map(l => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (!isMaster) return;
    setSelectedLancamentoIdsForBatch(
      selectedLancamentoIdsForBatch.includes(id)
        ? selectedLancamentoIdsForBatch.filter(i => i !== id)
        : [...selectedLancamentoIdsForBatch, id]
    );
  };

  const handleBatchApprove = () => {
    if (!isMaster) return;
    const eligibleIds = filteredLancamentos
      .filter(item => selectedLancamentoIdsForBatch.includes(item.id))
      .filter(item => item.status_aprovacao !== 'confirmado_master' || item.status_pagamento === 'quitação_pendente')
      .map(item => item.id);
    if (eligibleIds.length === 0) return;
    setSelectedLancamentoIdsForBatch(eligibleIds);
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

  const handleEdit = (l: LancamentoFinanceiro) => {
    setSelectedLancamentoIdForModal(l.id);
    setModalOpen('isNovoLancamentoOpen', true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id: string) => {
    if (!isMaster) return;
    if (confirm('Excluir este lançamento permanentemente?')) {
      try {
        await deleteLancamento({ id });
        setActiveMenuId(null);
      } catch (err) { alert('Erro ao excluir'); }
    }
  };

  const { data: contasSaldos = [] } = useContasSaldos();

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

  const selectedPrintLancamentos = displayedLancamentos.filter(item => selectedLancamentoIdsForBatch.includes(item.id));
  const selectedOperationalLancamentos = isOperationalView ? selectedPrintLancamentos : [];
  const operationalDocumentCodes = new Set<number>();
  const operationalTotals = selectedOperationalLancamentos.reduce(
    (totals, item) => {
      const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
      const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
      const valorPago = item.valor_recebido || 0;
      const hasDocumentCode = item.codigo_sequencial != null;

      if (!hasDocumentCode || !operationalDocumentCodes.has(item.codigo_sequencial)) {
        totals.valorDocOriginal += item.valor_original || item.valor_previsto;
        if (hasDocumentCode) operationalDocumentCodes.add(item.codigo_sequencial);
      }
      totals.valorParcOriginal += item.valor_previsto;
      totals.desconto += desconto;
      totals.acrescimo += acrescimo;
      totals.valorPago += valorPago;
      totals.aPagar += Math.max(0, item.valor_previsto - desconto + acrescimo - valorPago);
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
      totals.liquido += liquido;
      totals.aPagar += Math.max(0, item.valor_previsto - desconto + acrescimo - valorPago);
      if (item.tipo === 'entrada') totals.entradas += liquido;
      if (item.tipo === 'saida') totals.saidas += liquido;
      return totals;
    },
    { valorPrevisto: 0, desconto: 0, acrescimo: 0, valorPago: 0, liquido: 0, aPagar: 0, entradas: 0, saidas: 0 }
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

  const renderStatusBadge = (item: LancamentoFinanceiro) => {
   if (isFinanceiroView && item.status_aprovacao !== 'confirmado_master') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-orange-50 text-orange-600 font-black border border-orange-200 text-[9px] uppercase tracking-tighter animate-pulse">
         Pend. Gestor
       </span>
     );
   }
   if (item.status_pagamento === 'bpi') {
     return (
       <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-900 text-white font-black border border-neutral-950 text-[9px] uppercase tracking-tighter">
         BPI
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
         {isMaster ? 'Confirme Baixa' : 'Pendente Gestor'}
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

  return (
    <div className="lancamentos-page space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
      
      <AccountFilterCards
        accounts={accountCardsData}
        selectedIds={selectedAccountIds}
        onSelect={setSelectedAccountIds}
        dragScrollProps={dragScrollTabs.props}
        dragScrollRef={dragScrollTabs.ref}
        valueFormatter={valueFormatter}
      />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-primary" />
            {titleOverride || 'Extrato'}
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
              disabled={selectedLancamentoIdsForBatch.length === 0 || isBatchApproving}
            >
              <ShieldCheck className="w-4 h-4" />
              Aprovar ({selectedLancamentoIdsForBatch.length})
            </Button>
          )}

        </div>
      </div>

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
                onClick={() => { setIsFilterPanelOpen(false); setCurrentPage(1); }}
                className="h-9 px-3 rounded-lg border border-neutral-200 text-[9px] font-black uppercase tracking-widest text-secondary hover:border-primary hover:text-primary transition-all"
              >
                Ocultar filtros
              </button>
            </div>
          </div>

          <div className={isFinanceiroView ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
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

            {isFinanceiroView ? (
              <FinanceiroStatusFilter
                value={statusPagamento}
                onChange={setStatusPagamento}
                filters={financeiroStatusFilters}
              />
            ) : (
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
            )}
          </div>

          <div className={isFinanceiroView ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'}>
            {role !== 'colaborador' && (
              <div className="space-y-2">
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

            <div className="space-y-2">
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

            <div className="space-y-2">
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

            <div className="space-y-2">
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

      {/* Main filter bar */}
      <div className="bg-white border-2 border-neutral-100 p-4 rounded-3xl flex flex-col lg:flex-row gap-4 shadow-sm items-center">
        <button
          type="button"
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

        {isFinanceiroView && (
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
          <div className="flex flex-col bg-neutral-100 p-1 rounded-xl h-16 w-16 shrink-0" aria-label="Tempo" title="Tempo">
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('past')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'past' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Passado
            </button>
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('future')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'future' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Futuro
            </button>
            <button
              type="button"
              disabled={datePreset === 'custom'}
              onClick={() => handleDateDirectionChange('both')}
              className={`flex-1 px-1 rounded-lg text-[8px] font-black uppercase leading-none tracking-tighter transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                dateDirection === 'both' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Ambos
            </button>
          </div>

          <select
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
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
            <div className="w-px h-4 bg-neutral-200 self-center" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); setDateFilterActive(true); }}
              className="bg-transparent border-none text-[10px] font-black uppercase px-2 outline-none"
            />
          </div>

          <select
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
                  {isMaster && selectableLancamentos.length > 0 && (
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
                    <th className="py-5 px-4 text-center">Aprovação</th>
                    <th className="py-5 px-4 text-center">Conciliação</th>
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
              ) : displayedLancamentos.length === 0 ? (
                <tr><td colSpan={isOperationalView ? 15 : 12} className="py-24 text-center"><div className="flex flex-col items-center gap-3 opacity-20"><Receipt className="w-12 h-12" /><p className="font-black uppercase text-[10px] tracking-widest">Nenhum lançamento localizado</p></div></td></tr>
              ) : (
                <>
                  {displayedLancamentos.map((item, idx) => {
                  const isSelected = selectedLancamentoIdsForBatch.includes(item.id);
                  const isTransferenciaEspelho = Boolean(item.transferencia_id)
                    && (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino');
                  const isAprovacaoPendente = item.status_aprovacao !== 'confirmado_master' || item.status_pagamento === 'quitação_pendente';
                  const days = getDaysOverdue(item.data_vencimento);

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
                        {isMaster && !isTransferenciaEspelho && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(item.id)}
                            className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                          />
                        )}
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
                              onClick={() => {
                                setSelectedLancamentoIdForModal(item.id);
                                setModalOpen('isComprovanteOpen', true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-primary transition-all inline-flex items-center justify-center gap-1"
                              title="Ver Comprovante e Recibo"
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
                                <span className="text-amber-600 font-black text-[9px] uppercase">{isMaster ? 'Confirme Baixa' : 'Pendente Gestor'}</span>
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

                          <td className={`py-3 px-4 text-right font-black font-mono text-xs ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-neutral-950'}`}>
                            <span className="flex flex-col items-end">
                              {valueFormatter(getValorLiquido(item))}
                              {hasAjuste(item) && (
                                <span className="text-[8px] font-bold text-secondary uppercase tracking-wider mt-0.5">
                                  Prev: {valueFormatter(item.valor_previsto)}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {renderStatusBadge(item)}
                          </td>
                          <td className="py-3 px-4 text-center">{renderConciliadoBadge(item)}</td>
                          {renderBancoCell(item)}
                          <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLancamentoIdForModal(item.id);
                                setModalOpen('isComprovanteOpen', true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-primary transition-all inline-flex items-center justify-center gap-1"
                              title="Ver Comprovante e Recibo"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex items-center gap-1.5 mr-2">
                            {isFinanceiroView && isMaster && !isTransferenciaEspelho && isAprovacaoPendente && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLancamentoIdsForBatch([item.id]);
                                  setModalOpen('isAprovacaoModalOpen', true);
                                }}
                                className="px-3 py-1.5 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                              >
                                <ShieldCheck className="w-3 h-3" /> Aprovar
                              </button>
                            )}
                            {isOperationalView && (item.status_pagamento === 'aberto' || isPartialPayment(item)) && (
                              <button
                                type="button"
                                onClick={() => handleOpenBaixa(item.id)}
                                className="px-3 py-1.5 bg-bank-truth-green text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Dar baixa
                              </button>
                            )}
                          </div>

                          {isTransferenciaEspelho ? (
                            <button
                              type="button"
                              onClick={() => navigate('/conciliacao?aba=transferencias')}
                              className="px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all"
                            >
                              Ver transferência
                            </button>
                          ) : (
                            <LancamentoActionMenu
                              item={item}
                              isMaster={isMaster}
                              isActive={activeMenuId === item.id}
                              isOperationalView={isOperationalView}
                              onToggle={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                              onBaixa={handleOpenBaixa}
                              onEstornar={handleEstornar}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                            />
                          )}
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
                  <div className="py-3 px-4 text-right font-black font-mono text-xs text-neutral-900">
                    {valueFormatter(printTotals.liquido)}
                  </div>
                  <div className="py-3 px-4" />
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
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
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
                    );
                  })}
                  {totalPages > 5 && <span className="flex items-end pb-2 text-neutral-400">...</span>}
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

      <div className="lancamentos-print-report" aria-label="Relatório dos lançamentos selecionados">
        <div className="lancamentos-print-report__sheet">
          <header className="lancamentos-print-report__header">
            <div>
              <h1>{titleOverride || 'Financeiro / Extrato'}</h1>
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
                <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Entradas</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.entradas)}</span></div>
                <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Saídas</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.saidas)}</span></div>
                <div className="lancamentos-print-report__cell lancamentos-print-report__cell--number"><span className="lancamentos-print-report__label">Valor líquido exibido</span><span className="lancamentos-print-report__value">{valueFormatter(printTotals.liquido)}</span></div>
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
                        <span className="lancamentos-print-report__value">{item.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span>
                      </div>
                      <div className="lancamentos-print-report__cell">
                        <span className="lancamentos-print-report__label">Entidade</span>
                        <span className="lancamentos-print-report__value">{entidades.find(entidade => entidade.id === item.entidade_id)?.nome_razao_social || 'N/A'}</span>
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
                <button type="button" onClick={() => setSelectedLogItem(null)} className="p-2 rounded-xl hover:bg-neutral-200"><X className="w-5 h-5 text-secondary" /></button>
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
    </div>
  );
}