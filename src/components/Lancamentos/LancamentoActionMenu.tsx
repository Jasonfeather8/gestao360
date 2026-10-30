"use client";

import React, { useRef } from 'react';
import {
  MoreVertical,
  History,
  Edit,
  Trash2,
  Download,
  ArrowLeftRight
} from 'lucide-react';
import { LancamentoFinanceiro } from '../../types';
import { useLancamentoAnexos } from '../../hooks/useData';
import PortalDropdown from '../PortalDropdown';

interface LancamentoActionMenuProps {
  item: LancamentoFinanceiro;
  isMaster: boolean;
  isActive: boolean;
  isOperationalView?: boolean;
  onToggle: () => void;
  onBaixa: (id: string) => void;
  onEstornar: (id: string) => void;
  onEdit: (item: LancamentoFinanceiro) => void;
  onDelete: (id: string) => void;
  onVerTransferencia?: (item: LancamentoFinanceiro) => void;
}

export default function LancamentoActionMenu({
  item,
  isMaster,
  isActive,
  isOperationalView = true,
  onToggle,
  onBaixa,
  onEstornar,
  onEdit,
  onDelete,
  onVerTransferencia
}: LancamentoActionMenuProps) {
  const { anexos = [] } = useLancamentoAnexos(item.id);
  const hasAnexo = anexos.length > 0;
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Títulos gerados por transferência (saída, entrada e tarifa) pertencem à transferência:
  // não podem ser excluídos nem ter o valor ajustado por aqui, mas levam de volta à tela dela.
  const isTransferencia = Boolean(item.transferencia_id);
  const podeEstornar = isMaster
    && (item.status_pagamento === 'pago'
      || item.status_pagamento === 'pago_parcial'
      || item.status_pagamento === 'quitação_pendente'
      || item.status_pagamento === 'bpi');
  const mostrarAVR = !isTransferencia && isOperationalView && item.status_pagamento !== 'pago';
  const mostrarExcluir = isMaster && !isTransferencia;
  const temAcoesDeCadastro = mostrarAVR || mostrarExcluir;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        data-testid="lancamento-action-menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`p-2 rounded-xl transition-all ${
          isActive ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-400 hover:text-neutral-900 hover:bg-white hover:shadow-sm'
        }`}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      <PortalDropdown
        isOpen={isActive}
        onClose={onToggle}
        triggerRef={triggerRef}
      >
        {hasAnexo && (
          <a
            href={anexos[0].url}
            download
            target="_blank"
            rel="noreferrer"
            data-testid="action-baixar-arquivo"
            className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-primary/5 rounded-xl transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Baixar Arquivo</span>
          </a>
        )}

        {podeEstornar && (
          <button
            onClick={() => onEstornar(item.id)}
            data-testid="action-estornar"
            className="w-full flex items-center gap-3 px-4 py-3 text-alert-red hover:bg-red-50 rounded-xl transition-all"
          >
            <History className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Estornar</span>
          </button>
        )}

        {isTransferencia && onVerTransferencia && (
          <button
            onClick={() => onVerTransferencia(item)}
            data-testid="action-ver-transferencia"
            className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-primary/5 rounded-xl transition-all"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Ver transferência</span>
          </button>
        )}

        {temAcoesDeCadastro && <div className="h-px bg-neutral-50 my-1" />}

        {mostrarAVR && (
          <button
            onClick={() => onEdit(item)}
            data-testid="action-avr"
            className="w-full flex items-center gap-3 px-4 py-3 text-neutral-600 hover:bg-neutral-50 rounded-xl transition-all"
          >
            <Edit className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">AVR</span>
          </button>
        )}

        {mostrarExcluir && (
          <button
            onClick={() => onDelete(item.id)}
            data-testid="action-excluir"
            className="w-full flex items-center gap-3 px-4 py-3 text-alert-red/50 hover:text-alert-red hover:bg-red-50 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Excluir</span>
          </button>
        )}
      </PortalDropdown>
    </div>
  );
}
