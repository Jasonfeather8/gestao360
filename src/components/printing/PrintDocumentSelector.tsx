import React, { useEffect, useState } from 'react';
import { FileText, Printer, X } from 'lucide-react';
import type { PrintDocumentType, PrintPaperSize, PrintableDocumentData, PrintableParcel } from './types';

export interface PrintDocumentSelectorProps {
  data: PrintableDocumentData;
  open: boolean;
  onClose: () => void;
}

const documentLabels: Record<PrintDocumentType, string> = {
  recibo: 'Recibo',
  carne: 'Carnê',
  comprovante: 'Comprovante',
  provisoria: 'Provisória'
};

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const date = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
};
const typeLabel = (type: PrintDocumentType) => documentLabels[type];
const statusLabel = (status?: string) => status?.replaceAll('_', ' ') || 'Em aberto';

function Header({ type }: { type: PrintDocumentType }) {
  return (
    <header className="new-print-header">
      <div>
        <strong>Gestão 360</strong>
        <span>ERP Financeiro</span>
      </div>
      <div className="new-print-title">
        <strong>{typeLabel(type)}</strong>
        {type === 'provisoria' && <span>PROVISÓRIA · SEM VALOR FISCAL</span>}
      </div>
    </header>
  );
}

function Recipient({ data }: { data: PrintableDocumentData }) {
  return (
    <section className="new-print-recipient">
      <div><small>Destinatário</small><strong>{data.recipient || 'Não informado'}</strong></div>
      <div><small>Documento</small><strong>{data.documentNumber || data.id?.slice(0, 8) || 'Rascunho'}</strong></div>
    </section>
  );
}

function ParcelTable({ parcels }: { parcels: PrintableParcel[] }) {
  return (
    <section className="new-print-parcels">
      <div className="new-print-section-label">Parcelas ({parcels.length})</div>
      {parcels.map((parcel) => (
        <div className="new-print-parcel" key={`${parcel.number}-${parcel.dueDate}`}>
          <span>{parcel.number}ª parcela</span>
          <span>{date(parcel.dueDate)}</span>
          <strong>{money(parcel.amount)}</strong>
          <span>{statusLabel(parcel.status)}</span>
        </div>
      ))}
    </section>
  );
}

function PrintDocument({ data, type, paper, preview = false }: { data: PrintableDocumentData; type: PrintDocumentType; paper: PrintPaperSize; preview?: boolean }) {
  const parcels = data.parcels.length > 0 ? data.parcels : [{ number: 1, dueDate: data.dueDate || '', amount: data.amount, paidAmount: data.receivedAmount, status: data.status }];
  const effectiveAmount = data.adjustedAmount ?? data.amount;
  return (
    <article className={`${preview ? 'new-print-preview' : 'new-print-document'} paper-${paper}`} data-paper-size={paper}>
      <Header type={type} />
      <Recipient data={data} />
      <section className="new-print-main-value">
        <small>{type === 'recibo' ? 'Recebemos o valor de' : 'Valor do lançamento'}</small>
        <strong>{money(type === 'recibo' && data.receivedAmount ? data.receivedAmount : effectiveAmount)}</strong>
        <span>{data.operation === 'entrada' ? 'Entrada / Receita' : 'Saída / Despesa'} · {statusLabel(data.status)}</span>
      </section>
      <section className="new-print-details">
        <div><small>Emissão</small><strong>{date(data.issueDate)}</strong></div>
        <div><small>Vencimento</small><strong>{date(data.dueDate)}</strong></div>
        <div><small>Pagamento</small><strong>{date(data.paymentDate)}</strong></div>
        <div><small>Categoria</small><strong>{data.category || 'Sem categoria'}</strong></div>
        <div><small>Conta</small><strong>{data.account || 'Não informado'}</strong></div>
        <div><small>Nº documento</small><strong>{data.documentNumber || data.id?.slice(0, 8) || 'Rascunho'}</strong></div>
      </section>
      {data.adjustments && data.adjustments.length > 0 && (
        <section className="new-print-adjustments">
          <div className="new-print-section-label">Ajustes</div>
          {data.adjustments.map((adjustment) => <div key={adjustment.label}><span>{adjustment.label}</span><strong>{adjustment.value}</strong></div>)}
        </section>
      )}
      {type === 'carne' ? <ParcelTable parcels={parcels} /> : parcels.length > 1 && <ParcelTable parcels={parcels} />}
      {data.description && <section className="new-print-description"><small>Descrição / observações</small><p>{data.description}</p></section>}
      {type === 'provisoria' && <div className="new-print-warning">PROVISÓRIA · SEM VALOR FISCAL</div>}
      <footer className="new-print-signature">
        <div><span>{data.issuer || 'Sistema / Não informado'}</span><small>Emissor</small></div>
        <div><span>{data.approvalStatus || 'Documento emitido'}</span><small>Status / validação</small></div>
      </footer>
    </article>
  );
}

