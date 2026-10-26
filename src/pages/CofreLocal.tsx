import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { useCofreLocalConta, useCofreLocalLancamentos, useCofreLocalTransacoes, useContasSaldos } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function formatarData(data: string | null | undefined) {
  return data ? dataFormatada.format(new Date(`${data}T00:00:00Z`)) : '—';
}

function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function obterPeriodo(mes: string) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, numeroMes, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

function EstadoConsulta({ carregando, erro }: { carregando: boolean; erro: boolean }) {
  if (carregando) return <p className="py-12 text-center text-sm text-on-surface-variant">Carregando movimentações...</p>;
  if (erro) return <p className="py-12 text-center text-sm text-alert-red">Não foi possível carregar as movimentações. Tente novamente.</p>;
  return null;
}

export default function CofreLocal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mes, setMes] = useState(mesAtual);
  const { hasRole, isLoading: carregandoPermissao } = useAuth();
  // As transações importadas do extrato são restritas por RLS a master/gerente,
  // então a aba só existe para quem pode lê-las.
  const podeVerConciliacao = hasRole(['master', 'gerente']);
  const abaDaUrl = searchParams.get('aba');
  const abaAtiva = abaDaUrl === 'conciliacao' && podeVerConciliacao ? 'conciliacao' : 'movimentacoes';
  const { inicio, fim } = obterPeriodo(mes);

  useEffect(() => {
    if (carregandoPermissao) return;
    const abaValida = abaDaUrl === 'movimentacoes' || (abaDaUrl === 'conciliacao' && podeVerConciliacao);
    if (!abaValida) {
      setSearchParams((params) => {
        params.set('aba', 'movimentacoes');
        return params;
      }, { replace: true });
    }
  }, [abaDaUrl, carregandoPermissao, podeVerConciliacao, setSearchParams]);

  const contaQuery = useCofreLocalConta();
  const conta = contaQuery.data;
  const contaId = conta?.id ?? null;
  const { data: saldos = [] } = useContasSaldos();
  const lancamentosQuery = useCofreLocalLancamentos(contaId, inicio, fim);
  const transacoesQuery = useCofreLocalTransacoes(contaId, inicio, fim, podeVerConciliacao && abaAtiva === 'conciliacao');

  const alterarAba = (aba: 'movimentacoes' | 'conciliacao') => {
    setSearchParams((params) => {
      params.set('aba', aba);
      return params;
    });
  };

  if (contaQuery.isLoading) {
    return <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-sm text-on-surface-variant">Carregando Cofre Local...</div>;
  }

  if (contaQuery.isError) {
    return <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-sm text-alert-red">Não foi possível carregar a conta Cofre Local. Tente novamente.</div>;
  }

  if (!conta) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-surface-border bg-surface p-8 text-center shadow-sm">
        <Wallet className="mx-auto mb-4 h-10 w-10 text-on-surface-variant" />
        <h1 className="text-xl font-bold text-on-surface">Nenhum Cofre Local configurado</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Nenhuma conta bancária está marcada como Cofre Local. Acesse Cadastros para definir essa conta.</p>
        <Link to="/cadastros" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:opacity-90">Ir para Cadastros</Link>
      </section>
    );
  }

  const saldo = saldos.find((item) => item.conta_id === conta.id);
  const saldoAtual = saldo ? Number(saldo.saldo_operacional) : Number(conta.saldo_inicial || 0);
  const lancamentos = lancamentosQuery.data?.data || [];
  const entradas = lancamentos.filter((item) => item.tipo === 'entrada').reduce((total, item) => total + Number(item.valor_recebido ?? item.valor_previsto ?? 0), 0);
  const saidas = lancamentos.filter((item) => item.tipo === 'saida').reduce((total, item) => total + Number(item.valor_recebido ?? item.valor_previsto ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">{conta.nome_banco || conta.nome}</h1>
            <span className="rounded-full border border-surface-border bg-primary-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">Cofre Local</span>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">Movimentações registradas para a conta de dinheiro em espécie.</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface px-5 py-3 sm:text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Saldo operacional atual</p>
          <p className="mt-1 font-mono text-xl font-bold text-on-surface">{moeda.format(saldoAtual)}</p>
        </div>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-surface-border bg-surface p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Mês de referência</span>
          <input type="month" value={mes} onChange={(event) => setMes(event.target.value)} className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary" />
        </label>
        <div className="flex w-full gap-2 sm:w-auto" role="tablist" aria-label="Movimentações do Cofre Local">
          <button type="button" role="tab" aria-selected={abaAtiva === 'movimentacoes'} onClick={() => alterarAba('movimentacoes')} className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors sm:flex-none ${abaAtiva === 'movimentacoes' ? 'bg-primary-container text-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>Movimentações do Cofre</button>
          {podeVerConciliacao && (
            <button type="button" role="tab" aria-selected={abaAtiva === 'conciliacao'} onClick={() => alterarAba('conciliacao')} className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors sm:flex-none ${abaAtiva === 'conciliacao' ? 'bg-primary-container text-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>Movimentações da Conciliação</button>
          )}
        </div>
      </section>

      {abaAtiva === 'movimentacoes' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Entradas no período</p><p className="mt-2 font-mono text-lg font-bold text-bank-truth-green">{moeda.format(entradas)}</p></div>
            <div className="rounded-xl border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Saídas no período</p><p className="mt-2 font-mono text-lg font-bold text-alert-red">{moeda.format(saidas)}</p></div>
            <div className="rounded-xl border border-surface-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Resultado líquido</p><p className="mt-2 font-mono text-lg font-bold text-on-surface">{moeda.format(entradas - saidas)}</p></div>
          </div>
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
            <div className="border-b border-surface-border px-5 py-4"><h2 className="text-xs font-black uppercase tracking-widest text-on-surface">Lançamentos do período</h2></div>
            <EstadoConsulta carregando={lancamentosQuery.isLoading} erro={lancamentosQuery.isError} />
            {!lancamentosQuery.isLoading && !lancamentosQuery.isError && (lancamentos.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-on-surface-variant">Nenhuma movimentação do Cofre Local neste mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left">
                  <thead className="bg-surface-container-low text-[9px] font-black uppercase tracking-widest text-on-surface-variant"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-surface-border">
                    {lancamentos.map((item) => <tr key={item.id} className="text-sm"><td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{formatarData(item.data_pagamento)}</td><td className="max-w-md px-5 py-3 text-on-surface">{item.observacoes || 'Lançamento financeiro'}</td><td className="px-5 py-3"><span className={`inline-flex items-center gap-1 text-xs font-bold ${item.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>{item.tipo === 'entrada' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{item.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td><td className="whitespace-nowrap px-5 py-3 text-right font-mono font-semibold text-on-surface">{moeda.format(Number(item.valor_recebido ?? item.valor_previsto ?? 0))}</td><td className="px-5 py-3 text-xs font-semibold text-on-surface-variant">{item.status_pagamento || '—'}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-surface-border bg-surface">
          <div className="border-b border-surface-border px-5 py-4"><h2 className="text-xs font-black uppercase tracking-widest text-on-surface">Transações importadas do extrato</h2></div>
          <EstadoConsulta carregando={transacoesQuery.isLoading} erro={transacoesQuery.isError} />
          {!transacoesQuery.isLoading && !transacoesQuery.isError && ((transacoesQuery.data || []).length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-on-surface-variant">Esta aba mostra as transações importadas de extratos bancários para esta conta. Não há transações importadas neste mês; para uma conta de dinheiro em espécie, isso é esperado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead className="bg-surface-container-low text-[9px] font-black uppercase tracking-widest text-on-surface-variant"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3">Conciliação</th></tr></thead>
                <tbody className="divide-y divide-surface-border">
                  {(transacoesQuery.data || []).map((item) => <tr key={item.id} className="text-sm"><td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{formatarData(item.data_transacao)}</td><td className="px-5 py-3 text-on-surface">{item.descricao_banco || 'Transação importada'}</td><td className="px-5 py-3 text-xs font-bold text-on-surface">{item.tipo_movimento === 'credito' ? 'Entrada' : 'Saída'}</td><td className="whitespace-nowrap px-5 py-3 text-right font-mono font-semibold text-on-surface">{moeda.format(Number(item.valor))}</td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status_conciliacao ? 'bg-primary-container text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{item.status_conciliacao ? 'Conciliado' : 'Pendente'}</span></td></tr>)}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
