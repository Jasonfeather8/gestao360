import React, { useState } from 'react';
import { 
  Repeat, 
  PauseCircle, 
  Building2, 
  TrendingUp,
  Calendar,
  AlertCircle,
  Loader2,
  Info,
  MoreVertical,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { useRecorrencias } from '../hooks/useData';
import { motion } from 'motion/react';
import Button from '../components/Button';

export default function Recorrencias() {
  const { data: recorrencias = [], isLoading, stopRecorrencia } = useRecorrencias();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const valueFormatter = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleStop = async (id: string) => {
    if (confirm('Deseja realmente interromper esta recorrência? Todas as parcelas futuras em aberto serão removidas.')) {
      try {
        await stopRecorrencia(id);
        alert('Recorrência interrompida com sucesso!');
      } catch (err: any) {
        alert('Erro ao interromper: ' + err.message);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="text-secondary font-bold text-sm uppercase tracking-widest">Carregando Assinaturas...</span>
        </div>
      </div>
    );
  }

  const totalComprometimentoMensal = recorrencias.reduce((acc, r) => acc + r.valor_parcela, 0);
  const totalEmAberto = recorrencias.reduce((acc, r) => acc + (r.valor_parcela * (r.quantidade_total_parcelas - r.parcelas_pagas)), 0);

  return (
    <div className="space-y-6 animate-fade-in" onClick={() => setActiveMenuId(null)}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border/50 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface uppercase flex items-center gap-3">
            <Repeat className="w-7 h-7 text-primary" />
            Gestão de Recorrências
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium">Controle suas assinaturas, contratos e despesas recorrentes em um só lugar.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-surface p-6 rounded-2xl border border-surface-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Repeat className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Contratos Ativos</p>
            <h3 className="text-xl font-bold text-on-surface">{recorrencias.length} Séries</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-surface p-6 rounded-2xl border border-surface-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-bank-truth-green/10 flex items-center justify-center text-bank-truth-green">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Comprometimento Mensal</p>
            <h3 className="text-xl font-bold text-on-surface">{valueFormatter(totalComprometimentoMensal)}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-surface p-6 rounded-2xl border border-surface-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Total em Aberto</p>
            <h3 className="text-xl font-bold text-on-surface">{valueFormatter(totalEmAberto)}</h3>
          </div>
        </div>
      </div>

      {/* List Table Data */}
      <div className="bg-white dark:bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface border-b border-surface-border select-none">
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary">Tipo</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary">Entidade</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary">Periodicidade</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary">Categoria</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary text-center">Progresso</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary text-right">Vlr. Parcela</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-wider text-secondary">Próximo Venc.</th>
                <th className="py-4 px-4 w-14"></th>
              </tr>
            </thead>
            <tbody className="text-xs text-on-surface">
              {recorrencias.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <Info className="w-10 h-10 text-secondary" />
                      <p className="text-secondary font-bold uppercase tracking-widest text-[10px]">Nenhuma recorrência ativa encontrada</p>
                    </div>
                  </td>
                </tr>
              ) : (
                recorrencias.map((rec) => (
                  <tr
                    key={rec.id}
                    className="border-b border-surface-border hover:bg-neutral-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className={`flex justify-center w-8 h-8 rounded-lg items-center ${
                        rec.valor_parcela >= 0 ? 'bg-bank-truth-green/10 text-bank-truth-green' : 'bg-alert-red/10 text-alert-red'
                      }`}>
                        {rec.valor_parcela >= 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-black text-on-background uppercase tracking-tight">
                      {rec.entidade_nome}
                    </td>
                    <td className="py-3 px-4 font-bold text-secondary uppercase">
                      <span className="px-2 py-1 bg-neutral-100 rounded-md text-[9px]">
                        {rec.periodicidade}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-secondary font-semibold">
                      {rec.categoria_nome}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-black text-on-surface">
                          {rec.parcelas_pagas} / {rec.quantidade_total_parcelas}
                        </span>
                        <div className="w-16 h-1 bg-neutral-100 rounded-full mt-1 overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-500" 
                            style={{ width: `${(rec.parcelas_pagas / rec.quantidade_total_parcelas) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-right text-sm">
                      {valueFormatter(rec.valor_parcela)}
                    </td>
                    <td className="py-3 px-4 font-bold text-primary">
                      {rec.proxima_data !== 'Finalizada' 
                        ? rec.proxima_data.split('-').reverse().join('/') 
                        : <span className="text-secondary opacity-40">Encerrada</span>}
                    </td>
                    <td className="py-3 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(prev => (prev === rec.id ? null : rec.id));
                        }}
                        className="text-secondary hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-neutral-100"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {activeMenuId === rec.id && (
                        <div className="absolute right-12 top-0 mt-0 bg-white border border-surface-border rounded-lg shadow-xl z-[100] py-2 w-44 animate-fade-in text-left">
                          <button
                            type="button"
                            disabled={rec.proxima_data === 'Finalizada'}
                            onClick={() => {
                              handleStop(rec.id);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-4 py-2 hover:bg-neutral-50 text-left text-xs text-alert-red font-bold flex items-center gap-2 disabled:opacity-30"
                          >
                            <PauseCircle className="w-4 h-4" />
                            Interromper Série
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-6 bg-primary/5 border-2 border-primary/10 rounded-3xl flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-primary shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-primary uppercase tracking-widest">Informação Importante</h4>
          <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
            Ao encerrar uma recorrência, o sistema irá remover todos os lançamentos futuros que ainda estão com o status <strong>"Em Aberto"</strong>. 
            Lançamentos que já foram liquidados (pagos) permanecerão no histórico para garantir a integridade dos seus relatórios passados.
          </p>
        </div>
      </div>
    </div>
  );
}
