import { supabase } from '@/integrations/supabase/client';
import type { MigracaoCadastros, MigracaoColunas, MigracaoLinha } from '../../types';
import { detectarColunas } from './colunas';
import type { CelulaPlanilha } from './colunas';
import { buscarDuplicatas } from './duplicatas';
import { lerPlanilha } from './leituraPlanilha';
import { montarLinhas, montarObservacoes } from './montarLinhas';

const COLUNAS_ESSENCIAIS: { campo: keyof MigracaoColunas; rotulo: string }[] = [
  { campo: 'valor', rotulo: 'Valor' },
  { campo: 'vencimento', rotulo: 'Data de Vencimento' },
  { campo: 'recebido', rotulo: 'Recebido' },
];

export interface MigracaoPreparada {
  arquivo: string;
  tamanho: number;
  abas: string[];
  abaSelecionada: string;
  colunas: MigracaoColunas;
  naoReconhecidas: string[];
  linhas: MigracaoLinha[];
  avisos: string[];
}

/** Lê o arquivo, casa com os cadastros, checa duplicatas no banco e devolve as linhas prontas para revisão. */
export async function prepararMigracao(
  file: File,
  cadastros: MigracaoCadastros,
  aba?: string
): Promise<MigracaoPreparada> {
  const planilha = await lerPlanilha(file);
  if (planilha.abas.length === 0) throw new Error('Nenhuma aba encontrada no arquivo.');

  const escolhida = (aba ? planilha.abas.find(item => item.nome === aba) : undefined) ?? planilha.abas[0];
  const deteccao = detectarColunas(escolhida.linhas);

  const avisos: string[] = [];
  const ausentes = COLUNAS_ESSENCIAIS.filter(item => deteccao.colunas[item.campo] === undefined);
  if (ausentes.length > 0) {
    avisos.push(`Colunas essenciais não encontradas na planilha: ${ausentes.map(item => item.rotulo).join(', ')}.`);
  }

  const preliminares = montarLinhas({
    linhas: escolhida.linhas,
    colunas: deteccao.colunas,
    linhaCabecalho: deteccao.linhaCabecalho,
    cadastros,
    duplicados: [],
    nomesTipo: [planilha.nome, escolhida.nome],
  });

  let duplicados: number[] = [];
  try {
    duplicados = await buscarDuplicatas(
      preliminares.map(linha => ({
        indice: linha.linhaOrigem,
        conta_id: linha.contaId,
        vencimento: linha.vencimento,
        valor: linha.valor,
        observacoes: montarObservacoes(linha.descricao, linha.anotacoes),
      }))
    );
  } catch {
    avisos.push('Não foi possível verificar duplicatas no banco agora. A importação segue disponível.');
  }

  const linhas = montarLinhas({
    linhas: escolhida.linhas,
    colunas: deteccao.colunas,
    linhaCabecalho: deteccao.linhaCabecalho,
    cadastros,
    duplicados,
    nomesTipo: [planilha.nome, escolhida.nome],
  });

  const clientesAusentes = new Set(
    linhas.filter(linha => linha.situacao !== 'cancelada' && !linha.clienteId && linha.clienteNome).map(linha => linha.clienteNome)
  );
  if (clientesAusentes.size > 0) {
    avisos.push(`${clientesAusentes.size} nome(s) de cliente da planilha não existem no sistema.`);
  }

  return {
    arquivo: planilha.nome,
    tamanho: planilha.tamanho,
    abas: planilha.abas.map(item => item.nome),
    abaSelecionada: escolhida.nome,
    colunas: deteccao.colunas,
    naoReconhecidas: deteccao.naoReconhecidas,
    linhas,
    avisos,
  };
}

export interface ResultadoImportacao {
  lote_id: string;
  importadas: number;
  erros: { linha: number; motivo: string }[];
  valor_total: number;
}

/**
 * Remonta as linhas a partir das células cruas — usado quando o usuário
 * corrige o mapeamento de colunas na tela, sem reler o arquivo.
 */
