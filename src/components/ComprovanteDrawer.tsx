import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Printer,
  Download,
  X,
  Bluetooth,
  Calendar,
  User,
  Wallet,
  Tag,
  FileText,
  ExternalLink,
  Hash,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Briefcase,
  Layers,
  Banknote,
  QrCode
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useLancamentos, useEntidades, useCategorias, useContas, useLancamentoAnexos, useUsuarios } from '../hooks/useData';

export default function ComprovanteDrawer() {
  const { isComprovanteOpen, setModalOpen, selectedLancamentoIdForModal, setSelectedLancamentoIdForModal } = useUIStore();
  const { data: lancamentos = [] } = useLancamentos();
  const { data: entidades = [] } = useEntidades();
  const { data: categorias = [] } = useCategorias();
  const { data: contas = [] } = useContas();
  const { data: usuarios = [] } = useUsuarios();
  const { anexos = [] } = useLancamentoAnexos(selectedLancamentoIdForModal);

  const lancamento = lancamentos.find(l => l.id === selectedLancamentoIdForModal);

  const handleClose = () => {
    setModalOpen('isComprovanteOpen', false);
    setSelectedLancamentoIdForModal(null);
  };

  if (!lancamento) return null;

  const entidade = entidades.find(e => e.id === lancamento.entidade_id);
  const categoria = categorias.find(c => c.id === lancamento.categoria_id);
  const conta = contas.find(c => c.id === lancamento.conta_bancaria_id);
  const autor = usuarios.find(u => u.id === lancamento.usuario_criador_id);
  const isPartialPayment = lancamento.status_pagamento === 'pago_parcial' || (lancamento.status_pagamento === 'quitação_pendente' && Boolean((lancamento as any).vinculo_residuo_id));

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    return dateStr.split('-').reverse().join('/');
  };

  return (
    <AnimatePresence>
      {isComprovanteOpen && (
        <div className="fixed inset-0 z-[250] overflow-hidden font-sans select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={handleClose}
          />
          
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-y-0 right-0 max-w-xl w-full bg-surface shadow-2xl flex flex-col h-full transform transition-transform duration-300"
          >
            <div className="px-6 py-5 border-b border-surface-border flex items-center justify-between bg-white shrink-0 print:border-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center text-white font-black text-lg">
                  G
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase text-on-surface tracking-wider">Comprovante de Lançamento</h2>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-0.5">Gestão 360 • ERP Financeiro</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl text-secondary hover:bg-neutral-100 transition-all print:hidden"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-neutral-50/50 p-6 space-y-6 print:bg-white print:p-0 print:overflow-visible">
              {/* Header de Status */}
              <div className="flex gap-4">
                <div className="flex-1 bg-white border border-neutral-100 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden print:border-neutral-200 print:shadow-none">
                  <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 ${lancamento.tipo === 'entrada' ? 'bg-bank-truth-green' : 'bg-alert-red'}`} />
                  
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
                    lancamento.tipo === 'entrada' ? 'bg-bank-truth-green/10 text-bank-truth-green' : 'bg-alert-red/10 text-alert-red'
                  } print:border print:border-neutral-100`}>
                    <Wallet className="w-7 h-7" />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary">
                      {lancamento.tipo === 'entrada' ? 'Valor Recebido / Previsto' : 'Valor Pago / Previsto'}
                    </span>
                    <h3 className={`text-3xl font-black ${lancamento.tipo === 'entrada' ? 'text-bank-truth-green' : 'text-alert-red'}`}>
                      {formatBRL(lancamento.valor_previsto)}
                    </h3>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      lancamento.status_pagamento === 'pago' ? 'bg-bank-truth-green text-white' : isPartialPayment ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-pending-amber/10 text-pending-amber border border-pending-amber/20'
                    }`}>
                      {lancamento.status_pagamento === 'pago' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {lancamento.status_pagamento === 'pago' ? 'Liquidado, Pago' : isPartialPayment ? 'Pago Parcial' : 'Em Aberto'}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-neutral-900 text-white">
                      {lancamento.status_aprovacao === 'confirmado_master' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {lancamento.status_aprovacao === 'confirmado_master' ? 'Confirmado Master' : 'Pendente'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid de Informações Essenciais */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Entidade
                  </span>
                  <p className="text-xs font-black text-on-surface truncate">{entidade?.nome_razao_social || 'N/A'}</p>
                  <p className="text-[9px] text-neutral-400 font-mono">{entidade?.documento || 'Documento não informado'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Categoria
                  </span>
                  <p className="text-xs font-black text-on-surface truncate">{categoria?.nome || 'N/A'}</p>
                  <p className="text-[9px] text-neutral-400 uppercase tracking-widest">{lancamento.tipo === 'entrada' ? 'Receita' : 'Despesa'}</p>
                </div>
              </div>

              {/* Datas de Auditoria (Crucial para ERP) */}
              <div className="bg-white rounded-3xl border border-neutral-100 overflow-hidden">
                <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-900">Cronograma Fiscal</span>
                </div>
                <div className="p-5 grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-[9px] font-black uppercase text-secondary tracking-widest block mb-1">Emissão</span>
                    <p className="text-xs font-bold text-on-surface">{formatDate(lancamento.data_emissao)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-secondary tracking-widest block mb-1">Vencimento</span>
                    <p className="text-xs font-bold text-on-surface">{formatDate(lancamento.data_vencimento)}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-secondary tracking-widest block mb-1">Competência</span>
                    <p className="text-xs font-bold text-on-surface">{formatDate(lancamento.data_competencia || lancamento.data_emissao)}</p>
                  </div>
                </div>
              </div>

              {/* Detalhes Financeiros e Origem */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <Banknote className="w-3 h-3" /> Conta e Liquidação
                  </span>
                  <p className="text-xs font-black text-on-surface truncate">{conta?.nome_banco || 'N/A'}</p>
                  {lancamento.status_pagamento === 'pago' ? (
                    <p className="text-[9px] text-bank-truth-green font-bold uppercase tracking-tight">Liquidado, Pago em: {formatDate(lancamento.data_pagamento)}</p>
                  ) : isPartialPayment ? (
                    <p className="text-[9px] text-orange-600 font-bold uppercase tracking-tight">Pago Parcial em: {formatDate(lancamento.data_pagamento)}</p>
                  ) : (
                    <p className="text-[9px] text-amber-500 font-bold uppercase tracking-tight">Aguardando Baixa</p>
                  )}
                </div>
                <div className="bg-white p-4 rounded-2xl border border-neutral-100 space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Origem e Responsável
                  </span>
                  <p className="text-xs font-black text-on-surface truncate">{autor?.nome || 'Sistema'}</p>
                  <p className="text-[9px] text-neutral-400 uppercase tracking-widest">Via {(lancamento as any).condicao?.replace('_', ' ') || 'Lançamento Único'}</p>
                </div>
              </div>

              {/* Observações */}
              {lancamento.observacoes && (
                <div className="bg-white p-5 rounded-3xl border border-neutral-100 space-y-3">
                  <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5">
                    <Hash className="w-3 h-3" /> Observações Contábeis
                  </span>
                  <p className="text-xs font-medium text-on-surface leading-relaxed italic">
                    "{lancamento.observacoes}"
                  </p>
                </div>
              )}

              {/* Anexos */}
              <div className="space-y-3 print:hidden">
                <span className="text-[9px] font-black uppercase text-secondary tracking-widest flex items-center gap-1.5 ml-2">

                  <ExternalLink className="w-3 h-3" /> Documentos e Anexos Digitais ({anexos.length})
                </span>
                {anexos.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {anexos.map((anexo: any, index: number) => (
                      <a
                        key={`comprovante-${index}`}
                        href={anexo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white p-4 rounded-2xl border border-neutral-100 hover:border-primary transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-on-surface truncate max-w-[200px]">{anexo.nome}</p>
                            <p className="text-[9px] font-bold text-secondary uppercase tracking-widest">{(anexo.tamanho / 1024 / 1024).toFixed(2)} MB • Armazenado em Nuvem</p>
                          </div>
                        </div>
                        <Download className="w-4 h-4 text-neutral-300 group-hover:text-primary transition-all" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="bg-neutral-100 border-2 border-dashed border-neutral-200 p-6 rounded-3xl text-center">
                    <FileText className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nenhum documento digital anexado</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer de Auditoria e Botões */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-surface-border text-center">
               <p className="text-[8px] font-bold text-neutral-400 uppercase tracking-[0.3em]">ID de Rastreabilidade: {lancamento.id}</p>
            </div>

            <div className="p-6 bg-white border-t border-surface-border grid grid-cols-2 gap-3 shrink-0 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-12 bg-neutral-900 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-all"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-12 bg-primary text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-md"
              >
                <Download className="w-4 h-4" />
                Gerar PDF
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


