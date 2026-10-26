import type { MigracaoCadastros, MigracaoColunas, MigracaoLinha } from '../../types';
import type { CelulaPlanilha } from './colunas';
import { normalizarChave, normalizarData, normalizarStatusRecebido, normalizarTexto, normalizarValor } from './normalizacao';

type CadastroSemelhanca = {
  id: string;
  nome: string;
  nomeNormalizado: string;
  tokens: string[];
  tamanhoSemEspacos: number;
};

interface IndicesCadastros {
  contas: Map<string, string>;
  contasLista: { id: string; nome: string }[];
  clientes: Map<string, string>;
  clientesLista: CadastroSemelhanca[];
  categorias: Map<string, string>;
  categoriasLista: CadastroSemelhanca[];
  centrosCusto: Map<string, string>;
  centrosCustoLista: CadastroSemelhanca[];
}

export function sugerirTipoPorNomes(nomes: (string | null | undefined)[]): 'entrada' | 'saida' | null {
  const entradas = new Set(['entrada', 'entradas', 'receita', 'receitas', 'recebimento', 'recebimentos', 'credito', 'creditos']);
  const saidas = new Set(['saida', 'saidas', 'despesa', 'despesas', 'debito', 'debitos']);
  let encontrouEntrada = false;
  let encontrouSaida = false;

  for (const nome of nomes) {
    const tokens = normalizarChave(nome).split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some(token => entradas.has(token))) encontrouEntrada = true;
    if (tokens.some(token => saidas.has(token))) encontrouSaida = true;
  }

  if (encontrouEntrada === encontrouSaida) return null;
  return encontrouEntrada ? 'entrada' : 'saida';
}

export type MigracaoEscolhasManuais = Partial<Record<'tipo' | 'cliente' | 'conta' | 'categoria' | 'centroCusto', string>>;

export function indexarCadastros(cadastros: MigracaoCadastros): IndicesCadastros {
  const montarIndice = (itens: { id: string; nome: string }[]) => {
    const mapa = new Map<string, string>();
    for (const item of itens) {
      const chave = normalizarChave(item.nome);
      if (chave && !mapa.has(chave)) mapa.set(chave, item.id);
    }
    return mapa;
  };
  const prepararListaSemelhanca = (itens: { id: string; nome: string }[]): CadastroSemelhanca[] =>
    itens.map(item => {
      const nomeNormalizado = normalizarChave(item.nome);
      return {
        ...item,
        nomeNormalizado,
        tokens: [...new Set(nomeNormalizado.split(/[^a-z0-9]+/).filter(token => token.length > 1))],
        tamanhoSemEspacos: nomeNormalizado.replace(/\s/g, '').length,
      };
    });
  const montarIndiceNormalizado = (itens: CadastroSemelhanca[]) => {
    const mapa = new Map<string, string>();
    for (const item of itens) {
      if (item.nomeNormalizado && !mapa.has(item.nomeNormalizado)) mapa.set(item.nomeNormalizado, item.id);
    }
    return mapa;
  };

  const clientesLista = prepararListaSemelhanca(cadastros.clientes);
  const categoriasLista = prepararListaSemelhanca(cadastros.categorias);
  const centrosCustoLista = prepararListaSemelhanca(cadastros.centrosCusto);

  return {
    contas: montarIndice(cadastros.contas),
    contasLista: cadastros.contas,
    clientes: montarIndiceNormalizado(clientesLista),
    clientesLista,
    categorias: montarIndiceNormalizado(categoriasLista),
    categoriasLista,
    centrosCusto: montarIndiceNormalizado(centrosCustoLista),
    centrosCustoLista,
  };
}

function contaPorContencao(texto: string, contas: { id: string; nome: string }[]): string | null {
  const tokensTexto = normalizarChave(texto).split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokensTexto.length) return null;
  const contemSequencia = (maior: string[], menor: string[]) =>
    maior.some((_, inicio) => menor.every((token, deslocamento) => maior[inicio + deslocamento] === token));
  const correspondencias = contas.flatMap(conta => {
    const nome = normalizarChave(conta.nome);
    const tokensNome = nome.split(/[^a-z0-9]+/).filter(Boolean);
    if (nome.length < 3 || !tokensNome.length) return [];
    const textoContemNome = contemSequencia(tokensTexto, tokensNome);
    const nomeContemTexto = contemSequencia(tokensNome, tokensTexto);
    return textoContemNome || nomeContemTexto ? [{ ...conta, tokens: tokensNome.length, tamanho: nome.length }] : [];
  });
  if (!correspondencias.length) return null;

  correspondencias.sort((a, b) => b.tokens - a.tokens || b.tamanho - a.tamanho);
  const melhor = correspondencias[0];
  const empatadas = correspondencias.filter(item => item.tokens === melhor.tokens && item.tamanho === melhor.tamanho);
  return new Set(empatadas.map(item => item.id)).size === 1 ? melhor.id : null;
}

