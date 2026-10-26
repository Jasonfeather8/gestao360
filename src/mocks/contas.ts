import { ContaBancaria } from '../types';

export const mockContas: ContaBancaria[] = [
  {
    id: 'conta_itau',
    nome: 'Itaú CC',
    nome_banco: 'Banco Itaú S.A.',
    agencia: '0001',
    conta: '12345-6',
    saldo_inicial: 50000.00,
    data_abertura: '2023-01-01T09:00:00Z',
  },
  {
    id: 'conta_bradesco',
    nome: 'Bradesco CC',
    nome_banco: 'Banco Bradesco S.A.',
    agencia: '0002',
    conta: '56789-0',
    saldo_inicial: 25000.00,
    data_abertura: '2023-03-15T10:00:00Z',
  },
  {
    id: 'conta_santander',
    nome: 'Santander CC',
    nome_banco: 'Banco Santander Brasil S.A.',
    agencia: '0003',
    conta: '90123-4',
    saldo_inicial: 10000.00,
    data_abertura: '2023-06-01T14:00:00Z',
  }
];
