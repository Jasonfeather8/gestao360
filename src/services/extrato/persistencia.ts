import { supabase } from '@/integrations/supabase/client';
import type { ExtratoLido, LinhaExtrato, LoteExtrato, TransacaoBanco } from '@/types';

interface LinhaParaPreview {
  linha: LinhaExtrato;
  paginaOrigem: number | null;
  linhaOrigem: number;
  confiancaExtracao: number;
}

interface TransacaoRevalidada {
  data_transacao: string;
  data_original: string;
  valor: number;
  valor_centavos: number;
  descricao_banco: string;
  descricao_original: string;
  numero_documento: string | null;
  tipo_movimento: 'credito' | 'debito';
  hash_transacao: string;
  pagina_origem: number;
  linha_origem: number;
  confianca_extracao: number;
  estado_revisao: string;
  motivo_alerta: string | null;
}

export async function sha256Hex(arquivo: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nomeSanitizado(nome: string): string {
  const semExtensao = nome.replace(/\.pdf$/i, '');
  const base = semExtensao.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100) || 'extrato';
  return `${base}.pdf`;
}

function calcularOrdemLinhaPorPagina(extrato: ExtratoLido): Map<string, number> {
  const ordemLinhaPorId = new Map<string, number>();
  const indicePorPagina = new Map<number | null, number>();
  for (const linha of extrato.linhas) {
    const linhaOrigem = (indicePorPagina.get(linha.pagina) ?? 0) + 1;
    indicePorPagina.set(linha.pagina, linhaOrigem);
    ordemLinhaPorId.set(linha.id, linhaOrigem);
  }
  return ordemLinhaPorId;
}

/**
 * Reconecta as linhas de um extrato já importado às transações bancárias
 * gravadas, para permitir conciliar o restante sem reimportar o arquivo.
 * Retorna null quando o arquivo não está importado para esta conta.
 */
export async function reaproveitarExtratoImportado(params: {
  arquivo: File;
  contaId: string;
  extrato: ExtratoLido;
}): Promise<{
  transacoesPorHash: Map<string, string>;
  hashesPorLinha: Map<string, string>;
  linhasNaoReconhecidas: number;
} | null> {
  const { arquivo, contaId, extrato } = params;
  const arquivoHash = await sha256Hex(arquivo);

  const { data: transacoes, error } = await supabase
    .from('transacoes_banco')
    .select('id, hash_transacao, data_transacao, valor_centavos, pagina_origem, linha_origem')
    .eq('conta_bancaria_id', contaId)
    .eq('arquivo_hash', arquivoHash);
  if (error || !transacoes || transacoes.length === 0) return null;

  const porProcedencia = new Map<string, typeof transacoes[number]>();
  for (const transacao of transacoes) {
    if (transacao.pagina_origem === null || transacao.linha_origem === null || !transacao.hash_transacao) continue;
    porProcedencia.set(`${transacao.pagina_origem}:${transacao.linha_origem}`, transacao);
  }

  const ordemLinhaPorId = calcularOrdemLinhaPorPagina(extrato);
  const transacoesPorHash = new Map<string, string>();
  const hashesPorLinha = new Map<string, string>();
  let linhasNaoReconhecidas = 0;

  for (const linha of extrato.linhas) {
    if (linha.confianca === 'baixa' || linha.pagina === null) continue;
    const ordem = ordemLinhaPorId.get(linha.id);
    const candidata = ordem ? porProcedencia.get(`${linha.pagina}:${ordem}`) : undefined;
    const valorCentavos = Math.round((linha.direcao === 'entrada' ? linha.valor : -linha.valor) * 100);
    const confere = candidata
      && candidata.data_transacao === linha.data
      && Number(candidata.valor_centavos) === valorCentavos;
    if (!confere) {
      linhasNaoReconhecidas += 1;
      continue;
    }
    hashesPorLinha.set(linha.id, candidata.hash_transacao as string);
    transacoesPorHash.set(candidata.hash_transacao as string, candidata.id);
  }

  if (transacoesPorHash.size === 0) return null;
  return { transacoesPorHash, hashesPorLinha, linhasNaoReconhecidas };
}

