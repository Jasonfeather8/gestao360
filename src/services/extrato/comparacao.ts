import type {
  DiaComparacao,
  DirecaoExtrato,
  ExtratoLido,
  ItemComparacao,
  LancamentoFinanceiro,
  LinhaExtrato,
  ResultadoComparacao,
} from '../../types';

const STATUS_BAIXADOS: Array<LancamentoFinanceiro['status_pagamento']> = ['pago', 'pago_parcial'];

/** Status com baixa registrada (inclusive pendente do gestor): o valor recebido é o valor da conciliação. */
const STATUS_COM_VALOR_RECEBIDO: Array<LancamentoFinanceiro['status_pagamento']> = ['pago', 'pago_parcial', 'quitação_pendente'];

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Valor efetivo do lançamento: o recebido quando já existe baixa registrada, senão o previsto ajustado. */
export function valorEfetivoLancamento(lancamento: LancamentoFinanceiro): number {
  const recebido = Number(lancamento.valor_recebido ?? 0);
  if (STATUS_COM_VALOR_RECEBIDO.includes(lancamento.status_pagamento) && recebido > 0) return arredondar(recebido);

  const previsto = Math.abs(Number(lancamento.valor_previsto ?? 0));
  const desconto = Number(lancamento.desconto_valor ?? 0);
  const acrescimo = Number(lancamento.acrescimo_valor ?? 0);
  const valorDesconto =
    lancamento.desconto_tipo === 'porcentagem' ? (previsto * desconto) / 100 : desconto;
  const valorAcrescimo =
    lancamento.acrescimo_tipo === 'porcentagem' ? (previsto * acrescimo) / 100 : acrescimo;

  return arredondar(previsto - valorDesconto + valorAcrescimo);
}

/**
 * Valor de `valor_previsto` que faz o valor efetivo do lançamento bater com o
 * valor da linha do extrato, considerando desconto/acréscimo já registrados.
 */
export function valorPrevistoParaConciliar(lancamento: LancamentoFinanceiro, valorExtrato: number): number {
  const desconto = Number(lancamento.desconto_valor ?? 0);
  const acrescimo = Number(lancamento.acrescimo_valor ?? 0);
  const descontoPercentual = lancamento.desconto_tipo === 'porcentagem' ? desconto : 0;
  const acrescimoPercentual = lancamento.acrescimo_tipo === 'porcentagem' ? acrescimo : 0;
  const descontoFixo = lancamento.desconto_tipo === 'porcentagem' ? 0 : desconto;
  const acrescimoFixo = lancamento.acrescimo_tipo === 'porcentagem' ? 0 : acrescimo;
  const fator = 1 - descontoPercentual / 100 + acrescimoPercentual / 100;
  if (fator <= 0) return arredondar(valorExtrato + descontoFixo - acrescimoFixo);
  return arredondar((valorExtrato + descontoFixo - acrescimoFixo) / fator);
}

/** Dia de referência do lançamento: data de pagamento quando já baixado, senão vencimento. */
export function dataReferenciaLancamento(lancamento: LancamentoFinanceiro): string | null {
  const bruta =
    STATUS_BAIXADOS.includes(lancamento.status_pagamento) && lancamento.data_pagamento
      ? lancamento.data_pagamento
      : lancamento.data_vencimento || lancamento.data_pagamento;
  return bruta ? bruta.slice(0, 10) : null;
}

export function direcaoLancamento(lancamento: LancamentoFinanceiro): DirecaoExtrato {
  return lancamento.tipo === 'entrada' ? 'entrada' : 'saida';
}

function itemConciliado(linha: LinhaExtrato, lancamento: LancamentoFinanceiro): ItemComparacao {
  return {
    id: `par-${linha.id}-${lancamento.id}`,
    status: 'conciliado',
    data: linha.data,
    direcao: linha.direcao,
    descricao: linha.descricao,
    valorExtrato: linha.valor,
    valorErp: valorEfetivoLancamento(lancamento),
    linhaExtrato: linha,
    lancamento,
  };
}

