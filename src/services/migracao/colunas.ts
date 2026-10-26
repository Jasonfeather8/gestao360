import type { MigracaoCampo, MigracaoColunas } from '../../types';
import { normalizarCabecalho, normalizarTexto } from './normalizacao';

export type CelulaPlanilha = string | number | Date | null;

interface DefinicaoCampo {
  campo: MigracaoCampo;
  rotulos: string[];
}

const CAMPOS: DefinicaoCampo[] = [
  { campo: 'recebido', rotulos: ['recebido', 'status', 'situacao'] },
  { campo: 'competencia', rotulos: ['data de competencia', 'competencia', 'data competencia'] },
  { campo: 'vencimento', rotulos: ['data de vencimento', 'vencimento', 'data vencimento'] },
  { campo: 'data', rotulos: ['data', 'data de emissao', 'emissao', 'data emissao'] },
  { campo: 'descricao', rotulos: ['descricao', 'historico', 'lancamento'] },
  { campo: 'cliente', rotulos: ['cliente', 'fornecedor', 'cliente fornecedor', 'entidade'] },
  { campo: 'conta', rotulos: ['conta', 'conta bancaria', 'banco'] },
  { campo: 'categoria', rotulos: ['categoria', 'plano de contas'] },
  { campo: 'centro_custo', rotulos: ['centro de custo', 'centro de custos', 'centro custo'] },
  { campo: 'ref', rotulos: ['ref', 'referencia', 'documento', 'numero documento'] },
  { campo: 'anotacoes', rotulos: ['anotacoes', 'anotacao', 'observacoes', 'observacao', 'notas'] },
  { campo: 'valor', rotulos: ['valor', 'valor total', 'valor previsto', 'vlr'] },
];

export interface ColunasDetectadas {
  linhaCabecalho: number;
  colunas: MigracaoColunas;
  reconhecidas: MigracaoCampo[];
  naoReconhecidas: string[];
}

function casarCabecalhos(cabecalhos: string[]): { colunas: MigracaoColunas; acertos: number } {
  const colunas: MigracaoColunas = {};
  const usados = new Set<number>();
  const camposUsados = new Set<MigracaoCampo>();

  // 1ª passada: igualdade exata (resolve "Data" x "Data de Vencimento").
  cabecalhos.forEach((cabecalho, indice) => {
    if (!cabecalho) return;
    const definicao = CAMPOS.find(item => item.rotulos.includes(cabecalho));
    if (!definicao || camposUsados.has(definicao.campo)) return;
    colunas[definicao.campo] = indice;
    camposUsados.add(definicao.campo);
    usados.add(indice);
  });

  // 2ª passada: o rótulo mais longo contido no cabeçalho.
  cabecalhos.forEach((cabecalho, indice) => {
    if (!cabecalho || usados.has(indice)) return;
    let escolhido: { campo: MigracaoCampo; tamanho: number } | null = null;
    for (const definicao of CAMPOS) {
      if (camposUsados.has(definicao.campo)) continue;
      for (const rotulo of definicao.rotulos) {
        if (cabecalho.includes(rotulo) && (!escolhido || rotulo.length > escolhido.tamanho)) {
          escolhido = { campo: definicao.campo, tamanho: rotulo.length };
        }
      }
    }
    if (!escolhido) return;
    colunas[escolhido.campo] = indice;
    camposUsados.add(escolhido.campo);
    usados.add(indice);
  });

  return { colunas, acertos: camposUsados.size };
}

/**
 * Procura, entre as primeiras linhas, a que mais parece um cabeçalho
 * e devolve o mapa coluna → campo da planilha.
 */
export function detectarColunas(linhas: CelulaPlanilha[][]): ColunasDetectadas {
  let melhorLinha = 0;
  let melhor: MigracaoColunas = {};
  let melhorAcertos = 0;

  const limite = Math.min(linhas.length, 10);
  for (let indice = 0; indice < limite; indice += 1) {
    const cabecalhos = (linhas[indice] ?? []).map(celula => normalizarCabecalho(celula));
    const { colunas, acertos } = casarCabecalhos(cabecalhos);
    if (acertos > melhorAcertos) {
      melhorAcertos = acertos;
      melhorLinha = indice;
      melhor = colunas;
    }
  }

  const cabecalhosEscolhidos = (linhas[melhorLinha] ?? []).map(celula => normalizarTexto(celula));
  const usadas = new Set(Object.values(melhor));
  const naoReconhecidas = cabecalhosEscolhidos.filter((cabecalho, indice) => !!cabecalho && !usadas.has(indice));

  return {
    linhaCabecalho: melhorLinha,
    colunas: melhor,
    reconhecidas: Object.keys(melhor) as MigracaoCampo[],
    naoReconhecidas,
  };
}
