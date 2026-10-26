export type PrintDocumentType = 'recibo' | 'carne' | 'comprovante' | 'provisoria';
export type PrintPaperSize = 'a4' | '58mm' | '80mm';

export interface PrintableParcel {
  number: number;
  dueDate: string;
  amount: number;
  paidAmount?: number;
  status?: string;
}

export interface PrintableAdjustment {
  label: string;
  value: string;
}

export interface PrintableDocumentData {
  id?: string;
  documentNumber?: string;
  recipient: string;
  recipientDocument?: string;
  operation: 'entrada' | 'saida';
  category?: string;
  account?: string;
  issuer?: string;
  description?: string;
  issueDate?: string;
  dueDate?: string;
  paymentDate?: string;
  amount: number;
  receivedAmount?: number;
  adjustedAmount?: number;
  adjustments?: PrintableAdjustment[];
  parcels: PrintableParcel[];
  status?: string;
  approvalStatus?: string;
  provisional?: boolean;
}