export async function persistirExtrato(params: {
  arquivo: File;
  contaId: string;
  extrato: ExtratoLido;
}): Promise<{
  lote: LoteExtrato;
  transacoesPorHash: Map<string, string>;
  linhasIgnoradas: { confiancaBaixa: number; semPagina: number };
  hashesPorLinha: Map<string, string>;
}> {
  const { arquivo, contaId, extrato } = params;
  const { data: { user }, error: erroUsuario } = await supabase.auth.getUser();
  if (erroUsuario || !user) throw new Error('Sessão não encontrada. Entre novamente para persistir o extrato.');
  if (extrato.paginas > 15) {
    throw new Error('O limite de importação persistida é 15 páginas; o banco não aceita mais que isso.');
  }
  if (!Number.isInteger(extrato.paginas) || extrato.paginas < 1) {
    throw new Error('O número de páginas do extrato é inválido para persistência.');
  }
  if (arquivo.size <= 0 || arquivo.size > 20 * 1024 * 1024) {
    throw new Error('O arquivo PDF deve ter entre 1 byte e 20 MB para ser persistido.');
  }

  // Linhas de confiança baixa e linhas sem página identificada não podem ser
  // persistidas: o banco exige proveniência (página e linha de origem) e
  // confiança mínima. Elas continuam visíveis na comparação em memória.
  const linhasConfiancaBaixa = extrato.linhas.filter((linha) => linha.confianca === 'baixa').length;
  const linhasSemPagina = extrato.linhas.filter((linha) => linha.confianca !== 'baixa' && linha.pagina === null).length;
  const linhasParaPersistir = extrato.linhas.filter((linha) => linha.confianca !== 'baixa' && linha.pagina !== null);
  if (linhasParaPersistir.length === 0) {
    throw new Error('Não há linhas persistíveis: linhas de confiança baixa ou sem página identificada não são gravadas.');
  }
  const ordemLinhaPorId = calcularOrdemLinhaPorPagina(extrato);

  const nomeArquivo = nomeSanitizado(arquivo.name);
  const storagePath = `${user.id}/${crypto.randomUUID()}/${nomeArquivo}`;
  let objetoEnviado = false;
  let lotePersistido: LoteExtrato | null = null;

  try {
    const arquivoHash = await sha256Hex(arquivo);
    const { error: erroUpload } = await supabase.storage.from('bank-statements').upload(storagePath, arquivo, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (erroUpload) throw erroUpload;
    objetoEnviado = true;

    const payloadLote = {
      id: crypto.randomUUID(),
      conta_bancaria_id: contaId,
      importado_por: user.id,
      arquivo_nome: nomeArquivo,
      arquivo_tamanho: arquivo.size,
      arquivo_mime_type: 'application/pdf',
      arquivo_hash: arquivoHash,
      storage_path: storagePath,
      formato_arquivo: 'pdf',
      origem_extracao: 'texto',
    };
    const { data: loteCriado, error: erroPreparar } = await supabase.rpc('preparar_importacao_extrato', {
      p_lote: payloadLote,
    });
    if (erroPreparar) throw erroPreparar;
    if (!loteCriado) throw new Error('O banco não retornou o lote preparado para importação.');
    lotePersistido = loteCriado as LoteExtrato;

    const linhasPreview: LinhaParaPreview[] = linhasParaPersistir.map((linha) => ({
      linha,
      paginaOrigem: linha.pagina,
      linhaOrigem: ordemLinhaPorId.get(linha.id)!,
      confiancaExtracao: linha.confianca === 'alta' ? 0.95 : 0.9,
    }));

    const { data: previewData, error: erroPreview } = await supabase.rpc('revalidar_preview_extrato', {
      p_lote_id: lotePersistido.id,
      p_transacoes: linhasPreview.map(({ linha, paginaOrigem, linhaOrigem, confiancaExtracao }) => ({
        data_transacao: linha.data,
        data_original: linha.data,
        valor: linha.direcao === 'entrada' ? linha.valor : -linha.valor,
        descricao_banco: linha.descricao,
        descricao_original: linha.textoOriginal || linha.descricao,
        numero_documento: linha.documento ?? '',
        tipo_movimento: linha.direcao === 'entrada' ? 'credito' : 'debito',
        pagina_origem: paginaOrigem,
        linha_origem: linhaOrigem,
        confianca_extracao: confiancaExtracao,
        motivo_alerta: null,
      })),
    });
    if (erroPreview) throw erroPreview;
    if (!Array.isArray(previewData)) throw new Error('O banco retornou um preview inválido para o extrato.');
    const transacoesRevalidadas = previewData as TransacaoRevalidada[];
    if (transacoesRevalidadas.length !== linhasPreview.length) {
      throw new Error('A quantidade de transações revalidada não corresponde às linhas do extrato.');
    }

    const pendentes = transacoesRevalidadas
      .map((transacao, index) => transacao.estado_revisao !== 'valida' ? index + 1 : null)
      .filter((index): index is number => index !== null);
    if (pendentes.length > 0) {
      throw new Error(`O banco marcou como pendentes de revisão as linhas ${pendentes.join(', ')}. Elas não podem ser persistidas neste fluxo.`);
    }

    const paginasEncontradas = new Set(transacoesRevalidadas.map((transacao) => transacao.pagina_origem));
    const paginasFaltantes = Array.from({ length: extrato.paginas }, (_, index) => index + 1)
      .filter((pagina) => !paginasEncontradas.has(pagina));
    if (paginasFaltantes.length > 0) {
      throw new Error(`Não é possível confirmar o extrato: faltam transações nas páginas ${paginasFaltantes.join(', ')} do PDF.`);
    }

    const motivosExclusao = [
      linhasConfiancaBaixa > 0 ? `${linhasConfiancaBaixa} linha(s) de confiança baixa` : null,
      linhasSemPagina > 0 ? `${linhasSemPagina} linha(s) sem página identificada` : null,
    ].filter((motivo): motivo is string => motivo !== null);
    const justificativaSobrescrita = motivosExclusao.length > 0
      ? `${motivosExclusao.join(' e ')} foram excluídas da persistência, conforme a regra de importação.`
      : undefined;
    const metadata: Record<string, unknown> = {
      reviewState: 'validated',
      pendingReviewCount: 0,
      consistency: { criticalErrors: [] },
      sourceOrigin: 'texto',
      pages: extrato.paginas,
      extractedCount: transacoesRevalidadas.length,
      ...(typeof extrato.meta?.saldoInicial === 'number' ? { openingBalance: extrato.meta.saldoInicial } : {}),
      ...(typeof extrato.meta?.saldoFinal === 'number' ? { closingBalance: extrato.meta.saldoFinal } : {}),
      ...(justificativaSobrescrita ? { justificativaSobrescrita } : {}),
    };
    const origemArquivo = 'pdf_texto';
    const transacoesComProveniencia = transacoesRevalidadas.map((transacao) => ({
      ...transacao,
      extrato_lote_id: lotePersistido!.id,
      arquivo_nome: lotePersistido!.arquivo_nome,
      arquivo_hash: lotePersistido!.arquivo_hash,
      formato_arquivo: lotePersistido!.formato_arquivo,
      origem_extracao: lotePersistido!.origem_extracao,
      origem_arquivo: origemArquivo,
    }));
    const { data: loteConfirmado, error: erroConfirmar } = await supabase.rpc('confirmar_importacao_extrato', {
      p_lote: lotePersistido,
      p_transacoes: transacoesComProveniencia,
      p_metadata: metadata,
    });
    if (erroConfirmar) throw erroConfirmar;
    if (!loteConfirmado) throw new Error('O banco não retornou o lote confirmado.');

    const { data: transacoes, error: erroListagem } = await supabase
      .from('transacoes_banco')
      .select('id, conta_bancaria_id, extrato_lote_id, data_transacao, valor, valor_centavos, tipo_movimento, descricao_banco, status_conciliacao, pagina_origem, linha_origem, hash_transacao, confianca_extracao, estado_revisao')
      .eq('extrato_lote_id', lotePersistido.id);
    if (erroListagem) throw erroListagem;

    const transacoesPorHash = new Map<string, string>();
    for (const transacao of (transacoes ?? []) as TransacaoBanco[]) {
      transacoesPorHash.set(transacao.hash_transacao, transacao.id);
    }
    const hashesPorLinha = new Map<string, string>();
    transacoesRevalidadas.forEach((transacao, index) => {
      hashesPorLinha.set(linhasPreview[index].linha.id, transacao.hash_transacao);
    });

    return {
      lote: loteConfirmado as LoteExtrato,
      transacoesPorHash,
      linhasIgnoradas: { confiancaBaixa: linhasConfiancaBaixa, semPagina: linhasSemPagina },
      hashesPorLinha,
    };
  } catch (error) {
    if (objetoEnviado) {
      try {
        await supabase.storage.from('bank-statements').remove([storagePath]);
      } catch {
        // A limpeza é best-effort e não substitui o erro original.
      }
    }
    if (lotePersistido) {
      try {
        await supabase.rpc('cancelar_importacao_extrato', { p_lote_id: lotePersistido.id });
      } catch {
        // O cancelamento é best-effort e não substitui o erro original.
      }
    }
    throw error;
  }
}
