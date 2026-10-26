import { supabase } from '@/integrations/supabase/client';
import type { TransacaoBancoCandidata, TransferenciaBancaria } from '../types';

export interface CriarTransferenciaParams {
  contaOrigemId: string;
  contaDestinoId: string;
  valorCentavos: number;
  dataTransferencia: string;
  tarifaCentavos?: number;
  tarifaCategoriaId?: string;
  tarifaCentroCustoId?: string;
  observacao?: string;
}

function centavos(valor: number): number {
  return Math.round(Number(valor) * 100);
}

function deslocarDias(data: string, dias: number): string {
  const deslocada = new Date(`${data}T00:00:00Z`);
  deslocada.setUTCDate(deslocada.getUTCDate() + dias);
  return deslocada.toISOString().slice(0, 10);
}

function avaliarProveniencia(transacao: any): string[] {
  const pendencias: string[] = [];
  const lote = transacao.lote;
  const metadata = lote?.metadata && typeof lote.metadata === 'object' ? lote.metadata : {};

  if (!lote) pendencias.push('Lote do extrato ausente');
  else {
    if (lote.status !== 'confirmado') pendencias.push('Lote não confirmado');
    if (lote.paginas < 1 || lote.paginas > 15) pendencias.push('Quantidade de páginas inválida');
    if (metadata.reviewState !== 'validated') pendencias.push('Lote não validado');
    const temContagemPendencias = Object.prototype.hasOwnProperty.call(metadata, 'pendingReviewCount');
    if (temContagemPendencias && metadata.pendingReviewCount !== 0 && metadata.pendingReviewCount !== '0') pendencias.push('Há revisões pendentes');
    if (!Array.isArray(metadata.consistency?.criticalErrors) || metadata.consistency.criticalErrors.length > 0) pendencias.push('Lote com inconsistências críticas');
  }

  if (transacao.pagina_origem == null || transacao.pagina_origem < 1) pendencias.push('Página de origem inválida');
  if (lote && transacao.pagina_origem > lote.paginas) pendencias.push('Página fora do lote');
  if (transacao.linha_origem == null || transacao.linha_origem < 1) pendencias.push('Linha de origem inválida');
  if (transacao.confianca_extracao == null || transacao.confianca_extracao < 0.85 || transacao.confianca_extracao > 1) pendencias.push('Confiança de extração insuficiente');
  if (transacao.estado_revisao !== 'valida') pendencias.push('Transação pendente de revisão');
  if (!/^[a-f0-9]{64}$/.test(transacao.hash_transacao || '')) pendencias.push('Hash da transação inválido');
  if (!transacao.arquivo_nome?.trim()) pendencias.push('Nome do arquivo ausente');
  if (!/^[a-f0-9]{64}$/.test(transacao.arquivo_hash || '')) pendencias.push('Hash do arquivo inválido');

  const formato = transacao.formato_arquivo;
  const origem = transacao.origem_extracao;
  const origemArquivoEsperada = formato === 'pdf' && origem === 'texto'
    ? 'pdf_texto'
    : formato === 'pdf' && origem === 'ocr'
      ? 'pdf_ocr'
      : (formato === 'csv' || formato === 'xlsx') && origem === 'estruturado'
        ? formato
        : null;
  if (!formato || !origem || !transacao.origem_arquivo || !origemArquivoEsperada || transacao.origem_arquivo !== origemArquivoEsperada) {
    pendencias.push('Formato e origem do arquivo incompatíveis');
  }

  return pendencias;
}

