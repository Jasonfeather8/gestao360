"use client";

import React from 'react';
import { Building2, CheckCircle2, Landmark, Clock, ShieldCheck } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';

interface AccountFilterCardsProps {
  accounts: any[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  dragScrollProps: any;
  dragScrollRef: any;
  valueFormatter: (val: number) => string;
}

export default function AccountFilterCards({
  accounts,
  selectedIds,
  onSelect,
  dragScrollProps,
  dragScrollRef,
  valueFormatter
}: AccountFilterCardsProps) {
  const { role } = useAuth();
  const isMaster = role === 'master';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Filtrar por Conta
        </h4>
        {selectedIds.length > 0 && (
          <button
            onClick={() => onSelect([])}
            className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
          >
            Limpar Filtro
          </button>
        )}
      </div>
      <div
        ref={dragScrollRef}
        {...dragScrollProps}
        className="flex gap-4 overflow-x-auto pb-2 scroll-smooth select-none no-scrollbar"
      >
        {accounts.map((acc) => {
          const isSelected = selectedIds.includes(acc.id);
          return (
            <div
              key={acc.id}
              onClick={() => onSelect(isSelected ? selectedIds.filter(id => id !== acc.id) : [...selectedIds, acc.id])}
              className={`flex-shrink-0 w-64 bg-white p-4 border-2 rounded-2xl flex flex-col group cursor-pointer transition-all shadow-sm ${
                isSelected ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-neutral-100 hover:border-neutral-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black uppercase shrink-0 transition-colors ${
                    isSelected ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-400'
                  }`}>
                    {acc.logo_url ? (
                      <img src={acc.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      acc.nome.substring(0, 2)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-black uppercase truncate tracking-tighter ${isSelected ? 'text-primary' : 'text-neutral-900'}`}>
                      {acc.nome_banco || acc.nome}
                    </p>
                    {acc.is_cofre_local && <span className="mt-1 inline-flex rounded-full border border-surface-border bg-surface px-2 py-0.5 text-[8px] font-bold text-primary">Cofre Local</span>}
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>

              <div className="space-y-1 mt-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-secondary uppercase tracking-tighter flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Operacional
                  </span>
                  <p className="text-[11px] font-black font-mono text-neutral-900">
                    {valueFormatter(acc.operacionalBalance || 0)}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
                  <span className={`text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 ${isMaster ? 'text-bank-truth-green' : 'text-neutral-400'}`}>
                    <ShieldCheck className="w-3 h-3" /> {isMaster ? 'Confirmado' : 'Real (Master)'}
                  </span>
                  <p className={`text-[11px] font-black font-mono ${isMaster ? 'text-bank-truth-green' : 'text-neutral-400'}`}>
                    {valueFormatter(acc.auditadoBalance || 0)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}