export function PrintDocumentSelector({ data, open, onClose }: PrintDocumentSelectorProps) {
  const [type, setType] = useState<PrintDocumentType>('recibo');
  const [paper, setPaper] = useState<PrintPaperSize>('a4');

  useEffect(() => {
    if (!open) return;
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-new-document');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-new-document');
    };
  }, [open]);

  if (!open) return null;

  const print = (asPdf: boolean) => {
    if (asPdf) setPaper('a4');
    document.body.classList.add('printing-new-document');
    window.setTimeout(() => window.print(), 0);
  };

  return (
    <>
      <div className="fixed inset-0 z-[800] flex items-center justify-center bg-neutral-900/50 p-4 print:hidden">
        <div className="relative flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <header className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
            <div><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">Impressão e pré-visualização</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-secondary">Escolha o documento e o papel</p></div>
            <button type="button" onClick={onClose} aria-label="Fechar impressão" className="rounded-xl p-2 text-secondary hover:bg-neutral-100 hover:text-neutral-900"><X className="h-5 w-5" /></button>
          </header>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:p-7 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-4">
              <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-secondary">Tipo de documento</span><select value={type} onChange={(event) => setType(event.target.value as PrintDocumentType)} className="h-11 w-full rounded-xl border-2 border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-900 outline-none focus:border-primary"><option value="recibo">Recibo</option><option value="carne">Carnê</option><option value="comprovante">Comprovante</option><option value="provisoria">Provisória</option></select></label>
              <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-secondary">Tamanho do papel</span><select value={paper} onChange={(event) => setPaper(event.target.value as PrintPaperSize)} className="h-11 w-full rounded-xl border-2 border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-900 outline-none focus:border-primary"><option value="a4">A4</option><option value="58mm">58mm térmico</option><option value="80mm">80mm térmico</option></select></label>
              <div className="rounded-2xl bg-neutral-50 p-4 text-[10px] font-bold leading-relaxed text-secondary"><FileText className="mb-2 h-4 w-4 text-primary" />Gerar PDF abre a impressão A4 do navegador. Imprimir local usa o mesmo diálogo e permite selecionar impressoras pareadas pelo sistema.</div>
              <div className="flex flex-col gap-2"><button type="button" onClick={() => print(false)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-neutral-800"><Printer className="h-4 w-4" /> Imprimir local</button><button type="button" onClick={() => print(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary-container px-4 text-[10px] font-black uppercase tracking-widest text-on-primary-container hover:brightness-95"><FileText className="h-4 w-4" /> Gerar PDF</button></div>
            </div>
            <div className="flex min-h-[420px] items-start justify-center overflow-auto rounded-2xl bg-neutral-100 p-4 sm:p-7"><PrintDocument data={data} type={type} paper={paper} preview /></div>
          </div>
        </div>
      </div>
      <PrintDocument data={data} type={type} paper={paper} />
    </>
  );
}

export type { PrintDocumentType, PrintPaperSize, PrintableDocumentData, PrintableParcel } from './types';
