import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { useLancamentoAnexos } from '../../hooks/useData';
import type { LancamentoFinanceiro } from '../../types';
import { isSafeAttachmentUrl } from '../../utils/anexos';

interface ReciboModalProps {
  lancamento: LancamentoFinanceiro | null;
  onClose: () => void;
}

type TipoDocumento = 'imagem' | 'pdf' | 'outro';

export default function ReciboModal({ lancamento, onClose }: ReciboModalProps) {
  const { anexos = [], isLoading } = useLancamentoAnexos(lancamento?.id ?? null);
  const documentos = useMemo(() => {
    const lista = anexos.map((anexo: any) => ({
      id: anexo.id,
      nome: anexo.nome || anexo.file_name || anexo.name || 'Comprovante',
      url: anexo.url,
      tamanho: anexo.tamanho,
      tipo_arquivo: anexo.tipo_arquivo,
    }));

    if (lancamento?.comprovante_url && !lista.some(documento => documento.url === lancamento.comprovante_url)) {
      lista.push({
        id: `comprovante-${lancamento.id}`,
        nome: 'Comprovante',
        url: lancamento.comprovante_url,
        tamanho: null,
        tipo_arquivo: null,
      });
    }

    return lista;
  }, [anexos, lancamento]);

  const classificarDocumento = (documento: typeof documentos[number]): TipoDocumento => {
    const tipo = typeof documento.tipo_arquivo === 'string' ? documento.tipo_arquivo.toLowerCase() : '';
    if (tipo.startsWith('image/')) return 'imagem';
    if (tipo === 'application/pdf') return 'pdf';

    const caminho = `${documento.nome} ${documento.url || ''}`.split(/[?#]/, 1)[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)(?:\s|$)/.test(caminho)) return 'imagem';
    if (/\.pdf(?:\s|$)/.test(caminho)) return 'pdf';
    return 'outro';
  };

  const formatarTamanho = (tamanho: unknown) => {
    const bytes = Number(tamanho);
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AnimatePresence>
      {lancamento && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recibo-modal-title"
            data-testid="recibo-modal"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={event => event.stopPropagation()}
            className="relative z-10 flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border border-neutral-100 bg-surface shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
              <div>
                <h2 id="recibo-modal-title" className="text-xs font-black uppercase tracking-widest text-primary">Recibo</h2>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-secondary">
                  {documentos.length} documento{documentos.length === 1 ? '' : 's'}
                </p>
              </div>
              <button type="button" aria-label="Fechar recibo" onClick={onClose} className="rounded-xl p-2 hover:bg-neutral-100">
                <X className="h-5 w-5 text-secondary" />
              </button>
            </header>
            <div className="overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs font-bold text-secondary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando comprovantes...
                </div>
              ) : documentos.length === 0 ? (
                <p data-testid="recibo-vazio" className="py-12 text-center text-xs font-bold text-secondary">Nenhum comprovante anexado</p>
              ) : (
                <div className="space-y-4">
                  {documentos.map((documento, index) => {
                    const urlSegura = isSafeAttachmentUrl(documento.url);
                    const tipo = classificarDocumento(documento);
                    const tamanho = formatarTamanho(documento.tamanho);

                    return (
                      <article key={documento.id || `${documento.url}-${index}`} className="rounded-2xl border border-neutral-100 bg-surface p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words text-[10px] font-black text-primary">{documento.nome}</h3>
                            {tamanho && <p className="mt-1 text-[9px] font-bold text-secondary">{tamanho}</p>}
                          </div>
                          {urlSegura ? (
                            <a href={documento.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary">
                              <ExternalLink className="h-3 w-3" /> Abrir
                            </a>
                          ) : (
                            <span className="shrink-0 text-[9px] font-bold text-secondary">Link indisponível</span>
                          )}
                        </div>
                        {urlSegura && tipo === 'imagem' ? (
                          <img src={documento.url} alt={documento.nome} loading="lazy" className="max-h-[360px] w-full rounded-xl bg-neutral-50 object-contain" />
                        ) : urlSegura && tipo === 'pdf' ? (
                          <iframe title={documento.nome} src={documento.url} className="h-[420px] w-full rounded-xl border border-neutral-100" />
                        ) : urlSegura ? (
                          <p className="text-[10px] font-bold text-secondary">A pré-visualização não está disponível para este formato.</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
