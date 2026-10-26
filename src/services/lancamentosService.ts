import { supabase } from '@/integrations/supabase/client';
import { diagnosticLogger } from './diagnosticLogger';
import { LancamentoFinanceiro } from '../types';
import { calculateAdjustmentAmount } from '../utils/adjustments';

export interface LancamentoFilters {
  searchTerm?: string;
  docCode?: number;
  docParcel?: number;
  startDate?: string;
  endDate?: string;
  approvalStatus?: string;
  statusPagamento?: string | string[];
  financialStatus?: string | string[];
  type?: string | string[];
  authorId?: string | string[];
  categoryId?: string | string[];
  contaId?: string | string[];
  centroCustoId?: string | string[];
  condicao?: string;
  temDesconto?: string;
  temAcrescimo?: string;
  motivoDescontoId?: string;
  motivoAcrescimoId?: string;
  isFinanceiroView?: boolean;
  operationalView?: boolean;
  transferenciasOnly?: boolean;
  page?: number;
  pageSize?: number;
}

const normalizeFilterValues = (value?: string | string[]): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.includes('all') ? [] : Array.from(new Set(values.filter(Boolean)));
};

const combineOrGroups = (groups: string[][]): string => {
  const nonEmptyGroups = groups.filter(group => group.length > 0);

  if (nonEmptyGroups.length === 1) {
    return nonEmptyGroups[0].join(',');
  }

  return `and(${nonEmptyGroups
    .map(group => group.length === 1 ? group[0] : `or(${group.join(',')})`)
    .join(',')})`;
};

const normalizeAdjustmentType = (type: unknown): 'valor' | 'porcentagem' =>
  type === 'porcentagem' ? 'porcentagem' : 'valor';

const parseAVRValue = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  return Number(value.replace(/\./g, '').replace(',', '.')) || 0;
};

