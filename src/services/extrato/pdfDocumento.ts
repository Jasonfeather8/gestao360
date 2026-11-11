import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigurado = false;

export function configurarWorkerPdf(): void {
  if (workerConfigurado) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  workerConfigurado = true;
}

export interface CabecalhoDiaExtrato {
  /** Dia do cabeçalho em ISO (yyyy-mm-dd). */
  dia: string;
  /** Posição do cabeçalho na página, de 0 (topo) a 1 (base), pelo índice da linha. */
  topo: number;
}

export interface PaginaExtratoAnalisada {
  pagina: number;
  /** Linhas de texto da página, de cima para baixo. */
  linhas: string[];
  /** Cabeçalhos de dia encontrados na página, de cima para baixo. */
  cabecalhos: CabecalhoDiaExtrato[];
  /** Dia vigente no INÍCIO da página (herdado do último cabeçalho da página anterior). */
  diaInicial: string | null;
}

export interface AnaliseExtrato {
  totalPaginas: number;
  paginas: PaginaExtratoAnalisada[];
  periodoDeclarado: { inicio: string; fim: string } | null;
}

const CABECALHO_DIA = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/;
const LINHA_COM_HORA = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s*[-–—]?\s*\d{1,2}:\d{2}/;
const PERIODO_ENTRE_DATAS = /\bEntre\s+(\d{2})\/(\d{2})\/(\d{4})\s+(?:e|a)\s+(\d{2})\/(\d{2})\/(\d{4})\b/i;
// A Caixa imprime "Período dos lançamentos 01/11/2025 até 30/11/2025".
const PERIODO_LANCAMENTOS_CAIXA = /per[ií]odo\s+dos\s+lan[cç]amentos\s+(\d{2})\/(\d{2})\/(\d{4})\s+(?:at[eé]|a)\s+(\d{2})\/(\d{2})\/(\d{4})/i;

function dataIso(dia: number, mes: number, ano: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (ano >= 0 && ano <= 99) data.setUTCFullYear(ano);
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function periodoDoDocumento(linhas: string[]): { inicio: string; fim: string } | null {
  for (const linha of linhas) {
    const correspondencia = linha.match(PERIODO_ENTRE_DATAS) ?? linha.match(PERIODO_LANCAMENTOS_CAIXA);
    if (!correspondencia) continue;
    const inicio = dataIso(Number(correspondencia[1]), Number(correspondencia[2]), Number(correspondencia[3]));
    const fim = dataIso(Number(correspondencia[4]), Number(correspondencia[5]), Number(correspondencia[6]));
    if (inicio && fim) return { inicio, fim };
  }
  return null;
}

function anoDoPeriodo(linhas: string[]): number | null {
  for (const linha of linhas) {
    if (!/per[ií]odo/i.test(linha)) continue;
    const data = linha.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (data && dataIso(Number(data[1]), Number(data[2]), Number(data[3]))) return Number(data[3]);
  }
  return null;
}

export async function analisarExtrato(arquivo: File): Promise<AnaliseExtrato> {
  configurarWorkerPdf();
  let tarefa: ReturnType<typeof getDocument> | null = null;
  let documento: Awaited<ReturnType<typeof getDocument>['promise']> | null = null;

  try {
    tarefa = getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
    documento = await tarefa.promise;
    const totalPaginas = documento.numPages;
    const linhasPorPagina: string[][] = [];
    let encontrouTexto = false;

    for (let numero = 1; numero <= totalPaginas; numero++) {
      let linhas: string[] = [];
      try {
        const pagina = await documento.getPage(numero);
        const conteudo = await pagina.getTextContent();
        const itens = conteudo.items.filter((item) => 'str' in item) as Array<{ str: string; transform: number[] }>;
        const posicionados = itens
          .filter((item) => Array.isArray(item.transform))
          .map((item) => ({
            texto: item.str,
            x: item.transform[4],
            y: item.transform[5],
          }))
          .sort((a, b) => b.y - a.y || a.x - b.x);
        const grupos: Array<{ y: number; itens: Array<{ texto: string; x: number }> }> = [];

        for (const item of posicionados) {
          const grupo = grupos.find((candidato) => Math.abs(candidato.y - item.y) <= 2);
          if (grupo) grupo.itens.push({ texto: item.texto, x: item.x });
          else grupos.push({ y: item.y, itens: [{ texto: item.texto, x: item.x }] });
        }
        linhas = grupos
          .sort((a, b) => b.y - a.y)
          .map((grupo) => grupo.itens.sort((a, b) => a.x - b.x).map((item) => item.texto).join(' ').trim())
          .filter(Boolean);
        if (linhas.length) encontrouTexto = true;
      } catch {
        // Uma página sem texto não deve impedir a análise das demais nem a leitura por IA.
      }
      linhasPorPagina.push(linhas);
    }

    const periodoDeclarado = periodoDoDocumento(linhasPorPagina.flat());
    if (!encontrouTexto) return { totalPaginas, paginas: [], periodoDeclarado };
    let anoReferencia = linhasPorPagina.map(anoDoPeriodo).find((ano): ano is number => ano !== null) ?? null;
    if (anoReferencia === null) {
      for (const linhas of linhasPorPagina) {
        for (const linha of linhas) {
          if (LINHA_COM_HORA.test(linha.trimStart())) continue;
          const match = linha.trimStart().match(CABECALHO_DIA);
          if (!match?.[3] || match[3].length !== 4) continue;
          const candidato = dataIso(Number(match[1]), Number(match[2]), Number(match[3]));
          if (candidato) {
            anoReferencia = Number(match[3]);
            break;
          }
        }
        if (anoReferencia !== null) break;
      }
    }

    const anoInicial = anoReferencia ?? new Date().getFullYear();
    let diaVigente: string | null = null;
    const paginas = linhasPorPagina.map((linhas, indicePagina) => {
      const diaInicial = diaVigente;
      const cabecalhos: CabecalhoDiaExtrato[] = [];
      linhas.forEach((linha, indice) => {
        if (LINHA_COM_HORA.test(linha.trimStart())) return;
        const match = linha.trimStart().match(CABECALHO_DIA);
        if (!match) return;
        const ano = match[3]?.length === 4 ? Number(match[3]) : (anoReferencia ?? anoInicial);
        const dia = dataIso(Number(match[1]), Number(match[2]), ano);
        if (!dia) return;
        if (match[3]?.length === 4) anoReferencia = Number(match[3]);
        cabecalhos.push({ dia, topo: Number((indice / linhas.length).toFixed(2)) });
        diaVigente = dia;
      });
      return { pagina: indicePagina + 1, linhas, cabecalhos, diaInicial };
    });

    return { totalPaginas, paginas, periodoDeclarado };
  } catch {
    return { totalPaginas: documento?.numPages ?? 0, paginas: [], periodoDeclarado: null };
  } finally {
    if (tarefa) {
      try {
        await tarefa.destroy();
      } catch {
        // O documento já pode ter sido encerrado pelo pdfjs.
      }
    }
  }
}
