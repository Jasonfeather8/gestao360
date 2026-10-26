import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Check,
  DollarSign,
  Calendar,
  Wallet,
  Percent,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronDown,
  Plus,
  User,
  Tag,
  CreditCard,
  MessageSquare,
  Repeat,
  Paperclip,
  FileText,
  Shield
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useLancamentos, useLancamento, useContas, useEntidades, useCategorias, useCategoriasAjuste, useCentrosCusto, useContasSaldos, useLancamentoAnexos } from '../hooks/useData';

import { useAuth } from '../hooks/useAuth';
import MoneyInput from './MoneyInput';
import Button from './Button';
import { calculateAdjustmentAmount } from '../utils/adjustments';
import { supabase } from '@/integrations/supabase/client';

// Os tipos do motion não declaram `key`, mas o React exige key única entre os
// filhos diretos do AnimatePresence externo (filhos sem key colidem em "").
const KeyedAnimatePresence = AnimatePresence as React.ComponentType<React.PropsWithChildren<{ key?: React.Key }>>;

interface LocalFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

function formatBRL(value: any): string {
  if (value === null || value === undefined) return '0,00';
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value;
}

function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const cleanStr = value.toString().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleanStr) || 0;
}

export default function BaixaLancamentoModal() {
  const { 
    isBaixaLancamentoOpen, 
    setModalOpen,
    selectedLancamentoIdForModal,
    setSelectedLancamentoIdForModal,
    baixaPreset,
    setBaixaPreset,
    setSelectedLancamentoIdsForBatch
  } = useUIStore();

  const { role } = useAuth();
  const { data: lancamentos = [], baixaLancamento, updateLancamento } = useLancamentos();
  const { data: selectedLancamento } = useLancamento(selectedLancamentoIdForModal);
  const { data: rawContas } = useContas();

  const { data: rawCCs = [] } = useCentrosCusto();
  const { data: contasSaldos } = useContasSaldos();
  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { categoriasAjuste, createCategoriaAjuste } = useCategoriasAjuste();

  // Calculate real balance for each account using the RPC data
  const contas = useMemo(() => {
    return (rawContas ?? [])
      .filter((c: any) => c.status !== 'excluido')
      .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''))
      .map((conta: any) => {
        const saldoObj = (contasSaldos ?? []).find(s => s.conta_id === conta.id);
        const saldoReal = saldoObj ? Number(saldoObj.saldo_operacional) : (conta.saldo_inicial || 0);
        return { ...conta, saldo_real: saldoReal };
      });
  }, [rawContas, contasSaldos]);

  const [loading, setLoading] = useState(false);
  
  // Fields
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0]);
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataLancamento, setDataLancamento] = useState('');
  const [condicao, setCondicao] = useState<'a_vista' | 'a_prazo'>('a_prazo');
  const [quantidadeParcelasAVR, setQuantidadeParcelasAVR] = useState('1');
  const [periodicidadeAVR, setPeriodicidadeAVR] = useState('mensal');
  const [diasPersonalizadosAVR, setDiasPersonalizadosAVR] = useState('30');
  const [comEntradaAVR, setComEntradaAVR] = useState(false);
  const [parcelasAVR, setParcelasAVR] = useState<Array<{ id?: string; numero: number; data: string; valor: string; status: string }>>([]);
  const [contaId, setContaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [centroCustoId, setCentroCustoId] = useState('');
  
  const [tipoBaixa, setTipoBaixa] = useState<'financeira' | 'bpi' | 'avr'>('financeira');

  const [descontoValor, setDescontoValor] = useState('');
  const [descontoTipo, setDescontoTipo] = useState<'valor' | 'porcentagem'>('valor');
  const [motivoDescontoId, setMotivoDescontoId] = useState('');
  
  const [acrescimoValor, setAcrescimoValor] = useState('');
  const [acrescimoTipo, setAcrescimoTipo] = useState<'valor' | 'porcentagem'>('valor');
  const [motivoAcrescimoId, setMotivoAcrescimoId] = useState('');

  const [motivoAVRId, setMotivoAVRId] = useState('');
  
  const [valorPago, setValorPago] = useState('');
  const [observacao, setObservacao] = useState('');
  const [taxaBancaria, setTaxaBancaria] = useState('');
  const [propagateAVR, setPropagateAVR] = useState<'none' | 'open' | 'all'>('none');
  const [isAVRConfirmationOpen, setIsAVRConfirmationOpen] = useState(false);
  const [isFinalConfirmationOpen, setIsFinalConfirmationOpen] = useState(false);
  const [attachments, setAttachments] = useState<LocalFile[]>([]);
  const [dispensarComprovante, setDispensarComprovante] = useState(false);

  // Quick add states
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'desconto' | 'acrescimo'>('desconto');
  const [quickAddName, setQuickAddName] = useState('');

  const lancamento = selectedLancamento || lancamentos.find(l => l.id === selectedLancamentoIdForModal);
  const { anexos: existingAnexos, deleteAnexo } = useLancamentoAnexos(selectedLancamentoIdForModal);

  useEffect(() => {
    if (lancamento) {
      const persistedDescontoTipo = lancamento.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
      const persistedAcrescimoTipo = lancamento.acrescimo_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
      const initialValorPago = Math.max(0, lancamento.valor_previsto
        - calculateAdjustmentAmount(lancamento.desconto_valor, persistedDescontoTipo, lancamento.valor_previsto)
        + calculateAdjustmentAmount(lancamento.acrescimo_valor, persistedAcrescimoTipo, lancamento.valor_previsto)
        - (Number(lancamento.valor_recebido) || 0));

      setValorPago(formatBRL(initialValorPago));
      setQuantidadeParcelasAVR('1');
      setPeriodicidadeAVR('mensal');
      setDiasPersonalizadosAVR('30');
      setComEntradaAVR(false);
      setParcelasAVR([]);
      setDataPagamento(baixaPreset?.lancamentoId === lancamento.id ? baixaPreset.dataPagamento : (lancamento.data_pagamento || new Date().toISOString().split('T')[0]));
      setDataCompetencia(lancamento.data_competencia || '');
      setDataLancamento(lancamento.data_emissao || '');
      setCondicao(lancamento.condicao === 'a_vista' ? 'a_vista' : 'a_prazo');
      setContaId(lancamento.conta_bancaria_id || (contas[0]?.id || ''));
      setCategoriaId(lancamento.categoria_id || '');
      setCentroCustoId(lancamento.centro_custo_id || '');
      // Reset details
      setDescontoValor(formatBRL(lancamento.desconto_valor || 0));
      setDescontoTipo(lancamento.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor');
      setMotivoDescontoId(lancamento.motivo_desconto_id || '');
      setAcrescimoValor(formatBRL(lancamento.acrescimo_valor || 0));
      setAcrescimoTipo(lancamento.acrescimo_tipo === 'porcentagem' ? 'porcentagem' : 'valor');
      setMotivoAcrescimoId(lancamento.motivo_acrescimo_id || '');
      setMotivoAVRId('');
      setObservacao('');
      setTaxaBancaria('');
      setTipoBaixa('financeira');
      setPropagateAVR('none');
      setIsAVRConfirmationOpen(false);
      setAttachments([]);
      setDispensarComprovante(false);
    }
  }, [lancamento?.id, isBaixaLancamentoOpen, baixaPreset?.lancamentoId, baixaPreset?.dataPagamento]);

  useEffect(() => {
    if (!isBaixaLancamentoOpen || contaId || contas.length === 0) return;
    setContaId(contas[0].id);
  }, [contas, contaId, isBaixaLancamentoOpen]);

  useEffect(() => {
    if (!lancamento) return;

    const loadParcelas = async () => {
      let recurrence: any = null;
      if (lancamento.recorrencia_id) {
        const { data } = await supabase
          .from('recorrencias')
          .select('quantidade_total_parcelas, periodicidade, periodicidade_customizada_dias')
          .eq('id', lancamento.recorrencia_id)
          .maybeSingle();
        recurrence = data;
      }

      const { data, error } = lancamento.recorrencia_id
        ? await supabase
          .from('lancamentos_financeiros')
          .select('id, numero_parcela, data_vencimento, valor_previsto, status_pagamento')
          .eq('recorrencia_id', lancamento.recorrencia_id)
          .order('numero_parcela', { ascending: true })
        : { data: [], error: null };

      const parcelas = (data || []).map((parcela: any) => ({
        id: parcela.id,
        numero: parcela.numero_parcela || 1,
        data: parcela.data_vencimento,
        valor: formatBRL(parcela.valor_previsto),
        status: parcela.status_pagamento
      }));

      if (parcelas.length === 0) {
        parcelas.push({
          id: lancamento.id,
          numero: 1,
          data: lancamento.data_vencimento,
          valor: formatBRL(lancamento.valor_previsto),
          status: lancamento.status_pagamento
        });
      }

      if (!error) {
        setQuantidadeParcelasAVR(String(recurrence?.quantidade_total_parcelas || parcelas.length));
        setPeriodicidadeAVR(recurrence?.periodicidade || 'mensal');
        setDiasPersonalizadosAVR(String(recurrence?.periodicidade_customizada_dias || 30));
        setComEntradaAVR(parcelas[0]?.data === lancamento.data_emissao);
        setParcelasAVR(parcelas);
      }
    };

    loadParcelas();
  }, [lancamento?.id, lancamento?.recorrencia_id]);

  if (!lancamento) return null;

  const handleClose = () => {
    setModalOpen('isBaixaLancamentoOpen', false);
    setSelectedLancamentoIdForModal(null);
    setDispensarComprovante(false);
    if (baixaPreset) setBaixaPreset(null);
  };

  const isGerenteOrMaster = role === 'master' || role === 'gerente';

  // Math Calculations in Real-time
  const totalOriginal = lancamento.valor_previsto;
  
  // Calculate discount value
  const numericDesconto = parseMoney(descontoValor);
  const calculatedDesconto = calculateAdjustmentAmount(numericDesconto, descontoTipo, totalOriginal);

  // Calculate increase value
  const numericAcrescimo = parseMoney(acrescimoValor);
  const numericTaxa = parseMoney(taxaBancaria);

  const calculatedAcrescimo = calculateAdjustmentAmount(numericAcrescimo, acrescimoTipo, totalOriginal);

  // BPI locks everything, AVR allows editing valorPago
  const isBpi = tipoBaixa === 'bpi';
  const isAVR = tipoBaixa === 'avr';
  const hasAnexo = attachments.length > 0 || (existingAnexos?.length || 0) > 0;

  const subtotalCalculado = Math.max(0, totalOriginal - calculatedDesconto + calculatedAcrescimo + numericTaxa);
  const valorDigitado = parseMoney(valorPago);
  const valorRecebidoAnterior = Number(lancamento.valor_recebido) || 0;
  const saldoDisponivel = Math.max(0, subtotalCalculado - valorRecebidoAnterior);

  // Checks and balances
  const diff = Math.max(0, saldoDisponivel - valorDigitado);
  const isPartial = !isAVR && valorDigitado < saldoDisponivel - 0.005 && valorDigitado > 0;
  const isOverpaid = !isAVR && valorDigitado > saldoDisponivel + 0.005;
  
  // Adjustment Reasons Logic
  const discReasons = (categoriasAjuste || []).filter(c => c.tipo === 'desconto');
  const incrReasons = (categoriasAjuste || []).filter(c => c.tipo === 'acrescimo');
  const avrReasons = (categoriasAjuste || []).filter(c => c.tipo === 'avr');

  const isDescontoReasonRequired = calculatedDesconto > 0;
  const isAcrescimoReasonRequired = calculatedAcrescimo > 0;
  const isAVRReasonRequired = isAVR;
  
  const isDescontoReasonSelected = !!motivoDescontoId;
  const isAcrescimoReasonSelected = !!motivoAcrescimoId;
  const isAVRReasonSelected = !!motivoAVRId;

  const persistedDescontoTipo = lancamento.desconto_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const persistedAcrescimoTipo = lancamento.acrescimo_tipo === 'porcentagem' ? 'porcentagem' : 'valor';
  const hasChangedAdjustment =
    descontoTipo !== persistedDescontoTipo ||
    Math.abs(numericDesconto - parseMoney(lancamento.desconto_valor)) > 0.005 ||
    acrescimoTipo !== persistedAcrescimoTipo ||
    Math.abs(numericAcrescimo - parseMoney(lancamento.acrescimo_valor)) > 0.005;
  const hasPendingAdjustmentForBaixa = !isAVR && !isBpi && hasChangedAdjustment;

  // Logic for mandatory observation: BPI or manual divergence
  // Note: AVR now uses a dropdown instead of free text observation
  const hasFinancialDivergence = hasPendingAdjustmentForBaixa || numericTaxa > 0 || isPartial;
  const isObsRequired = isBpi || hasFinancialDivergence;
  const isObsFilled = observacao.trim().length > 0;

  // Saldo Insuficiente validation (Item 1)
  const selectedContaSaldo = contas.find((c: any) => c.id === contaId)?.saldo_real || 0;
  const isSaida = lancamento?.tipo === 'saida';
  const saldoInsuficienteBaixa = !isBpi && !isAVR && isSaida && valorDigitado > 0 && valorDigitado > selectedContaSaldo + 0.005;

  const canSave = (!isObsRequired || isObsFilled) &&
                  (!isAVRReasonRequired || isAVRReasonSelected) &&
                  (!isDescontoReasonRequired || isDescontoReasonSelected) &&
                  (!isAcrescimoReasonRequired || isAcrescimoReasonSelected) &&
                  (hasAnexo || dispensarComprovante) &&
                  !isOverpaid && (isBpi || valorDigitado > 0) && !saldoInsuficienteBaixa &&
                  !hasPendingAdjustmentForBaixa;
  const canSaveRegistro = (!isDescontoReasonRequired || isDescontoReasonSelected) &&
                          (!(calculatedAcrescimo + numericTaxa > 0) || isAcrescimoReasonSelected);

  const gerarParcelasAVR = () => {
    const total = Math.max(1, Math.min(120, parseInt(quantidadeParcelasAVR) || 1));
    const valorParcela = valorDigitado / total;
    const parcelasGeradas = [];
    let currentDate = new Date(`${comEntradaAVR ? dataLancamento : lancamento.data_vencimento}T00:00:00`);

    for (let index = 0; index < total; index += 1) {
      const parcelaExistente = parcelasAVR[index];
      parcelasGeradas.push({
        id: parcelaExistente?.id,
        numero: index + 1,
        data: currentDate.toISOString().split('T')[0],
        valor: formatBRL(valorParcela),
        status: parcelaExistente?.status || 'aberto'
      });

      if (periodicidadeAVR === 'diario') currentDate.setDate(currentDate.getDate() + 1);
      else if (periodicidadeAVR === 'semanal') currentDate.setDate(currentDate.getDate() + 7);
      else if (periodicidadeAVR === 'quinzenal') currentDate.setDate(currentDate.getDate() + 15);
      else if (periodicidadeAVR === 'bimestral') currentDate.setMonth(currentDate.getMonth() + 2);
      else if (periodicidadeAVR === 'trimestral') currentDate.setMonth(currentDate.getMonth() + 3);
      else if (periodicidadeAVR === 'semestral') currentDate.setMonth(currentDate.getMonth() + 6);
      else if (periodicidadeAVR === 'anual') currentDate.setFullYear(currentDate.getFullYear() + 1);
      else if (periodicidadeAVR === 'personalizado') currentDate.setDate(currentDate.getDate() + (parseInt(diasPersonalizadosAVR) || 30));
      else currentDate.setMonth(currentDate.getMonth() + 1);
    }

    setParcelasAVR(parcelasGeradas);
  };

  const handleTipoBaixaChange = (tipo: 'financeira' | 'bpi' | 'avr') => {
    setTipoBaixa(tipo);
    if (tipo === 'bpi') {
      // BPI now preserves original bank but zeros the amount
      setValorPago('0,00');
      // CCD is still useful to categorize as BPI internally
      const bpiCC = rawCCs.find(cc => cc.nome === 'BPI');
      if (bpiCC) setCentroCustoId(bpiCC.id);
    } else if (tipo === 'avr') {
      // Quando trocar para AVR, sempre restaura o centro de custo oficial do banco de dados
      setValorPago(formatBRL(lancamento.valor_previsto));
      setCentroCustoId(lancamento.centro_custo_id || '');
    } else {
      // Para financeira (Quitar), restaura o valor e também o centro de custo caso estivesse no BPI
      setValorPago(formatBRL(Math.max(0, lancamento.valor_previsto
        - calculateAdjustmentAmount(lancamento.desconto_valor, persistedDescontoTipo, lancamento.valor_previsto)
        + calculateAdjustmentAmount(lancamento.acrescimo_valor, persistedAcrescimoTipo, lancamento.valor_previsto)
        - (Number(lancamento.valor_recebido) || 0))));
      
      const bpiCC = rawCCs.find(cc => cc.nome === 'BPI');
      if (centroCustoId === bpiCC?.id) {
        setCentroCustoId(lancamento.centro_custo_id || '');
      }
    }
  };

  const handleSaveRegistro = async () => {
    if (!canSaveRegistro) return;

    setLoading(true);
    try {
      await updateLancamento({
        id: lancamento.id,
        data: {
          desconto_valor: numericDesconto,
          desconto_tipo: descontoTipo,
          motivo_desconto_id: motivoDescontoId || null,
          acrescimo_valor: numericAcrescimo,
          acrescimo_tipo: acrescimoTipo,
          motivo_acrescimo_id: motivoAcrescimoId || null
        }
      });
      handleClose();
    } catch (err: any) {
      alert('Erro ao salvar registro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasPendingAdjustmentForBaixa || !canSave) return;

    // Se for AVR e recorrente, precisamos de confirmação antes de prosseguir
    if (tipoBaixa === 'avr' && lancamento.recorrencia_id && !isAVRConfirmationOpen) {
      setIsAVRConfirmationOpen(true);
      return;
    }

    // Para baixas normais (financeira ou BPI), pedimos confirmação final
    if (!isFinalConfirmationOpen && !isAVRConfirmationOpen) {
      setIsFinalConfirmationOpen(true);
      return;
    }

    await executeSubmit();
  };

  const executeSubmit = async (propagateModeOverride?: 'none' | 'open' | 'all') => {
    setLoading(true);
    try {
      const avrReasonName = isAVR ? avrReasons.find(r => r.id === motivoAVRId)?.nome : undefined;

      await baixaLancamento({
        id: lancamento.id,
        data: {
          valor_pago: valorDigitado,
          data_pagamento: dataPagamento,
          conta_bancaria_id: contaId,
          centro_custo_id: centroCustoId || undefined,
          categoria_id: categoriaId || undefined,
          tipo_baixa: tipoBaixa,
          condicao: isAVR ? condicao : undefined,
          data_competencia: isAVR ? dataCompetencia || undefined : undefined,
          data_emissao: isAVR ? dataLancamento || undefined : undefined,
          parcelas: isAVR && condicao === 'a_prazo' ? parcelasAVR.map(parcela => ({
            ...parcela,
            valor: parcela.id === lancamento.id ? formatBRL(valorDigitado) : parcela.valor
          })) : undefined,
          parcela_config: isAVR && condicao === 'a_prazo' ? {
            quantidade: Math.max(1, parseInt(quantidadeParcelasAVR) || parcelasAVR.length || 1),
            periodicidade: periodicidadeAVR,
            periodicidade_customizada_dias: periodicidadeAVR === 'personalizado' ? parseInt(diasPersonalizadosAVR) || 30 : undefined,
            com_entrada: comEntradaAVR
          } : undefined,
          taxa_bancaria: numericTaxa,
          motivo_desconto_id: motivoDescontoId || undefined,
          motivo_acrescimo_id: motivoAcrescimoId || undefined,
          motivo_ajuste: isAVR ? avrReasonName : observacao,
          propagate_avr: propagateModeOverride || propagateAVR
        }
      });

      // Handle Attachments
      if (attachments.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        for (const attachment of attachments) {
          const fileExt = attachment.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `lancamentos/${lancamento.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, attachment.file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('documents')
              .getPublicUrl(filePath);

            await (supabase.from('lancamento_anexos') as any).insert({
              lancamento_id: lancamento.id,
              nome: attachment.name,
              url: publicUrl,
              tamanho: attachment.size,
              tipo_arquivo: attachment.type,
              user_id: user?.id
            });
          }
        }
      }

      if (baixaPreset?.aprovarDepois && role === 'master') {
        setSelectedLancamentoIdsForBatch([lancamento.id]);
        setModalOpen('isAprovacaoModalOpen', true);
      }
      setBaixaPreset(null);
      handleClose();
    } catch (err: any) {
      alert('Erro ao processar baixa: ' + err.message);
    } finally {
      setLoading(false);
      setIsAVRConfirmationOpen(false);
      setIsFinalConfirmationOpen(false);
    }
  };

  const handleQuickAddReason = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createCategoriaAjuste({ nome: quickAddName, tipo: quickAddType });
      if (quickAddType === 'desconto') setMotivoDescontoId(result.id);
      else if (quickAddType === 'acrescimo') setMotivoAcrescimoId(result.id);
      else if (quickAddType === 'avr') setMotivoAVRId(result.id);
      setIsQuickAddOpen(false);
      setQuickAddName('');
    } catch (err: any) {
      alert('Erro ao criar categoria: ' + err.message);
    }
  };

  const entName = entidades.find(e => e.id === lancamento.entidade_id)?.nome_razao_social || 'Desconhecido';
  const catName = categorias.find(c => c.id === lancamento.categoria_id)?.nome || 'Sem categoria';
  const accName = contas.find(c => c.id === lancamento.conta_bancaria_id)?.nome_banco || 'Sem conta';

  return (
    <AnimatePresence>
      {isBaixaLancamentoOpen && (
        <div key="baixa-modal" className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs"
          />

          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-[560px] rounded-[32px] shadow-2xl relative z-10 overflow-hidden border border-neutral-100 flex flex-col max-h-[90vh]"
          >
            <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">Operações de Baixa de Título</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-secondary">
                    <User className="w-3 h-3" /> {entName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-secondary">
                    <Tag className="w-3 h-3" /> {catName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-secondary">
                    <CreditCard className="w-3 h-3" /> {accName}
                  </div>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-neutral-200 rounded-xl transition-all">
                <X className="w-5 h-5 text-secondary" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">
              
              {/* Resumo - ReadOnly */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-1">Valor Original do Título</span>
                  <span className="text-lg font-black text-on-surface">R$ {formatBRL(totalOriginal)}</span>
                </div>
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-1">Vencimento Original</span>
                  <span className="text-lg font-black text-primary">{lancamento.data_vencimento.split('-').reverse().join('/')}</span>
                </div>
              </div>

              {/* Tipo de Baixa */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-secondary tracking-widest">Tipo de Baixa</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'financeira', label: 'Quitar', desc: 'Liquidação normal' },
                    { id: 'bpi', label: 'BPI', desc: 'Baixa por inatividade' }
                  ].map((opt, index) => (
                    <button
                      key={`tipo-baixa-${opt.id}-${index}`}
                      type="button"
                      onClick={() => handleTipoBaixaChange(opt.id as any)}
                      className={`p-3 rounded-2xl border-2 text-left transition-all ${
                        tipoBaixa === opt.id 
                          ? 'border-neutral-900 bg-neutral-900 text-white' 
                          : 'border-neutral-100 bg-neutral-50 text-neutral-600 hover:border-neutral-200'
                      }`}
                    >
                      <p className="text-xs font-black uppercase">{opt.label}</p>
                      <p className={`text-[8px] font-bold uppercase ${tipoBaixa === opt.id ? 'text-white/60' : 'text-neutral-400'}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Desconto & Acréscimo */}
              {!isAVR && (
                <div className="grid grid-cols-2 gap-6">
                {/* Desconto */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-bank-truth-green" /> Desconto
                    </label>
                  </div>
                  <div className="flex bg-neutral-50 border-2 border-neutral-100 rounded-2xl overflow-hidden focus-within:border-primary transition-all">
                    <select
                      disabled={!isGerenteOrMaster || isBpi}
                      value={descontoTipo}
                      onChange={(e) => setDescontoTipo(e.target.value as any)}
                      className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none px-3 border-r-2 border-neutral-100 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <option value="valor">R$</option>
                      <option value="porcentagem">%</option>
                    </select>
                    <MoneyInput
                      disabled={!isGerenteOrMaster || isBpi}
                      value={descontoValor}
                      onChange={setDescontoValor}
                      className="w-full h-12 bg-transparent border-none text-xs font-black text-on-surface focus:outline-none px-4 disabled:opacity-50"
                      placeholder="0,00"
                    />
                  </div>

                  {calculatedDesconto > 0 && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Motivo Desconto <span className="text-alert-red">*</span></label>
                        <button
                          type="button"
                          onClick={() => { setQuickAddType('desconto'); setIsQuickAddOpen(true); }}
                          className="text-[8px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-2.5 h-2.5" /> Novo
                        </button>
                      </div>
                      <select
                        value={motivoDescontoId}
                        onChange={(e) => setMotivoDescontoId(e.target.value)}
                        className={`w-full h-10 bg-neutral-50 border-2 rounded-xl px-3 text-[10px] font-bold outline-none appearance-none cursor-pointer transition-all ${
                          isDescontoReasonSelected ? 'border-neutral-100' : 'border-alert-red/30'
                        }`}
                      >
                        <option value="">Selecione o motivo...</option>
                        {discReasons.map((r, index) => (
                          <option key={`desconto-${r.id || 'motivo'}-${index}`} value={r.id}>{r.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Acréscimo */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-alert-red" /> Acréscimo/Juros
                  </label>
                  <div className="flex bg-neutral-50 border-2 border-neutral-100 rounded-2xl overflow-hidden focus-within:border-primary transition-all">
                    <select
                      disabled={isBpi}
                      value={acrescimoTipo}
                      onChange={(e) => setAcrescimoTipo(e.target.value as any)}
                      className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none px-3 border-r-2 border-neutral-100 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <option value="valor">R$</option>
                      <option value="porcentagem">%</option>
                    </select>
                    <MoneyInput
                      disabled={isBpi}
                      value={acrescimoValor}
                      onChange={setAcrescimoValor}
                      className="w-full h-12 bg-transparent border-none text-xs font-black text-on-surface focus:outline-none px-4 disabled:opacity-50"
                      placeholder="0,00"
                    />
                  </div>

                  {calculatedAcrescimo > 0 && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Motivo Acréscimo <span className="text-alert-red">*</span></label>
                        <button
                          type="button"
                          onClick={() => { setQuickAddType('acrescimo'); setIsQuickAddOpen(true); }}
                          className="text-[8px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-2.5 h-2.5" /> Novo
                        </button>
                      </div>
                      <select
                        value={motivoAcrescimoId}
                        onChange={(e) => setMotivoAcrescimoId(e.target.value)}
                        className={`w-full h-10 bg-neutral-50 border-2 rounded-xl px-3 text-[10px] font-bold outline-none appearance-none cursor-pointer transition-all ${
                          isAcrescimoReasonSelected ? 'border-neutral-100' : 'border-alert-red/30'
                        }`}
                      >
                        <option value="">Selecione o motivo...</option>
                        {incrReasons.map((r, index) => (
                          <option key={`acrescimo-${r.id || 'motivo'}-${index}`} value={r.id}>{r.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Taxa Administrativa / Certificado (1%) */}
              <div className="p-5 bg-neutral-50 rounded-3xl border border-neutral-100 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                    <Percent className="w-4 h-4" /> Taxas / Tarifas Bancárias
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const onePercent = totalOriginal * 0.01;
                      setTaxaBancaria(formatBRL(onePercent));
                      // Update valorPago to match new subtotal with tax
                      const newSubtotal = Math.max(0, totalOriginal - calculatedDesconto + calculatedAcrescimo + onePercent);
                      setValorPago(formatBRL(newSubtotal));
                    }}
                    className="text-[9px] font-black uppercase text-primary hover:underline"
                  >
                    Calcular 1% Sugerido
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-secondary">R$</span>
                  <MoneyInput
                    disabled={isBpi}
                    value={taxaBancaria}
                    onChange={setTaxaBancaria}
                    className="w-full h-12 pl-10 pr-4 bg-white border-2 border-neutral-100 rounded-2xl text-sm font-black text-on-surface focus:outline-none focus:border-primary transition-all disabled:opacity-50"
                    placeholder="0,00"
                  />
                </div>
                <p className="text-[8px] font-bold text-secondary uppercase tracking-tight">Este valor será somado ao subtotal como custo de transação.</p>
              </div>

              {/* Subtotal Calculado */}
              <div className="p-4 bg-neutral-900 text-white rounded-3xl flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Subtotal Calculado</span>
                  <span className="text-xl font-black font-mono">R$ {formatBRL(subtotalCalculado)}</span>
                </div>
                {(calculatedDesconto > 0 || calculatedAcrescimo > 0) && (
                  <div className="text-right">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block">Diferença</span>
                    <span className={`text-xs font-black font-mono ${calculatedDesconto > calculatedAcrescimo ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                      {calculatedDesconto > calculatedAcrescimo ? '-' : '+'} R$ {formatBRL(Math.abs(calculatedDesconto - calculatedAcrescimo))}
                    </span>
                  </div>
                )}
              </div>

              {/* Input de Valor Recebido/Pago */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                    {isAVR ? <DollarSign className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                    {isAVR ? 'Novo Valor Original' : 'Valor Recebido / Pago'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-secondary">R$</span>
                    <MoneyInput
                      disabled={isBpi}
                      value={valorPago}
                      onChange={setValorPago}
                      className={`w-full h-12 pl-10 pr-4 border-2 rounded-2xl text-sm font-black focus:outline-none transition-all ${
                        isAVR ? 'bg-primary/5 border-primary/30 text-primary focus:border-primary' : 'bg-neutral-50 border-neutral-100 text-on-surface focus:border-primary disabled:opacity-50'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  {/* Badges de Devedor / Troco */}
                  {isPartial && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-alert-red h-12">
                      <span className="w-2 h-2 rounded-full bg-alert-red animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-tight">Devedor: R$ {formatBRL(diff)}</span>
                    </div>
                  )}
                  {isOverpaid && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-alert-red h-12">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-tight">Excede o Subtotal!</span>
                    </div>
                  )}
                  {saldoInsuficienteBaixa && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-alert-red min-h-12">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-tight">Saldo insuficiente na conta selecionada. Saldo disponível: R$ {formatBRL(selectedContaSaldo)}. Valor necessário: R$ {formatBRL(valorDigitado)}.</span>
                    </div>
                  )}
                  {isAVR && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-2 text-primary h-12">
                      <Shield className="w-4 h-4 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-tight">Correção de Valor Original</span>
                    </div>
                  )}
                  {valorDigitado > 0 && !isPartial && !isOverpaid && !isAVR && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-bank-truth-green h-12">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="text-[10px] font-black uppercase tracking-tight">Quitação Integral</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CONTEXTUAL JUSTIFICATION BOX */}
              <AnimatePresence>
                {isAVR && (
                  <motion.div
                    key="baixa-avr-grade"
                    initial={{ opacity: 0, height: 0, scale: 0.95 }}
                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    className="space-y-3 p-5 bg-primary/5 rounded-3xl border-2 border-primary/20 shadow-sm overflow-hidden"
                  >
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                        <Tag className="w-4 h-4" /> Motivo do Ajuste (AVR) <span className="text-alert-red">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => { setQuickAddType('avr'); setIsQuickAddOpen(true); }}
                        className="text-[8px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" /> Novo
                      </button>
                    </div>
                    <select
                      value={motivoAVRId}
                      onChange={(e) => setMotivoAVRId(e.target.value)}
                      className={`w-full h-12 bg-white border-2 rounded-2xl px-4 text-xs font-bold outline-none appearance-none cursor-pointer transition-all ${
                        isAVRReasonSelected ? 'border-primary/30 focus:border-primary' : 'border-alert-red/30 focus:border-alert-red'
                      }`}
                    >
                      <option value="">Selecione o motivo do ajuste...</option>
                      {avrReasons.map((r, index) => (
                        <option key={`avr-${r.id || 'motivo'}-${index}`} value={r.id}>{r.nome}</option>
                      ))}
                    </select>
                    <p className="text-[8px] font-bold text-secondary uppercase tracking-tight">Este motivo será registrado no log de auditoria do título.</p>

                    <div className="space-y-3 pt-2 border-t border-primary/10">
                      <label className="text-[10px] font-black uppercase text-primary tracking-widest">Condição do Título</label>
                      <div className="flex bg-white border-2 border-primary/10 rounded-xl p-1 h-11">
                        <button
                          type="button"
                          onClick={() => setCondicao('a_vista')}
                          className={`flex-1 text-[10px] font-black rounded-lg uppercase tracking-tighter transition-all ${condicao === 'a_vista' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-on-surface'}`}
                        >
                          À Vista
                        </button>
                        <button
                          type="button"
                          onClick={() => setCondicao('a_prazo')}
                          className={`flex-1 text-[10px] font-black rounded-lg uppercase tracking-tighter transition-all ${condicao === 'a_prazo' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-on-surface'}`}
                        >
                          A Prazo
                        </button>
                      </div>
                    </div>

                    {condicao === 'a_prazo' && (
                      <div className="space-y-4 pt-2 border-t border-primary/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[10px] font-black uppercase text-primary tracking-widest">Configuração de Parcelas</label>
                            <p className="text-[8px] font-bold text-secondary uppercase tracking-tight mt-1">Defina como os lançamentos serão gerados</p>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <span className="text-[9px] font-black text-secondary uppercase tracking-widest">Com Entrada?</span>
                            <input
                              type="checkbox"
                              checked={comEntradaAVR}
                              onChange={(e) => setComEntradaAVR(e.target.checked)}
                              className="rounded-md border-primary/30 text-primary focus:ring-primary w-4 h-4"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Nº vezes</label>
                            <input
                              type="number"
                              min="1"
                              max="120"
                              value={quantidadeParcelasAVR}
                              onChange={(e) => setQuantidadeParcelasAVR(e.target.value)}
                              className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold outline-none focus:border-primary"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Intervalo</label>
                            <select
                              value={periodicidadeAVR}
                              onChange={(e) => setPeriodicidadeAVR(e.target.value)}
                              className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold outline-none focus:border-primary appearance-none"
                            >
                              <option value="diario">Diário</option>
                              <option value="semanal">Semanal</option>
                              <option value="quinzenal">Quinzenal</option>
                              <option value="mensal">Mensal</option>
                              <option value="bimestral">Bimestral</option>
                              <option value="trimestral">Trimestral</option>
                              <option value="semestral">Semestral</option>
                              <option value="anual">Anual</option>
                              <option value="personalizado">Personalizado</option>
                            </select>
                          </div>
                          {periodicidadeAVR === 'personalizado' && (
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Qtd. Dias</label>
                              <input
                                type="number"
                                min="1"
                                value={diasPersonalizadosAVR}
                                onChange={(e) => setDiasPersonalizadosAVR(e.target.value)}
                                className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold outline-none focus:border-primary"
                              />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={gerarParcelasAVR}
                          className="w-full h-10 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                        >
                          Gerar / Atualizar Parcelas
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-primary tracking-widest">Data de Competência</label>
                        <input
                          type="date"
                          value={dataCompetencia}
                          onChange={(e) => setDataCompetencia(e.target.value)}
                          className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-primary tracking-widest">Data de Lançamento</label>
                        <input
                          type="date"
                          value={dataLancamento}
                          onChange={(e) => setDataLancamento(e.target.value)}
                          className="w-full h-10 bg-white border-2 border-primary/10 rounded-xl px-3 text-xs font-bold outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {condicao === 'a_prazo' && parcelasAVR.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-primary/10">
                        <div>
                          <label className="text-[10px] font-black uppercase text-primary tracking-widest">Parcelas do Título</label>
                          <p className="text-[8px] font-bold text-secondary uppercase tracking-tight mt-1">Edite o vencimento e o valor de cada parcela configurada neste lançamento.</p>
                        </div>
                        <div className="border-2 border-primary/10 rounded-xl overflow-hidden bg-white">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-primary/5 border-b border-primary/10">
                                <th className="px-2 py-2 text-[8px] font-black text-secondary uppercase text-left">Parc.</th>
                                <th className="px-2 py-2 text-[8px] font-black text-secondary uppercase text-left">Vencimento</th>
                                <th className="px-2 py-2 text-[8px] font-black text-secondary uppercase text-left">Valor (R$)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-primary/10">
                              {parcelasAVR.map((parcela, index) => (
                                <tr key={`${parcela.id || 'nova'}-${parcela.numero}`}>
                                  <td className="px-2 py-1.5 text-[10px] font-black text-neutral-400">#{parcela.numero}</td>
                                  <td className="px-1 py-1">
                                    <input
                                      type="date"
                                      disabled={parcela.status !== 'aberto'}
                                      value={parcela.data}
                                      onChange={(e) => setParcelasAVR(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, data: e.target.value } : item))}
                                      className="w-full bg-transparent border-none text-[10px] font-bold p-1 focus:ring-0 disabled:opacity-50"
                                    />
                                  </td>
                                  <td className="px-1 py-1">
                                    <MoneyInput
                                      disabled={parcela.status !== 'aberto'}
                                      value={parcela.id === lancamento.id ? valorPago : parcela.valor}
                                      onChange={(value) => {
                                        if (parcela.id === lancamento.id) setValorPago(value);
                                        setParcelasAVR(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, valor: value } : item));
                                      }}
                                      className="w-full bg-transparent border-none text-[10px] font-black p-1 font-mono focus:ring-0 disabled:opacity-50"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[8px] font-bold text-secondary uppercase">Parcelas já pagas permanecem bloqueadas.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {isObsRequired && (
                  <motion.div
                    key="baixa-justificativa"
                    initial={{ opacity: 0, height: 0, scale: 0.95 }}
                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    className="space-y-2 p-5 bg-amber-50 rounded-3xl border-2 border-amber-100 shadow-sm overflow-hidden"
                  >
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" /> Justificativa da Baixa <span className="text-alert-red">*</span>
                      </label>
                      <span className="text-[8px] bg-amber-200/50 text-amber-800 font-black uppercase px-2 py-0.5 rounded">Obrigatório</span>
                    </div>
                    <textarea
                      required
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder={
                        isBpi
                          ? "Explique o motivo desta baixa por inatividade (Cancelamento)..."
                          : "Explique o motivo da diferença no pagamento (ex: Juros, arredondamento, taxa)..."
                      }
                      className="w-full p-4 bg-white border-2 border-amber-200 rounded-2xl text-xs font-bold text-neutral-800 focus:border-amber-400 outline-none resize-none shadow-inner"
                      rows={3}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Data & Conta & Categoria & CC */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest">Categoria Contábil</label>
                  <select
                    disabled={isBpi}
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-4 text-xs font-bold outline-none focus:border-primary appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Selecione...</option>
                    {categorias.filter(c => c.tipo === lancamento.tipo).map((c, index) => (
                      <option key={`categoria-${c.id || 'item'}-${index}`} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest">Centro de Custo</label>
                  <select
                    disabled={isBpi}
                    value={centroCustoId}
                    onChange={(e) => setCentroCustoId(e.target.value)}
                    className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-4 text-xs font-bold outline-none focus:border-primary appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Selecione...</option>
                    {rawCCs.filter((cc: any) => cc.status !== 'excluido').map((cc, index) => (
                      <option key={`centro-${cc.id || 'item'}-${index}`} value={cc.id}>{cc.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Data do Pagamento
                  </label>
                  <input
                    type="date"
                    disabled={isBpi}
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-4 text-xs font-bold outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary tracking-widest">Conta / Caixa</label>
                  <select
                    disabled={isBpi}
                    value={contaId}
                    onChange={(e) => setContaId(e.target.value)}
                    className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-4 text-xs font-bold outline-none focus:border-primary appearance-none cursor-pointer disabled:opacity-50"
                  >
                    {contas.map((c: any, index: number) => (
                      <option key={`conta-${c.id || 'item'}-${index}`} value={c.id}>{c.nome_banco} (Saldo: R$ {formatBRL(c.saldo_real)})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {/* Anexos */}
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <Paperclip className="w-4 h-4" /> Comprovantes e Anexos
                </h4>
                
                <div className="relative group cursor-pointer h-12 border-2 border-dashed border-neutral-200 rounded-xl hover:border-primary transition-all flex items-center justify-center gap-2 text-secondary hover:text-primary bg-neutral-50/50">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase">
                    {(attachments.length + (existingAnexos?.length || 0)) > 0 
                      ? `${attachments.length + (existingAnexos?.length || 0)} Anexo(s)` 
                      : 'Anexar Comprovante'}
                  </span>
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

                <div className="space-y-2">
                  {/* Existing Remote Attachments */}
                  {existingAnexos && existingAnexos.map((anexo: any, index: number) => (
                    <div key={`baixa-anexo-${anexo.id || 'arquivo'}-${index}`} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold truncate max-w-[150px] text-primary">{anexo.nome} (Salvo)</span>
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
                        <span className="text-[10px] font-bold truncate max-w-[150px]">{f.name}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} 
                        className="text-neutral-400 hover:text-alert-red transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                </div>

              {role === 'master' && !hasAnexo && (
                <div className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 transition-all cursor-pointer ${
                      dispensarComprovante ? 'bg-primary border-primary' : 'bg-white border-neutral-200'
                    }`}
                    onClick={() => setDispensarComprovante(!dispensarComprovante)}
                  >
                    {dispensarComprovante && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 cursor-pointer" onClick={() => setDispensarComprovante(!dispensarComprovante)}>
                    <p className="text-[10px] font-black uppercase text-neutral-900">Dispensar comprovante</p>
                    <p className="text-[8px] font-bold text-secondary uppercase leading-tight mt-0.5">
                      Aprovar este lançamento manualmente sem a necessidade de um anexo.
                    </p>
                  </div>
                </div>
              )}

            </form>

            {saldoInsuficienteBaixa && (
              <div className="px-8 py-4 bg-red-50 border-t-2 border-alert-red/20 flex items-center gap-3 shrink-0">
                <AlertCircle className="w-5 h-5 text-alert-red shrink-0" />
                <div>
                  <span className="text-[10px] font-black uppercase text-alert-red tracking-widest block">Saldo Insuficiente</span>
                  <span className="text-[9px] font-bold text-alert-red/80">A conta selecionada possui R$ {formatBRL(selectedContaSaldo)} de saldo real. Não é possível quitar este título.</span>
                </div>
              </div>
            )}

            {!role || role !== 'master' && (
              <div className="px-8 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center gap-3 shrink-0">
                <Shield className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-[9px] font-bold text-secondary uppercase tracking-tighter">
                  Esta operação atualizará apenas o <span className="text-primary font-black">Saldo Operacional</span>. A consolidação no saldo real depende da aprovação Master.
                </span>
              </div>
            )}

            <footer className="px-8 py-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-3 text-[10px] font-black uppercase text-secondary hover:text-on-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRegistro}
                disabled={loading || !canSaveRegistro}
                className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border-2 transition-all active:scale-[0.98] flex items-center gap-2 ${
                  canSaveRegistro
                    ? 'border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white cursor-pointer'
                    : 'border-neutral-200 text-neutral-300 cursor-not-allowed opacity-50'
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar Registro
              </button>
              {hasPendingAdjustmentForBaixa && (
                <span className="self-center text-[9px] font-bold text-alert-red uppercase">Salve o registro antes de baixar.</span>
              )}
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading || !canSave}
                className={`px-10 py-3 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center gap-2 ${
                  canSave
                    ? (isAVR ? 'bg-primary hover:bg-primary-hover' : 'bg-neutral-900 hover:bg-black') + ' cursor-pointer'
                    : 'bg-neutral-300 cursor-not-allowed opacity-50'
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isAVR ? <FileText className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />)}
                {isAVR ? 'Salvar Ajuste (AVR)' : (isPartial ? 'Confirmar Parcial' : 'Baixar Título')}
              </button>
            </footer>
          </motion.div>
        </div>
      )}

      {/* Quick Add Reason Modal */}
      <KeyedAnimatePresence key="baixa-motivo-rapido">
        {isQuickAddOpen && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsQuickAddOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.form
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onSubmit={handleQuickAddReason}
              className="bg-white w-full max-w-[360px] rounded-3xl shadow-2xl relative z-10 overflow-hidden"
            >
              <header className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Novo Motivo de {quickAddType}</h4>
                <button type="button" onClick={() => setIsQuickAddOpen(false)}><X className="w-4 h-4 text-neutral-400" /></button>
              </header>
              <div className="p-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-secondary tracking-widest">Nome do Motivo</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    className="w-full h-11 bg-neutral-50 border-2 border-neutral-100 rounded-xl px-4 text-xs font-bold outline-none focus:border-primary"
                    placeholder="Ex: Pagamento Antecipado"
                  />
                </div>
              </div>
              <footer className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-2">
                <button type="button" onClick={() => setIsQuickAddOpen(false)} className="px-4 py-2 text-[9px] font-black uppercase text-secondary">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-neutral-900 text-white text-[9px] font-black uppercase tracking-widest rounded-lg">Salvar</button>
              </footer>
            </motion.form>
          </div>
        )}
      </KeyedAnimatePresence>
  
        {/* AVR Propagation Modal */}
        <KeyedAnimatePresence key="baixa-avr-confirmacao">
          {isAVRConfirmationOpen && (
            <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAVRConfirmationOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-[420px] rounded-[32px] shadow-2xl relative z-10 overflow-hidden border border-neutral-100"
              >
                <button
                  onClick={() => setIsAVRConfirmationOpen(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-neutral-100 rounded-xl transition-all z-20"
                >
                  <X className="w-4 h-4 text-secondary" />
                </button>

                <div className="p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <Repeat className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">Propagar Ajuste (AVR)?</h3>
                    <p className="text-[10px] font-bold text-secondary uppercase leading-relaxed mt-2">
                      Este lançamento faz parte de uma recorrência. Como deseja aplicar este novo valor de <span className="text-primary font-black">R$ {formatBRL(valorDigitado)}</span>?
                    </p>
                  </div>
  
                  <div className="flex flex-col gap-3 pt-4 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setPropagateAVR('none');
                        setTimeout(() => executeSubmit('none'), 100);
                      }}
                      className="w-full py-4 bg-neutral-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-white/40" /> Ajustar apenas esta
                    </button>

                    <span className="text-[8px] font-black uppercase text-secondary/40 tracking-[0.3em] py-1">ou</span>

                    <button
                      type="button"
                      onClick={() => {
                        setPropagateAVR('open');
                        setTimeout(() => executeSubmit('open'), 100);
                      }}
                      className="w-full py-4 bg-neutral-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4 text-white/40" /> Todas em aberto
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </KeyedAnimatePresence>

        {/* General Confirmation Modal */}
        <KeyedAnimatePresence key="baixa-confirmacao-final">
          {isFinalConfirmationOpen && (
            <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFinalConfirmationOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-[420px] rounded-[32px] shadow-2xl relative z-10 overflow-hidden border border-neutral-100"
              >
                <button
                  onClick={() => setIsFinalConfirmationOpen(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-neutral-100 rounded-xl transition-all z-20"
                >
                  <X className="w-4 h-4 text-secondary" />
                </button>

                <div className="p-8 text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                    isAVR ? 'bg-primary/10 text-primary' : 'bg-bank-truth-green/10 text-bank-truth-green'
                  }`}>
                    {isAVR ? <FileText className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">
                      {isAVR ? 'Confirmar Ajuste AVR?' : (tipoBaixa === 'bpi' ? 'Confirmar Baixa por Inatividade?' : 'Confirmar Baixa de Título?')}
                    </h3>
                    <p className="text-[10px] font-bold text-secondary uppercase leading-relaxed mt-2">
                      {isAVR ? (
                        <>Você está corrigindo o valor original para <span className="text-primary font-black">R$ {formatBRL(valorDigitado)}</span> sem gerar movimentação de caixa.</>
                      ) : (tipoBaixa === 'bpi' ? (
                        <>Você está prestes a realizar a baixa por inatividade (cancelamento) do título de <span className="text-primary font-black">{entName}</span>.</>
                      ) : (
                        <>Você está prestes a baixar o título de <span className="text-primary font-black">{entName}</span> no valor de <span className="text-primary font-black">R$ {formatBRL(valorDigitado)}</span>.</>
                      ))}
                    </p>
                  </div>
  
                  <div className="grid grid-cols-1 gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => executeSubmit()}
                      className={`w-full py-4 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
                        isAVR ? 'bg-primary hover:bg-primary-hover' : 'bg-neutral-900 hover:bg-black'
                      }`}
                    >
                      {isAVR ? <FileText className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {isAVR ? 'Confirmar e Salvar' : 'Confirmar e Baixar'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </KeyedAnimatePresence>
      </AnimatePresence>

    );
  }
