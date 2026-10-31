import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Paperclip,
  FileX,
  XCircle
} from 'lucide-react';

import { useUIStore } from '../store/uiStore';
import { useLancamentoAnexos, useLancamentos } from '../hooks/useData';

export default function AprovacaoModal() {
  const { 
    isAprovacaoModalOpen, 
    setModalOpen,
    selectedLancamentoIdsForBatch,
    setSelectedLancamentoIdsForBatch,
    selectedTransferenciaAprovacao,
    setSelectedTransferenciaAprovacao
  } = useUIStore();

  const { data: lancamentos = [], batchApprove } = useLancamentos();
  const [loading, setLoading] = useState(false);

  const selectedCount = selectedLancamentoIdsForBatch.length;
  const aprovandoTransferencia = selectedCount > 1 ? selectedTransferenciaAprovacao : null;
  const showAttachment = selectedCount === 1;

  const lancamento = showAttachment
    ? (lancamentos as any[]).find(l => l.id === selectedLancamentoIdsForBatch[0])
    : null;
  const { anexos, isLoading: carregandoAnexos } = useLancamentoAnexos(
    showAttachment ? (selectedLancamentoIdsForBatch[0] ?? null) : null,
  );
  const temComprovante = Boolean(lancamento?.comprovante_url) || anexos.length > 0;

  const entName = lancamento?.entidades_negocio?.nome_razao_social || 'Desconhecido';

  const handleClose = () => {
    setModalOpen('isAprovacaoModalOpen', false);
    setSelectedLancamentoIdsForBatch([]);
    setSelectedTransferenciaAprovacao(null);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await batchApprove({ ids: selectedLancamentoIdsForBatch, targetStatus: 'confirmado_master' });
      handleClose();
    } catch (err: any) {
      alert('Erro ao aprovar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReprove = async () => {
    if (!confirm(`Deseja realmente reprovar ${selectedCount > 1 ? `os ${selectedCount} títulos selecionados` : 'este título'}?`)) {
      return;
    }

    setLoading(true);
    try {
      await batchApprove({ ids: selectedLancamentoIdsForBatch, targetStatus: 'reprovado' });
      handleClose();
    } catch (err: any) {
      alert('Erro ao reprovar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAprovacaoModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs"
        />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white w-full max-w-[420px] rounded-[32px] shadow-2xl relative z-10 overflow-hidden border border-neutral-100"
        >
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-bank-truth-green/10 rounded-full flex items-center justify-center mx-auto text-bank-truth-green">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900">
                {aprovandoTransferencia ? 'Aprovar Transferência' : `Aprovar ${selectedCount > 1 ? `${selectedCount} Títulos` : 'Título'}`}
              </h3>
              <p className="text-[10px] font-bold text-secondary uppercase leading-relaxed mt-2">
                {aprovandoTransferencia ? (
                  <>Você está prestes a confirmar a transferência entre contas <span className="text-primary font-black">{aprovandoTransferencia.rotulo}</span>. Isso confirma os dois lados de uma vez: a saída na conta de origem e a entrada na conta de destino.</>
                ) : selectedCount > 1 ? (
                  <>Você está prestes a aprovar <span className="text-primary font-black">{selectedCount} títulos</span> selecionados.</>
                ) : (
                  <>Você está prestes a aprovar o título de <span className="text-primary font-black">{entName}</span>.</>
                )}
                {selectedCount === 1 && (
                  <span className="block mt-1 text-bank-truth-green font-black">
                    {lancamento?.status_pagamento === 'bpi'
                      ? 'Isso irá confirmar a baixa por inatividade. O valor não entra no saldo do banco.'
                      : 'Isso irá alterar o status para Pago.'}
                  </span>
                )}
              </p>

            </div>

            {showAttachment && (
              <div data-testid="comprovante-status" className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                {carregandoAnexos ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-secondary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Verificando comprovante...</span>
                  </>
                ) : temComprovante ? (
                  <>
                    <Paperclip className="h-4 w-4 text-bank-truth-green" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-bank-truth-green">Comprovante anexado</span>
                  </>
                ) : (
                  <>
                    <FileX className="h-4 w-4 text-secondary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Comprovante dispensado</span>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 pt-4">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-4 bg-neutral-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirmar Aprovação
              </button>

              <button
                onClick={handleReprove}
                disabled={loading}
                className="w-full py-4 bg-white hover:bg-red-50 text-alert-red rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 border-red-100 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reprovar {selectedCount > 1 ? 'Selecionados' : 'Título'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="text-[9px] font-black uppercase text-secondary hover:text-neutral-900 transition-colors pt-2"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
