"use client";

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Filter,
  Download,
  Building2,
  AlertTriangle,
  LineChart,
  Landmark,
  Shield,
  Clock,
  RefreshCw,
  Eye,
  User,
  X,
  ShieldCheck,
  Wallet,
  PieChart as PieChartIcon,
  Users,
  Activity
} from 'lucide-react';
import { useLancamentos, useContas, useCentrosCusto, useAuditoriaLogs, useEntidades, useContasSaldos, useDashboardIndicadores } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { calculateAdjustmentAmount } from '../utils/adjustments';

import { useDragScroll } from '../hooks/useDragScroll';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardIndicadores } from '../types';
import { CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function Dashboard() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isMaster = role === 'master';
  const dragScrollAccounts = useDragScroll();

  const dragScrollTabs = useDragScroll();

  const [currentTab, setCurrentTab] = useState<'general' | 'cashflow' | 'audit'>('general');
  const [showAdvancedFilters, setShowAdvancedFiltersAdvancedFilters] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCCId, setSelectedCCId] = useState<string | null>(null);

  const { data: lancamentos = [], isLoading: loadingLancamentos } = useLancamentos();
  const { data: rawContas = [], isLoading: loadingContas } = useContas();
  const { data: rawCentrosCusto = [] } = useCentrosCusto();
  const { data: auditoriaLogs = [], refetch: refetchAudit, isFetching: fetchingAudit } = useAuditoriaLogs();
  const { data: entidades = [] } = useEntidades();

  const [periodFilter, setPeriodFilter] = useState('all');
  const selectedMonth = periodFilter === 'all' ? null : periodFilter;
  const monthStart = selectedMonth ? `${selectedMonth}-01` : null;
  const monthEnd = selectedMonth
    ? `${selectedMonth}-${String(new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
    : null;
  const { data: indicadoresData, isLoading: loadingIndicadores } = useDashboardIndicadores(monthStart, monthEnd);
  const indicadores: DashboardIndicadores | undefined = indicadoresData;

  const contas = useMemo(() => {
    return rawContas
      .filter((c: any) => c.status !== 'excluido')
      .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
  }, [rawContas]);
  const centrosCusto = useMemo(() => rawCentrosCusto.filter((c: any) => c.status !== 'excluido'), [rawCentrosCusto]);

  // Detail modal state for audit
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_user_id: user.id });
      if (error) throw error;
      return data;
    }
  });
  
  const { setModalOpen, setActiveTab } = useUIStore();

  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(item => {
      const periodMatch = periodFilter === 'all' || item.data_vencimento.startsWith(periodFilter);

      // Account filter
      const accountMatch = selectedAccountId ? item.conta_bancaria_id === selectedAccountId : true;

      // Cost center filter
      const ccMatch = selectedCCId ? item.centro_custo_id === selectedCCId : true;

      return periodMatch && accountMatch && ccMatch;
    });
  }, [lancamentos, periodFilter, selectedAccountId, selectedCCId]);

  const valueFormatter = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const totals = useMemo(() => {
   const paidSum = filteredLancamentos.filter(l => l.status_pagamento === 'pago').length;
   const unpaidSum = filteredLancamentos.filter(l => l.status_pagamento === 'aberto').length;
   const bpiSum = filteredLancamentos.filter(l => l.status_pagamento === 'bpi').length;
   const totalStatusCount = paidSum + unpaidSum + bpiSum || 1;

   // Real juros and discounts metrics
   const jurosPagos = filteredLancamentos
     .filter(l => l.tipo === 'saida' && l.status_pagamento === 'pago')
     .reduce((acc, l) => acc + calculateAdjustmentAmount(l.acrescimo_valor, l.acrescimo_tipo, l.valor_previsto), 0);

   const descontosObtidos = filteredLancamentos
     .filter(l => l.tipo === 'saida' && l.status_pagamento === 'pago')
     .reduce((acc, l) => acc + calculateAdjustmentAmount(l.desconto_valor, l.desconto_tipo, l.valor_previsto), 0);

   const jurosRecebidos = filteredLancamentos
     .filter(l => l.tipo === 'entrada' && l.status_pagamento === 'pago')
     .reduce((acc, l) => acc + calculateAdjustmentAmount(l.acrescimo_valor, l.acrescimo_tipo, l.valor_previsto), 0);

   const descontosConcedidos = filteredLancamentos
     .filter(l => l.tipo === 'entrada' && l.status_pagamento === 'pago')
     .reduce((acc, l) => acc + calculateAdjustmentAmount(l.desconto_valor, l.desconto_tipo, l.valor_previsto), 0);

   return {
     paidPercent: Math.round((paidSum / totalStatusCount) * 100),
     unpaidPercent: Math.round((unpaidSum / totalStatusCount) * 100),
     bpiPercent: Math.round((bpiSum / totalStatusCount) * 100),
     paidCount: paidSum,
     unpaidCount: unpaidSum,
     bpiCount: bpiSum,
     jurosPagos,
     descontosObtidos,
     jurosRecebidos,
     descontosConcedidos
   };
 }, [filteredLancamentos]);

 const { data: contasSaldos = [] } = useContasSaldos();

 const accountsBalances = useMemo(() => {
   return contas.map(account => {
     const saldoObj = contasSaldos.find(s => s.conta_id === account.id);
     return {
       ...account,
       auditado: saldoObj ? Number(saldoObj.saldo_confirmado) : (account.saldo_inicial || 0),
       operacional: saldoObj ? Number(saldoObj.saldo_operacional) : (account.saldo_inicial || 0),
       isBpi: false // Banco BPI removido
     };
   });
 }, [contas, contasSaldos]);

 const globalBalances = useMemo(() => {
   return {
     operacional: accountsBalances.reduce((sum, acc) => sum + (acc.operacional || 0), 0),
     auditado: accountsBalances.reduce((sum, acc) => sum + (acc.auditado || 0), 0)
   };
 }, [accountsBalances]);
 const cofreLocalAccount = accountsBalances.find(account => account.is_cofre_local);

  const costCenterBreakdown = useMemo(() => {
    return centrosCusto.map(cc => {
      const ccLaunches = filteredLancamentos.filter(l => l.centro_custo_id === cc.id);
      const entradas = ccLaunches.filter(l => l.tipo === 'entrada').reduce((acc, l) => acc + l.valor_previsto, 0);
      const saidas = ccLaunches.filter(l => l.tipo === 'saida').reduce((acc, l) => acc + l.valor_previsto, 0);
      return { ...cc, entradas, saidas };
    });
  }, [centrosCusto, filteredLancamentos]);

  if (loadingLancamentos || loadingContas || loadingStats) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-on-surface-variant font-medium text-sm">Carregando painel financeiro...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border/50 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary uppercase">Dashboard Real-Time</h1>
            <div className="h-6 w-px bg-surface-border hidden sm:block" />
            <nav ref={dragScrollTabs.ref} {...dragScrollTabs.props} className="flex gap-4 sm:gap-6 select-none overflow-x-auto scrollbar-none whitespace-nowrap scroll-smooth pb-0.5">
              <button type="button" onClick={() => setCurrentTab('general')} className={`text-xs font-bold pb-2 transition-colors border-b-2 ${currentTab === 'general' ? 'text-primary border-primary' : 'text-secondary hover:text-primary border-transparent'}`}>Visão Geral</button>
              <button type="button" onClick={() => setCurrentTab('cashflow')} className={`text-xs font-bold pb-2 transition-colors border-b-2 ${currentTab === 'cashflow' ? 'text-primary border-primary' : 'text-secondary hover:text-primary border-transparent'}`}>Fluxo de Caixa</button>
              {isMaster && (
                <button type="button" onClick={() => setCurrentTab('audit')} className={`text-xs font-bold pb-2 transition-colors border-b-2 ${currentTab === 'audit' ? 'text-primary border-primary' : 'text-secondary hover:text-primary border-transparent'}`}>Auditoria</button>
              )}
            </nav>

          </div>
        </div>

        {currentTab === 'general' && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-surface p-4 rounded-lg border border-surface-border shadow-sm animate-fade-in">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col"><span className="text-xs font-medium text-secondary mb-1">Seletor de Período</span><div className="flex items-center gap-2 border border-surface-border rounded-lg px-3 py-2 bg-surface"><Calendar className="w-5 h-5 text-secondary" /><select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="bg-transparent border-none p-0 text-sm font-semibold focus:ring-0 w-48 text-on-surface outline-none cursor-pointer"><option value="all">Todo o período</option>{(indicadoresData?.meses || []).map(month => <option key={month} value={month}>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`)).replace(/^./, letter => letter.toUpperCase())}</option>)}</select></div></div>
              </div>
              <button onClick={() => {
                const data = indicadores;
                const rows: string[][] = [];
                const addSection = (title: string, headers: string[], values: string[][]) => {
                  rows.push([title], headers, ...values, []);
                };
                const csvValue = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
                addSection('SALDOS', ['Indicador', 'Valor'], data ? [
                  ['Real', valueFormatter(data.saldos.real)], ['Operacional', valueFormatter(data.saldos.operacional)], ['Simulado', valueFormatter(data.saldos.simulado)]
                ] : []);
                addSection('INDICADORES DO DASHBOARD', ['Indicador', 'Valor'], [
                  ['Saldo Consolidado', valueFormatter(stats?.total_consolidado || 0)], ['Expectativa Final', valueFormatter(stats?.total_simulado || 0)], ['Pendentes Saída', valueFormatter(stats?.pendente_saida_valor || 0)], ['Pendentes Entrada', valueFormatter(stats?.pendente_entrada_valor || 0)]
                ]);
                addSection('COBERTURA DAS PROVISÕES', ['Indicador', 'Valor'], data ? [
                  ['Total de provisões', valueFormatter(data.cobertura.total_provisoes)], ['Total coberto', valueFormatter(data.cobertura.total_coberto)], ['Total descoberto', valueFormatter(data.cobertura.total_descoberto)], ['Percentual coberto', `${data.cobertura.percentual_coberto.toFixed(1)}%`],
                  ...(data.cobertura.ponto_estouro ? [['Ponto de estouro', `${data.cobertura.ponto_estouro.descricao} · falta ${valueFormatter(data.cobertura.ponto_estouro.faltando)}`]] : [['Ponto de estouro', 'Provisões 100% cobertas']])
                ] : []);
                addSection('ITENS DE COBERTURA', ['Descrição', 'Entidade', 'Vencimento', 'Valor', 'Acumulado', 'Coberto'], data?.cobertura.itens.map(item => [item.descricao, item.entidade || '', item.vencimento || '', valueFormatter(item.valor), valueFormatter(item.acumulado), item.coberto ? 'Sim' : 'Não']) || []);
                addSection('CARTEIRA / INADIMPLÊNCIA', ['Indicador', 'Valor'], data ? [
                  ['Pago regular', valueFormatter(data.carteira.pago_regular)], ['Atrasado', valueFormatter(data.carteira.atrasado)], ['Baixa por inatividade', valueFormatter(data.carteira.baixa_inatividade)], ['Total', valueFormatter(data.carteira.total)]
                ] : []);
                addSection('KPIs DO PERÍODO', ['Indicador', 'Valor'], data ? [
                  ['Entradas realizadas', valueFormatter(data.periodo.kpis.realizado_entrada)], ['Saídas realizadas', valueFormatter(data.periodo.kpis.realizado_saida)], ['Entradas previstas', valueFormatter(data.periodo.kpis.previsto_entrada)], ['Saídas previstas', valueFormatter(data.periodo.kpis.previsto_saida)], ['Liquidez corrente', valueFormatter(data.periodo.kpis.liquidez)], ['Saldo projetado', valueFormatter(data.periodo.kpis.saldo_projetado)], ['Margem operacional', `${data.periodo.kpis.margem.toFixed(1)}%`]
                ] : []);
                addSection('FLUXO DE CAIXA DIÁRIO', ['Data', 'Realizado', 'Projetado'], data?.periodo.fluxo_diario.map(day => [day.data, valueFormatter(day.realizado), valueFormatter(day.previsto)]) || []);
                addSection('SAÍDAS POR CATEGORIA', ['Categoria', 'Valor'], data?.periodo.saidas_por_categoria.map(item => [item.categoria, valueFormatter(item.valor)]) || []);
                addSection('RECEITA POR CLIENTE', ['Cliente', 'Valor'], data?.periodo.receita_por_cliente.map(item => [item.cliente, valueFormatter(item.valor)]) || []);
                if (isMaster && data?.centros_custo) {
                  const centros = [...data.centros_custo.melhores, ...data.centros_custo.deficitarios];
                  addSection('CENTROS DE CUSTO', ['Centro de custo', 'Receitas', 'Despesas', 'Resultado'], [
                    ['TOTAL', valueFormatter(data.centros_custo.total_receitas), valueFormatter(data.centros_custo.total_despesas), valueFormatter(data.centros_custo.resultado)],
                    ...centros.map(center => [center.nome, valueFormatter(center.receitas), valueFormatter(center.despesas), valueFormatter(center.resultado)])
                  ]);
                }
                const csv = rows.map(row => row.map(csvValue).join(',')).join('\n');
                const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'dashboard_real.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
              }} disabled={loadingIndicadores || !indicadores} className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-neutral-700 text-white rounded-lg text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"><Download className="w-5 h-5" /> Exportar CSV</button>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
              {/* Saldo Principal (Operacional para Gerente, Duplo para Master) */}
              <div className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-bank-truth-green"></div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold text-secondary uppercase tracking-wider">
                    {isMaster ? 'Saldos de Caixa' : 'Saldo Disponível (Operacional)'}
                  </span>
                  <Landmark className="w-5 h-5 text-bank-truth-green" />
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold font-mono text-on-surface">{valueFormatter(stats?.total_operacional || 0)}</h3>
                    <div className="text-[10px] font-semibold text-secondary flex items-center gap-1 uppercase tracking-widest mt-1">
                      <Clock className="w-3.5 h-3.5" /> Saldo Operacional (Disponível)
                    </div>
                  </div>

                  <div className="pt-4 border-t border-surface-border/50">
                    {isMaster ? (
                      <>
                        <h4 className="text-lg font-bold font-mono text-bank-truth-green">{valueFormatter(stats?.total_consolidado || 0)}</h4>
                        <div className="text-[10px] font-semibold text-bank-truth-green flex items-center gap-1 uppercase tracking-widest mt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Saldo Real (Confirmado Master)
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-secondary uppercase tracking-widest">Em Validação Master</p>
                          <p className="text-xs font-bold font-mono text-neutral-400">
                            {valueFormatter(Math.max(0, (stats?.total_operacional || 0) - (stats?.total_consolidado || 0)))}
                          </p>
                        </div>
                        <div className="bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-100 flex items-center gap-1">
                          <Shield className="w-3 h-3 text-neutral-300" />
                          <span className="text-[8px] font-black text-neutral-400 uppercase">Aguardando</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                <div className="flex justify-between items-start mb-4"><span className="text-xs font-bold text-secondary uppercase tracking-wider">Expectativa Final</span><LineChart className="w-5 h-5 text-primary" /></div>
                <h3 className="text-2xl font-bold font-mono text-on-surface">{valueFormatter(stats?.total_simulado || 0)}</h3>
                <p className="text-xs text-secondary mt-2">Cenário previsto para final do período</p>
                
                {stats?.quitacao_pendente_count > 0 && (
                   <div className="mt-4 p-2 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4 text-amber-600" />
                     <span className="text-[9px] font-black text-amber-700 uppercase">
                       {stats.quitacao_pendente_count} Quitações aguardando Master
                     </span>
                   </div>
                )}
              </div>

              <div className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#FFA000]"></div>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold text-secondary uppercase tracking-wider">Fila de Trabalho</span>
                  <Shield className="w-5 h-5 text-[#FFA000]" />
                </div>
                
                <div className="space-y-3">
                  <div
                    onClick={() => navigate('/pagar')}
                    className="flex items-center justify-between cursor-pointer hover:bg-neutral-50 p-2 -mx-2 rounded-lg transition-colors group"
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-alert-red uppercase">Pendentes (Saída)</span>
                      <span className="text-lg font-bold font-mono text-on-surface group-hover:text-primary">{valueFormatter(stats?.pendente_saida_valor || 0)}</span>
                    </div>
                    <div className="text-right">
                      <span className="bg-red-50 text-alert-red text-[10px] font-black px-2 py-1 rounded-lg border border-red-100">
                        {stats?.pendente_saida_count || 0} Itens
                      </span>
                    </div>
                  </div>
                  
                  <div className="h-px bg-surface-border/50 w-full"></div>

                  <div
                    onClick={() => navigate('/receber')}
                    className="flex items-center justify-between cursor-pointer hover:bg-neutral-50 p-2 -mx-2 rounded-lg transition-colors group"
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-bank-truth-green uppercase">Pendentes (Entrada)</span>
                      <span className="text-lg font-bold font-mono text-on-surface group-hover:text-primary">{valueFormatter(stats?.pendente_entrada_valor || 0)}</span>
                    </div>
                    <div className="text-right">
                      <span className="bg-emerald-50 text-bank-truth-green text-[10px] font-black px-2 py-1 rounded-lg border border-emerald-100">
                        {stats?.pendente_entrada_count || 0} Itens
                      </span>
                    </div>
                  </div>

                  {isMaster && (
                    <>
                      <div className="h-px bg-surface-border/50 w-full"></div>
                      <div
                        onClick={() => navigate('/conciliacao?aba=transferencias')}
                        className="flex items-center justify-between cursor-pointer hover:bg-neutral-50 p-2 -mx-2 rounded-lg transition-colors group"
                      >
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-[#FFA000] uppercase">Transferências aguardando Master</span>
                          <span className="text-lg font-bold font-mono text-on-surface group-hover:text-primary">{valueFormatter(stats?.transferencias_pendentes_valor || 0)}</span>
                        </div>
                        <div className="text-right">
                          <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2 py-1 rounded-lg border border-amber-100">
                            {stats?.transferencias_pendentes_count || 0} Itens
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-2"><Building2 className="w-5 h-5 text-secondary" /> SALDO POR CONTA</h4>
                {selectedAccountId && (
                  <button
                    onClick={() => setSelectedAccountId(null)}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    Limpar Filtro Conta
                  </button>
                )}
              </div>
              {cofreLocalAccount && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface-container-low px-4 py-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface">Cofre Local · {cofreLocalAccount.nome_banco || cofreLocalAccount.nome}</p>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">Saldo operacional · já incluído no saldo consolidado</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-on-surface">{valueFormatter(cofreLocalAccount.operacional || 0)}</span>
                </div>
              )}
              <div ref={dragScrollAccounts.ref} {...dragScrollAccounts.props} className="flex gap-4 overflow-x-auto pb-2 scroll-smooth select-none px-0.5">
                {/* Card Todas as Contas */}
                <div
                  onClick={() => setSelectedAccountId(null)}
                  className={`flex-shrink-0 w-64 bg-white dark:bg-surface p-4 border rounded-lg flex flex-col group cursor-pointer transition-all ${
                    selectedAccountId === null ? 'border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]' : 'border-surface-border hover:border-primary shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold uppercase transition-colors ${
                      selectedAccountId === null ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                    }`}>
                      <Landmark className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Saldo Global</span>
                  </div>
                  
                  <div className="space-y-1">
                    <p className={`text-sm font-bold font-mono transition-colors ${
                       selectedAccountId === null ? 'text-primary' : 'text-on-surface'
                     }`}>
                       {valueFormatter(globalBalances.operacional)}
                       <span className="text-[9px] font-medium text-secondary ml-1 lowercase">(operacional)</span>
                     </p>
                     <p className={`text-[11px] font-bold font-mono ${isMaster ? 'text-bank-truth-green' : 'text-neutral-400'}`}>
                       {valueFormatter(globalBalances.auditado)}
                       <span className="text-[8px] font-medium ml-1 lowercase">({isMaster ? 'confirmado' : 'real'})</span>
                     </p>
                  </div>
                </div>

                {accountsBalances.map((acc, i) => (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccountId(acc.id === selectedAccountId ? null : acc.id)}
                    className={`flex-shrink-0 w-64 bg-white dark:bg-surface p-4 border rounded-lg flex flex-col group cursor-pointer transition-all ${
                      selectedAccountId === acc.id ? 'border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]' : 'border-surface-border hover:border-primary shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold uppercase transition-colors ${
                        selectedAccountId === acc.id ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                      }`}>
                        {acc.logo_url ? (
                          <img src={acc.logo_url} alt="Logo" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          (acc.nome || '').substring(0, 2)
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[10px] font-black uppercase tracking-widest text-secondary">{acc.nome}</span>
                        {acc.is_cofre_local && <span className="mt-1 inline-flex rounded-full border border-surface-border bg-surface px-2 py-0.5 text-[8px] font-bold text-primary">Cofre Local</span>}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <p className={`text-sm font-bold font-mono transition-colors ${
                        selectedAccountId === acc.id ? 'text-primary' : 'text-on-surface'
                      }`}>
                        {valueFormatter(acc.operacional || 0)}
                        <span className="text-[9px] font-medium text-secondary ml-1 lowercase">(operacional)</span>
                      </p>
                      <p className={`text-[11px] font-bold font-mono ${isMaster ? 'text-bank-truth-green' : 'text-neutral-400'}`}>
                        {valueFormatter(acc.auditado || 0)}
                        <span className="text-[8px] font-medium ml-1 lowercase">({isMaster ? 'confirmado' : 'real'})</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              <div className="lg:col-span-2 bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-on-surface">Performance por Centro de Custo</h4>
                  {selectedCCId && (
                    <button
                      onClick={() => setSelectedCCId(null)}
                      className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      Limpar Filtro Centro
                    </button>
                  )}
                </div>
                <div className="relative h-64 w-full flex items-end justify-around gap-2 px-4 border-b border-surface-border pt-10">
                  {costCenterBreakdown.map((cc, i) => {
                    const maxVal = Math.max(...costCenterBreakdown.map(c => Math.max(c.entradas, c.saidas, 1))) * 1.1;
                    const isSelected = selectedCCId === cc.id;
                    return (
                      <div
                        key={cc.id}
                        onClick={() => setSelectedCCId(isSelected ? null : cc.id)}
                        className={`flex flex-col items-center gap-1 flex-1 h-full justify-end group cursor-pointer transition-all ${
                          isSelected ? 'opacity-100 scale-105' : selectedCCId ? 'opacity-30 grayscale' : 'opacity-100'
                        }`}
                      >
                        <div className="w-full flex justify-center items-end gap-1.5 h-44">
                          <div className="bg-bank-truth-green w-6 rounded-t-sm relative transition-all duration-300" style={{ height: `${(cc.entradas / maxVal) * 100}%` }} />
                          <div className="bg-alert-red w-6 rounded-t-sm relative transition-all duration-300" style={{ height: `${(cc.saidas / maxVal) * 100}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold mt-2 truncate max-w-full ${isSelected ? 'text-primary' : 'text-secondary'}`}>{cc.nome}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm flex flex-col h-full justify-between">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-on-surface mb-2">Desempenho & Desperdício</h4>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-4">Acompanhamento de Juros e Descontos</p>
                </div>
                
                <div className="space-y-4 my-2">
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-red-500 uppercase tracking-widest block">Juros Pagos (Desperdício)</span>
                      <span className="text-sm font-mono font-black text-red-600 dark:text-red-400">{valueFormatter(totals.jurosPagos)}</span>
                    </div>
                    <div className="text-[9px] font-black text-red-500 bg-red-100/50 dark:bg-red-900/50 px-2 py-1 rounded-lg">
                      Evite Atrasos
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Descontos Obtidos (Economia)</span>
                      <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">{valueFormatter(totals.descontosObtidos)}</span>
                    </div>
                    <div className="text-[9px] font-black text-emerald-500 bg-emerald-100/50 dark:bg-emerald-900/50 px-2 py-1 rounded-lg">
                      Excelente!
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-surface-border">
                  <div className="flex justify-between text-[10px] font-black uppercase text-secondary mb-1">
                    <span>Eficiência de Pagamento</span>
                    <span className="text-on-surface">{totals.paidPercent}% Liquidados</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-100 dark:bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-bank-truth-green transition-all duration-500" style={{ width: `${totals.paidPercent}%` }} />
                  </div>
                </div>
              </div>

            </section>

            <section className="space-y-6 animate-fade-in">
              {loadingIndicadores ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[0, 1, 2, 3].map(item => <div key={item} className="h-56 rounded-xl border border-surface-border bg-surface animate-pulse" />)}
                </div>
              ) : indicadores ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm">
                      <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Cobertura das Provisões</h3><ShieldCheck className="w-5 h-5 text-bank-truth-green" /></div>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div><p className="text-[10px] uppercase text-secondary">Provisões</p><p className="font-bold text-sm">{valueFormatter(indicadores.cobertura.total_provisoes)}</p></div>
                        <div><p className="text-[10px] uppercase text-secondary">Coberto</p><p className="font-bold text-sm text-bank-truth-green">{valueFormatter(indicadores.cobertura.total_coberto)}</p></div>
                        <div><p className="text-[10px] uppercase text-secondary">Cobertura</p><p className="font-bold text-sm">{indicadores.cobertura.percentual_coberto.toFixed(1)}%</p></div>
                      </div>
                      {indicadores.cobertura.ponto_estouro ? (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                          <p className="flex items-center gap-2 text-xs font-bold"><AlertTriangle className="w-4 h-4" /> Ponto de estouro · {indicadores.cobertura.ponto_estouro.vencimento ? new Date(`${indicadores.cobertura.ponto_estouro.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Data não informada'}</p>
                          <p className="mt-1 text-sm font-semibold">{indicadores.cobertura.ponto_estouro.descricao}{indicadores.cobertura.ponto_estouro.entidade ? ` · ${indicadores.cobertura.ponto_estouro.entidade}` : ''}</p>
                          <p className="mt-1 text-xs">Faltam {valueFormatter(indicadores.cobertura.ponto_estouro.faltando)}</p>
                        </div>
                      ) : <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">As provisões estão 100% cobertas.</p>}
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-surface-border">
                        {indicadores.cobertura.itens.length ? indicadores.cobertura.itens.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 border-b border-surface-border/60 px-3 py-2 last:border-0">
                            <div className="min-w-0"><p className="truncate text-xs font-semibold text-on-surface">{item.descricao}</p><p className="text-[10px] text-secondary">{item.vencimento ? new Date(`${item.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem vencimento'}{item.entidade ? ` · ${item.entidade}` : ''}</p></div>
                            <div className="shrink-0 text-right"><p className="text-xs font-bold">{valueFormatter(item.valor)}</p><span className={`text-[10px] font-semibold ${item.coberto ? 'text-bank-truth-green' : 'text-alert-red'}`}>{item.coberto ? 'Coberto' : 'Descoberto'}</span></div>
                          </div>
                        )) : <p className="p-4 text-center text-xs text-secondary">Nenhuma provisão encontrada.</p>}
                      </div>
                    </article>

                    <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm">
                      <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Inadimplência por Valor</h3><PieChartIcon className="w-5 h-5 text-primary" /></div>
                      {indicadores.carteira.total > 0 ? <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="h-48 w-full sm:w-1/2"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: 'Pago regular', value: indicadores.carteira.pago_regular }, { name: 'Atrasado', value: indicadores.carteira.atrasado }, { name: 'Baixa por inatividade', value: indicadores.carteira.baixa_inatividade }]} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="82%" paddingAngle={2}>{['#2E7D32', '#D32F2F', '#FFA000'].map(color => <Cell key={color} fill={color} />)}</Pie><Tooltip formatter={(value) => valueFormatter(Number(value))} /></PieChart></ResponsiveContainer></div>
                        <div className="w-full space-y-3">{[
                          ['Pago regular', indicadores.carteira.pago_regular, 'bg-bank-truth-green'], ['Atrasado', indicadores.carteira.atrasado, 'bg-alert-red'], ['Baixa por inatividade', indicadores.carteira.baixa_inatividade, 'bg-pending-amber']
                        ].map(([label, value, color]) => <div key={String(label)} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 text-secondary"><i className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span><strong className="text-on-surface">{valueFormatter(Number(value))}</strong></div>)}</div>
                      </div> : <p className="py-12 text-center text-xs text-secondary">Sem dados de carteira para este período.</p>}
                    </article>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      ['Liquidez corrente', indicadores.periodo.kpis.liquidez.toFixed(1)],
                      ['Margem operacional', `${indicadores.periodo.kpis.margem.toFixed(1)}%`],
                      ['Saldo projetado', valueFormatter(indicadores.periodo.kpis.saldo_projetado)],
                      ['Realizado · entradas / saídas', `${valueFormatter(indicadores.periodo.kpis.realizado_entrada)} / ${valueFormatter(indicadores.periodo.kpis.realizado_saida)}`]
                    ].map(([label, value]) => <div key={label} className="bg-white dark:bg-surface p-4 rounded-xl border border-surface-border shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-secondary">{label}</p><p className="mt-2 text-lg font-bold text-on-surface">{value}</p></div>)}
                  </div>

                  <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm">
                    <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Fluxo de Caixa Diário · Realizado × Projetado</h3><Activity className="w-5 h-5 text-primary" /></div>
                    {indicadores.periodo.fluxo_diario.length ? <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={indicadores.periodo.fluxo_diario} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" /><XAxis dataKey="data" tickFormatter={value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 10 }} /><YAxis tickFormatter={value => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={label => new Date(`${label}T12:00:00`).toLocaleDateString('pt-BR')} formatter={(value, name) => [valueFormatter(Number(value)), name === 'realizado' ? 'Realizado' : 'Projetado']} /><Line type="monotone" dataKey="realizado" name="realizado" stroke="#2E7D32" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="previsto" name="previsto" stroke="#795900" strokeWidth={2} strokeDasharray="5 4" dot={false} /></ComposedChart></ResponsiveContainer></div> : <p className="py-12 text-center text-xs text-secondary">Sem movimentação diária para este período.</p>}
                  </article>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm"><div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Saídas por Categoria</h3><Wallet className="w-5 h-5 text-alert-red" /></div>
                      <div className="max-h-64 overflow-y-auto">{indicadores.periodo.saidas_por_categoria.length ? indicadores.periodo.saidas_por_categoria.map(item => <div key={item.categoria} className="flex justify-between gap-4 border-b border-surface-border/60 py-3 last:border-0"><span className="text-sm text-secondary">{item.categoria}</span><strong className="text-sm text-on-surface">{valueFormatter(item.valor)}</strong></div>) : <p className="py-10 text-center text-xs text-secondary">Sem saídas por categoria neste período.</p>}</div>
                    </article>
                    <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm"><div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Concentração de Receita · Top 5 Clientes</h3><Users className="w-5 h-5 text-bank-truth-green" /></div>
                      <div className="max-h-64 overflow-y-auto">{indicadores.periodo.receita_por_cliente.length ? indicadores.periodo.receita_por_cliente.slice(0, 5).map((item, index) => <div key={`${item.cliente}-${index}`} className="flex justify-between gap-4 border-b border-surface-border/60 py-3 last:border-0"><span className="truncate text-sm text-secondary">{index + 1}. {item.cliente}</span><strong className="shrink-0 text-sm text-on-surface">{valueFormatter(item.valor)}</strong></div>) : <p className="py-10 text-center text-xs text-secondary">Sem receitas por cliente neste período.</p>}</div>
                    </article>
                  </div>

                  {isMaster && indicadores.centros_custo && <article className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm">
                    <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Saúde por Centro de Custo</h3><Building2 className="w-5 h-5 text-primary" /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"><div><p className="text-[10px] uppercase text-secondary">Receitas</p><strong>{valueFormatter(indicadores.centros_custo.total_receitas)}</strong></div><div><p className="text-[10px] uppercase text-secondary">Despesas</p><strong>{valueFormatter(indicadores.centros_custo.total_despesas)}</strong></div><div><p className="text-[10px] uppercase text-secondary">Resultado</p><strong>{valueFormatter(indicadores.centros_custo.resultado)}</strong></div></div>
                    {[['Melhores resultados', indicadores.centros_custo.melhores], ['Centros deficitários', indicadores.centros_custo.deficitarios]].map(([title, centers]) => <div key={String(title)} className="mb-4 last:mb-0"><h4 className="mb-2 text-xs font-bold text-secondary">{title}</h4>{(centers as NonNullable<typeof indicadores.centros_custo>['melhores']).length ? (centers as NonNullable<typeof indicadores.centros_custo>['melhores']).map(center => <div key={center.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-b border-surface-border/60 py-2 text-xs"><span className="truncate font-semibold">{center.nome}</span><span>Rec. {valueFormatter(center.receitas)}</span><span>Desp. {valueFormatter(center.despesas)}</span><strong className={center.resultado < 0 ? 'text-alert-red' : 'text-bank-truth-green'}>{valueFormatter(center.resultado)}</strong></div>) : <p className="text-xs text-secondary">Nenhum centro nesta lista.</p>}</div>)}
                  </article>}
                </>
              ) : <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-sm text-secondary">Não foi possível carregar os indicadores.</div>}
            </section>
          </>
        )}

        {currentTab === 'cashflow' && (
          <section className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm animate-fade-in">
             <div className="flex justify-between items-center mb-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-on-surface">Histórico Recente de Fluxo</h4>
              <button
                onClick={() => { setActiveTab('lancamentos'); window.scrollTo(0, 0); }}
                className="text-xs font-black text-primary hover:underline uppercase tracking-widest"
              >
                Ver Tudo →
              </button>
            </div>
             <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Data</th><th className="py-4 px-8">Descrição</th><th className="py-4 px-8">Entidade</th><th className="py-4 px-8 text-right">Valor</th></tr></thead>
                <tbody className="text-[11px] font-bold">
                  {lancamentos.filter(l => l.status_pagamento === 'pago').slice(0, 50).map(l => (
                    <tr key={l.id} className="border-b border-neutral-50 hover:bg-neutral-50">

                      <td className="py-4 px-8 font-mono">{l.data_vencimento.split('-').reverse().join('/')}</td>
                      <td className="py-4 px-8 uppercase">{l.observacoes || 'Lançamento'}</td>
                      <td className="py-4 px-8">{entidades.find(e => e.id === l.entidade_id)?.nome_razao_social || '-'}</td>
                      <td className={`py-4 px-8 text-right font-black ${l.tipo === 'saida' ? 'text-alert-red' : 'text-bank-truth-green'}`}>{valueFormatter(l.valor_previsto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {currentTab === 'audit' && (
          <section className="bg-white dark:bg-surface p-6 rounded-xl border border-surface-border shadow-sm animate-fade-in relative">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-on-surface">Rastro de Auditoria</h4>
              <button
                onClick={() => refetchAudit()}
                disabled={fetchingAudit}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${fetchingAudit ? 'animate-spin' : ''}`} />
                Atualizar Dados
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest">
                    <th className="py-4 px-8">Data/Hora</th>
                    <th className="py-4 px-8">Usuário</th>
                    <th className="py-4 px-8">Ação Realizada</th>
                    <th className="py-4 px-8">Módulo</th>
                    <th className="py-4 px-8 text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] font-bold">
                  {auditoriaLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-secondary opacity-40 uppercase tracking-widest text-[10px]">Nenhum log registrado ainda</td>
                    </tr>
                  ) : (
                    auditoriaLogs.slice(0, 50).map(log => (
                      <tr key={log.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">

                        <td className="py-4 px-8 font-mono text-secondary">
                          {new Date(log.data_hora).toLocaleDateString()} {new Date(log.data_hora).toLocaleTimeString()}
                        </td>
                        <td className="py-4 px-8">
                          <div className="flex flex-col">
                            <span className="text-on-surface uppercase">{log.profiles?.nome || 'Sistema'}</span>
                            <span className="text-[9px] text-secondary font-medium">{log.profiles?.email || 'automático'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-8">
                          <span className={`px-2 py-1 rounded text-[9px] uppercase font-black ${
                            log.acao.includes('Aprovação') ? 'bg-bank-truth-green/10 text-bank-truth-green' :
                            log.acao.includes('Exclusão') ? 'bg-alert-red/10 text-alert-red' :
                            log.acao.includes('Novo') ? 'bg-blue-50 text-blue-600' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {log.acao}
                          </span>
                        </td>
                        <td className="py-4 px-8 uppercase text-secondary/60 text-[10px]">{log.tabela_afetada.replace('_', ' ')}</td>
                        <td className="py-4 px-8 text-right">
                          <button
                            onClick={() => setSelectedAuditLog(log)}
                            className="p-2 text-secondary hover:text-primary transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Simple Detail Modal */}
            {selectedAuditLog && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-surface-border">
                  <header className="px-6 py-4 border-b border-surface-border flex justify-between items-center bg-neutral-50">
                    <h3 className="text-xs font-black uppercase tracking-widest">Detalhes da Auditoria</h3>
                    <button onClick={() => setSelectedAuditLog(null)} className="p-2 hover:bg-neutral-200 rounded-lg"><X className="w-5 h-5" /></button>
                  </header>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-secondary uppercase">Ação</p>
                        <p className="text-xs font-bold">{selectedAuditLog.acao}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-secondary uppercase">Horário</p>
                        <p className="text-xs font-bold">{new Date(selectedAuditLog.data_hora).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-secondary uppercase">Usuário Responsável</p>
                      <div className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                        <User className="w-4 h-4 text-secondary" />
                        <span className="text-xs font-bold">{selectedAuditLog.profiles?.nome} ({selectedAuditLog.profiles?.email})</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-secondary uppercase">Alterações Detectadas</p>
                      <div className="p-4 bg-neutral-900 rounded-xl font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-48 scrollbar-thin">
                        <pre>{JSON.stringify({
                          de: selectedAuditLog.dados_anteriores,
                          para: selectedAuditLog.dados_novos
                        }, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                  <footer className="px-6 py-4 border-t border-surface-border bg-neutral-50 flex justify-end">
                    <button onClick={() => setSelectedAuditLog(null)} className="px-6 py-2 bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg">Fechar</button>
                  </footer>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}