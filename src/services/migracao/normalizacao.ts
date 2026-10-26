import type { MigracaoStatusPlanilha } from '../../types';

const dois = (valor: number) => String(valor).padStart(2, '0');

/** Texto limpo: sem espaços duplicados nas pontas/meio. */
export function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return normalizarData(valor) ?? '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

/** Chave de comparação de nomes: sem acento, minúscula, espaços normalizados. */
export function normalizarChave(valor: unknown): string {
  return normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Cabeçalho de coluna: sem acento, minúsculo, sem pontuação final. */
export function normalizarCabecalho(valor: unknown): string {
  return normalizarChave(valor).replace(/[.:]+$/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Datas em 'YYYY-MM-DD'. Aceita Date, serial do Excel, 'dd/mm/aaaa',
 * 'd/m/aa', 'aaaa-mm-dd' e 'dd-mm-aaaa'. Sempre em UTC para não deslocar o dia.
 */
export function normalizarData(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return `${valor.getUTCFullYear()}-${dois(valor.getUTCMonth() + 1)}-${dois(valor.getUTCDate())}`;
  }

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor <= 0) return null;
    const milissegundos = Math.round((valor - 25569) * 86400000);
    const data = new Date(milissegundos);
    if (Number.isNaN(data.getTime())) return null;
    return `${data.getUTCFullYear()}-${dois(data.getUTCMonth() + 1)}-${dois(data.getUTCDate())}`;
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${dois(Number(iso[2]))}-${dois(Number(iso[3]))}`;

  const brasileiro = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (brasileiro) {
    const dia = Number(brasileiro[1]);
    const mes = Number(brasileiro[2]);
    let ano = Number(brasileiro[3]);
    if (ano < 100) ano += 2000;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${dois(mes)}-${dois(dia)}`;
  }

  return null;
}

/**
 * Valores monetários em número com 2 casas. Aceita número, 'R$ 1.234,56',
 * '1234,56', '1234.56', '1.234' e '(1.234,56)' (parênteses = negativo).
 */
export function normalizarValor(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
  }

  let texto = String(valor).replace(/\s/g, '').replace(/r\$/gi, '');
  if (!texto) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  if (texto.startsWith('-')) {
    negativo = true;
    texto = texto.slice(1);
  }

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  if (temVirgula && temPonto) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    texto = texto.replace(',', '.');
  } else if (temPonto) {
    const partes = texto.split('.');
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
      texto = texto.replace(/\./g, '');
    }
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return null;
  return Math.round((negativo ? -numero : numero) * 100) / 100;
}

export interface StatusRecebidoNormalizado {
  status: MigracaoStatusPlanilha;
  recebido: boolean;
  texto: string;
}

/**
 * Interpreta a coluna "Recebido", que vem como texto de status.
 * 'pago'/'recebido' = lançamento já realizado; 'em aberto'/'atrasado' = previsão;
 * 'cancelado' = fora da importação; qualquer outro texto fica para revisão.
 */
export function normalizarStatusRecebido(valor: unknown): StatusRecebidoNormalizado {
  const texto = normalizarTexto(valor);
  const chave = normalizarChave(texto);

  if (!chave) return { status: 'desconhecido', recebido: false, texto };

  // Pagamento parcial não é suportado pela importação: vai para revisão manual.
  if (chave.includes('parcial')) return { status: 'desconhecido', recebido: false, texto };

  const comecaCom = (prefixos: string[]) => prefixos.some(prefixo => chave.startsWith(prefixo));

  if (comecaCom(['cancelado', 'cancelada', 'cancelamento'])) {
    return { status: 'cancelado', recebido: false, texto };
  }
  if (comecaCom(['atrasado', 'em atraso', 'vencido', 'em atraso'])) {
    return { status: 'atrasado', recebido: false, texto };
  }
  if (comecaCom(['recebido', 'pago', 'paga', 'quitado', 'quitada', 'baixado', 'baixada'])) {
    return { status: 'recebido', recebido: true, texto };
  }
  if (comecaCom(['em aberto', 'aberto', 'aberta', 'a receber', 'a pagar', 'pendente'])) {
    return { status: 'em_aberto', recebido: false, texto };
  }

  return { status: 'desconhecido', recebido: false, texto };
}
