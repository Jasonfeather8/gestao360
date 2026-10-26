import type { AbaMigracao, PlanilhaMigracao } from '../../types';
import type { CelulaPlanilha } from './colunas';

interface EntradaZip {
  metodo: number;
  tamanhoComprimido: number;
  offsetLocal: number;
}

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

/** Lê o arquivo escolhido pelo usuário e devolve as abas com as células cruas. */
export async function lerPlanilha(file: File): Promise<PlanilhaMigracao> {
  const nome = file.name;
  const extensao = nome.toLowerCase().split('.').pop() ?? '';

  if (extensao === 'xlsx') {
    return { nome, tamanho: file.size, abas: await lerXlsx(file) };
  }
  if (extensao === 'xls') {
    throw new Error('Arquivos .xls antigos não são suportados. Abra no Excel e salve como .xlsx ou .csv.');
  }
  return { nome, tamanho: file.size, abas: await lerCsv(file) };
}

/* ---------------------------------- CSV ---------------------------------- */

function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function detectarSeparador(linhaCabecalho: string): string {
  const candidatos = [';', ',', '\t'];
  let melhor = ';';
  let melhorContagem = 0;
  let dentroDeAspas = false;

  const contagem: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const caractere of linhaCabecalho) {
    if (caractere === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas && caractere in contagem) contagem[caractere] += 1;
  }
  for (const candidato of candidatos) {
    if (contagem[candidato] > melhorContagem) {
      melhorContagem = contagem[candidato];
      melhor = candidato;
    }
  }
  return melhor;
}

function parseCsv(conteudo: string): CelulaPlanilha[][] {
  const texto = conteudo.replace(/^\uFEFF/, '');
  const separador = detectarSeparador(texto.split(/\r?\n/)[0] ?? '');

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];

    if (dentroDeAspas) {
      if (caractere === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += caractere;
      }
      continue;
    }

    if (caractere === '"') {
      dentroDeAspas = true;
    } else if (caractere === separador) {
      linha.push(campo);
      campo = '';
    } else if (caractere === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (caractere !== '\r') {
      campo += caractere;
    }
  }

  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.map(celulas => celulas.map(valor => (valor.trim() === '' ? null : valor)));
}

async function lerCsv(file: File): Promise<AbaMigracao[]> {
  const texto = decodificar(await file.arrayBuffer());
  return [{ nome: 'CSV', linhas: parseCsv(texto) }];
}

/* --------------------------------- XLSX ---------------------------------- */

