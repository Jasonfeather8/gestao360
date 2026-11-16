/**
 * O extrato do Stone (e de outros bancos) é impresso com a movimentação MAIS RECENTE primeiro
 * (ordem decrescente). Detectamos a direção pelas datas das próprias linhas e, quando o extrato
 * inteiro cai num único dia, pela coluna Saldo (em um extrato decrescente o saldo cai de cima
 * para baixo). Sem sinal claro, mantemos a ordem de leitura.
 */
export function extratoDecrescente(linhas: Array<{ id: string; data: string; saldoApos?: number | null }>): boolean {
  if (linhas.length < 2) return false;
  const comSaldo = linhas.filter((linha) => typeof linha.saldoApos === 'number' && Number.isFinite(linha.saldoApos));
  const base = comSaldo.length >= 2 ? comSaldo : linhas;
  const primeira = base[0];
  const ultima = base[base.length - 1];
  if (primeira.data !== ultima.data) return primeira.data > ultima.data;
  if (typeof primeira.saldoApos === 'number' && typeof ultima.saldoApos === 'number' && primeira.saldoApos !== ultima.saldoApos) {
    return primeira.saldoApos > ultima.saldoApos;
  }
  return false;
}

/**
 * Ordem cronológica (mais antiga primeiro) de cada linha do extrato, independente da ordem
 * impressa. Extratos decrescentes são invertidos para que a conciliação siga a sequência real
 * das movimentações.
 */
export function ordemCronologicaDaLinha(linhas: Array<{ id: string; data: string; saldoApos?: number | null }>): Map<string, number> {
  const decrescente = extratoDecrescente(linhas);
  const mapa = new Map<string, number>();
  linhas.forEach((linha, index) => mapa.set(linha.id, decrescente ? linhas.length - 1 - index : index));
  return mapa;
}

export function ordenarCronologicamente<T extends { id: string }>(
  itens: T[],
  dataDe: (item: T) => string | null | undefined,
): T[] {
  const registros = itens.map((item, indice) => ({ item, indice, data: dataDe(item) }));
  const comData = registros.filter(
    (registro): registro is { item: T; indice: number; data: string } => registro.data != null,
  );
  const linhas = comData.map(({ item, data }) => ({ id: item.id, data }));
  const ordem = ordemCronologicaDaLinha(linhas);
  const datasOrdenadas = [...linhas].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
  const indicePorData = new Map<string, number>();
  datasOrdenadas.forEach(({ data }) => {
    if (!indicePorData.has(data)) indicePorData.set(data, indicePorData.size);
  });

  const itensComDataOrdenados = [...comData].sort((a, b) => {
    const diferencaData = (indicePorData.get(a.data) ?? 0) - (indicePorData.get(b.data) ?? 0);
    return diferencaData || a.indice - b.indice;
  });
  const semData = registros.filter(({ data }) => data == null).map(({ item }) => item);

  return [...itensComDataOrdenados.map(({ item }) => item), ...semData];
}