function casarPorSemelhanca(texto: string, lista: CadastroSemelhanca[]): string | null {
  const nomeTexto = normalizarChave(texto);
  const tokensTexto = [...new Set(nomeTexto.split(/[^a-z0-9]+/).filter(token => token.length > 1))];
  if (!tokensTexto.length) return null;
  const tamanhoTexto = nomeTexto.replace(/\s/g, '').length;
  const correspondencias = lista.flatMap(cadastro => {
    const { tokens: tokensNome, tamanhoSemEspacos: tamanhoNome, nomeNormalizado } = cadastro;
    if (!tokensNome.length || Math.min(tamanhoTexto, tamanhoNome) < 4) return [];
    const tokensCurtos = tamanhoTexto <= tamanhoNome ? tokensTexto : tokensNome;
    const tokensLongos = tamanhoTexto <= tamanhoNome ? tokensNome : tokensTexto;
    if (!tokensCurtos.every(token => tokensLongos.includes(token))) return [];
    const intersecao = tokensTexto.filter(token => tokensNome.includes(token)).length;
    const uniao = new Set([...tokensTexto, ...tokensNome]).size;
    const jaccard = intersecao / uniao;
    return jaccard >= 0.5 ? [{ id: cadastro.id, jaccard, tamanho: nomeNormalizado.length }] : [];
  });
  if (!correspondencias.length) return null;

  correspondencias.sort((a, b) => b.jaccard - a.jaccard || b.tamanho - a.tamanho);
  const melhor = correspondencias[0];
  const empatadas = correspondencias.filter(item => item.jaccard === melhor.jaccard && item.tamanho === melhor.tamanho);
  return new Set(empatadas.map(item => item.id)).size === 1 ? melhor.id : null;
}

/** Observações gravadas no banco: descrição + anotações, igual à função de importação. */
export function montarObservacoes(descricao: string, anotacoes: string): string {
  return [descricao.trim(), anotacoes.trim()].filter(Boolean).join(' | ');
}

function chaveLinha(linha: MigracaoLinha): string | null {
  if (!linha.contaId || !linha.vencimento || linha.valor === null) return null;
  const observacoes = normalizarChave(montarObservacoes(linha.descricao, linha.anotacoes));
  return `${linha.contaId}|${linha.vencimento}|${linha.valor.toFixed(2)}|${observacoes}`;
}

/** Chaves que aparecem mais de uma vez dentro do próprio arquivo. */
export function chavesRepetidas(linhas: MigracaoLinha[]): Set<string> {
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const linha of linhas) {
    const chave = chaveLinha(linha);
    if (!chave) continue;
    if (vistas.has(chave)) repetidas.add(chave);
    else vistas.add(chave);
  }
  return repetidas;
}

function descreverResultado(linha: MigracaoLinha, repetidaNoArquivo: boolean): string {
  if (linha.situacao === 'cancelada') return 'Cancelado na planilha — não será importado';
  if (linha.situacao === 'duplicada') {
    return repetidaNoArquivo ? 'Repetida dentro do arquivo' : 'Possível duplicata de lançamento já existente';
  }
  if (linha.situacao === 'erro') return 'Não foi possível ler esta linha';
  if (linha.situacao === 'pendente') return linha.pendencias[0] ?? 'Pendência a revisar';
  return linha.recebido
    ? 'Pronto para importar · Lançamento realizado (afeta o saldo real)'
    : 'Pronto para importar · Previsão em aberto';
}

function avaliar(
  linha: MigracaoLinha,
  indices: IndicesCadastros,
  duplicados: Set<number>,
  repetidas: Set<string>,
  escolhasManuais: MigracaoEscolhasManuais = {}
): MigracaoLinha {
  const atualizada: MigracaoLinha = { ...linha };

  atualizada.clienteId = indices.clientes.get(normalizarChave(atualizada.clienteNome))
    ?? casarPorSemelhanca(atualizada.clienteNome, indices.clientesLista);
  atualizada.contaId = indices.contas.get(normalizarChave(atualizada.contaNome)) ?? contaPorContencao(atualizada.contaNome, indices.contasLista);
  atualizada.categoriaId = indices.categorias.get(normalizarChave(atualizada.categoriaNome))
    ?? casarPorSemelhanca(atualizada.categoriaNome, indices.categoriasLista);
  atualizada.centroCustoId = indices.centrosCusto.get(normalizarChave(atualizada.centroCustoNome))
    ?? casarPorSemelhanca(atualizada.centroCustoNome, indices.centrosCustoLista);

  if (escolhasManuais.tipo) atualizada.tipo = escolhasManuais.tipo as 'entrada' | 'saida';
  if (escolhasManuais.cliente) atualizada.clienteId = escolhasManuais.cliente;
  if (escolhasManuais.conta) atualizada.contaId = escolhasManuais.conta;
  if (escolhasManuais.categoria) atualizada.categoriaId = escolhasManuais.categoria;
  if (escolhasManuais.centroCusto) atualizada.centroCustoId = escolhasManuais.centroCusto;

  const pendencias: string[] = [];
  if (!atualizada.clienteId) pendencias.push('Selecione o cliente');
  if (!atualizada.contaId) pendencias.push('Selecione a conta');
  if (!atualizada.categoriaId) pendencias.push('Selecione a categoria');
  if (!atualizada.centroCustoId) pendencias.push('Selecione o centro de custo');
  if (!atualizada.vencimento) pendencias.push('Informe a data de vencimento');
  if (atualizada.valor === null || atualizada.valor === 0) pendencias.push('Valor não informado');
  if (atualizada.statusPlanilha === 'desconhecido') {
    pendencias.push(
      atualizada.recebidoTexto
        ? `Valor de Recebido não reconhecido: ${atualizada.recebidoTexto}`
        : 'Informe se a linha está recebida ou em aberto'
    );
  }
  if (!atualizada.tipo) pendencias.push('Informe o tipo (entrada/saída)');
  atualizada.pendencias = pendencias;

  const chave = chaveLinha(atualizada);
  const repetidaNoArquivo = !!chave && repetidas.has(chave);
  const duplicadaNoBanco = duplicados.has(atualizada.linhaOrigem);

  if (atualizada.statusPlanilha === 'cancelado') atualizada.situacao = 'cancelada';
  else if (repetidaNoArquivo || duplicadaNoBanco) atualizada.situacao = 'duplicada';
  else if (pendencias.length > 0) atualizada.situacao = 'pendente';
  else atualizada.situacao = 'pronta';

  atualizada.resultadoPrevisto = descreverResultado(atualizada, repetidaNoArquivo);
  if (!atualizada.incluirManual) atualizada.incluir = atualizada.situacao === 'pronta';

  return atualizada;
}