function localizarEntradas(buffer: ArrayBuffer): Map<string, EntradaZip> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let eocd = -1;
  const limite = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= limite; i -= 1) {
    if (view.getUint32(i, true) === ASSINATURA_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx inválido: assinatura ZIP não encontrada.');

  const total = view.getUint16(eocd + 10, true);
  let ponteiro = view.getUint32(eocd + 16, true);
  const entradas = new Map<string, EntradaZip>();

  for (let i = 0; i < total; i += 1) {
    if (ponteiro + 46 > bytes.length || view.getUint32(ponteiro, true) !== ASSINATURA_CENTRAL) break;
    const metodo = view.getUint16(ponteiro + 10, true);
    const tamanhoComprimido = view.getUint32(ponteiro + 20, true);
    const tamanhoNome = view.getUint16(ponteiro + 28, true);
    const tamanhoExtra = view.getUint16(ponteiro + 30, true);
    const tamanhoComentario = view.getUint16(ponteiro + 32, true);
    const offsetLocal = view.getUint32(ponteiro + 42, true);
    const nome = new TextDecoder('utf-8').decode(bytes.subarray(ponteiro + 46, ponteiro + 46 + tamanhoNome));
    entradas.set(nome, { metodo, tamanhoComprimido, offsetLocal });
    ponteiro += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return entradas;
}

async function descomprimir(comprimido: Uint8Array, metodo: number): Promise<Uint8Array> {
  if (metodo === 0) return comprimido;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não consegue ler arquivos .xlsx. Salve a planilha como CSV e importe novamente.');
  }
  const fluxo = new Blob([comprimido]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

async function extrairArquivo(buffer: ArrayBuffer, entradas: Map<string, EntradaZip>, nome: string): Promise<string | null> {
  const entrada = entradas.get(nome);
  if (!entrada) return null;

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(entrada.offsetLocal, true) !== ASSINATURA_LOCAL) {
    throw new Error('Arquivo .xlsx inválido: cabeçalho interno não encontrado.');
  }
  const tamanhoNome = view.getUint16(entrada.offsetLocal + 26, true);
  const tamanhoExtra = view.getUint16(entrada.offsetLocal + 28, true);
  const inicio = entrada.offsetLocal + 30 + tamanhoNome + tamanhoExtra;
  const comprimido = bytes.subarray(inicio, inicio + entrada.tamanhoComprimido);
  const descomprimido = await descomprimir(comprimido, entrada.metodo);
  return new TextDecoder('utf-8').decode(descomprimido);
}

function interpretarXml(texto: string): Document {
  const documento = new DOMParser().parseFromString(texto, 'application/xml');
  if (documento.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Não foi possível interpretar a planilha. O arquivo pode estar corrompido.');
  }
  return documento;
}

function indiceDaColuna(referencia: string): number {
  const letras = (referencia.match(/^[A-Z]+/i) ?? [''])[0].toUpperCase();
  if (!letras) return -1;
  let indice = 0;
  for (const letra of letras) {
    indice = indice * 26 + (letra.charCodeAt(0) - 64);
  }
  return indice - 1;
}

function serialParaData(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const data = new Date(Math.round((serial - 25569) * 86400000));
  return Number.isNaN(data.getTime()) ? null : data;
}

function estilosDeData(styles: string | null): Set<number> {
  const indices = new Set<number>();
  if (!styles) return indices;

  const documento = interpretarXml(styles);
  const formatos = new Map<number, string>();
  for (const formato of Array.from(documento.getElementsByTagName('numFmt'))) {
    const id = Number(formato.getAttribute('numFmtId'));
    if (Number.isFinite(id)) formatos.set(id, formato.getAttribute('formatCode') ?? '');
  }

  const cellXfs = documento.getElementsByTagName('cellXfs')[0];
  if (!cellXfs) return indices;

  Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf, indice) => {
    const numFmtId = Number(xf.getAttribute('numFmtId') ?? '0');
    const embutido = (numFmtId >= 14 && numFmtId <= 22) || (numFmtId >= 45 && numFmtId <= 47);
    const codigo = (formatos.get(numFmtId) ?? '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/"[^"]*"/g, '');
    if (embutido || /[dmy]/i.test(codigo)) indices.add(indice);
  });

  return indices;
}

function lerAba(sheet: string, compartilhadas: string[], estilosData: Set<number>): CelulaPlanilha[][] {
  const documento = interpretarXml(sheet);
  const linhas: CelulaPlanilha[][] = [];

  for (const row of Array.from(documento.getElementsByTagName('row'))) {
    const celulas: CelulaPlanilha[] = [];
    for (const celula of Array.from(row.getElementsByTagName('c'))) {
      const coluna = indiceDaColuna(celula.getAttribute('r') ?? '');
      if (coluna < 0) continue;

      const tipo = celula.getAttribute('t');
      const estilo = celula.getAttribute('s');
      const valorTexto = celula.getElementsByTagName('v')[0]?.textContent ?? '';
      let valor: CelulaPlanilha = null;

      if (tipo === 'inlineStr') {
        valor = Array.from(celula.getElementsByTagName('t')).map(no => no.textContent ?? '').join('');
      } else if (tipo === 's') {
        valor = compartilhadas[Number(valorTexto)] ?? '';
      } else if (tipo === 'str') {
        valor = valorTexto;
      } else if (tipo === 'b') {
        valor = valorTexto === '1' ? 'Sim' : 'Não';
      } else if (valorTexto !== '') {
        const numero = Number(valorTexto);
        if (!Number.isFinite(numero)) valor = valorTexto;
        else if (estilo !== null && estilosData.has(Number(estilo))) valor = serialParaData(numero);
        else valor = numero;
      }

      celulas[coluna] = valor;
    }
    for (let i = 0; i < celulas.length; i += 1) {
      if (celulas[i] === undefined) celulas[i] = null;
    }
    linhas.push(celulas);
  }

  return linhas;
}

async function lerXlsx(file: File): Promise<AbaMigracao[]> {
  const buffer = await file.arrayBuffer();
  const entradas = localizarEntradas(buffer);

  const workbook = await extrairArquivo(buffer, entradas, 'xl/workbook.xml');
  if (!workbook) throw new Error('Arquivo .xlsx inválido: estrutura da pasta de trabalho não encontrada.');
  const relacoes = await extrairArquivo(buffer, entradas, 'xl/_rels/workbook.xml.rels');
  const sharedStrings = await extrairArquivo(buffer, entradas, 'xl/sharedStrings.xml');
  const styles = await extrairArquivo(buffer, entradas, 'xl/styles.xml');

  const compartilhadas: string[] = [];
  if (sharedStrings) {
    for (const si of Array.from(interpretarXml(sharedStrings).getElementsByTagName('si'))) {
      compartilhadas.push(Array.from(si.getElementsByTagName('t')).map(no => no.textContent ?? '').join(''));
    }
  }
  const estilosData = estilosDeData(styles);

  const mapaRelacoes = new Map<string, string>();
  if (relacoes) {
    for (const relacao of Array.from(interpretarXml(relacoes).getElementsByTagName('Relationship'))) {
      mapaRelacoes.set(relacao.getAttribute('Id') ?? '', relacao.getAttribute('Target') ?? '');
    }
  }

  const abas: AbaMigracao[] = [];
  for (const sheet of Array.from(interpretarXml(workbook).getElementsByTagName('sheet'))) {
    const nomeAba = sheet.getAttribute('name') ?? `Aba ${abas.length + 1}`;
    const relId = sheet.getAttribute('r:id') ?? sheet.getAttribute('id') ?? '';
    const alvo = mapaRelacoes.get(relId) ?? '';
    const caminho = alvo.startsWith('/') ? alvo.slice(1) : alvo ? `xl/${alvo}` : '';
    if (!caminho) continue;

    const conteudo = await extrairArquivo(buffer, entradas, caminho);
    if (!conteudo) continue;
    abas.push({ nome: nomeAba, linhas: lerAba(conteudo, compartilhadas, estilosData) });
  }

  if (abas.length === 0) throw new Error('Nenhuma aba legível encontrada no arquivo .xlsx.');
  return abas;
}
