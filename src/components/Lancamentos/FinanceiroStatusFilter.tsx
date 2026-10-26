import { useMemo } from 'react';
import { CreditCard } from 'lucide-react';
import { useLancamentos } from '../../hooks/useData';
import { LancamentoFinanceiro } from '../../types';
import { calculateAdjustmentAmount } from '../../utils/adjustments';

interface FinanceiroStatusFilters {
  searchTerm?: string;
  docCode?: number;
  docParcel?: number;
  startDate?: string;
  endDate?: string;
  approvalStatus?: string;
  type?: string[];
  authorId?: string | string[];
  categoryId?: string | string[];
  contaId?: string | string[];
  centroCustoId?: string | string[];
  condicao?: string;
  temDesconto?: string;
  temAcrescimo?: string;
  motivoDescontoId?: string;
  motivoAcrescimoId?: string;
  isFinanceiroView: boolean;
}

interface FinanceiroStatusFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
  filters: FinanceiroStatusFilters;
}

const valueFormatter = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

const getValorLiquido = (item: LancamentoFinanceiro): number => {
  if ((item.status_pagamento === 'pago' || item.status_pagamento === 'pago_parcial') && item.valor_recebido) {
    return Number(item.valor_recebido);
  }
  const desconto = calculateAdjustmentAmount(item.desconto_valor, item.desconto_tipo, item.valor_previsto);
  const acrescimo = calculateAdjustmentAmount(item.acrescimo_valor, item.acrescimo_tipo, item.valor_previsto);
  return Number(item.valor_previsto) - desconto + acrescimo;
};

const sumValues = (items: LancamentoFinanceiro[]) => items.reduce((sum, item) => {
  // Transferências entre contas não são caixa; somente a tarifa é uma despesa real.
  if (item.transferencia_lado === 'origem' || item.transferencia_lado === 'destino') return sum;
  return sum + getValorLiquido(item);
}, 0);

export default function FinanceiroStatusFilter({ value, onChange, filters }: FinanceiroStatusFilterProps) {
  const confirmedQuery = useLancamentos({
    ...filters,
    financialStatus: ['confirmado_master'],
    statusPagamento: []
  });
  const pendingQuery = useLancamentos({
    ...filters,
    financialStatus: ['quitação_pendente'],
    statusPagamento: []
  });
  const bpiQuery = useLancamentos({
    ...filters,
    financialStatus: ['bpi'],
    statusPagamento: []
  });

  const totals = useMemo(() => ({
    confirmado_master: sumValues(confirmedQuery.data || []),
    quitação_pendente: sumValues(pendingQuery.data || []),
    bpi: sumValues(bpiQuery.data || [])
  }), [confirmedQuery.data, pendingQuery.data, bpiQuery.data]);

  const options = [
    { id: 'all', label: 'Todos' },
    { id: 'confirmado_master', label: 'Confirmado', total: totals.confirmado_master, isLoading: confirmedQuery.isLoading },
    { id: 'quitação_pendente', label: 'Pend. Gestor', total: totals.quitação_pendente, isLoading: pendingQuery.isLoading },
    { id: 'bpi', label: 'BPI (Inatividade)', total: totals.bpi, isLoading: bpiQuery.isLoading }
  ];

  const toggleStatus = (id: string) => {
    if (id === 'all') {
      onChange([]);
      return;
    }
    onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> Status de Pagamento
      </label>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(120px,auto)_minmax(0,1fr)_minmax(106px,auto)] md:items-start md:gap-x-3">
        <button
          type="button"
          onClick={() => toggleStatus(options[0].id)}
          className={`w-full md:w-fit md:min-w-[120px] min-h-[39px] px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all text-left flex items-center justify-between gap-3 md:col-start-1 md:self-start ${
            value.length === 0
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-neutral-100 bg-neutral-50 text-secondary hover:border-neutral-200'
          }`}
        >
          {options[0].label}
          {value.length === 0 && <div className="w-2 h-2 bg-primary rounded-full shrink-0" />}
        </button>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(106px,auto)] gap-2 md:contents">
          <div className="flex flex-col gap-2 md:col-start-2">
            {options.slice(1).map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleStatus(option.id)}
                className={`min-h-[39px] px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all text-left flex items-center justify-between gap-3 ${
                  value.includes(option.id)
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-neutral-100 bg-neutral-50 text-secondary hover:border-neutral-200'
                }`}
              >
                {option.label}
                {value.includes(option.id) && <div className="w-2 h-2 bg-primary rounded-full shrink-0" />}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 md:col-start-3">
            {options.slice(1).map(option => (
              <div key={option.id} className="min-h-[39px] min-w-[106px] px-3 py-2.5 rounded-xl bg-neutral-50 border-2 border-neutral-100 text-right font-mono text-[10px] font-black text-neutral-700 flex items-center justify-end">
                {option.isLoading ? '...' : valueFormatter(option.total || 0)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
