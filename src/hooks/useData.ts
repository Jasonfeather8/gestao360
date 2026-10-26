import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { DashboardIndicadores, ImportacaoDados } from '../types';
import type { TransferenciaBancaria } from '../types';
import type { CriarTransferenciaParams } from '../services/transferenciasService';
import { transferenciasService } from '../services/transferenciasService';
import { desfazerImportacao } from '../services/migracao';
import { entidadesService } from '../services/entidadesService';
import { centrosCustoService } from '../services/centrosCustoService';
import { categoriasService } from '../services/categoriasService';
import { contasService } from '../services/contasService';
import { lancamentosService } from '../services/lancamentosService';
import { recorrenciasService } from '../services/recorrenciasService';
import { usuariosService } from '../services/usuariosService';
import { auditoriaService } from '../services/auditoriaService';
import { notificationsService } from '../services/notificationsService';
import { diagnosticLogger } from '../services/diagnosticLogger';
import { persistirExtrato } from '../services/extrato/persistencia';
import { conciliacaoService } from '../services/conciliacaoService';
import { cofreLocalService } from '../services/cofreLocalService';

export function useCofreLocalConta() {
  return useQuery({
    queryKey: ['cofreLocal', 'conta'],
    queryFn: cofreLocalService.getConta,
  });
}

export function useCofreLocalLancamentos(contaId: string | null, startDate: string | null, endDate: string | null) {
  const enabled = Boolean(contaId && startDate && endDate);
  return useQuery({
    queryKey: ['cofreLocal', 'lancamentos', contaId, startDate, endDate],
    queryFn: ({ signal }) => cofreLocalService.getLancamentos(contaId as string, startDate as string, endDate as string, signal),
    enabled,
  });
}

