import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Search,
  ChevronRight,
  FileText,
  Paperclip,
  TrendingDown,
  TrendingUp,
  Percent,
  Banknote,
  Repeat,
  Calendar,
  CreditCard,
  Hash,
  Shield
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useLancamentos, useLancamento, useEntidades, useCentrosCusto, useCategorias, useContas, useContasSaldos, useLancamentoAnexos, useCategoriasAjuste } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import MoneyInput from './MoneyInput';
import { PrintDocumentSelector } from './printing/PrintDocumentSelector';
import type { PrintableDocumentData } from './printing/types';

import { supabase } from '@/integrations/supabase/client';
import Button from './Button';
import { calculateAdjustmentAmount } from '../utils/adjustments';
import { conciliacaoService } from '../services/conciliacaoService';

function formatBRL(value: any): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const clean = value.toString().replace(/\D/g, '');
  if (!clean) return '';
  const parsed = parseInt(clean, 10);
  const formatted = (parsed / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
}

function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const cleanStr = value.toString().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleanStr) || 0;
}

const SearchableSelect = ({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder, 
  required,
  onAddClick,
  onQuickAddClick,
  quickAddLabel,
  disabled
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { id: string; label: string; sublabel?: string }[];
  placeholder: string;
  required?: boolean;
  onAddClick?: () => void;
  onQuickAddClick?: () => void;
  quickAddLabel?: string;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    o.sublabel?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-2 relative" ref={containerRef}>
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black text-secondary uppercase tracking-widest">{label} {required && <span className="text-alert-red">*</span>}</label>
        <div className="flex gap-3">
          {onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1 z-50 relative"
            >
              <Plus className="w-3.5 h-3.5" /> Cadastro Rápido
            </button>
          )}
          {onQuickAddClick && (
            <button
              type="button"
              onClick={onQuickAddClick}
              className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1 z-50 relative"
            >
              <Plus className="w-3.5 h-3.5" /> {quickAddLabel || 'Novo'}
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-12 bg-white border-2 border-neutral-200 rounded-xl px-4 flex items-center justify-between text-sm font-bold transition-all shadow-xs ${isOpen ? 'border-primary' : ''}`}
      >
        <span className={selectedOption ? 'text-on-surface' : 'text-secondary/50'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronRight className={`w-4 h-4 text-secondary transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-[calc(100%+8px)] left-0 w-full bg-white border-2 border-neutral-100 rounded-2xl shadow-2xl z-[100] overflow-hidden"
          >
            <div className="p-3 border-b border-neutral-100 bg-neutral-50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquisar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-white border border-neutral-200 rounded-lg text-xs font-bold focus:outline-none focus:border-primary transition-all"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-[10px] font-black uppercase text-neutral-300">Nenhum resultado</div>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full p-3 text-left rounded-xl transition-all flex flex-col gap-0.5 ${value === opt.id ? 'bg-primary/5 border border-primary/20' : 'hover:bg-neutral-50 border border-transparent'}`}
                  >
                    <span className="text-xs font-black uppercase tracking-tight text-neutral-900">{opt.label}</span>
                    {opt.sublabel && <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{opt.sublabel}</span>}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface LocalFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

export default function NovoLancamentoDrawer() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const {
    isNovoLancamentoOpen,

    setModalOpen,
    selectedLancamentoIdForModal,
    setSelectedLancamentoIdForModal,
    selectedRecorrenciaAction,
    setSelectedRecorrenciaAction,
    lancamentoFormDraft,
    setLancamentoFormDraft,
    lancamentoPreset,
    setLancamentoPreset,
    setConciliacaoPosLancamento,
    avrPreset,
    setAvrPreset,
    setEntidadeFormDraft,
    resetLancamentoFormDraft,
    resetAllDrafts
  } = useUIStore();

  const { createLancamento, updateLancamento, baixaLancamento, isCreating, isUpdating, data: lancamentos = [] } = useLancamentos();
  const { data: lancamentoSelecionado, isLoading: isLancamentoSelecionadoLoading } = useLancamento(selectedLancamentoIdForModal);
  const { data: entidades = [] } = useEntidades();
  const { data: rawCentros = [] } = useCentrosCusto();
  const { data: rawCategorias = [] } = useCategorias();
  const { data: rawContas = [] } = useContas();

  const { createCC } = useCentrosCusto();
  const { createCategory } = useCategorias();
  const { createAccount } = useContas();
  const { categoriasAjuste, createCategoriaAjuste } = useCategoriasAjuste();
  const { data: contasSaldos = [] } = useContasSaldos();

  const { anexos: existingAnexos, deleteAnexo } = useLancamentoAnexos(selectedLancamentoIdForModal);

  const [attachments, setAttachments] = useState<LocalFile[]>([]);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  const [parcelasManuais, setParcelasManuais] = useState<Array<{ numero: number; data: string; valor: string }>>([]);
  const [isAVREdit, setIsAVREdit] = useState(false);
  const [avrReasonId, setAvrReasonId] = useState('');
  const [avrQuantity, setAvrQuantity] = useState('1');
  const [avrPeriodicity, setAvrPeriodicity] = useState('mensal');
  const [avrCustomDays, setAvrCustomDays] = useState('30');
  const [avrWithEntry, setAvrWithEntry] = useState(false);
  const [avrParcels, setAvrParcels] = useState<Array<{ id?: string; numero: number; data: string; valor: string; status: string; valor_recebido?: number | null }>>([]);
  const [avrSingleParcelValue, setAvrSingleParcelValue] = useState('');
  const [avrPropagation, setAvrPropagation] = useState<'none' | 'open'>('none');
  const [isAVRConfirmationOpen, setIsAVRConfirmationOpen] = useState(false);
  const [avrHasReceived, setAvrHasReceived] = useState(false);

  // Filter out soft-deleted items for new selection
  const centros = useMemo(() => rawCentros.filter((c: any) => c.status !== 'excluido'), [rawCentros]);
  const categorias = useMemo(() => rawCategorias.filter((c: any) => c.status !== 'excluido'), [rawCategorias]);
  
  // Use the operational balance returned by the database RPC for each account.
  const contas = useMemo(() => {
    const activeRawContas = rawContas.filter((c: any) => c.status !== 'excluido');
    
    return activeRawContas.map(conta => {
      const saldoObj = contasSaldos.find(saldo => saldo.conta_id === conta.id);
      const saldoReal = saldoObj ? Number(saldoObj.saldo_operacional) : (conta.saldo_inicial || 0);
      
      return {
        ...conta,
        saldo_real: saldoReal
      };
    });
  }, [rawContas, contasSaldos]);

  // Toasts state

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const isEditing = Boolean(selectedLancamentoIdForModal);
  const editingItem = useMemo(() => {
    if (!selectedLancamentoIdForModal) return null;
    return lancamentoSelecionado || lancamentos.find(l => l.id === selectedLancamentoIdForModal) || null;
  }, [selectedLancamentoIdForModal, lancamentoSelecionado, lancamentos]);
  const isEditingLoading = isEditing && isLancamentoSelecionadoLoading && !editingItem;

  // O rascunho do painel é preservado ao reabrir "Novo Lançamento" — esse é o
  // próprio objetivo do draft. As parcelas locais acompanham o rascunho; só a
  // sessão iniciada por um preset do extrato é que começa do zero.
  useEffect(() => {
    if (!isNovoLancamentoOpen) return;
    if (lancamentoPreset) {
      setAttachments([]);
      setParcelasManuais([]);
      return;
    }
    if (!isEditing) {
      setAttachments([]);
    }
  }, [isNovoLancamentoOpen]);

  // O registro só entra no rascunho com o painel aberto: abrir os detalhes de um
  // título não pode deixar os dados dele no rascunho do próximo lançamento.
  useEffect(() => {
    if (!isNovoLancamentoOpen) return;
    if (editingItem) {
      setLancamentoFormDraft({
        tipo: editingItem.tipo,
        valor_previsto: formatBRL(editingItem.valor_original || editingItem.valor_previsto),
        data_emissao: editingItem.data_emissao,
        data_vencimento: editingItem.data_vencimento,
        data_competencia: editingItem.data_competencia || editingItem.data_emissao,
        data_pagamento: editingItem.data_pagamento || editingItem.data_vencimento,
        entidade_id: editingItem.entidade_id,
        centro_custo_id: editingItem.centro_custo_id,
        categoria_id: editingItem.categoria_id,
        conta_bancaria_id: editingItem.conta_bancaria_id,
        observacoes: editingItem.observacoes,
        condicao: editingItem.condicao || 'a_prazo',
        ja_recebido: editingItem.ja_recebido || false,
        desconto_valor: formatBRL(editingItem.desconto_valor || 0),
        desconto_tipo: editingItem.desconto_tipo || 'valor',
        motivo_desconto_id: (editingItem as any).motivo_desconto_id || '',
        acrescimo_valor: formatBRL(editingItem.acrescimo_valor || 0),
        acrescimo_tipo: editingItem.acrescimo_tipo || 'valor',
        motivo_acrescimo_id: (editingItem as any).motivo_acrescimo_id || '',
        valor_recebido: formatBRL(editingItem.valor_recebido || 0),
      });
    }
  }, [editingItem, isNovoLancamentoOpen]);

  useEffect(() => {
    if (!editingItem) {
      setAvrHasReceived(false);
      if (!isEditing) {
        setIsAVREdit(false);
        setAvrReasonId('');
        setAvrParcels([]);
      }
      return;
    }

    const valorAVRPreset = avrPreset && avrPreset.lancamentoId === editingItem.id ? avrPreset.valor : null;
    setIsAVREdit(true);
    setAvrHasReceived(Number(editingItem.valor_recebido) > 0);
    const existingAvrReason = (categoriasAjuste as any[]).find(reason => reason.nome === (editingItem as any).motivo_ajuste);
    setAvrReasonId((editingItem as any).motivo_ajuste_id || existingAvrReason?.id || '');
    setAvrQuantity(String(editingItem.quantidade_total_parcelas || 1));
    setAvrPeriodicity('mensal');
    setAvrCustomDays('30');
    setAvrWithEntry(false);
    setAvrSingleParcelValue(valorAVRPreset ?? formatBRL(editingItem.valor_previsto));
    setAvrParcels([]);

    const loadAVRData = async () => {
      if (!editingItem.recorrencia_id) return;
      const [{ data: recurrence }, { data: parcels }] = await Promise.all([
        supabase.from('recorrencias').select('quantidade_total_parcelas, periodicidade, periodicidade_customizada_dias').eq('id', editingItem.recorrencia_id).maybeSingle(),
        supabase.from('lancamentos_financeiros').select('id, numero_parcela, data_vencimento, valor_previsto, valor_recebido, status_pagamento').eq('recorrencia_id', editingItem.recorrencia_id).order('numero_parcela', { ascending: true })
      ]);
      if (recurrence) {
        setAvrQuantity(String(recurrence.quantidade_total_parcelas || 1));
        setAvrPeriodicity(recurrence.periodicidade || 'mensal');
        setAvrCustomDays(String(recurrence.periodicidade_customizada_dias || 30));
      }
      setAvrHasReceived(
        Number(editingItem.valor_recebido) > 0 || (parcels || []).some((parcel: any) => Number(parcel.valor_recebido) > 0)
      );
      const loadedParcels = (parcels || []).map((parcel: any) => ({
        id: parcel.id,
        numero: parcel.numero_parcela || 1,
        data: parcel.data_vencimento,
        valor: parcel.id === editingItem.id && valorAVRPreset ? valorAVRPreset : formatBRL(parcel.valor_previsto),
        status: parcel.status_pagamento,
        valor_recebido: parcel.valor_recebido
      }));
      setAvrWithEntry(loadedParcels[0]?.data === editingItem.data_emissao);
      setAvrParcels(loadedParcels);
      setParcelasManuais(loadedParcels.map(({ id, status, ...parcel }) => parcel));
    };
    loadAVRData();
  }, [editingItem, categoriasAjuste, isEditing]);

  useEffect(() => {
    if (contas.length > 0 && !lancamentoFormDraft.conta_bancaria_id) {
      setLancamentoFormDraft({ conta_bancaria_id: contas[0].id });
    }
    if (centros.length > 0 && !lancamentoFormDraft.centro_custo_id) {
      setLancamentoFormDraft({ centro_custo_id: centros[0].id });
    }
  }, [contas, centros, isNovoLancamentoOpen, lancamentoFormDraft.conta_bancaria_id, lancamentoFormDraft.centro_custo_id]);

  const filteredCategorias = useMemo(() => {
    return categorias.filter(c => c.tipo === lancamentoFormDraft.tipo);
  }, [categorias, lancamentoFormDraft.tipo]);

  const entidadesCompativeis = useMemo(() => {
    const tipoPermitido = lancamentoFormDraft.tipo === 'saida' ? 'fornecedor' : 'cliente';
    return entidades.filter(e =>
      e.status_base !== 'inativo' &&
      e.status_base !== 'bpi' &&
      (e.tipo === tipoPermitido || e.tipo === 'ambos')
    );
  }, [entidades, lancamentoFormDraft.tipo]);

  useEffect(() => {
    if (
      lancamentoFormDraft.entidade_id &&
      entidades.length > 0 &&
      !entidadesCompativeis.some(entidade => entidade.id === lancamentoFormDraft.entidade_id)
    ) {
      setLancamentoFormDraft({ entidade_id: '' });
    }
  }, [entidades, entidadesCompativeis, lancamentoFormDraft.entidade_id]);

  useEffect(() => {
    if (filteredCategorias.length > 0 && !isEditing && !lancamentoFormDraft.categoria_id) {
      setLancamentoFormDraft({ categoria_id: filteredCategorias[0].id });
    }
  }, [filteredCategorias, isEditing]);

  // Parcel Generation Logic
  useEffect(() => {
    if (editingItem || isEditing) return; // Don't auto-generate when editing an existing one
    
    // Condition to show/generate parcels: either "A Prazo" OR "Repetir" (with more than 1 parcel)
    const isAPrazo = lancamentoFormDraft.condicao === 'a_prazo';
    const isRepeat = lancamentoFormDraft.recorrencia_repeat;
    const totalParcelas = parseInt(lancamentoFormDraft.quantidade_total_parcelas) || 1;

    if (!isAPrazo && !isRepeat) {
      setParcelasManuais([]);
      return;
    }

    if (totalParcelas < 1) return;

    const valorTotal = parseMoney(lancamentoFormDraft.valor_previsto);
    const novasParcelas = [];
    let currentDate = new Date(lancamentoFormDraft.data_vencimento + 'T00:00:00');

    // Sem data de vencimento válida não há como projetar as parcelas.
    if (Number.isNaN(currentDate.getTime())) {
      setParcelasManuais([]);
      return;
    }

    const valorPorParcela = isRepeat
      ? valorTotal
      : valorTotal / totalParcelas;

    for (let i = 1; i <= totalParcelas; i++) {
      novasParcelas.push({
        numero: i,
        data: currentDate.toISOString().split('T')[0],
        valor: formatBRL(valorPorParcela)
      });

      // Advance date
      if (lancamentoFormDraft.periodicidade === 'diario') currentDate.setDate(currentDate.getDate() + 1);
      else if (lancamentoFormDraft.periodicidade === 'semanal') currentDate.setDate(currentDate.getDate() + 7);
      else if (lancamentoFormDraft.periodicidade === 'quinzenal') currentDate.setDate(currentDate.getDate() + 15);
      else if (lancamentoFormDraft.periodicidade === 'mensal') currentDate.setMonth(currentDate.getMonth() + 1);
      else if (lancamentoFormDraft.periodicidade === 'bimestral') currentDate.setMonth(currentDate.getMonth() + 2);
      else if (lancamentoFormDraft.periodicidade === 'trimestral') currentDate.setMonth(currentDate.getMonth() + 3);
      else if (lancamentoFormDraft.periodicidade === 'semestral') currentDate.setMonth(currentDate.getMonth() + 6);
      else if (lancamentoFormDraft.periodicidade === 'anual') currentDate.setFullYear(currentDate.getFullYear() + 1);
      else if (lancamentoFormDraft.periodicidade === 'personalizado') {
        const dias = parseInt(lancamentoFormDraft.periodicidade_customizada_dias) || 30;
        currentDate.setDate(currentDate.getDate() + dias);
      }
    }

    setParcelasManuais(novasParcelas);
  }, [
    lancamentoFormDraft.condicao,
    lancamentoFormDraft.recorrencia_repeat,
    lancamentoFormDraft.valor_previsto,
    lancamentoFormDraft.quantidade_total_parcelas,
    lancamentoFormDraft.periodicidade,
    lancamentoFormDraft.periodicidade_customizada_dias,
    lancamentoFormDraft.data_vencimento,
    editingItem,
    isEditing
  ]);

  // Financial Calculations
  const calculations = useMemo(() => {
    const valorBase = parseMoney(lancamentoFormDraft.valor_previsto);
    
    const desconto = calculateAdjustmentAmount(
      lancamentoFormDraft.desconto_valor,
      lancamentoFormDraft.desconto_tipo,
      valorBase
    );

    const acrescimo = calculateAdjustmentAmount(
      lancamentoFormDraft.acrescimo_valor,
      lancamentoFormDraft.acrescimo_tipo,
      valorBase
    );

    const subtotal = valorBase - desconto + acrescimo;
    const recebido = parseMoney(lancamentoFormDraft.valor_recebido);
    const diferenca = recebido - subtotal;
    
    return {
      subtotal,
      diferenca,
      isTroco: diferenca > 0,
      isDevedor: diferenca < 0
    };
  }, [
    lancamentoFormDraft.valor_previsto,
    lancamentoFormDraft.desconto_valor,
    lancamentoFormDraft.desconto_tipo,
    lancamentoFormDraft.acrescimo_valor,
    lancamentoFormDraft.acrescimo_tipo,
    lancamentoFormDraft.valor_recebido
  ]);

  const printableDraftData: PrintableDocumentData = useMemo(() => {
    const draftParcels = parcelasManuais.length > 0
      ? parcelasManuais.map(parcel => ({
        number: parcel.numero,
        dueDate: parcel.data,
        amount: parseMoney(parcel.valor),
        paidAmount: 0,
        status: lancamentoFormDraft.ja_recebido ? 'pago' : 'aberto'
      }))
      : [{
        number: 1,
        dueDate: lancamentoFormDraft.data_vencimento,
        amount: parseMoney(lancamentoFormDraft.valor_previsto),
        paidAmount: parseMoney(lancamentoFormDraft.valor_recebido),
        status: lancamentoFormDraft.ja_recebido ? 'pago' : 'aberto'
      }];
    const recipient = entidades.find(entity => entity.id === lancamentoFormDraft.entidade_id)?.nome_razao_social || 'Não informado';
    const category = categorias.find(categoryItem => categoryItem.id === lancamentoFormDraft.categoria_id)?.nome;
    const account = contas.find(accountItem => accountItem.id === lancamentoFormDraft.conta_bancaria_id);
    const baseAmount = parseMoney(lancamentoFormDraft.valor_previsto);
    return {
      id: editingItem?.id,
      documentNumber: editingItem?.documento_numero || (editingItem?.codigo_sequencial ? String(editingItem.codigo_sequencial) : undefined),
      recipient,
      operation: lancamentoFormDraft.tipo,
      category,
      account: account?.nome_banco || account?.nome,
      issuer: user?.email || 'Sistema / Não informado',
      description: lancamentoFormDraft.observacoes,
      issueDate: lancamentoFormDraft.data_emissao,
      dueDate: lancamentoFormDraft.data_vencimento,
      paymentDate: lancamentoFormDraft.ja_recebido ? lancamentoFormDraft.data_pagamento : undefined,
      amount: baseAmount,
      receivedAmount: parseMoney(lancamentoFormDraft.valor_recebido),
      adjustedAmount: calculations.subtotal,
      adjustments: [
        { label: 'Desconto', value: `${lancamentoFormDraft.desconto_valor || '0,00'} ${lancamentoFormDraft.desconto_tipo === 'porcentagem' ? '%' : ''}`.trim() },
        { label: 'Acréscimo', value: `${lancamentoFormDraft.acrescimo_valor || '0,00'} ${lancamentoFormDraft.acrescimo_tipo === 'porcentagem' ? '%' : ''}`.trim() }
      ],
      parcels: draftParcels,
      status: lancamentoFormDraft.ja_recebido ? 'pago' : 'aberto',
      approvalStatus: editingItem?.status_aprovacao || 'Rascunho não salvo',
      provisional: true
    };
  }, [contas, categorias, calculations.subtotal, editingItem, entidades, lancamentoFormDraft, parcelasManuais, user?.email]);

  // Saldo Insuficiente validation (Item 1)
  const selectedConta = contas.find(c => c.id === lancamentoFormDraft.conta_bancaria_id);
  const isSaidaImediata = lancamentoFormDraft.tipo === 'saida' && lancamentoFormDraft.ja_recebido && !isAVREdit;
  const saldoRecebimento = Math.max(0, calculations.subtotal);
  const valorRecebido = parseMoney(lancamentoFormDraft.valor_recebido);
  const valorOperacaoSaida = isSaidaImediata && valorRecebido > 0 ? valorRecebido : 0;
  const saldoInsuficiente = isSaidaImediata && selectedConta
    ? valorOperacaoSaida > (selectedConta as any).saldo_real + 0.005
    : false;
  const recebimentoAcimaSaldo = lancamentoFormDraft.ja_recebido && valorRecebido > saldoRecebimento + 0.005;
  const pagamentoParcial = lancamentoFormDraft.ja_recebido && valorRecebido > 0 && valorRecebido < saldoRecebimento - 0.005;
  const persistedDescontoTipo = editingItem?.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const persistedAcrescimoTipo = editingItem?.acrescimo_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const hasPendingAdjustmentChanges = Boolean(editingItem) && (
    lancamentoFormDraft.desconto_tipo !== persistedDescontoTipo ||
    Math.abs(parseMoney(lancamentoFormDraft.desconto_valor) - (Number(editingItem?.desconto_valor) || 0)) > 0.005 ||
    lancamentoFormDraft.acrescimo_tipo !== persistedAcrescimoTipo ||
    Math.abs(parseMoney(lancamentoFormDraft.acrescimo_valor) - (Number(editingItem?.acrescimo_valor) || 0)) > 0.005
  );

  const isApproved = editingItem?.status_aprovacao === 'confirmado_master';
  const isMaster = role === 'master';
  const shouldLockFields = !isAVREdit && isApproved && !isMaster;
  const shouldLockEntity = isAVREdit ? avrHasReceived : shouldLockFields;

  const handleClose = () => {
    // Sessões de edição/preset escrevem dados de um registro existente no
    // rascunho; ao fechar, esse conteúdo não pode virar o próximo lançamento.
    if (isEditing || lancamentoPreset || avrPreset) {
      resetLancamentoFormDraft();
    }

    setModalOpen('isNovoLancamentoOpen', false);
    setSelectedLancamentoIdForModal(null);
    setSelectedRecorrenciaAction(null);
    setAvrPreset(null);
    setLancamentoPreset(null);
  };

  const generateAVRParcels = () => {
    const total = Math.max(1, Math.min(120, parseInt(avrQuantity) || 1));
    const amount = parseMoney(lancamentoFormDraft.valor_previsto) / total;
    const nextParcels = [];
    let currentDate = new Date(`${avrWithEntry ? lancamentoFormDraft.data_emissao : lancamentoFormDraft.data_vencimento}T00:00:00`);

    if (Number.isNaN(currentDate.getTime())) {
      showToast('Informe uma data válida antes de gerar as parcelas do AVR.', 'warning');
      return;
    }

    for (let index = 0; index < total; index += 1) {
      const existing = avrParcels[index];
      nextParcels.push({
        id: existing?.id,
        numero: index + 1,
        data: existing?.data || currentDate.toISOString().split('T')[0],
        valor: existing?.valor || formatBRL(amount),
        status: existing?.status || 'aberto',
        valor_recebido: existing?.valor_recebido
      });
      if (avrPeriodicity === 'diario') currentDate.setDate(currentDate.getDate() + 1);
      else if (avrPeriodicity === 'semanal') currentDate.setDate(currentDate.getDate() + 7);
      else if (avrPeriodicity === 'quinzenal') currentDate.setDate(currentDate.getDate() + 15);
      else if (avrPeriodicity === 'bimestral') currentDate.setMonth(currentDate.getMonth() + 2);
      else if (avrPeriodicity === 'trimestral') currentDate.setMonth(currentDate.getMonth() + 3);
      else if (avrPeriodicity === 'semestral') currentDate.setMonth(currentDate.getMonth() + 6);
      else if (avrPeriodicity === 'anual') currentDate.setFullYear(currentDate.getFullYear() + 1);
      else if (avrPeriodicity === 'personalizado') currentDate.setDate(currentDate.getDate() + (parseInt(avrCustomDays) || 30));
      else currentDate.setMonth(currentDate.getMonth() + 1);
    }
    setAvrParcels(nextParcels);
  };

  const handleAVRSubmit = async (propagationOverride?: 'none' | 'open') => {
    if (isEditing && !editingItem) {
      showToast(
        isEditingLoading
          ? 'Carregando lançamento selecionado. Tente novamente em instantes.'
          : 'Não foi possível carregar o lançamento selecionado.',
        'info'
      );
      return;
    }
    if (!editingItem || !avrReasonId) {
      showToast('Selecione um motivo para o AVR.', 'warning');
      return;
    }

    const selectedParcel = editingItem.recorrencia_id
      ? avrParcels.find(parcel => parcel.id === editingItem.id)
      : undefined;
    const selectedValue = editingItem.recorrencia_id
      ? parseMoney(selectedParcel?.valor)
      : parseMoney(avrSingleParcelValue);
    const selectedStatus = selectedParcel?.status ?? editingItem.status_pagamento;
    const selectedReceived = Number(selectedParcel?.valor_recebido ?? editingItem.valor_recebido ?? 0);

    if (selectedStatus !== 'aberto' || selectedReceived > 0) {
      showToast('Somente parcelas abertas e sem valor recebido podem ser ajustadas.', 'warning');
      setIsAVRConfirmationOpen(false);
      return;
    }
    if (selectedValue <= 0) {
      showToast('Informe um valor válido para a parcela.', 'warning');
      setIsAVRConfirmationOpen(false);
      return;
    }
    if (editingItem.recorrencia_id && avrParcels.length === 0) {
      showToast('Gere as parcelas do AVR antes de salvar.', 'warning');
      setIsAVRConfirmationOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await baixaLancamento({
        id: editingItem.id,
        data: {
          tipo_baixa: 'avr',
          valor_pago: selectedValue,
          parcela_valor: selectedValue,
          data_pagamento: lancamentoFormDraft.data_pagamento,
          conta_bancaria_id: lancamentoFormDraft.conta_bancaria_id,
          centro_custo_id: lancamentoFormDraft.centro_custo_id,
          categoria_id: lancamentoFormDraft.categoria_id,
          entidade_id: lancamentoFormDraft.entidade_id,
          condicao: lancamentoFormDraft.condicao,
          data_competencia: lancamentoFormDraft.data_competencia,
          data_emissao: lancamentoFormDraft.data_emissao,
          parcelas: editingItem.recorrencia_id ? avrParcels : undefined,
          parcela_config: editingItem.recorrencia_id ? {
            quantidade: Math.max(1, parseInt(avrQuantity) || avrParcels.length || 1),
            periodicidade: avrPeriodicity,
            periodicidade_customizada_dias: avrPeriodicity === 'personalizado' ? parseInt(avrCustomDays) || 30 : undefined,
            com_entrada: avrWithEntry
          } : undefined,
          motivo_ajuste: (categoriasAjuste as any[]).find(reason => reason.id === avrReasonId)?.nome,
          propagate_avr: propagationOverride ?? avrPropagation
        }
      });
      showToast('AVR atualizado com sucesso!', 'success');
      setIsAVRConfirmationOpen(false);
      resetAllDrafts();
      handleClose();
    } catch (err: any) {
      showToast('Ocorreu um problema: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && !editingItem) {
      showToast(
        isEditingLoading
          ? 'Carregando lançamento selecionado. Tente novamente em instantes.'
          : 'Não foi possível carregar o lançamento selecionado.',
        'info'
      );
      return;
    }
    if (editingItem && lancamentoFormDraft.ja_recebido && hasPendingAdjustmentChanges) {
      showToast('Salve o registro antes de marcar como recebido/pago.', 'warning');
      return;
    }
    if (isAVREdit) {
      if (!avrReasonId) {
        showToast('Selecione um motivo para o AVR.', 'warning');
        return;
      }
      setIsAVRConfirmationOpen(true);
      return;
    }
    setIsSubmitting(true);
    
    const val = parseMoney(lancamentoFormDraft.valor_previsto);
    if (isNaN(val) || val <= 0) {
      showToast('Por favor, informe um valor monetário válido.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (!lancamentoFormDraft.entidade_id) {
      showToast('Por favor, preencha o destinatário.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (!lancamentoFormDraft.condicao) {
      showToast('Selecione a condição de pagamento.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (!lancamentoFormDraft.conta_bancaria_id) {
      showToast('Por favor, selecione uma conta bancária.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (!lancamentoFormDraft.categoria_id) {
      showToast('Por favor, selecione uma categoria.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (!lancamentoFormDraft.centro_custo_id) {
      showToast('Por favor, selecione um centro de custo.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (parseMoney(lancamentoFormDraft.desconto_valor) > 0 && !lancamentoFormDraft.motivo_desconto_id) {
      showToast('Selecione um motivo para o desconto aplicado.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (parseMoney(lancamentoFormDraft.acrescimo_valor) > 0 && !lancamentoFormDraft.motivo_acrescimo_id) {
      showToast('Selecione um motivo para o acréscimo aplicado.', 'warning');
      setIsSubmitting(false);
      return;
    }

    if (recebimentoAcimaSaldo) {
      showToast('O valor recebido não pode ser maior que o saldo do lançamento.', 'warning');
      setIsSubmitting(false);
      return;
    }

    const itemDetails = {

      tipo: lancamentoFormDraft.tipo,
      valor_previsto: val,
      data_emissao: lancamentoFormDraft.data_emissao,
      data_vencimento: lancamentoFormDraft.data_vencimento,
      data_competencia: lancamentoFormDraft.data_competencia,
      data_pagamento: lancamentoFormDraft.ja_recebido ? lancamentoFormDraft.data_pagamento : null,
      entidade_id: lancamentoFormDraft.entidade_id || null,
      centro_custo_id: lancamentoFormDraft.centro_custo_id || null,
      categoria_id: lancamentoFormDraft.categoria_id || null,
      conta_bancaria_id: lancamentoFormDraft.conta_bancaria_id || null,
      status_pagamento: lancamentoFormDraft.ja_recebido && isMaster
        ? (pagamentoParcial ? 'pago_parcial' : 'pago')
        : 'aberto',
      status_aprovacao: lancamentoFormDraft.ja_recebido
        ? (isMaster ? 'confirmado_master' : 'pendente_digital')
        : (editingItem?.status_aprovacao || 'pendente_digital'),
      observacoes: lancamentoFormDraft.observacoes,
      condicao: lancamentoFormDraft.condicao,
      ja_recebido: lancamentoFormDraft.ja_recebido && !isMaster,
      desconto_valor: parseMoney(lancamentoFormDraft.desconto_valor),
      desconto_tipo: lancamentoFormDraft.desconto_tipo,
      motivo_desconto_id: parseMoney(lancamentoFormDraft.desconto_valor) > 0 ? (lancamentoFormDraft.motivo_desconto_id || null) : null,
      acrescimo_valor: parseMoney(lancamentoFormDraft.acrescimo_valor),
      acrescimo_tipo: lancamentoFormDraft.acrescimo_tipo,
      motivo_acrescimo_id: parseMoney(lancamentoFormDraft.acrescimo_valor) > 0 ? (lancamentoFormDraft.motivo_acrescimo_id || null) : null,
      valor_recebido: lancamentoFormDraft.ja_recebido && valorRecebido <= 0 ? saldoRecebimento : valorRecebido
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let createdItem;

      if (editingItem) {
        createdItem = await updateLancamento({
          id: editingItem.id,
          data: itemDetails,
          mode: selectedRecorrenciaAction || undefined
        });
        showToast('Lançamento atualizado com sucesso!', 'success');
      } else {
        let recurrencePayload = undefined;
        const isRecurrent = lancamentoFormDraft.condicao === 'a_prazo' || lancamentoFormDraft.recorrencia_repeat;
        
        if (isRecurrent && parcelasManuais.length > 0) {
          recurrencePayload = {
            periodicidade: lancamentoFormDraft.periodicidade,
            periodicidade_customizada_dias: lancamentoFormDraft.periodicidade === 'personalizado' ? parseInt(lancamentoFormDraft.periodicidade_customizada_dias) : undefined,
            quantidade_total_parcelas: parcelasManuais.length,
            parcelas: parcelasManuais.map(p => ({
              data_vencimento: p.data,
              valor_previsto: parseMoney(p.valor)
            }))
          };
        }

        createdItem = await createLancamento({
          item: itemDetails,
          recorrencia: recurrencePayload
        });
      }

      // Handle Attachments
      const lancamentoId = editingItem ? editingItem.id : (createdItem as any)?.id;
      if (lancamentoId && attachments.length > 0) {
        for (const attachment of attachments) {
          const fileExt = (attachment as LocalFile).name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `lancamentos/${lancamentoId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, (attachment as LocalFile).file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('documents')
              .getPublicUrl(filePath);

            await (supabase.from('lancamento_anexos') as any).insert({
              lancamento_id: lancamentoId,
              nome: (attachment as LocalFile).name,
              url: publicUrl,
              tamanho: (attachment as LocalFile).size,
              tipo_arquivo: (attachment as LocalFile).type,
              user_id: user?.id
            });
          } else {
            console.error('Erro ao subir anexo:', uploadError);
          }
        }
      }

      showToast(editingItem ? 'Lançamento atualizado!' : 'Lançamento cadastrado com sucesso!', 'success');
      if (!editingItem && lancamentoPreset && (createdItem as any)?.id) {
        const lancamentoId = (createdItem as any).id as string;
        if (lancamentoPreset.transacaoBancoId) {
          try {
            await conciliacaoService.conciliar({
              transacaoBancoId: lancamentoPreset.transacaoBancoId,
              lancamentoIds: [lancamentoId],
            });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['transacoesBanco'] }),
              queryClient.invalidateQueries({ queryKey: ['conciliacoes'] }),
              queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
              queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }),
              queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }),
            ]);
            showToast('Lançamento criado e conciliado com o extrato', 'success');
          } catch (error) {
            showToast(`Lançamento criado, mas não foi possível conciliá-lo: ${error instanceof Error ? error.message : 'erro desconhecido'}`, 'error');
            setConciliacaoPosLancamento({ lancamentoId, dataExtrato: lancamentoPreset.dataExtrato });
          }
        } else {
          setConciliacaoPosLancamento({ lancamentoId, dataExtrato: lancamentoPreset.dataExtrato });
        }
        setLancamentoPreset(null);
      }
      resetAllDrafts();
      setAttachments([]);
      handleClose();
    } catch (err: any) {
      showToast('Ocorreu um problema: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Action Modal States
  const [isQuickCatOpen, setIsQuickCatOpen] = useState(false);
  const [isQuickCCOpen, setIsQuickCCOpen] = useState(false);
  const [isQuickAccountOpen, setIsQuickAccountOpen] = useState(false);
  const [isQuickReasonOpen, setIsQuickReasonOpen] = useState(false);

  // Quick Action Form States
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCCName, setQuickCCName] = useState('');
  const [quickAccountName, setQuickAccountName] = useState('');
  const [quickAccountSaldo, setQuickAccountSaldo] = useState('0,00');
  const [quickAddReasonType, setQuickAddReasonType] = useState<'desconto' | 'acrescimo'>('desconto');
  const [quickReasonName, setQuickReasonName] = useState('');

  const handleQuickCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newCat = await createCategory({ nome: quickCatName, tipo: lancamentoFormDraft.tipo });
      if (newCat) setLancamentoFormDraft({ categoria_id: (newCat as any).id });
      setIsQuickCatOpen(false);
      setQuickCatName('');
      showToast('Categoria criada!', 'success');
    } catch (err) { showToast('Erro ao criar categoria', 'error'); }
  };

  const handleQuickCCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newCC = await createCC({ nome: quickCCName, descricao: '' });
      if (newCC) setLancamentoFormDraft({ centro_custo_id: (newCC as any).id });
      setIsQuickCCOpen(false);
      setQuickCCName('');
      showToast('Centro de custo criado!', 'success');
    } catch (err) { showToast('Erro ao criar centro', 'error'); }
  };

  const handleQuickAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newAccount = await createAccount({
        nome_banco: quickAccountName,
        nome: quickAccountName,
        saldo_inicial: parseMoney(quickAccountSaldo),
        agencia: '0001',
        conta: '0-0',
        data_abertura: new Date().toISOString()
      });
      if (newAccount) setLancamentoFormDraft({ conta_bancaria_id: (newAccount as any).id });
      setIsQuickAccountOpen(false);
      setQuickAccountName('');
      setQuickAccountSaldo('0,00');
      showToast('Conta bancária criada!', 'success');
    } catch (err) { showToast('Erro ao criar conta', 'error'); }
  };

  const handleQuickReasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createCategoriaAjuste({ nome: quickReasonName, tipo: quickAddReasonType });
      if (quickAddReasonType === 'desconto') {
        setLancamentoFormDraft({ motivo_desconto_id: (result as any).id });
      } else {
        setLancamentoFormDraft({ motivo_acrescimo_id: (result as any).id });
      }
      setIsQuickReasonOpen(false);
      setQuickReasonName('');
      showToast('Motivo criado!', 'success');
    } catch (err) { showToast('Erro ao criar motivo', 'error'); }
  };

  return (
    <>
      <PrintDocumentSelector data={printableDraftData} open={isPrintOpen} onClose={() => setIsPrintOpen(false)} />
      <AnimatePresence>
        {isNovoLancamentoOpen && (
          <div className="fixed inset-0 z-[250] flex justify-end overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs transition-opacity duration-300"
            />

            {/* Slide body */}
            <motion.form 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onSubmit={handleFormSubmit}
              className="w-full md:w-[550px] h-full bg-surface shadow-2xl flex flex-col relative z-20"
            >
              <header className="flex items-center justify-between px-6 py-5 border-b border-surface-border bg-surface shrink-0">
                <div>
                  <h2 className="text-headline-sm text-on-surface font-black tracking-tight uppercase">
                    {isEditing ? 'Editar Lançamento' : 'Novo Lançamento'}
                  </h2>
                  <span className="text-[10px] uppercase font-black text-primary block mt-0.5 tracking-widest">
                    {isEditing ? 'Ajuste de registro' : 'Inserir nova previsão financeira'}
                  </span>
                  {editingItem?.codigo_sequencial && (
                    <span className="text-[9px] uppercase font-black text-secondary block mt-2 tracking-widest">
                      Código da conta: {editingItem.codigo_sequencial}{editingItem.numero_parcela ? `-${editingItem.numero_parcela}` : ''}
                    </span>
                  )}
                </div>

                <button 
                  type="button" 
                  onClick={handleClose}
                  className="text-secondary hover:text-on-surface p-2 rounded-xl hover:bg-neutral-100 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {editingItem && editingItem.recorrencia_id && (
                  <div className="p-4 bg-pending-amber/10 border-2 border-pending-amber/20 rounded-xl text-xs text-on-surface-variant flex gap-3">
                    <AlertCircle className="w-5 h-5 text-pending-amber shrink-0" />
                    <span className="font-semibold">
                      <strong>Pendente de Aprovação:</strong> Este registro ainda não foi validado pelo nível Master.
                    </span>
                  </div>
                )}

                {isApproved && (
                  <div className="p-4 bg-bank-truth-green/10 border-2 border-bank-truth-green/20 rounded-xl text-xs text-on-surface-variant flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-bank-truth-green shrink-0" />
                    <span className="font-semibold">
                      <strong>Lançamento Aprovado:</strong> Alguns campos foram bloqueados para garantir a integridade da aprovação do Master.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Direcionador de Fluxo Contábil</label>
                  <div className={`flex bg-neutral-100 dark:bg-surface-container border-2 border-neutral-100 dark:border-surface-border rounded-xl p-1 h-12 select-none ${shouldLockFields ? 'opacity-50 pointer-events-none' : ''}`}>
                    <button
                      type="button"
                      disabled={shouldLockFields}
                      onClick={() => setLancamentoFormDraft({ tipo: 'entrada', categoria_id: '' })}
                      className={`flex-1 text-xs font-black rounded-lg transition-all uppercase tracking-tighter ${
                        lancamentoFormDraft.tipo === 'entrada'
                          ? 'bg-white dark:bg-surface text-bank-truth-green shadow-sm'
                          : 'text-secondary hover:text-on-surface'
                      }`}
                    >
                      Receita / Entrada
                    </button>
                    <button
                      type="button"
                      disabled={shouldLockFields}
                      onClick={() => setLancamentoFormDraft({ tipo: 'saida', categoria_id: '' })}
                      className={`flex-1 text-xs font-black rounded-lg transition-all uppercase tracking-tighter ${
                        lancamentoFormDraft.tipo === 'saida'
                          ? 'bg-white dark:bg-surface text-alert-red shadow-sm'
                          : 'text-secondary hover:text-on-surface'
                      }`}
                    >
                      Despesa / Saída
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className={shouldLockEntity ? 'opacity-50 pointer-events-none' : ''}>
                    <SearchableSelect
                      label="Entidade / Destinatário"
                      placeholder="Selecione um cliente / fornecedor"
                      value={lancamentoFormDraft.entidade_id}
                      onChange={(val) => setLancamentoFormDraft({ entidade_id: val })}
                      options={entidadesCompativeis.map(e => ({
                        id: e.id,
                        label: e.nome_razao_social,
                        sublabel: e.tipo.toUpperCase()
                      }))}
                      required
                      disabled={shouldLockEntity}
                      onAddClick={shouldLockEntity ? undefined : () => {
                        setEntidadeFormDraft({ tipo: lancamentoFormDraft.tipo === 'saida' ? 'fornecedor' : 'cliente' });
                        setModalOpen('isCadastroRapidoOpen', true);
                      }}
                    />
                  </div>
                </div>

                <div className={`grid gap-4 ${isAVREdit ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {!isAVREdit && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Valor Estimado <span className="text-alert-red">*</span></label>
                      <div className={`relative group ${shouldLockFields ? 'opacity-50 pointer-events-none' : ''}`}>
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-secondary font-black">R$</span>
                        <MoneyInput
                          value={lancamentoFormDraft.valor_previsto}
                          onChange={(val) => setLancamentoFormDraft({ valor_previsto: val })}
                          className="w-full h-12 pl-10 pr-4 bg-white border-2 border-neutral-200 rounded-xl font-mono text-sm font-black text-on-surface focus:outline-none focus:border-primary transition-all shadow-xs"
                          placeholder="0,00"
                          required
                          disabled={shouldLockFields}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Condição <span className="text-alert-red">*</span></label>
                      <label className={`flex items-center gap-2 cursor-pointer select-none ${shouldLockFields ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                          type="checkbox"
                          disabled={shouldLockFields}
                          checked={lancamentoFormDraft.recorrencia_repeat}
                          onChange={(e) => setLancamentoFormDraft({ recorrencia_repeat: e.target.checked })}
                          className="rounded-md border-neutral-300 text-primary focus:ring-primary w-4 h-4 transition-all"
                        />
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Repetir</span>
                      </label>
                    </div>
                    <div className={`flex bg-neutral-100 dark:bg-surface-container border-2 border-neutral-100 dark:border-surface-border rounded-xl p-1 h-12 select-none ${shouldLockFields ? 'opacity-50 pointer-events-none' : ''}`}>
                      <button
                        type="button"
                        disabled={shouldLockFields}
                        onClick={() => setLancamentoFormDraft({ condicao: 'a_vista' })}
                        className={`flex-1 text-[10px] font-black rounded-lg transition-all uppercase tracking-tighter ${
                          lancamentoFormDraft.condicao === 'a_vista'
                            ? 'bg-white dark:bg-surface text-primary shadow-sm'
                            : 'text-secondary hover:text-on-surface'
                        }`}
                      >
                        À Vista
                      </button>
                      <button
                        type="button"
                        disabled={shouldLockFields}
                        onClick={() => setLancamentoFormDraft({ condicao: 'a_prazo' })}
                        className={`flex-1 text-[10px] font-black rounded-lg transition-all uppercase tracking-tighter ${
                          lancamentoFormDraft.condicao === 'a_prazo'
                            ? 'bg-white dark:bg-surface text-primary shadow-sm'
                            : 'text-secondary hover:text-on-surface'
                        }`}
                      >
                        A Prazo
                      </button>
                    </div>
                  </div>

                </div>

                {!isAVREdit && (
                  <div className="p-4 bg-neutral-50 rounded-2xl border-2 border-neutral-100 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={lancamentoFormDraft.ja_recebido} 
                      onChange={(e) => setLancamentoFormDraft({ ja_recebido: e.target.checked })}
                      className="rounded-md border-neutral-300 text-primary focus:ring-primary w-5 h-5 transition-all"
                    />
                    <span className="font-black text-[10px] text-on-background uppercase tracking-wider">Já foi recebido / pago?</span>
                  </label>

                  {lancamentoFormDraft.ja_recebido && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Data do Recebimento</label>
                          <input
                            type="date"
                            value={lancamentoFormDraft.data_pagamento}
                            onChange={(e) => setLancamentoFormDraft({ data_pagamento: e.target.value })}
                            className="w-full h-10 bg-white border-2 border-neutral-200 text-xs font-bold rounded-lg px-3 focus:outline-none focus:border-primary shadow-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Valor Recebido</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-secondary font-black">R$</span>
                            <MoneyInput
                              value={lancamentoFormDraft.valor_recebido}
                              onChange={(val) => setLancamentoFormDraft({ valor_recebido: val })}
                              className="w-full h-10 pl-8 pr-3 bg-white border-2 border-neutral-200 rounded-lg font-mono text-xs font-black text-on-surface focus:outline-none focus:border-primary shadow-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {(!role || role !== 'master') && (
                        <div className="p-3 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-[8px] font-black text-neutral-500 uppercase tracking-tighter">
                            Este pagamento afetará apenas o <span className="text-primary">Saldo Operacional</span> até ser validado pelo Master.
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Data de Competência</label>
                    <input
                      type="date"
                      disabled={shouldLockFields}
                      value={lancamentoFormDraft.data_competencia}
                      onChange={(e) => setLancamentoFormDraft({ data_competencia: e.target.value })}
                      className={`w-full h-12 bg-white border-2 border-neutral-200 text-sm font-bold rounded-xl focus:outline-none focus:border-primary transition-all px-4 shadow-xs ${shouldLockFields ? 'opacity-50' : ''}`}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Data de Vencimento <span className="text-alert-red">*</span></label>
                    <input
                      type="date"
                      required
                      disabled={shouldLockFields}
                      value={lancamentoFormDraft.data_vencimento}
                      onChange={(e) => setLancamentoFormDraft({ data_vencimento: e.target.value })}
                      className={`w-full h-12 bg-white border-2 border-neutral-200 text-sm font-bold rounded-xl focus:outline-none focus:border-primary transition-all px-4 shadow-xs ${shouldLockFields ? 'opacity-50' : ''}`}
                    />
                  </div>
                </div>

                {!isAVREdit && (
                  <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Desconto</label>
                      <div className="flex bg-neutral-100 rounded-lg p-0.5">
                        <button type="button" onClick={() => setLancamentoFormDraft({ desconto_tipo: 'valor' })} className={`px-1.5 py-0.5 text-[9px] font-black rounded ${lancamentoFormDraft.desconto_tipo === 'valor' ? 'bg-white shadow-sm text-primary' : 'text-neutral-400'}`}>R$</button>
                        <button type="button" onClick={() => setLancamentoFormDraft({ desconto_tipo: 'porcentagem' })} className={`px-1.5 py-0.5 text-[9px] font-black rounded ${lancamentoFormDraft.desconto_tipo === 'porcentagem' ? 'bg-white shadow-sm text-primary' : 'text-neutral-400'}`}>%</button>
                      </div>
                    </div>
                    <MoneyInput
                      value={lancamentoFormDraft.desconto_valor}
                      onChange={(val) => setLancamentoFormDraft({ desconto_valor: val })}
                      className="w-full h-12 px-4 bg-white border-2 border-neutral-200 rounded-xl font-mono text-sm font-black text-on-surface focus:outline-none focus:border-primary transition-all shadow-xs"
                    />

                    {parseMoney(lancamentoFormDraft.desconto_valor) > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 overflow-hidden">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Motivo do Desconto <span className="text-alert-red">*</span></label>
                          <button
                            type="button"
                            onClick={() => { setQuickAddReasonType('desconto'); setIsQuickReasonOpen(true); }}
                            className="text-[8px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-2.5 h-2.5" /> Novo
                          </button>
                        </div>
                        <select
                          value={lancamentoFormDraft.motivo_desconto_id}
                          onChange={(e) => setLancamentoFormDraft({ motivo_desconto_id: e.target.value })}
                          className={`w-full h-10 bg-neutral-50 border-2 rounded-xl px-3 text-[10px] font-bold outline-none appearance-none cursor-pointer transition-all ${
                            lancamentoFormDraft.motivo_desconto_id ? 'border-neutral-100' : 'border-alert-red/30'
                          }`}
                        >
                          <option value="">Selecione o motivo...</option>
                          {categoriasAjuste.filter((c: any) => c.tipo === 'desconto' && c.status !== 'inativo').map((r: any) => (
                            <option key={r.id} value={r.id}>{r.nome}</option>
                          ))}
                        </select>
                      </motion.div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Acréscimo</label>
                      <div className="flex bg-neutral-100 rounded-lg p-0.5">
                        <button type="button" onClick={() => setLancamentoFormDraft({ acrescimo_tipo: 'valor' })} className={`px-1.5 py-0.5 text-[9px] font-black rounded ${lancamentoFormDraft.acrescimo_tipo === 'valor' ? 'bg-white shadow-sm text-primary' : 'text-neutral-400'}`}>R$</button>
                        <button type="button" onClick={() => setLancamentoFormDraft({ acrescimo_tipo: 'porcentagem' })} className={`px-1.5 py-0.5 text-[9px] font-black rounded ${lancamentoFormDraft.acrescimo_tipo === 'porcentagem' ? 'bg-white shadow-sm text-primary' : 'text-neutral-400'}`}>%</button>
                      </div>
                    </div>
                    <MoneyInput
                      value={lancamentoFormDraft.acrescimo_valor}
                      onChange={(val) => setLancamentoFormDraft({ acrescimo_valor: val })}
                      className="w-full h-12 px-4 bg-white border-2 border-neutral-200 rounded-xl font-mono text-sm font-black text-on-surface focus:outline-none focus:border-primary transition-all shadow-xs"
                    />

                    {parseMoney(lancamentoFormDraft.acrescimo_valor) > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 overflow-hidden">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Motivo do Acréscimo <span className="text-alert-red">*</span></label>
                          <button
                            type="button"
                            onClick={() => { setQuickAddReasonType('acrescimo'); setIsQuickReasonOpen(true); }}
                            className="text-[8px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-2.5 h-2.5" /> Novo
                          </button>
                        </div>
                        <select
                          value={lancamentoFormDraft.motivo_acrescimo_id}
                          onChange={(e) => setLancamentoFormDraft({ motivo_acrescimo_id: e.target.value })}
                          className={`w-full h-10 bg-neutral-50 border-2 rounded-xl px-3 text-[10px] font-bold outline-none appearance-none cursor-pointer transition-all ${
                            lancamentoFormDraft.motivo_acrescimo_id ? 'border-neutral-100' : 'border-alert-red/30'
                          }`}
                        >
                          <option value="">Selecione o motivo...</option>
                          {categoriasAjuste.filter((c: any) => c.tipo === 'acrescimo' && c.status !== 'inativo').map((r: any) => (
                            <option key={r.id} value={r.id}>{r.nome}</option>
                          ))}
                        </select>
                      </motion.div>
                    )}
                  </div>
                </div>
                )}

                <div className="flex flex-col gap-2 border-y-2 border-neutral-50 py-4">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Subtotal</span>
                    <span className="text-sm font-black text-neutral-900">R$ {formatBRL(calculations.subtotal)}</span>
                  </div>
                  
                  {lancamentoFormDraft.ja_recebido && (
                    <div className="flex justify-between items-center px-2 mt-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${recebimentoAcimaSaldo ? 'text-alert-red' : pagamentoParcial ? 'text-alert-red' : 'text-bank-truth-green'}`}>
                        {recebimentoAcimaSaldo ? 'Valor acima do saldo' : pagamentoParcial ? 'Pago Parcial' : 'Liquidado, Pago'}
                      </span>
                      <span className={`text-sm font-black ${recebimentoAcimaSaldo || pagamentoParcial ? 'text-alert-red' : 'text-bank-truth-green'}`}>
                        R$ {formatBRL(recebimentoAcimaSaldo ? valorRecebido - saldoRecebimento : Math.max(0, saldoRecebimento - valorRecebido))}
                      </span>
                    </div>
                  )}

                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={shouldLockFields ? 'opacity-50 pointer-events-none' : ''}>
                    <SearchableSelect
                      label="Categoria Contábil"
                      placeholder="Selecione..."
                      value={lancamentoFormDraft.categoria_id}
                      onChange={(val) => setLancamentoFormDraft({ categoria_id: val })}
                      options={filteredCategorias.map(c => ({
                        id: c.id,
                        label: c.nome
                      }))}
                      required
                      onQuickAddClick={shouldLockFields ? undefined : () => setIsQuickCatOpen(true)}
                      quickAddLabel="Nova Categoria"
                    />
                  </div>

                  <div className={shouldLockFields ? 'opacity-50 pointer-events-none' : ''}>
                    <SearchableSelect
                      label="Centro de Custo"
                      placeholder="Selecione..."
                      value={lancamentoFormDraft.centro_custo_id}
                      onChange={(val) => setLancamentoFormDraft({ centro_custo_id: val })}
                      options={centros.map(cc => ({
                        id: cc.id,
                        label: cc.nome
                      }))}
                      required
                      onQuickAddClick={shouldLockFields ? undefined : () => setIsQuickCCOpen(true)}
                      quickAddLabel="Novo Centro de Custo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Conta Bancária <span className="text-alert-red">*</span></label>
                      <button type="button" onClick={() => setIsQuickAccountOpen(true)} className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1"><Plus className="w-3 h-3" /> Nova Conta</button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {contas.length === 0 ? (
                        <div className="p-4 border-2 border-dashed border-alert-red/30 bg-alert-red/5 rounded-xl text-center">
                          <p className="text-[10px] font-black text-alert-red uppercase tracking-widest mb-2">Nenhuma conta cadastrada!</p>
                          <button
                            type="button"
                            onClick={() => setIsQuickAccountOpen(true)}
                            className="text-[9px] font-black text-primary uppercase hover:underline"
                          >
                            Clique aqui para criar sua primeira conta
                          </button>
                        </div>
                      ) : (
                        contas.map(cnt => (
                          <button
                            key={cnt.id}
                            type="button"
                            onClick={() => setLancamentoFormDraft({ conta_bancaria_id: cnt.id })}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                              lancamentoFormDraft.conta_bancaria_id === cnt.id
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-neutral-100 hover:border-neutral-200 bg-white'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center overflow-hidden shrink-0 border border-neutral-200">
                              {cnt.logo_url ? (
                                <img src={cnt.logo_url} alt="Logo" className="w-full h-full object-cover" />
                              ) : (
                                <Banknote className="w-4 h-4 text-neutral-400" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-black uppercase text-neutral-900 truncate">{cnt.nome_banco || cnt.nome}</span>
                              <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest">Saldo Real: R$ {formatBRL((cnt as any).saldo_real)}</span>
                            </div>
                            {lancamentoFormDraft.conta_bancaria_id === cnt.id && (
                              <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Data de Emissão</label>
                    <input
                      type="date"
                      disabled={shouldLockFields}
                      value={lancamentoFormDraft.data_emissao}
                      onChange={(e) => setLancamentoFormDraft({ data_emissao: e.target.value })}
                      className={`w-full h-12 bg-white border-2 border-neutral-200 text-sm font-bold rounded-xl focus:outline-none focus:border-primary transition-all px-4 shadow-xs ${shouldLockFields ? 'opacity-50' : ''}`}
                    />
                  </div>
                </div>

                {/* Seção de Parcelamento / Repetição */}
                {!isEditing && (lancamentoFormDraft.condicao === 'a_prazo' || lancamentoFormDraft.recorrencia_repeat) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-neutral-50 dark:bg-surface-container border-2 border-neutral-100 dark:border-surface-border rounded-2xl space-y-6"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          {lancamentoFormDraft.recorrencia_repeat ? <Repeat className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                        </div>
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-tight text-on-surface">
                            {lancamentoFormDraft.recorrencia_repeat ? 'Configuração de Repetição' : 'Configuração de Parcelas'}
                          </h3>
                          <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">Defina como os lançamentos serão gerados</p>
                        </div>
                      </div>
                      
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Com Entrada?</span>
                        <div
                          onClick={() => setLancamentoFormDraft({ recorrencia_com_entrada: !lancamentoFormDraft.recorrencia_com_entrada })}
                          className={`w-10 h-5 rounded-full transition-all relative ${lancamentoFormDraft.recorrencia_com_entrada ? 'bg-primary' : 'bg-neutral-300'}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${lancamentoFormDraft.recorrencia_com_entrada ? 'left-6' : 'left-1'}`} />
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Nº vezes</span>
                        <div className="relative">
                          <Hash className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                          <input
                            type="number"
                            min="1"
                            max="120"
                            value={lancamentoFormDraft.quantidade_total_parcelas}
                            onChange={(e) => setLancamentoFormDraft({ quantidade_total_parcelas: e.target.value })}
                            className="w-full h-10 pl-9 pr-3 bg-white border-2 border-neutral-200 text-xs font-bold rounded-lg focus:outline-none focus:border-primary shadow-xs"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Intervalo</span>
                        <select
                          value={lancamentoFormDraft.periodicidade}
                          onChange={(e) => setLancamentoFormDraft({ periodicidade: e.target.value as any })}
                          className="w-full h-10 bg-white border-2 border-neutral-200 text-xs font-bold rounded-lg px-3 focus:outline-none focus:border-primary shadow-xs cursor-pointer appearance-none"
                        >
                          <option value="diario">Diário</option>
                          <option value="semanal">Semanal</option>
                          <option value="quinzenal">Quinzenal</option>
                          <option value="mensal">Mensal</option>
                          <option value="bimestral">Bimestral</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semanal</option>
                          <option value="anual">Anual</option>
                          <option value="personalizado">Personalizado</option>
                        </select>
                      </div>

                      {lancamentoFormDraft.periodicidade === 'personalizado' && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-secondary uppercase tracking-widest">Qtd Dias</span>
                          <input
                            type="number"
                            min="1"
                            value={lancamentoFormDraft.periodicidade_customizada_dias}
                            onChange={(e) => setLancamentoFormDraft({ periodicidade_customizada_dias: e.target.value })}
                            className="w-full h-10 bg-white border-2 border-neutral-200 text-xs font-bold rounded-lg px-3 focus:outline-none focus:border-primary shadow-xs"
                          />
                        </div>
                      )}
                    </div>

                    {parcelasManuais.length > 0 && (
                      <div className="mt-4 border-2 border-neutral-100 rounded-xl overflow-hidden bg-white">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                              <th className="px-3 py-2 text-[9px] font-black text-secondary uppercase tracking-widest text-left w-16">Parc.</th>
                              <th className="px-3 py-2 text-[9px] font-black text-secondary uppercase tracking-widest text-left">Vencimento</th>
                              <th className="px-3 py-2 text-[9px] font-black text-secondary uppercase tracking-widest text-left">Valor (R$)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {parcelasManuais.map((parc, idx) => (
                              <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                                <td className="px-3 py-2 text-xs font-black text-neutral-400">
                                  {lancamentoFormDraft.recorrencia_com_entrada && idx === 0 ? 'ENTRADA' : `#${parc.numero}`}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="date"
                                    value={idx === 0 ? lancamentoFormDraft.data_vencimento : parc.data}
                                    onChange={(e) => {
                                      if (idx === 0) {
                                        setLancamentoFormDraft({ data_vencimento: e.target.value });
                                        return;
                                      }
                                      const newParcels = [...parcelasManuais];
                                      newParcels[idx].data = e.target.value;
                                      setParcelasManuais(newParcels);
                                    }}
                                    className="w-full bg-transparent border-none text-[11px] font-bold text-on-surface focus:ring-0 p-1"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <MoneyInput
                                    value={parc.valor}
                                    onChange={(val) => {
                                      const newParcels = [...parcelasManuais];
                                      newParcels[idx].valor = val;
                                      setParcelasManuais(newParcels);
                                    }}
                                    className="w-full bg-transparent border-none text-[11px] font-black text-on-surface focus:ring-0 p-1 font-mono"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </motion.div>
                )}

                {editingItem && (
                  <div className="p-5 bg-primary/5 border-2 border-primary/20 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-primary">Ajuste de Valor Real (AVR)</h3>
                        <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mt-1">Mantém o mesmo painel de edição e não gera movimentação de caixa</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAVREdit(!isAVREdit)}
                        className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest ${isAVREdit ? 'bg-primary text-white' : 'bg-white text-primary border border-primary/20'}`}
                      >
                        {isAVREdit ? 'AVR Ativo' : 'Usar AVR'}
                      </button>
                    </div>
                    {isAVREdit && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-primary tracking-widest">Motivo do AVR *</label>
                            <select value={avrReasonId} onChange={(e) => setAvrReasonId(e.target.value)} className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-[10px] font-bold outline-none focus:border-primary">
                              <option value="">Selecione o motivo...</option>
                              {(categoriasAjuste as any[]).filter(reason => reason.tipo === 'avr' && reason.status !== 'inativo').map(reason => <option key={reason.id} value={reason.id}>{reason.nome}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-primary tracking-widest">Novo valor original</label>
                            <MoneyInput value={lancamentoFormDraft.valor_previsto} onChange={() => undefined} disabled className="w-full h-10 bg-neutral-100 border-2 border-primary/10 rounded-xl px-3 text-xs font-black outline-none cursor-not-allowed" />
                          </div>
                        </div>

                        {!editingItem.recorrencia_id && (
                          <div className="space-y-2 border-t border-primary/10 pt-4">
                            <label className="text-[9px] font-black uppercase text-primary tracking-widest">Novo valor da parcela *</label>
                            <MoneyInput value={avrSingleParcelValue} onChange={setAvrSingleParcelValue} className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-black outline-none focus:border-primary" />
                          </div>
                        )}

                        {lancamentoFormDraft.condicao === 'a_prazo' && editingItem.recorrencia_id && (
                          <div className="space-y-3 border-t border-primary/10 pt-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-secondary">Nº vezes</span><input type="number" min="1" max="120" value={avrQuantity} onChange={(e) => setAvrQuantity(e.target.value)} className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold" /></label>
                              <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-secondary">Intervalo</span><select value={avrPeriodicity} onChange={(e) => setAvrPeriodicity(e.target.value)} className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold"><option value="diario">Diário</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="personalizado">Personalizado</option></select></label>
                              {avrPeriodicity === 'personalizado' && <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-secondary">Qtd. dias</span><input type="number" min="1" value={avrCustomDays} onChange={(e) => setAvrCustomDays(e.target.value)} className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold" /></label>}
                            </div>
                            <label className="flex items-center gap-2 text-[9px] font-black uppercase text-secondary"><input type="checkbox" checked={avrWithEntry} onChange={(e) => setAvrWithEntry(e.target.checked)} className="rounded text-primary" /> Com entrada</label>
                            <button type="button" onClick={generateAVRParcels} className="w-full h-10 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest">Gerar / Atualizar Parcelas</button>
                            {avrParcels.length > 0 && <div className="border-2 border-primary/10 rounded-xl overflow-hidden bg-white"><table className="w-full"><tbody>{avrParcels.map((parcel, index) => { const parcelLocked = parcel.status !== 'aberto' || Number(parcel.valor_recebido) > 0; return <tr key={`${parcel.id || 'new'}-${parcel.numero}`} className="border-b border-primary/10"><td className="px-2 py-2 text-[10px] font-black">#{parcel.numero}</td><td className="px-1 py-1"><input type="date" disabled={parcelLocked} value={parcel.data} onChange={(e) => setAvrParcels(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, data: e.target.value } : item))} className="w-full border-none text-[10px]" /></td><td className="px-1 py-1"><MoneyInput disabled={parcelLocked} value={parcel.valor} onChange={(value) => setAvrParcels(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, valor: value } : item))} className="w-full border-none text-[10px] font-black" /></td></tr>; })}</tbody></table></div>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Nota Fiscal / Produto</label>
                  <div className="relative group cursor-pointer h-12 border-2 border-dashed border-neutral-200 rounded-xl hover:border-primary transition-all flex items-center justify-center gap-2 text-secondary hover:text-primary bg-neutral-50/50">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase">{(attachments.length + (existingAnexos?.length || 0)) > 0 ? `${attachments.length + (existingAnexos?.length || 0)} Anexo(s)` : 'Anexar Documento'}</span>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          const fileList = Array.from(e.target.files) as File[];
                          const newFiles: LocalFile[] = fileList.map(f => ({
                            name: f.name,
                            size: f.size,
                            type: f.type,
                            file: f
                          }));
                          setAttachments(prev => [...prev, ...newFiles]);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Existing Remote Attachments */}
                  {existingAnexos && existingAnexos.map((anexo: any, index: number) => (
                    <div key={`comprovante-${index}`} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <a
                          href={anexo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold truncate max-w-[150px] hover:underline text-primary"
                        >
                          {anexo.nome} (Salvo)
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Excluir este anexo permanentemente?')) {
                            const path = anexo.url.split('documents/')[1];
                            deleteAnexo({ id: anexo.id, path });
                          }
                        }}
                        className="text-neutral-400 hover:text-alert-red transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Local Files to be Uploaded */}
                  {attachments.map((f, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-100 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold truncate max-w-[150px]">{(f as LocalFile).name}</span>
                      </div>
                      <button type="button" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-alert-red transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Observações Contábeis</label>
                  <textarea
                    rows={4}
                    readOnly={isEditing}
                    placeholder="Digite descrições detalhadas..."
                    value={lancamentoFormDraft.observacoes}
                    onChange={(e) => setLancamentoFormDraft({ observacoes: e.target.value })}
                    className={`w-full bg-white border-2 border-neutral-200 text-sm font-medium rounded-xl focus:outline-none focus:border-primary transition-all p-4 resize-none shadow-xs ${isEditing ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {saldoInsuficiente && (
                <div className="px-6 py-4 bg-red-50 border-t-2 border-alert-red/20 flex items-center gap-3 shrink-0">
                  <AlertCircle className="w-5 h-5 text-alert-red shrink-0" />
                  <div>
                    <span className="text-[10px] font-black uppercase text-alert-red tracking-widest block">Saldo Insuficiente</span>
                    <span className="text-[9px] font-bold text-alert-red/80">Saldo insuficiente na conta selecionada. Saldo disponível: R$ {formatBRL((selectedConta as any)?.saldo_real)}. Valor necessário: R$ {formatBRL(valorOperacaoSaida)}.</span>
                  </div>
                </div>
              )}

              {(!role || role !== 'master') && lancamentoFormDraft.ja_recebido && (
                <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center gap-3 shrink-0">
                  <Shield className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-[9px] font-bold text-secondary uppercase tracking-tighter">
                    Esta operação atualizará apenas o <span className="text-primary font-black">Saldo Operacional</span>. A consolidação no saldo real depende da aprovação Master.
                  </span>
                </div>
              )}

              <footer className="p-6 border-t border-surface-border bg-neutral-50 flex flex-col gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPrintOpen(true)}
                  className="w-full px-6 py-3 font-black text-[10px] text-neutral-700 border-2 border-neutral-200 rounded-xl hover:bg-neutral-100 hover:border-primary transition-all uppercase tracking-widest"
                >
                  Pré-visualizar / Imprimir
                </button>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full sm:w-auto px-6 py-3 font-black text-[10px] text-secondary border-2 border-neutral-200 rounded-xl hover:bg-neutral-100 hover:border-neutral-300 transition-all uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  
                  {editingItem && lancamentoFormDraft.ja_recebido && hasPendingAdjustmentChanges && (
                    <span className="w-full sm:w-auto text-[9px] font-bold text-alert-red uppercase sm:flex-1 sm:min-w-0">Salve os ajustes antes de receber/pagar.</span>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || isCreating || isUpdating || saldoInsuficiente || (Boolean(editingItem) && lancamentoFormDraft.ja_recebido && hasPendingAdjustmentChanges)}
                    className={`w-full sm:w-auto px-8 py-3 font-black text-[10px] rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center gap-2 uppercase tracking-widest ${
                      saldoInsuficiente
                        ? 'bg-neutral-300 text-neutral-400 cursor-not-allowed'
                        : 'text-on-primary-container bg-primary-container hover:brightness-95'
                    }`}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {isSubmitting ? 'Salvando...' : 'Salvar Registro'}
                  </button>
                </div>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAVRConfirmationOpen && (
          <div className="fixed inset-0 z-[450] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAVRConfirmationOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-[420px] rounded-3xl shadow-2xl relative z-10 p-8 space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto"><Shield className="w-7 h-7" /></div>
              <div><h3 className="text-sm font-black uppercase tracking-widest">Confirmar ajuste AVR?</h3><p className="text-[10px] font-bold text-secondary uppercase leading-relaxed mt-2">O novo valor será salvo sem gerar movimentação de caixa.</p></div>
              {editingItem?.recorrencia_id && <div className="grid gap-2"><button type="button" onClick={() => { setAvrPropagation('none'); handleAVRSubmit('none'); }} className="w-full py-3 bg-neutral-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Ajustar apenas este</button><button type="button" onClick={() => { setAvrPropagation('open'); handleAVRSubmit('open'); }} className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Todas em aberto</button></div>}
              {!editingItem?.recorrencia_id && <button type="button" onClick={handleAVRSubmit} className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Confirmar e salvar</button>}
              <button type="button" onClick={() => setIsAVRConfirmationOpen(false)} className="text-[10px] font-black uppercase text-secondary">Cancelar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Action Modals */}
      <AnimatePresence>
        {isQuickCatOpen && (
          <div key="quick-categoria" className="fixed inset-0 z-[350] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsQuickCatOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleQuickCatSubmit} className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl relative z-10 overflow-hidden">
              <header className="px-8 py-5 border-b border-neutral-100 flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Nova Categoria</h3><button type="button" onClick={() => setIsQuickCatOpen(false)}><X className="w-5 h-5 text-neutral-400" /></button></header>
              <div className="p-8 space-y-4">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400">Nome</label><input type="text" required value={quickCatName} onChange={(e) => setQuickCatName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary" /></div>
              </div>
              <footer className="px-8 py-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsQuickCatOpen(false)} className="px-4 py-2 text-[10px] font-black uppercase text-neutral-500">Cancelar</button>
                <Button type="submit">Adicionar</Button>
              </footer>
            </motion.form>
          </div>
        )}

        {isQuickCCOpen && (
          <div key="quick-centro-custo" className="fixed inset-0 z-[350] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsQuickCCOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleQuickCCSubmit} className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl relative z-10 overflow-hidden">
              <header className="px-8 py-5 border-b border-neutral-100 flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Novo Centro de Custo</h3><button type="button" onClick={() => setIsQuickCCOpen(false)}><X className="w-5 h-5 text-neutral-400" /></button></header>
              <div className="p-8 space-y-4">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400">Nome</label><input type="text" required value={quickCCName} onChange={(e) => setQuickCCName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary" /></div>
              </div>
              <footer className="px-8 py-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsQuickCCOpen(false)} className="px-4 py-2 text-[10px] font-black uppercase text-neutral-500">Cancelar</button>
                <Button type="submit">Adicionar</Button>
              </footer>
            </motion.form>
          </div>
        )}

        {isQuickAccountOpen && (
          <div key="quick-conta" className="fixed inset-0 z-[350] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsQuickAccountOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleQuickAccountSubmit} className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl relative z-10 overflow-hidden">
              <header className="px-8 py-5 border-b border-neutral-100 flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Nova Conta Bancária</h3><button type="button" onClick={() => setIsQuickAccountOpen(false)}><X className="w-5 h-5 text-neutral-400" /></button></header>
              <div className="p-8 space-y-4">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400">Nome do Banco / Conta</label><input type="text" required value={quickAccountName} onChange={(e) => setQuickAccountName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400">Saldo Inicial</label><MoneyInput value={quickAccountSaldo} onChange={setQuickAccountSaldo} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary" /></div>
              </div>
              <footer className="px-8 py-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsQuickAccountOpen(false)} className="px-4 py-2 text-[10px] font-black uppercase text-neutral-500">Cancelar</button>
                <Button type="submit">Adicionar</Button>
              </footer>
            </motion.form>
          </div>
        )}

        {isQuickReasonOpen && (
          <div key="quick-motivo" className="fixed inset-0 z-[350] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsQuickReasonOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleQuickReasonSubmit} className="bg-white w-full max-w-[360px] rounded-3xl shadow-2xl relative z-10 overflow-hidden">
              <header className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Novo Motivo de {quickAddReasonType === 'desconto' ? 'Desconto' : 'Acréscimo'}</h4>
                <button type="button" onClick={() => setIsQuickReasonOpen(false)}><X className="w-4 h-4 text-neutral-400" /></button>
              </header>
              <div className="p-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Nome do Motivo</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickReasonName}
                    onChange={(e) => setQuickReasonName(e.target.value)}
                    className="w-full h-11 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary"
                    placeholder="Ex: Pagamento Antecipado"
                  />
                </div>
              </div>
              <footer className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-2">
                <button type="button" onClick={() => setIsQuickReasonOpen(false)} className="px-4 py-2 text-[9px] font-black uppercase text-secondary">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-neutral-900 text-white text-[9px] font-black uppercase tracking-widest rounded-lg">Salvar</button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Portal */}
      <div className="fixed bottom-6 right-6 z-[500] flex flex-col gap-3 pointer-events-none select-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={`pointer-events-auto p-4 rounded-2xl border-2 shadow-xl flex items-start gap-4 bg-white transition-all ${
                toast.type === 'success' ? 'border-emerald-100 bg-emerald-50/20 text-emerald-900' : 
                toast.type === 'error' ? 'border-alert-red/10 bg-red-50/20 text-alert-red' :
                'border-amber-100 bg-amber-50/20 text-amber-900'
              }`}
            >
              <div className="shrink-0 mt-1">
                {toast.type === 'success' && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                {toast.type === 'error' && <XCircle className="w-6 h-6 text-alert-red" />}
                {toast.type === 'warning' && <AlertTriangle className="w-6 h-6 text-pending-amber" />}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5 opacity-50">{toast.type}</p>
                <p className="text-xs font-bold leading-tight">{toast.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}