function itemDivergente(linha: LinhaExtrato, lancamento: LancamentoFinanceiro): ItemComparacao {
  return {
    id: `div-${linha.id}-${lancamento.id}`,
    status: 'divergente',
    data: linha.data,
    direcao: linha.direcao,
    descricao: linha.descricao,
    valorExtrato: linha.valor,
    valorErp: valorEfetivoLancamento(lancamento),
    linhaExtrato: linha,
    lancamento,
  };
}

function itemPendenteBanco(linha: LinhaExtrato): ItemComparacao {
  return {
    id: `banco-${linha.id}`,
    status: 'pendente_banco',
    data: linha.data,
    direcao: linha.direcao,
    descricao: linha.descricao,
    valorExtrato: linha.valor,
    valorErp: null,
    linhaExtrato: linha,
    lancamento: null,
  };
}

function itemPendenteErp(lancamento: LancamentoFinanceiro, data: string): ItemComparacao {
  return {
    id: `erp-${lancamento.id}`,
    status: 'pendente_erp',
    data,
    direcao: direcaoLancamento(lancamento),
    descricao: lancamento.observacoes || 'Lançamento sem descrição',
    valorExtrato: null,
    valorErp: valorEfetivoLancamento(lancamento),
    linhaExtrato: null,
    lancamento,
  };
}

const ORDEM_STATUS: Record<ItemComparacao['status'], number> = {
  conciliado: 0,
  divergente: 1,
  pendente_banco: 2,
  pendente_erp: 3,
};

function ordenarItens(itens: ItemComparacao[]): ItemComparacao[] {
  return [...itens].sort((a, b) => {
    const porStatus = ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status];
    if (porStatus !== 0) return porStatus;
    return (b.valorExtrato ?? b.valorErp ?? 0) - (a.valorExtrato ?? a.valorErp ?? 0);
  });
}

/**
 * Compara as linhas lidas do extrato com os lançamentos do período.
 * Regra de casamento: mesmo dia + mesmo valor (descrição ignorada).
 */