const formatAdjustmentValue = (value: unknown, type: unknown, base: number): string => {
  const numericValue = Number(value) || 0;
  const formattedValue = numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (normalizeAdjustmentType(type) === 'porcentagem') return `${formattedValue}%`;
  const percentage = base > 0 ? (numericValue / base) * 100 : 0;
  return `R$ ${formattedValue} (${percentage.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
};

const formatBRL = (value: number): string => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const getOperationalBalance = async (contaId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('get_contas_saldos_reais');
  if (error) throw error;
  const saldo = (data || []).find((item: { conta_id: string }) => item.conta_id === contaId);
  return saldo ? Number(saldo.saldo_operacional) || 0 : 0;
};

const assertOperationalBalance = async ({
  tipo,
  tipoBaixa,
  contaId,
  amount,
  saldoAdicionado = 0
}: {
  tipo?: string;
  tipoBaixa?: string;
  contaId?: string | null;
  amount: number;
  saldoAdicionado?: number;
}): Promise<void> => {
  if (tipo !== 'saida' || tipoBaixa === 'avr' || tipoBaixa === 'bpi' || amount <= 0) return;
  if (!contaId) throw new Error('Selecione uma conta bancária para realizar a saída.');

  const saldoDisponivel = await getOperationalBalance(contaId) + saldoAdicionado;
  if (amount > saldoDisponivel + 0.005) {
    throw new Error(`Saldo insuficiente na conta selecionada. Saldo disponível: R$ ${formatBRL(saldoDisponivel)}. Valor necessário: R$ ${formatBRL(amount)}.`);
  }
};

export const lancamentosService = {
  getAll: async (filters?: LancamentoFilters, signal?: AbortSignal): Promise<{ data: LancamentoFinanceiro[], count: number }> => {
    let recurrenceIds: string[] = [];

    if (filters?.docCode !== undefined) {
      let recurrenceQuery = supabase
        .from('lancamentos_financeiros')
        .select('recorrencia_id')
        .eq('codigo_sequencial', filters.docCode);
      if (signal) recurrenceQuery = recurrenceQuery.abortSignal(signal);

      const { data: matchingLancamentos, error: matchingError } = await recurrenceQuery;

      if (matchingError) throw matchingError;

      recurrenceIds = (matchingLancamentos || [])
        .map(({ recorrencia_id }) => recorrencia_id)
        .filter((recorrenciaId): recorrenciaId is string => Boolean(recorrenciaId));
    }

    let searchLancamentoIds: string[] | undefined;

    if (filters?.searchTerm && filters.searchTerm.length >= 3) {
      const term = `%${filters.searchTerm}%`;
      let observacoesQuery = supabase
        .from('lancamentos_financeiros')
        .select('id')
        .ilike('observacoes', term);
      if (signal) observacoesQuery = observacoesQuery.abortSignal(signal);

      const { data: matchingObservacoes, error: observacoesError } = await observacoesQuery;

      if (observacoesError) throw observacoesError;

      let entidadesQuery = supabase
        .from('entidades_negocio')
        .select('id')
        .ilike('nome_razao_social', term);
      if (signal) entidadesQuery = entidadesQuery.abortSignal(signal);

      const { data: matchingEntidades, error: entidadesError } = await entidadesQuery;

      if (entidadesError) throw entidadesError;

      const entidadeIds = (matchingEntidades || []).map(({ id }) => id);
      let entidadeLancamentoIds: string[] = [];

      if (entidadeIds.length > 0) {
        let lancamentosEntidadeQuery = supabase
          .from('lancamentos_financeiros')
          .select('id')
          .in('entidade_id', entidadeIds);
        if (signal) lancamentosEntidadeQuery = lancamentosEntidadeQuery.abortSignal(signal);

        const { data: matchingLancamentosPorEntidade, error: lancamentosEntidadeError } = await lancamentosEntidadeQuery;

        if (lancamentosEntidadeError) throw lancamentosEntidadeError;
        entidadeLancamentoIds = (matchingLancamentosPorEntidade || []).map(({ id }) => id);
      }

      searchLancamentoIds = Array.from(new Set([
        ...(matchingObservacoes || []).map(({ id }) => id),
        ...entidadeLancamentoIds
      ]));
    }

    if (searchLancamentoIds && searchLancamentoIds.length === 0) {
      return { data: [], count: 0 };
    }

    let query = supabase
      .from('lancamentos_financeiros')
      .select('*, entidades_negocio(nome_razao_social), conciliacoes(id, data_conciliacao)', { count: 'exact' });

    if (filters?.docCode !== undefined) {
      query = query
        .order('codigo_sequencial', { ascending: true })
        .order('numero_parcela', { ascending: true })
        .order('created_at', { ascending: false });
    } else if (filters?.isFinanceiroView) {
      query = query
        .order('data_pagamento', { ascending: false, nullsFirst: false })
        .order('hora_pagamento', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query
        .order('data_vencimento', { ascending: true })
        .order('codigo_sequencial', { ascending: true })
        .order('created_at', { ascending: false });
    }

    if (filters) {
      const orGroups: string[][] = [];

      if (filters.transferenciasOnly) {
        query = query.not('transferencia_id', 'is', null);
      }

      if (filters.docCode === undefined) {
        const dateField = filters.isFinanceiroView ? 'data_pagamento' : 'data_vencimento';
        if (filters.startDate) query = query.gte(dateField, filters.startDate);
        if (filters.endDate) query = query.lte(dateField, filters.endDate);
      }
      
      if (filters.docCode !== undefined) {
        const documentClauses = [`codigo_sequencial.eq.${filters.docCode}`];
        if (recurrenceIds.length > 0) {
          documentClauses.push(`recorrencia_id.in.(${recurrenceIds.join(',')})`);
        }
        orGroups.push(documentClauses);
      }
      if (filters.docParcel) query = query.eq('numero_parcela', filters.docParcel);

      if (filters.approvalStatus && filters.approvalStatus !== 'all') {
        if (filters.approvalStatus === 'pendente') {
          query = query.in('status_aprovacao', ['pendente_digital', 'digital']);
        } else if (filters.approvalStatus === 'fila_operacional') {
          query = query.in('status_aprovacao', ['pendente_digital', 'digital', 'reprovado']);
        } else {
          query = query.eq('status_aprovacao', filters.approvalStatus);
        }
      }

      if (filters.operationalView) {
        // Baixa registrada sai das telas de Pagar/Receber; títulos abertos e baixas parciais permanecem.
        query = query.in('status_pagamento', ['aberto', 'pago_parcial', 'quitação_pendente']);
        orGroups.push(['saldo_aberto.gt.0', 'status_pagamento.eq.aberto']);
        orGroups.push(['status_aprovacao.neq.confirmado_master', 'status_aprovacao.is.null']);
        // Transferências entre contas não são títulos; a tarifa permanece visível por ser despesa real.
        orGroups.push(['transferencia_id.is.null', 'transferencia_lado.eq.tarifa']);
      }

      if (filters.isFinanceiroView) {
        const financialStatusValues = normalizeFilterValues(filters.financialStatus);
        if (financialStatusValues.length > 0) {
          const financialStatusClauses = financialStatusValues.flatMap(status => {
            if (status === 'confirmado_master') return ['status_aprovacao.eq.confirmado_master'];
            if (status === 'quitação_pendente') return ['status_aprovacao.neq.confirmado_master', 'status_aprovacao.is.null'];
            if (status === 'bpi') return ['status_pagamento.eq.bpi'];
            return [];
          });
          if (financialStatusClauses.length > 0) orGroups.push(financialStatusClauses);
        }
      }

      const statusPagamentoValues = normalizeFilterValues(filters.statusPagamento);
      if (statusPagamentoValues.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const hasAtrasadas = statusPagamentoValues.includes('atrasadas');
        const hasAVencer = statusPagamentoValues.includes('aberto');

        if (filters.operationalView) {
          if (hasAtrasadas && !hasAVencer) {
            query = query.lt('data_vencimento', today);
          } else if (!hasAtrasadas && hasAVencer) {
            query = query.gte('data_vencimento', today);
          }
        } else {
          const hasDateScopedStatus = statusPagamentoValues.some(status => status === 'aberto' || status === 'atrasadas');

          if (!hasDateScopedStatus) {
            query = query.in('status_pagamento', statusPagamentoValues);
          } else if (statusPagamentoValues.length === 1) {
            const [status] = statusPagamentoValues;
            if (status === 'atrasadas') {
              query = query
                .lt('data_vencimento', today)
                .in('status_pagamento', ['aberto', 'pago_parcial']);
            } else {
              query = query
                .eq('status_pagamento', 'aberto')
                .gte('data_vencimento', today);
            }
          } else {
            orGroups.push(statusPagamentoValues.map(status => {
              if (status === 'atrasadas') {
                return `and(data_vencimento.lt.${today},status_pagamento.in.(aberto,pago_parcial))`;
              }
              if (status === 'aberto') {
                return `and(status_pagamento.eq.aberto,data_vencimento.gte.${today})`;
              }
              return `status_pagamento.eq.${status}`;
            }));
          }
        }
      }

      const typeValues = normalizeFilterValues(filters.type);
      if (typeValues.length > 0) {
        query = query.in('tipo', typeValues);
      }

      const authorValues = normalizeFilterValues(filters.authorId);
      if (authorValues.length > 0) {
        query = query.in('usuario_criador_id', authorValues);
      }

      const categoryValues = normalizeFilterValues(filters.categoryId);
      if (categoryValues.length > 0) {
        query = query.in('categoria_id', categoryValues);
      }

      const contaValues = normalizeFilterValues(filters.contaId);
      if (contaValues.length > 0) {
        query = query.in('conta_bancaria_id', contaValues);
      }

      const centroCustoValues = normalizeFilterValues(filters.centroCustoId);
      if (centroCustoValues.length > 0) {
        query = query.in('centro_custo_id', centroCustoValues);
      }

      if (filters.condicao && filters.condicao !== 'all') {
        query = query.eq('condicao', filters.condicao);
      }

      if (filters.temDesconto === 'sim') {
        query = query.gt('desconto_valor', 0);
      } else if (filters.temDesconto === 'nao') {
        orGroups.push(['desconto_valor.eq.0', 'desconto_valor.is.null']);
      }

      if (filters.temAcrescimo === 'sim') {
        query = query.gt('acrescimo_valor', 0);
      } else if (filters.temAcrescimo === 'nao') {
        orGroups.push(['acrescimo_valor.eq.0', 'acrescimo_valor.is.null']);
      }

      if (filters.motivoDescontoId && filters.motivoDescontoId !== 'all') {
        query = query.eq('motivo_desconto_id', filters.motivoDescontoId);
      }

      if (filters.motivoAcrescimoId && filters.motivoAcrescimoId !== 'all') {
        query = query.eq('motivo_acrescimo_id', filters.motivoAcrescimoId);
      }

      if (orGroups.length > 0) {
        query = query.or(combineOrGroups(orGroups));
      }

      if (searchLancamentoIds) {
        query = query.in('id', searchLancamentoIds);
      }

      // Pagination
      if (filters.page && filters.pageSize) {
        const from = (filters.page - 1) * filters.pageSize;
        const to = from + filters.pageSize - 1;
        query = query.range(from, to);
      }
    } else {
      query = query.range(0, 49); // Default limit
    }

    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data as LancamentoFinanceiro[], count: count || 0 };
  },

  getById: async (id: string): Promise<LancamentoFinanceiro> => {
    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as LancamentoFinanceiro;
  },

  getParcelasByRecorrenciaId: async (recorrenciaId: string): Promise<LancamentoFinanceiro[]> => {
    const { data, error } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('recorrencia_id', recorrenciaId)
      .order('numero_parcela', { ascending: true });

    if (error) throw error;
    return (data || []) as LancamentoFinanceiro[];
  },

  create: async (item: any, recorrencia?: any): Promise<LancamentoFinanceiro> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    // Recupera a role do usuário para segurança na criação
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isMaster = profile?.role === 'master';
    const valorPrevisto = Number(item.valor_previsto) || 0;
    const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, valorPrevisto);
    const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, valorPrevisto);
    const saldoDisponivel = Math.max(0, valorPrevisto - desconto + acrescimo);
    const valorRecebido = Number(item.valor_recebido) || 0;
    const hasReceivedPayment = item.ja_recebido === true || item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial' || item.valor_recebido !== undefined;

    if (hasReceivedPayment && (valorRecebido < 0 || valorRecebido > saldoDisponivel + 0.005)) {
      throw new Error('O valor recebido não pode ser maior que o saldo disponível do lançamento.');
    }
    await assertOperationalBalance({
      tipo: item.tipo,
      tipoBaixa: item.tipo_baixa,
      contaId: item.conta_bancaria_id,
      amount: valorRecebido
    });

    const lancamentoData = {
      ...item,
      user_id: user.id,
      usuario_criador_id: user.id,
      // Se não for master, garante que não entra como confirmado
      status_aprovacao: isMaster ? (item.status_aprovacao || 'confirmado_master') : 'digital'
    };

    if (!recorrencia) {
      const { data, error } = await supabase
        .from('lancamentos_financeiros')
        .insert([lancamentoData])
        .select()
        .single();
      if (error) throw error;
      return data as LancamentoFinanceiro;
    } else {
      const { data: recData, error: recError } = await supabase
        .from('recorrencias')
        .insert([{
          user_id: user.id,
          periodicidade: recorrencia.periodicidade,
          quantidade_total_parcelas: recorrencia.quantidade_total_parcelas,
          data_inicio: item.data_vencimento,
          periodicidade_customizada_dias: recorrencia.periodicidade_customizada_dias
        }])
        .select()
        .single();

      if (recError) throw recError;

      const valorTotalRecorrencia = recorrencia.parcelas.reduce(
        (total: number, parcela: any) => total + (Number(parcela.valor_previsto) || 0),
        0
      );
      const recorrenciaRecebida = item.ja_recebido === true || item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial';
      const parcelas = recorrencia.parcelas.map((p: any, index: number) => ({
        ...lancamentoData,
        ...(recorrenciaRecebida && index === 0 ? {} : {
          status_pagamento: 'aberto',
          valor_recebido: 0,
          ja_recebido: false,
          data_pagamento: null
        }),
        data_vencimento: index === 0 ? item.data_vencimento : p.data_vencimento,
        valor_previsto: p.valor_previsto,
        valor_original: valorTotalRecorrencia,
        recorrencia_id: recData.id,
        numero_parcela: index + 1,
        quantidade_total_parcelas: recorrencia.quantidade_total_parcelas
      }));

      const { data: createdParcelas, error: parcelasError } = await supabase
        .from('lancamentos_financeiros')
        .insert(parcelas)
        .select();

      if (parcelasError) throw parcelasError;
      return createdParcelas[0] as LancamentoFinanceiro;
    }
  },

  update: async (id: string, data: any, mode: 'single' | 'all' = 'single'): Promise<LancamentoFinanceiro> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isMaster = profile?.role === 'master';

    // Proteção: Se não for master, não pode alterar para status de aprovação master
    const safeData = { ...data };
    if (!isMaster && safeData.status_aprovacao === 'confirmado_master') {
      delete safeData.status_aprovacao;
    }
    delete safeData.valor_original;
    delete safeData.valor_previsto;

    const { data: current } = await supabase
      .from('lancamentos_financeiros')
      .select('recorrencia_id, tipo, conta_bancaria_id, valor_previsto, desconto_valor, desconto_tipo, acrescimo_valor, acrescimo_tipo, valor_recebido, status_pagamento, tipo_baixa, observacoes')
      .eq('id', id)
      .single();

    const isAVRUpdate = safeData.tipo_baixa === 'avr' || current?.tipo_baixa === 'avr';
    const valorPrevisto = Number(safeData.valor_previsto ?? current?.valor_previsto) || 0;
    const descontoValor = safeData.desconto_valor ?? current?.desconto_valor;
    const acrescimoValor = safeData.acrescimo_valor ?? current?.acrescimo_valor;
    const descontoTipo = safeData.desconto_tipo ?? current?.desconto_tipo;
    const acrescimoTipo = safeData.acrescimo_tipo ?? current?.acrescimo_tipo;
    const desconto = calculateAdjustmentAmount(descontoValor, descontoTipo, valorPrevisto);
    const acrescimo = calculateAdjustmentAmount(acrescimoValor, acrescimoTipo, valorPrevisto);
    const saldoDisponivel = Math.max(0, valorPrevisto - desconto + acrescimo);
    const valorRecebido = Number(safeData.valor_recebido ?? current?.valor_recebido) || 0;
    const persistedDescontoTipo = normalizeAdjustmentType(current?.desconto_tipo);
    const persistedAcrescimoTipo = normalizeAdjustmentType(current?.acrescimo_tipo);
    const nextDescontoTipo = normalizeAdjustmentType(safeData.desconto_tipo ?? current?.desconto_tipo);
    const nextAcrescimoTipo = normalizeAdjustmentType(safeData.acrescimo_tipo ?? current?.acrescimo_tipo);
    const nextDescontoValor = safeData.desconto_valor ?? current?.desconto_valor;
    const nextAcrescimoValor = safeData.acrescimo_valor ?? current?.acrescimo_valor;
    const descontoProvided = safeData.desconto_valor !== undefined || safeData.desconto_tipo !== undefined;
    const acrescimoProvided = safeData.acrescimo_valor !== undefined || safeData.acrescimo_tipo !== undefined;
    const descontoChanged = descontoProvided && (
      Math.abs((Number(nextDescontoValor) || 0) - (Number(current?.desconto_valor) || 0)) > 0.005 ||
      nextDescontoTipo !== persistedDescontoTipo
    );
    const acrescimoChanged = acrescimoProvided && (
      Math.abs((Number(nextAcrescimoValor) || 0) - (Number(current?.acrescimo_valor) || 0)) > 0.005 ||
      nextAcrescimoTipo !== persistedAcrescimoTipo
    );
    if (descontoChanged || acrescimoChanged) {
      const historyLines = [
        descontoChanged
          ? `Desconto anterior: ${formatAdjustmentValue(current?.desconto_valor, persistedDescontoTipo, valorPrevisto)} | atual: ${formatAdjustmentValue(nextDescontoValor, nextDescontoTipo, valorPrevisto)}`
          : null,
        acrescimoChanged
          ? `Acréscimo anterior: ${formatAdjustmentValue(current?.acrescimo_valor, persistedAcrescimoTipo, valorPrevisto)} | atual: ${formatAdjustmentValue(nextAcrescimoValor, nextAcrescimoTipo, valorPrevisto)}`
          : null
      ].filter(Boolean).join('\n');
      const observacoesBase = safeData.observacoes ?? current?.observacoes ?? '';
      const observacoesPreservadas = current?.observacoes && !observacoesBase.includes(current.observacoes)
        ? `${current.observacoes}\n${observacoesBase}`
        : observacoesBase;
      safeData.observacoes = `${observacoesPreservadas}${observacoesPreservadas ? '\n' : ''}${historyLines}`;
    }
    const hasReceivedPayment = safeData.ja_recebido === true || safeData.status_pagamento === 'pago' || safeData.status_pagamento === 'pago_parcial' || safeData.valor_recebido !== undefined || current?.status_pagamento === 'pago' || current?.status_pagamento === 'pago_parcial' || valorRecebido > 0;

    if (!isAVRUpdate && hasReceivedPayment && (valorRecebido < 0 || valorRecebido > saldoDisponivel + 0.005)) {
      throw new Error('O valor recebido não pode ser maior que o saldo disponível do lançamento.');
    }

    const contaBancariaEfetiva = safeData.conta_bancaria_id ?? current?.conta_bancaria_id;
    const currentIsFinancialDebit = current?.tipo === 'saida' && current?.tipo_baixa !== 'avr' && current?.tipo_baixa !== 'bpi' && (
      current?.status_pagamento === 'pago' || current?.status_pagamento === 'pago_parcial' || current?.status_pagamento === 'quitação_pendente' || Number(current?.valor_recebido) > 0
    );
    const saldoAtualDoLancamento = currentIsFinancialDebit && contaBancariaEfetiva === current?.conta_bancaria_id
      ? Number(current?.valor_recebido) || 0
      : 0;
    await assertOperationalBalance({
      tipo: safeData.tipo ?? current?.tipo,
      tipoBaixa: safeData.tipo_baixa ?? current?.tipo_baixa,
      contaId: contaBancariaEfetiva,
      amount: valorRecebido,
      saldoAdicionado: saldoAtualDoLancamento
    });

    if (mode === 'all' && current?.recorrencia_id) {
      const { data: updated, error } = await supabase
        .from('lancamentos_financeiros')
        .update(safeData)
        .eq('recorrencia_id', current.recorrencia_id)
        .eq('status_pagamento', 'aberto')
        .select();
      if (error) throw error;
      return updated[0] as LancamentoFinanceiro;
    } else {
      const { data: updated, error } = await supabase
        .from('lancamentos_financeiros')
        .update(safeData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated as LancamentoFinanceiro;
    }
  },

  delete: async (id: string, mode: 'single' | 'all' = 'single'): Promise<boolean> => {
    const { data: current } = await supabase
      .from('lancamentos_financeiros')
      .select('recorrencia_id')
      .eq('id', id)
      .single();

    if (mode === 'all' && current?.recorrencia_id) {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .delete()
        .eq('recorrencia_id', current.recorrencia_id)
        .eq('status_pagamento', 'aberto');
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
    return true;
  },

  baixaLancamento: async (id: string, data: {
   valor_pago: number,
   data_pagamento: string,
   conta_bancaria_id: string,
   centro_custo_id?: string,
   categoria_id?: string,
   entidade_id?: string,
   tipo_baixa?: 'financeira' | 'bpi' | 'avr',
   valor_desconto?: number,
   valor_acrescimo?: number,
   taxa_bancaria?: number,
   motivo_ajuste?: string,
   motivo_desconto_id?: string,
   motivo_acrescimo_id?: string,
   condicao?: 'a_vista' | 'a_prazo',
   data_competencia?: string,
   data_emissao?: string,
   parcela_valor?: string | number,
   parcelas?: Array<{ id?: string; numero: number; data: string; valor: string; status: string; valor_recebido?: number | null }>,
   parcela_config?: { quantidade: number; periodicidade: string; periodicidade_customizada_dias?: number; com_entrada: boolean },
   propagate_avr?: 'none' | 'open' | 'all'
 }, isMaster: boolean = false): Promise<LancamentoFinanceiro> => {
    const { data: current, error: getError } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .eq('id', id)
      .single();

    if (getError) throw getError;

    const isBPI = data.tipo_baixa === 'bpi';
    const isAVR = data.tipo_baixa === 'avr';
    const isBaixaFinanceira = !isBPI && !isAVR;
    if (isAVR && (current.status_pagamento !== 'aberto' || Number(current.valor_recebido) > 0)) {
      throw new Error('Somente parcelas abertas e sem valor recebido podem ser ajustadas.');
    }
    const valorPagoEfetivo = (isBPI || isAVR) ? (data.valor_pago > 0 ? data.valor_pago : (isBPI ? 0 : current.valor_previsto)) : (data.valor_pago > 0 ? data.valor_pago : current.valor_previsto);
    const parcelaSelecionadaAVR = data.parcelas?.find(parcela => parcela.id === id);
    if (isAVR && current.recorrencia_id && !parcelaSelecionadaAVR) {
      throw new Error('A parcela selecionada não foi encontrada na grade AVR.');
    }
    const valorParcelaSelecionadaAVR = parcelaSelecionadaAVR
      ? parseAVRValue(parcelaSelecionadaAVR.valor)
      : parseAVRValue(data.parcela_valor ?? valorPagoEfetivo);
    let valorTotalAVR = valorParcelaSelecionadaAVR;
    if (isAVR && current.recorrencia_id) {
      const { data: recurrenceRows, error: recurrenceRowsError } = await supabase
        .from('lancamentos_financeiros')
        .select('id, status_pagamento, valor_recebido, valor_previsto')
        .eq('recorrencia_id', current.recorrencia_id);
      if (recurrenceRowsError) throw recurrenceRowsError;

      const rows = recurrenceRows || [];
      const isOpenWithoutReceipt = (row: any) => row.status_pagamento === 'aberto' && Number(row.valor_recebido) <= 0;
      valorTotalAVR = rows.reduce((total, row) => {
        const shouldUseSelectedValue = data.propagate_avr === 'open'
          ? isOpenWithoutReceipt(row)
          : row.id === id;
        return total + (shouldUseSelectedValue ? valorParcelaSelecionadaAVR : Number(row.valor_previsto) || 0);
      }, 0);
    }
    const descontoValor = Number(current.desconto_valor) || 0;
    const acrescimoValor = Number(current.acrescimo_valor) || 0;
    const descontoTipo = normalizeAdjustmentType(current.desconto_tipo);
    const acrescimoTipo = normalizeAdjustmentType(current.acrescimo_tipo);
    const descontoAplicado = calculateAdjustmentAmount(descontoValor, descontoTipo, current.valor_previsto);
    const acrescimoAplicado = calculateAdjustmentAmount(acrescimoValor, acrescimoTipo, current.valor_previsto);
    const taxaAplicada = Number(data.taxa_bancaria) || 0;
    const subtotal = Math.max(0, current.valor_previsto - descontoAplicado + acrescimoAplicado + taxaAplicada);
    const valorRecebidoAnterior = Number(current.valor_recebido) || 0;
    const saldoDisponivel = Math.max(0, subtotal - valorRecebidoAnterior);
    const totalValorRecebido = valorRecebidoAnterior + valorPagoEfetivo;
    if (isBaixaFinanceira && (data.valor_pago < 0 || data.valor_pago > saldoDisponivel + 0.005)) {
      throw new Error('O valor pago não pode ser maior que o saldo disponível do título.');
    }
    const isPartial = isBaixaFinanceira && totalValorRecebido < subtotal - 0.005;
    const dataPagamentoVal = data.data_pagamento || new Date().toISOString().split('T')[0];
    const horaPagamentoVal = new Date().toTimeString().slice(0, 8);
    const contaBancariaVal = data.conta_bancaria_id || current.conta_bancaria_id;
    await assertOperationalBalance({
      tipo: current.tipo,
      tipoBaixa: data.tipo_baixa || current.tipo_baixa,
      contaId: contaBancariaVal,
      amount: valorPagoEfetivo
    });

   // AVR logic: Update history and handle original value
   const observacaoOriginal = current.observacoes || '';
   let observacaoFinal = observacaoOriginal;
   
   if (isAVR) {
     observacaoFinal += `\n[AVR - Ajuste Realizado em ${new Date().toLocaleDateString('pt-BR')}] Valor original alterado de R$ ${current.valor_original || current.valor_previsto} para R$ ${valorTotalAVR}. Motivo: ${data.motivo_ajuste || 'Não informado'}`;
   } else if (isBPI) {
     observacaoFinal += `\n[BPI - Baixa por Inatividade em ${new Date().toLocaleDateString('pt-BR')}]`;
   }

   // Define final payment status based on role
   const finalPaymentStatus = isBPI ? 'bpi' : 'quitação_pendente';

   // AVR logic: Skip financial movement and only update values
   if (isAVR) {
     const now = new Date();
     const timestampStr = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
     // AVR é edição pura: nunca cria registro. A recorrência só é atualizada
     // quando o título já pertence a uma; título avulso continua avulso.
     const recurrenceId = current.recorrencia_id;

     if (recurrenceId && data.parcela_config) {
       const { error: recurrenceError } = await supabase
         .from('recorrencias')
         .update({
           periodicidade: data.parcela_config.periodicidade,
           quantidade_total_parcelas: data.parcela_config.quantidade,
           periodicidade_customizada_dias: data.parcela_config.periodicidade_customizada_dias,
           data_inicio: data.parcelas?.[0]?.data || current.data_vencimento
         })
         .eq('id', recurrenceId);
       if (recurrenceError) throw recurrenceError;
     }
     
     const updatePayload: any = {
       tipo_baixa: 'avr',
       motivo_ajuste: data.motivo_ajuste || current.motivo_ajuste || null,
       valor_previsto: valorParcelaSelecionadaAVR,
       valor_original: valorTotalAVR,
       // Numeração e quantidade só mudam quando o título já é parcela de uma
       // recorrência e a grade do AVR informou esses valores.
       ...(recurrenceId ? {
         recorrencia_id: recurrenceId,
         ...(parcelaSelecionadaAVR?.numero ? { numero_parcela: parcelaSelecionadaAVR.numero } : {}),
         ...(data.parcela_config?.quantidade ? { quantidade_total_parcelas: data.parcela_config.quantidade } : {})
       } : {}),
       ...(data.condicao ? { condicao: data.condicao } : {}),
       ...(data.data_competencia ? { data_competencia: data.data_competencia } : {}),
       ...(data.data_emissao ? { data_emissao: data.data_emissao } : {}),
       ...(data.conta_bancaria_id ? { conta_bancaria_id: data.conta_bancaria_id } : {}),
       ...(data.centro_custo_id ? { centro_custo_id: data.centro_custo_id } : {}),
       ...(data.categoria_id ? { categoria_id: data.categoria_id } : {}),
       ...(data.entidade_id ? { entidade_id: data.entidade_id } : {}),
       ...(parcelaSelecionadaAVR?.data ? { data_vencimento: parcelaSelecionadaAVR.data } : {}),
       observacoes: (current.observacoes || '') + `\n[AVR - Ajuste Realizado em ${timestampStr}] Valor alterado de R$ ${current.valor_original || current.valor_previsto} para R$ ${valorTotalAVR}. Motivo: ${data.motivo_ajuste || 'Não informado'}`,
     };

     // Se não for master, o status de aprovação volta para digital para conferência
     if (!isMaster) {
       updatePayload.status_aprovacao = 'digital';
     }

     let updated: LancamentoFinanceiro;
     if (data.propagate_avr === 'open' && current.recorrencia_id) {
       updated = current as LancamentoFinanceiro;
     } else {
       const { data: selectedUpdated, error: updateError } = await supabase
         .from('lancamentos_financeiros')
         .update(updatePayload)
         .eq('id', id)
         .eq('status_pagamento', 'aberto')
         .or('valor_recebido.is.null,valor_recebido.eq.0')
         .select()
         .single();
       if (updateError) throw updateError;
       updated = selectedUpdated as LancamentoFinanceiro;
     }


     // Propagação do AVR atualiza somente parcelas abertas da mesma recorrência.
     if (data.propagate_avr === 'open' && current.recorrencia_id) {
       const { data: openParcels, error: openParcelsError } = await supabase
         .from('lancamentos_financeiros')
         .select('id, observacoes')
         .eq('recorrencia_id', current.recorrencia_id)
         .eq('status_pagamento', 'aberto')
         .or('valor_recebido.is.null,valor_recebido.eq.0');
       if (openParcelsError) throw openParcelsError;

       for (const openParcel of openParcels || []) {
         const { error: propagationError } = await supabase
           .from('lancamentos_financeiros')
           .update({
             valor_previsto: valorParcelaSelecionadaAVR,
             valor_original: valorTotalAVR,
             tipo_baixa: 'avr',
           ...(!isMaster ? { status_aprovacao: 'digital' } : {}),
           motivo_ajuste: data.motivo_ajuste || current.motivo_ajuste || null,
           ...(data.conta_bancaria_id ? { conta_bancaria_id: data.conta_bancaria_id } : {}),
           ...(data.centro_custo_id ? { centro_custo_id: data.centro_custo_id } : {}),
           ...(data.categoria_id ? { categoria_id: data.categoria_id } : {}),
           ...(data.entidade_id ? { entidade_id: data.entidade_id } : {}),
           ...(data.condicao ? { condicao: data.condicao } : {}),
           ...(data.data_competencia ? { data_competencia: data.data_competencia } : {}),
           ...(data.data_emissao ? { data_emissao: data.data_emissao } : {}),
           observacoes: (openParcel.observacoes || '') + `\\n[AVR Propagado em ${timestampStr}]`
         })
           .eq('id', openParcel.id)
           .eq('status_pagamento', 'aberto')
           .or('valor_recebido.is.null,valor_recebido.eq.0');
         if (propagationError) throw propagationError;
       }
     }

     return updated as LancamentoFinanceiro;
   }

   const updatePayload: any = {
     status_pagamento: isPartial && !isBPI ? 'quitação_pendente' : finalPaymentStatus,
     ...(isBaixaFinanceira ? { status_aprovacao: 'digital' } : {}),
     data_pagamento: dataPagamentoVal,
     hora_pagamento: isBPI ? null : horaPagamentoVal,
     conta_bancaria_id: contaBancariaVal,
     centro_custo_id: data.centro_custo_id || current.centro_custo_id,
     categoria_id: data.categoria_id || current.categoria_id,
     tipo_baixa: data.tipo_baixa || 'financeira',
     desconto_valor: descontoValor,
     desconto_tipo: descontoTipo,
     acrescimo_valor: acrescimoValor,
     acrescimo_tipo: acrescimoTipo,
     motivo_ajuste: data.motivo_ajuste || null,
     motivo_desconto_id: data.motivo_desconto_id || current.motivo_desconto_id || null,
     motivo_acrescimo_id: data.motivo_acrescimo_id || current.motivo_acrescimo_id || null,
     observacoes: isPartial && !isBPI
       ? observacaoOriginal + `\n[Pagamento parcial de R$ ${valorPagoEfetivo} em ${dataPagamentoVal.split('-').reverse().join('/')}]`
       : observacaoFinal,
     valor_recebido: isBPI ? 0 : totalValorRecebido
   };

   if (isBPI) {
     updatePayload.bpi_em = new Date().toISOString();
   }

   const { data: updated, error: updateError } = await supabase
     .from('lancamentos_financeiros')
     .update(updatePayload)
     .eq('id', id)
     .select()
     .single();

   if (updateError) throw updateError;

   return updated as LancamentoFinanceiro;
 },

  estornarLancamento: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('estornar_lancamento_atomico', { p_lancamento_id: id });
    if (error) throw error;
  },

  approveInBatch: async (ids: string[], targetStatus: 'digital' | 'confirmado_master' | 'reprovado'): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

    if (targetStatus === 'confirmado_master' && profile?.role !== 'master') {
      throw new Error('Apenas usuários Master podem confirmar saldos.');
    }

    if (targetStatus === 'reprovado') {
      const { error } = await supabase.rpc('reprovar_lancamentos_master', { p_lancamento_ids: ids });
      if (error) throw error;
      return;
    }

    if (targetStatus === 'confirmado_master') {
      // BPI é confirmado sem entrar no saldo: a RPC mantém status_pagamento = 'bpi'.
      const { data: bpiRows, error: bpiError } = await supabase
        .from('lancamentos_financeiros')
        .select('id')
        .in('id', ids)
        .eq('status_pagamento', 'bpi');
      if (bpiError) throw bpiError;

      const bpiIds = (bpiRows || []).map(row => row.id);
      if (bpiIds.length > 0) {
        const { error } = await supabase.rpc('confirmar_bpi_master', { p_lancamento_ids: bpiIds });
        if (error) throw error;
      }

      ids = ids.filter(id => !bpiIds.includes(id));
      if (ids.length === 0) return;
    }

    const updatePayload: any = {
      status_aprovacao: targetStatus,
      data_aprovacao: targetStatus === 'confirmado_master' ? new Date().toISOString() : null
    };

    if (targetStatus === 'confirmado_master') {
      updatePayload.status_pagamento = 'pago';
      updatePayload.data_pagamento = new Date().toISOString().split('T')[0];
    }

    if (targetStatus !== 'confirmado_master') {
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .update(updatePayload)
        .in('id', ids);
      if (error) throw error;
      return;
    }

    const { data: rows, error: rowsError } = await supabase
      .from('lancamentos_financeiros')
      .select('id, status_pagamento, vinculo_residuo_id, data_pagamento, valor_previsto, valor_recebido, desconto_valor, desconto_tipo, acrescimo_valor, acrescimo_tipo')
      .in('id', ids);
    if (rowsError) throw rowsError;

    const registros = rows || [];
    const valorFinalAjustadoCentavos = (row: typeof registros[number]): number => {
      const valorPrevisto = Math.abs(Number(row.valor_previsto) || 0);
      const ajusteDesconto = Math.round(calculateAdjustmentAmount(
        row.desconto_valor,
        normalizeAdjustmentType(row.desconto_tipo),
        valorPrevisto
      ) * 100) / 100;
      const ajusteAcrescimo = Math.round(calculateAdjustmentAmount(
        row.acrescimo_valor,
        normalizeAdjustmentType(row.acrescimo_tipo),
        valorPrevisto
      ) * 100) / 100;
      return Math.round((valorPrevisto - ajusteDesconto + ajusteAcrescimo) * 100);
    };
    const parcialIds = new Set(registros
      .filter(row => row.status_pagamento === 'pago_parcial'
        || Boolean(row.vinculo_residuo_id)
        || (Number(row.valor_recebido) > 0
          && Math.round(Number(row.valor_recebido) * 100) < valorFinalAjustadoCentavos(row)))
      .map(row => row.id));
    const comDataPagamento = new Set(registros.filter(row => row.data_pagamento).map(row => row.id));

    const aplicar = async (grupoIds: string[], preservarDataPagamento: boolean) => {
      if (grupoIds.length === 0) return;
      const payload: any = { ...updatePayload };
      if (preservarDataPagamento) delete payload.data_pagamento;

      const regulares = grupoIds.filter(id => !parcialIds.has(id));
      const parciais = grupoIds.filter(id => parcialIds.has(id));

      if (regulares.length > 0) {
        const { error } = await supabase.from('lancamentos_financeiros').update(payload).in('id', regulares);
        if (error) throw error;
      }
      if (parciais.length > 0) {
        const { error } = await supabase
          .from('lancamentos_financeiros')
          .update({ ...payload, status_pagamento: 'pago_parcial' })
          .in('id', parciais);
        if (error) throw error;
      }
    };

    await aplicar(ids.filter(id => comDataPagamento.has(id)), true);
    await aplicar(ids.filter(id => !comDataPagamento.has(id)), false);
  },

  confirmarQuitacao: async (id: string, isMaster: boolean = false): Promise<void> => {
    const { error } = await supabase
      .from('lancamentos_financeiros')
      .update({ status_pagamento: isMaster ? 'pago' : 'quitação_pendente' })
      .eq('id', id);
    if (error) throw error;
  },

  getAnexos: async (lancamentoId: string): Promise<any[]> => {
    const anexos = await lancamentosService.getAnexosByLancamentoIds([lancamentoId]);
    return anexos;
  },

  getAnexosByLancamentoIds: async (lancamentoIds: string[]): Promise<any[]> => {
    const ids = Array.from(new Set(lancamentoIds.filter(Boolean)));
    if (ids.length === 0) return [];

    diagnosticLogger.info('lancamento-anexos', 'Iniciando leitura dos anexos no banco', { lancamentoIds: ids });
    const { data, error } = await supabase
      .from('lancamento_anexos')
      .select('*')
      .in('lancamento_id', ids);
    if (error) {
      diagnosticLogger.error('lancamento-anexos', 'Erro na leitura dos anexos no banco', { lancamentoIds: ids, error });
      throw error;
    }
    diagnosticLogger.info('lancamento-anexos', 'Leitura dos anexos concluída', { lancamentoIds: ids, count: data?.length || 0 });
    return data || [];
  },

  deleteAnexo: async (id: string, filePath: string): Promise<void> => {
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);
    if (storageError) console.error('Storage error:', storageError);

    const { error: dbError } = await supabase
      .from('lancamento_anexos')
      .delete()
      .eq('id', id);
    if (dbError) throw dbError;
  }
};