function montarLinha(
  celulas: CelulaPlanilha[],
  numeroLinha: number,
  colunas: MigracaoColunas,
  indices: IndicesCadastros,
  duplicados: Set<number>,
  repetidas: Set<string>,
  tipoSugerido: 'entrada' | 'saida' | null
): MigracaoLinha {
  const ler = (campo: keyof MigracaoColunas): CelulaPlanilha => {
    const indice = colunas[campo];
    if (indice === undefined) return null;
    return celulas[indice] ?? null;
  };

  const status = normalizarStatusRecebido(ler('recebido'));
  const valorBruto = normalizarValor(ler('valor'));
  const valor = valorBruto === null ? null : Math.abs(valorBruto);

  const linha: MigracaoLinha = {
    id: `migracao-${numeroLinha}`,
    linhaOrigem: numeroLinha,
    statusPlanilha: status.status,
    recebidoTexto: status.texto,
    recebido: status.recebido,
    tipo: tipoSugerido === 'entrada' && valorBruto !== null && valorBruto < 0 ? null : tipoSugerido,
    valor,
    data: normalizarData(ler('data')),
    competencia: normalizarData(ler('competencia')),
    vencimento: normalizarData(ler('vencimento')),
    descricao: normalizarTexto(ler('descricao')),
    anotacoes: normalizarTexto(ler('anotacoes')),
    ref: normalizarTexto(ler('ref')),
    clienteNome: normalizarTexto(ler('cliente')),
    contaNome: normalizarTexto(ler('conta')),
    categoriaNome: normalizarTexto(ler('categoria')),
    centroCustoNome: normalizarTexto(ler('centro_custo')),
    clienteId: null,
    contaId: null,
    categoriaId: null,
    centroCustoId: null,
    pendencias: [],
    incluir: false,
    situacao: 'pendente',
    resultadoPrevisto: '',
  };

  return avaliar(linha, indices, duplicados, repetidas);
}

export function montarLinhas(entrada: {
  linhas: CelulaPlanilha[][];
  colunas: MigracaoColunas;
  linhaCabecalho: number;
  cadastros: MigracaoCadastros;
  duplicados: number[];
  nomesTipo?: (string | null | undefined)[];
}): MigracaoLinha[] {
  const { linhas, colunas, linhaCabecalho, cadastros, duplicados } = entrada;
  const tipoSugerido = sugerirTipoPorNomes(entrada.nomesTipo ?? []);
  const indices = indexarCadastros(cadastros);
  const conjuntoDuplicados = new Set(duplicados);
  const repetidas = new Set<string>();
  const resultado: MigracaoLinha[] = [];

  for (let i = linhaCabecalho + 1; i < linhas.length; i += 1) {
    const celulas = linhas[i] ?? [];
    const vazia = celulas.every(celula => celula === null || normalizarTexto(celula) === '');
    if (vazia) continue;
    resultado.push(montarLinha(celulas, i + 1, colunas, indices, conjuntoDuplicados, repetidas, tipoSugerido));
  }

  return resultado;
}

/** Reavalia uma linha depois que o usuário escolhe um valor no dropdown. */
export function recalcularLinha(
  linha: MigracaoLinha,
  cadastros: MigracaoCadastros,
  duplicados: number[],
  repetidasArquivo: Set<string> = new Set(),
  escolhasManuais: MigracaoEscolhasManuais = {}
): MigracaoLinha {
  return avaliar(linha, indexarCadastros(cadastros), new Set(duplicados), repetidasArquivo, escolhasManuais);
}