export function compararExtrato(
  extrato: ExtratoLido,
  lancamentos: LancamentoFinanceiro[],
): ResultadoComparacao {
  const vazio: ResultadoComparacao = {
    dataInicio: extrato.dataInicio,
    dataFim: extrato.dataFim,
    dias: [],
    resumo: {
      totalEntradas: 0,
      totalSaidas: 0,
      conciliados: 0,
      pendentesBanco: 0,
      pendentesErp: 0,
      divergentes: 0,
    },
  };

  if (extrato.linhas.length === 0 || !extrato.dataInicio || !extrato.dataFim) return vazio;

  const lancamentosDoPeriodo = lancamentos
    .map((lancamento) => ({ lancamento, data: dataReferenciaLancamento(lancamento) }))
    .filter(
      (item): item is { lancamento: LancamentoFinanceiro; data: string } =>
        item.data !== null && item.data >= extrato.dataInicio! && item.data <= extrato.dataFim!,
    );

  const porDia = new Map<string, { banco: LinhaExtrato[]; erp: Array<{ lancamento: LancamentoFinanceiro; data: string }> }>();
  const diaDe = (data: string) => {
    const existente = porDia.get(data);
    if (existente) return existente;
    const novo = { banco: [] as LinhaExtrato[], erp: [] as Array<{ lancamento: LancamentoFinanceiro; data: string }> };
    porDia.set(data, novo);
    return novo;
  };

  for (const linha of extrato.linhas) diaDe(linha.data).banco.push(linha);
  for (const item of lancamentosDoPeriodo) diaDe(item.data).erp.push(item);

  const dias: DiaComparacao[] = [];
  const resumo = { ...vazio.resumo };

  for (const data of Array.from(porDia.keys()).sort((a, b) => b.localeCompare(a))) {
    const grupo = porDia.get(data)!;
    const entradas: ItemComparacao[] = [];
    const saidas: ItemComparacao[] = [];

    for (const direcao of ['entrada', 'saida'] as DirecaoExtrato[]) {
      const banco = grupo.banco.filter((linha) => linha.direcao === direcao);
      const erp = grupo.erp.filter((item) => direcaoLancamento(item.lancamento) === direcao);

      const bancoDisponivel = [...banco];
      const erpDisponivel = [...erp];
      const itens: ItemComparacao[] = [];

      // 1) Casamento exato: mesmo dia + mesmo valor.
      for (const linha of banco) {
        const indice = erpDisponivel.findIndex(
          (item) => centavos(valorEfetivoLancamento(item.lancamento)) === centavos(linha.valor),
        );
        if (indice === -1) continue;
        itens.push(itemConciliado(linha, erpDisponivel[indice].lancamento));
        erpDisponivel.splice(indice, 1);
        bancoDisponivel.splice(bancoDisponivel.indexOf(linha), 1);
      }

      // 2) Sobras dos dois lados no mesmo dia e mesma natureza: divergência dentro da tolerância.
      const candidatos: Array<{ bancoIndex: number; erpIndex: number; diferenca: number }> = [];
      for (let bancoIndex = 0; bancoIndex < bancoDisponivel.length; bancoIndex++) {
        const valorBanco = centavos(bancoDisponivel[bancoIndex].valor);
        for (let erpIndex = 0; erpIndex < erpDisponivel.length; erpIndex++) {
          const valorErp = centavos(valorEfetivoLancamento(erpDisponivel[erpIndex].lancamento));
          const diferenca = Math.abs(valorBanco - valorErp);
          const toleranciaPercentual = Math.round(Math.max(valorBanco, valorErp) * 0.05);
          if (diferenca <= 2000 || diferenca <= toleranciaPercentual) {
            candidatos.push({ bancoIndex, erpIndex, diferenca });
          }
        }
      }

      candidatos.sort((a, b) => a.diferenca - b.diferenca || a.bancoIndex - b.bancoIndex || a.erpIndex - b.erpIndex);
      const bancoPareado = new Set<number>();
      const erpPareado = new Set<number>();
      for (const candidato of candidatos) {
        if (bancoPareado.has(candidato.bancoIndex) || erpPareado.has(candidato.erpIndex)) continue;
        itens.push(itemDivergente(
          bancoDisponivel[candidato.bancoIndex],
          erpDisponivel[candidato.erpIndex].lancamento,
        ));
        bancoPareado.add(candidato.bancoIndex);
        erpPareado.add(candidato.erpIndex);
      }

      for (let i = 0; i < bancoDisponivel.length; i++) {
        if (!bancoPareado.has(i)) itens.push(itemPendenteBanco(bancoDisponivel[i]));
      }
      for (let i = 0; i < erpDisponivel.length; i++) {
        if (!erpPareado.has(i)) itens.push(itemPendenteErp(erpDisponivel[i].lancamento, data));
      }

      const ordenados = ordenarItens(itens);
      if (direcao === 'entrada') entradas.push(...ordenados);
      else saidas.push(...ordenados);
    }

    const totalEntradas = arredondar(grupo.banco.filter((l) => l.direcao === 'entrada').reduce((soma, l) => soma + l.valor, 0));
    const totalSaidas = arredondar(grupo.banco.filter((l) => l.direcao === 'saida').reduce((soma, l) => soma + l.valor, 0));
    const todos = [...entradas, ...saidas];
    const conciliados = todos.filter((item) => item.status === 'conciliado').length;
    const divergentes = todos.filter((item) => item.status === 'divergente').length;
    const pendentesBanco = todos.filter((item) => item.status === 'pendente_banco').length;
    const pendentesErp = todos.filter((item) => item.status === 'pendente_erp').length;

    resumo.totalEntradas = arredondar(resumo.totalEntradas + totalEntradas);
    resumo.totalSaidas = arredondar(resumo.totalSaidas + totalSaidas);
    resumo.conciliados += conciliados;
    resumo.divergentes += divergentes;
    resumo.pendentesBanco += pendentesBanco;
    resumo.pendentesErp += pendentesErp;

    dias.push({
      data,
      entradas,
      saidas,
      totalEntradas,
      totalSaidas,
      conciliados,
      pendentes: pendentesBanco + pendentesErp,
      divergentes,
    });
  }

  return { dataInicio: extrato.dataInicio, dataFim: extrato.dataFim, dias, resumo };
}