export const transferenciasService = {
  listar: async (): Promise<TransferenciaBancaria[]> => {
    const { data, error } = await supabase
      .from('transferencias_bancarias')
      .select('*, conta_origem:contas_bancarias!transferencias_bancarias_conta_origem_id_fkey(nome), conta_destino:contas_bancarias!transferencias_bancarias_conta_destino_id_fkey(nome), transacao_origem:transacoes_banco!transferencias_bancarias_transacao_origem_id_fkey(data_transacao, descricao_banco, valor), transacao_destino:transacoes_banco!transferencias_bancarias_transacao_destino_id_fkey(data_transacao, descricao_banco, valor), tarifa:lancamentos_financeiros!transferencias_tarifa_lancamento_fkey(valor_previsto, categoria_id, centro_custo_id)')
      .order('data_transferencia', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TransferenciaBancaria[];
  },

  criar: async (params: CriarTransferenciaParams): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('criar_transferencia_atomica', {
      p_conta_origem_id: params.contaOrigemId,
      p_conta_destino_id: params.contaDestinoId,
      p_valor_centavos: Math.trunc(params.valorCentavos),
      p_data_transferencia: params.dataTransferencia,
      p_tarifa_centavos: Math.trunc(params.tarifaCentavos ?? 0),
      p_tarifa_categoria_id: params.tarifaCategoriaId || null,
      p_tarifa_centro_custo_id: params.tarifaCentroCustoId || null,
      p_observacao: params.observacao?.trim() || null,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  listarCandidatas: async (transferencia: TransferenciaBancaria, lado: 'origem' | 'destino'): Promise<TransacaoBancoCandidata[]> => {
    const contaId = lado === 'origem' ? transferencia.conta_origem_id : transferencia.conta_destino_id;
    const valorCentavos = (lado === 'origem' ? -1 : 1) * centavos(transferencia.valor);
    const { data, error } = await supabase
      .from('transacoes_banco')
      .select('id, data_transacao, valor, valor_centavos, tipo_movimento, descricao_banco, status_conciliacao, pagina_origem, linha_origem, confianca_extracao, estado_revisao, hash_transacao, arquivo_nome, arquivo_hash, formato_arquivo, origem_extracao, origem_arquivo, lote:extratos_bancarios!transacoes_banco_extrato_lote_id_fkey(status, paginas, metadata)')
      .eq('conta_bancaria_id', contaId)
      .eq('status_conciliacao', false)
      .eq('valor_centavos', valorCentavos)
      .gte('data_transacao', deslocarDias(transferencia.data_transferencia, -7))
      .lte('data_transacao', deslocarDias(transferencia.data_transferencia, 7))
      .order('data_transacao', { ascending: false })
      .order('descricao_banco', { ascending: true });
    if (error) throw error;
    return (data || []).map((transacao: any) => {
      const pendencias = avaliarProveniencia(transacao);
      return {
        id: transacao.id,
        data_transacao: transacao.data_transacao,
        valor: Number(transacao.valor),
        valor_centavos: Number(transacao.valor_centavos),
        tipo_movimento: transacao.tipo_movimento,
        descricao_banco: transacao.descricao_banco,
        provenienciaCompleta: pendencias.length === 0,
        pendencias,
      };
    });
  },

  conciliar: async (transferenciaId: string, transacaoId: string, lado: 'origem' | 'destino'): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('conciliar_transferencia_atomica', {
      p_transferencia_id: transferenciaId,
      p_transacao_id: transacaoId,
      p_lado: lado,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  identificarTransferencia: async (transacaoId: string, contaRelacionadaId: string): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('identificar_transacao_transferencia_atomica', {
      p_transacao_id: transacaoId,
      p_conta_relacionada_id: contaRelacionadaId,
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },

  sugerirTransferenciasDestino: async (transacaoId: string): Promise<TransferenciaBancaria[]> => {
    const { data, error } = await supabase.rpc('sugerir_transferencias_destino', {
      p_transacao_id: transacaoId,
    });
    if (error) throw error;
    return (data || []) as TransferenciaBancaria[];
  },

  decidir: async (transferenciaId: string, aprovado: boolean, justificativa?: string): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('decidir_aprovacao_master', {
      p_item_id: transferenciaId,
      p_tipo: 'transferencia_bancaria',
      p_aprovado: aprovado,
      p_justificativa: justificativa?.trim() || null,
    });
    if (error) throw error;
    const resposta = data as { bloqueada: boolean; mensagem: string; resultado: TransferenciaBancaria };
    if (resposta.bloqueada) throw new Error(resposta.mensagem);
    return resposta.resultado;
  },

  estornar: async (transferenciaId: string, motivo: string): Promise<TransferenciaBancaria> => {
    const { data, error } = await supabase.rpc('estornar_transferencia_atomica', {
      p_transferencia_id: transferenciaId,
      p_motivo: motivo.trim(),
    });
    if (error) throw error;
    return data as TransferenciaBancaria;
  },
};