export async function remontarLinhas(entrada: {
  linhas: CelulaPlanilha[][];
  linhaCabecalho: number;
  colunas: MigracaoColunas;
  cadastros: MigracaoCadastros;
  nomesTipo?: (string | null | undefined)[];
}): Promise<{ linhas: MigracaoLinha[]; duplicados: number[]; avisos: string[] }> {
  const avisos: string[] = [];
  const ausentes = COLUNAS_ESSENCIAIS.filter(item => entrada.colunas[item.campo] === undefined);
  if (ausentes.length > 0) {
    avisos.push(`Colunas essenciais não encontradas na planilha: ${ausentes.map(item => item.rotulo).join(', ')}.`);
  }

  const preliminares = montarLinhas({ ...entrada, duplicados: [] });

  let duplicados: number[] = [];
  try {
    duplicados = await buscarDuplicatas(
      preliminares.map(linha => ({
        indice: linha.linhaOrigem,
        conta_id: linha.contaId,
        vencimento: linha.vencimento,
        valor: linha.valor,
        observacoes: montarObservacoes(linha.descricao, linha.anotacoes),
      }))
    );
  } catch {
    avisos.push('Não foi possível verificar duplicatas no banco agora. A importação segue disponível.');
  }

  const linhas = montarLinhas({ ...entrada, duplicados });
  const clientesAusentes = new Set(
    linhas.filter(linha => linha.situacao !== 'cancelada' && !linha.clienteId && linha.clienteNome).map(linha => linha.clienteNome)
  );
  if (clientesAusentes.size > 0) {
    avisos.push(`${clientesAusentes.size} nome(s) de cliente da planilha não existem no sistema.`);
  }

  return { linhas, duplicados, avisos };
}

/** Envia as linhas marcadas para o banco. Cada linha vira um lançamento. */
export async function importarLinhas(
  arquivo: string,
  linhas: MigracaoLinha[],
  arquivoHash?: string
): Promise<ResultadoImportacao> {
  const payload = linhas.map(linha => ({
    linha: linha.linhaOrigem,
    tipo: linha.tipo,
    valor: linha.valor,
    vencimento: linha.vencimento,
    emissao: linha.data ?? linha.vencimento,
    competencia: linha.competencia,
    descricao: linha.descricao,
    anotacoes: linha.anotacoes,
    ref: linha.ref,
    entidade_id: linha.clienteId,
    conta_id: linha.contaId,
    categoria_id: linha.categoriaId,
    centro_custo_id: linha.centroCustoId,
    recebido: linha.recebido,
    data_pagamento: linha.recebido ? linha.data ?? linha.vencimento : null,
  }));

  const { data, error } = await supabase.rpc('importar_lancamentos', {
    p_lote: { arquivo_nome: arquivo, arquivo_hash: arquivoHash ?? null, linhas: payload },
  });
  if (error) throw error;

  const resultado = data as ResultadoImportacao | null;
  if (!resultado) throw new Error('O banco não retornou o resultado da importação.');

  return {
    lote_id: resultado.lote_id,
    importadas: resultado.importadas ?? 0,
    erros: Array.isArray(resultado.erros) ? resultado.erros : [],
    valor_total: resultado.valor_total ?? 0,
  };
}

/** Desfaz um lote importado (Master). */
export async function desfazerImportacao(loteId: string): Promise<number> {
  const { data, error } = await supabase.rpc('desfazer_importacao', { p_lote_id: loteId });
  if (error) throw error;
  const resultado = data as { removidos?: number } | null;
  return resultado?.removidos ?? 0;
}

export { lerPlanilha } from './leituraPlanilha';
export { detectarColunas } from './colunas';
export { montarLinhas, recalcularLinha, chavesRepetidas, montarObservacoes, sugerirTipoPorNomes } from './montarLinhas';
export type { MigracaoEscolhasManuais } from './montarLinhas';
export { buscarDuplicatas } from './duplicatas';
