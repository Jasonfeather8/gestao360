import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Paperclip,
  FileText,
  XCircle
} from 'lucide-react';

import { useUIStore } from '../store/uiStore';
import { useLancamentos } from '../hooks/useData';
import { supabase } from '@/integrations/supabase/client';

interface LocalFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

export default function AprovacaoModal() {
  const { 
    isAprovacaoModalOpen, 
    setModalOpen, 
    selectedLancamentoIdsForBatch,
    setSelectedLancamentoIdsForBatch
  } = useUIStore();

  const { data: lancamentos = [], batchApprove } = useLancamentos();
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<LocalFile[]>([]);

  const selectedCount = selectedLancamentoIdsForBatch.length;
  const showAttachment = selectedCount === 1;

  const lancamento = showAttachment
    ? (lancamentos as any[]).find(l => l.id === selectedLancamentoIdsForBatch[0])
    : null;

  const entName = lancamento?.entidades_negocio?.nome_razao_social || 'Desconhecido';

  const handleClose = () => {
    setModalOpen('isAprovacaoModalOpen', false);
    setSelectedLancamentoIdsForBatch([]);
    setAttachments([]);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await batchApprove({ ids: selectedLancamentoIdsForBatch, targetStatus: 'confirmado_master' });

      // Handle Attachment if only one item is selected
      if (showAttachment && attachments.length > 0) {
        const lancamentoId = selectedLancamentoIdsForBatch[0];
        const { data: { user } } = await supabase.auth.getUser();
        
        for (const attachment of attachments) {
          const fileExt = attachment.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `lancamentos/${lancamentoId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, attachment.file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('documents')
              .getPublicUrl(filePath);

            await (supabase.from('lancamento_anexos') as any).insert({
              lancamento_id: lancamentoId,
              nome: attachment.name,
              url: publicUrl,
              tamanho: attachment.size,
              tipo_arquivo: attachment.type,
              user_id: user?.id
            });
          }
        }
      }

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
                Aprovar {selectedCount > 1 ? `${selectedCount} Títulos` : 'Título'}
              </h3>
              <p className="text-[10px] font-bold text-secondary uppercase leading-relaxed mt-2">
                {selectedCount > 1 ? (
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
              <div className="text-left space-y-3 pt-2">
                <label className="text-[10px] font-black uppercase text-secondary tracking-widest flex items-center gap-2">
                  <Paperclip className="w-4 h-4" /> Anexar Comprovante (Opcional)
                </label>
                
                <div className="relative group cursor-pointer h-12 border-2 border-dashed border-neutral-200 rounded-xl hover:border-primary transition-all flex items-center justify-center gap-2 text-secondary hover:text-primary bg-neutral-50/50">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase">
                    {attachments.length > 0 ? `${attachments.length} Anexo(s)` : 'Selecionar Arquivo'}
                  </span>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        const fileList = Array.from(e.target.files) as File[];
                        const newFiles: LocalFile[] = fileList.map(f => ({
                          name: f.name,
                          size: f.size,
                          type: f.type,
                          file: f
                        }));
                        setAttachments(prev => [...prev, ...newFiles]);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-100 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold truncate max-w-[150px]">{f.name}</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} 
                        className="text-neutral-400 hover:text-alert-red transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
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