export function useCofreLocalTransacoes(contaId: string | null, startDate: string | null, endDate: string | null, ativo = true) {
  const enabled = ativo && Boolean(contaId && startDate && endDate);
  return useQuery({
    queryKey: ['cofreLocal', 'transacoesBanco', contaId, startDate, endDate],
    queryFn: ({ signal }) => cofreLocalService.getTransacoesBanco(contaId as string, startDate as string, endDate as string, signal),
    enabled,
  });
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: notificationsService.getAll,
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!user?.id) return;

    // Usando um nome único para o canal para evitar colisões
    const channelName = `notifications-${user.id}-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: notificationsService.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsService.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  return {
    ...query,
    notifications: query.data || [],
    unreadCount: (query.data || []).filter(n => !n.read).length,
    markAsRead: markReadMutation.mutateAsync,
    markAllAsRead: markAllReadMutation.mutateAsync
  };
}

export function useFinancialSummary(filters?: { accountId?: string, costCenterId?: string }) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['financialSummary', user?.id, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_summary', {
        p_user_id: user?.id,
        p_account_id: filters?.accountId || null,
        p_cost_center_id: filters?.costCenterId || null
      });
      if (error) throw error;
      return data[0];
    },
    enabled: !!user?.id
  });
}

export function useEntidades() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['entidades'], queryFn: entidadesService.getAll });
  const createMutation = useMutation({ mutationFn: entidadesService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => entidadesService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });
  const deleteMutation = useMutation({ mutationFn: entidadesService.delete, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidades'] }) });

  return {
    ...query,
    createEntity: createMutation.mutateAsync,
    updateEntity: updateMutation.mutateAsync,
    deleteEntity: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
}

export function useEntidadeDocuments(entidadeId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['entidadeDocuments', entidadeId], queryFn: () => entidadeId ? entidadesService.getDocuments(entidadeId) : Promise.resolve([]), enabled: !!entidadeId });
  const deleteMutation = useMutation({ mutationFn: ({ id, path }: { id: string, path: string }) => entidadesService.deleteDocument(id, path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entidadeDocuments', entidadeId] }) });

  return {
    ...query,
    documents: query.data || [],
    deleteDocument: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending
  };
}

export function useCentrosCusto() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['centrosCusto'], queryFn: centrosCustoService.getAll });
  const createMutation = useMutation({ mutationFn: centrosCustoService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => centrosCustoService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });
  const deleteMutation = useMutation({ mutationFn: ({ id }: { id: string }) => centrosCustoService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['centrosCusto'] }) });

  return { ...query, createCC: createMutation.mutateAsync, updateCC: updateMutation.mutateAsync, deleteCC: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useCategorias() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['categorias'], queryFn: categoriasService.getAll });
  const createMutation = useMutation({ mutationFn: categoriasService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => categoriasService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => categoriasService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categorias'] }) });

  return { ...query, createCategory: createMutation.mutateAsync, updateCategory: updateMutation.mutateAsync, deleteCategory: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useCategoriasAjuste() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['categoriasAjuste'], queryFn: async () => { const { data, error } = await supabase.from('categorias_ajuste').select('*').order('nome'); if (error) throw error; return data; } });
  const createMutation = useMutation({ mutationFn: async (data: { nome: string, tipo: 'desconto' | 'acrescimo' }) => { const { data: { user } } = await supabase.auth.getUser(); const { data: result, error } = await supabase.from('categorias_ajuste').insert([{ ...data, user_id: user?.id }]).select().single(); if (error) throw error; return result; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });
  const updateMutation = useMutation({ mutationFn: async ({ id, data }: { id: string, data: any }) => { const { error } = await supabase.from('categorias_ajuste').update(data).eq('id', id); if (error) throw error; return true; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('categorias_ajuste').update({ status: 'inativo' }).eq('id', id); if (error) throw error; return true; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categoriasAjuste'] }) });

  return { ...query, categoriasAjuste: query.data || [], createCategoriaAjuste: createMutation.mutateAsync, updateCategoriaAjuste: updateMutation.mutateAsync, deleteCategoriaAjuste: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useContasSaldos() {
  return useQuery({
    queryKey: ['contasSaldos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contas_saldos_reais');
      if (error) throw error;
      return data as Array<{ conta_id: string; saldo_confirmado: number; saldo_operacional: number }>;
    }
  });
}

export function useContas() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['contas'], queryFn: contasService.getAll });
  const createMutation = useMutation({ mutationFn: (item: any) => contasService.create(item), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => contasService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => contasService.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas'] }) });

  return { ...query, createAccount: createMutation.mutateAsync, updateAccount: updateMutation.mutateAsync, deleteAccount: deleteMutation.mutateAsync, isCreating: createMutation.isPending };
}

export function useTransferencias() {
  return useQuery({ queryKey: ['transferencias'], queryFn: transferenciasService.listar });
}

export function useCriarTransferencia() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (params: CriarTransferenciaParams) => transferenciasService.criar(params),
    onSuccess: () => {
      ['transferencias', 'lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'auditoriaLogs', 'notifications']
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });

  return { criarTransferencia: mutation.mutateAsync, isCreating: mutation.isPending };
}

export function useTransacoesCandidatas(transferencia: TransferenciaBancaria | null, lado: 'origem' | 'destino') {
  const pendente = Boolean(transferencia && transferencia.status !== 'estornada' && (
    lado === 'origem' ? !transferencia.transacao_origem_id : !transferencia.transacao_destino_id
  ));
  return useQuery({
    queryKey: ['transacoesBanco', 'candidatas', transferencia?.id, lado],
    queryFn: () => transferencia ? transferenciasService.listarCandidatas(transferencia, lado) : Promise.resolve([]),
    enabled: pendente,
  });
}

export function useSugerirTransferenciasDestino(transacaoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['transferencias', 'sugestoesDestino', transacaoId],
    queryFn: () => transacaoId ? transferenciasService.sugerirTransferenciasDestino(transacaoId) : Promise.resolve([]),
    enabled: enabled && Boolean(transacaoId),
  });
}

export function useIdentificarTransferencia() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ transacaoId, contaRelacionadaId }: { transacaoId: string; contaRelacionadaId: string }) =>
      transferenciasService.identificarTransferencia(transacaoId, contaRelacionadaId),
    onSuccess: () => {
      ['transferencias', 'lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'auditoriaLogs', 'notifications', 'transacoesBanco']
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });
  return { identificarTransferencia: mutation.mutateAsync, isIdentificando: mutation.isPending };
}

export function useConciliarTransferencia() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ transferenciaId, transacaoId, lado }: { transferenciaId: string; transacaoId: string; lado: 'origem' | 'destino' }) =>
      transferenciasService.conciliar(transferenciaId, transacaoId, lado),
    onSuccess: () => {
      ['transferencias', 'lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'auditoriaLogs', 'notifications', 'transacoesBanco']
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });
  return { conciliarTransferencia: mutation.mutateAsync, isConciliando: mutation.isPending };
}

export function useDecidirTransferencia() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ transferenciaId, aprovado, justificativa }: { transferenciaId: string; aprovado: boolean; justificativa?: string }) =>
      transferenciasService.decidir(transferenciaId, aprovado, justificativa),
    onSuccess: () => {
      ['transferencias', 'lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'auditoriaLogs', 'notifications', 'transacoesBanco']
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });
  return { decidirTransferencia: mutation.mutateAsync, isDecidindo: mutation.isPending };
}

export function useEstornarTransferencia() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ transferenciaId, motivo }: { transferenciaId: string; motivo: string }) =>
      transferenciasService.estornar(transferenciaId, motivo),
    onSuccess: () => {
      ['transferencias', 'lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'auditoriaLogs', 'notifications', 'transacoesBanco']
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });
  return { estornarTransferencia: mutation.mutateAsync, isEstornando: mutation.isPending };
}

export function useLancamentos(filters?: any) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isMaster = role === 'master';

  const query = useQuery({ queryKey: ['lancamentos', filters], queryFn: ({ signal }) => lancamentosService.getAll(filters, signal) });
  const createMutation = useMutation({ mutationFn: ({ item, recorrencia }: { item: any, recorrencia?: any }) => lancamentosService.create(item, recorrencia), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data, mode }: { id: string, data: any, mode?: 'single' | 'all' }) => lancamentosService.update(id, data, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const deleteMutation = useMutation({ mutationFn: ({ id, mode }: { id: string, mode?: 'single' | 'all' }) => lancamentosService.delete(id, mode), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const batchApproveMutation = useMutation({ mutationFn: ({ ids, targetStatus }: { ids: string[], targetStatus: 'digital' | 'confirmado_master' | 'reprovado' }) => lancamentosService.approveInBatch(ids, targetStatus), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });
  const baixaMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => lancamentosService.baixaLancamento(id, data, isMaster), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['lancamento'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });

  const estornoMutation = useMutation({ mutationFn: (id: string) => lancamentosService.estornarLancamento(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] }); queryClient.invalidateQueries({ queryKey: ['contasSaldos'] }); } });

  return {
    ...query,
    data: query.data?.data || [], 
    totalCount: query.data?.count || 0, 
    createLancamento: createMutation.mutateAsync,
    updateLancamento: updateMutation.mutateAsync,
    deleteLancamento: deleteMutation.mutateAsync,
    baixaLancamento: baixaMutation.mutateAsync,
    estornarLancamento: estornoMutation.mutateAsync,
    batchApprove: batchApproveMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBatchApproving: batchApproveMutation.isPending
  };
}

const MARGEM_DIAS_LANCAMENTOS = 60;

function deslocarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Lançamentos da conta para conciliar: a janela é ampliada porque o dia de
// referência pode ser a baixa (data_pagamento) e não o vencimento.
export function useLancamentosDaConta(
  contaId: string | null,
  dataInicio: string | null,
  dataFim: string | null,
) {
  const habilitado = Boolean(contaId && dataInicio && dataFim);
  const filters = habilitado
    ? {
        contaId: contaId as string,
        startDate: deslocarDias(dataInicio as string, -MARGEM_DIAS_LANCAMENTOS),
        endDate: deslocarDias(dataFim as string, MARGEM_DIAS_LANCAMENTOS),
        page: 1,
        pageSize: 1000,
      }
    : undefined;

  const query = useQuery({
    queryKey: ['lancamentos', filters],
    enabled: habilitado,
    queryFn: ({ signal }) => lancamentosService.getAll(filters, signal),
  });

  return { ...query, data: query.data?.data || [], totalCount: query.data?.count || 0 };
}

export function useLancamento(id: string | null) {
  return useQuery({ queryKey: ['lancamento', id], queryFn: () => id ? lancamentosService.getById(id) : Promise.resolve(null), enabled: !!id });
}

export function useLancamentoParcelas(recorrenciaId: string | null) {
  return useQuery({
    queryKey: ['lancamentoParcelas', recorrenciaId],
    queryFn: () => recorrenciaId ? lancamentosService.getParcelasByRecorrenciaId(recorrenciaId) : Promise.resolve([]),
    enabled: !!recorrenciaId,
  });
}

export function useLancamentoAnexosByIds(lancamentoIds: string[]) {
  const ids = Array.from(new Set(lancamentoIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['lancamentoAnexosByIds', ids],
    queryFn: () => lancamentosService.getAnexosByLancamentoIds(ids),
    enabled: ids.length > 0,
  });
}

export function useAuditoriaLogsByRegistroIds(registroIds: string[]) {
  const ids = Array.from(new Set(registroIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['auditoriaLogs', 'registros', ids],
    queryFn: () => auditoriaService.getByRegistroIds(ids),
    enabled: ids.length > 0,
  });
}

export function useLancamentoAnexos(lancamentoId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['lancamentoAnexos', lancamentoId],
    queryFn: async () => {
      if (!lancamentoId) return [];
      diagnosticLogger.info('lancamento-anexos', 'Consultando anexos', { lancamentoId });
      const anexos = await lancamentosService.getAnexos(lancamentoId);
      diagnosticLogger.info('lancamento-anexos', 'Anexos consultados', { lancamentoId, count: anexos.length });
      return anexos;
    },
    enabled: !!lancamentoId,
    meta: { feature: 'lancamento-anexos' },
  });
  const deleteMutation = useMutation({ mutationFn: ({ id, path }: { id: string, path: string }) => lancamentosService.deleteAnexo(id, path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lancamentoAnexos', lancamentoId] }) });

  return { ...query, anexos: query.data || [], deleteAnexo: deleteMutation.mutateAsync, isDeleting: deleteMutation.isPending };

}

export function useRecorrencias() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['recorrencias'], queryFn: recorrenciasService.getAll });
  const stopMutation = useMutation({ mutationFn: recorrenciasService.stopRecorrencia, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recorrencias'] }); queryClient.invalidateQueries({ queryKey: ['lancamentos'] }); } });

  return { ...query, stopRecorrencia: stopMutation.mutateAsync, isStopping: stopMutation.isPending };
}

export function useUsuarios() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['usuarios'], queryFn: usuariosService.getAll });
  const createMutation = useMutation({ mutationFn: usuariosService.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string, data: any }) => usuariosService.update(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }) });

  return { ...query, inviteUser: createMutation.mutateAsync, updateUser: updateMutation.mutateAsync, isInviting: createMutation.isPending };
}

export function useAuditoriaLogs() {
  return useQuery({ queryKey: ['auditoriaLogs'], queryFn: auditoriaService.getAll });
}

export function useDashboardIndicadores(inicio?: string | null, fim?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboardIndicadores', user?.id, inicio ?? null, fim ?? null],
    queryFn: async (): Promise<DashboardIndicadores> => {
      const { data, error } = await supabase.rpc('get_dashboard_indicadores', {
        p_inicio: inicio ?? null,
        p_fim: fim ?? null,
      });
      if (error) throw error;
      return data as DashboardIndicadores;
    },
    enabled: !!user?.id,
  });
}

export function useImportacoesDados() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['importacoesDados', user?.id],
    queryFn: async (): Promise<ImportacaoDados[]> => {
      const { data, error } = await supabase
        .from('importacoes_dados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ImportacaoDados[];
    },
    enabled: !!user?.id,
  });
}

export function useDesfazerImportacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (loteId: string) => desfazerImportacao(loteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importacoesDados'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['contasSaldos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardIndicadores'] });
      queryClient.invalidateQueries({ queryKey: ['financialSummary'] });
      queryClient.invalidateQueries({ queryKey: ['auditoriaLogs'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function usePersistirExtrato() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: persistirExtrato,
    onSuccess: () => {
      ['transacoesBanco', 'transferencias', 'auditoriaLogs', 'notifications'].forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      });
    },
  });

  return {
    persistir: mutation.mutateAsync,
    isPersisting: mutation.isPending,
  };
}

export function useConciliarTransacao() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: conciliacaoService.conciliar,
    onSuccess: () => {
      [
        'lancamentos',
        'lancamento',
        'contasSaldos',
        'auditoriaLogs',
        'notifications',
        'dashboardStats',
        'dashboardIndicadores',
        'financialSummary',
        'transferencias',
        'transacoesBanco',
        'conciliacoes',
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    },
  });

  return { conciliar: mutation.mutateAsync, isConciliando: mutation.isPending };
}

export function useStatusConciliacaoTransacoes(transacaoIds: string[], enabled: boolean) {
  return useQuery<Record<string, boolean>>({
    queryKey: ['transacoesBanco', 'statusConciliacao', [...transacaoIds].sort()],
    queryFn: () => transacaoIds.length > 0 ? conciliacaoService.listarStatusConciliacao(transacaoIds) : Promise.resolve({}),
    enabled: enabled && transacaoIds.length > 0,
  });
}

export function useLancamentosConciliados(lancamentoIds: string[], enabled: boolean) {
  return useQuery<Set<string>>({
    queryKey: ['conciliacoes', 'porLancamento', [...lancamentoIds].sort()],
    queryFn: () => conciliacaoService.listarLancamentosConciliados(lancamentoIds),
    enabled: enabled && lancamentoIds.length > 0,
  });
}
