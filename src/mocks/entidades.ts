import { EntidadeNegocio } from '../types';

export const mockEntidades: EntidadeNegocio[] = [
  {
    id: 'entidade_1',
    tipo: 'fornecedor',
    nome_razao_social: 'TechCorp Soluções Digitais S.A.',
    documento: '12.345.678/0001-90',
    status_sincronizacao: true,
    created_at: '2026-01-05T08:00:00Z',
    email: 'financeiro@techcorp.com.br',
    telefone: '(11) 98222-1100',
    data_nascimento: '1990-07-15',
    status_base: 'ativo'
  },
  {
    id: 'entidade_2',
    tipo: 'cliente',
    nome_razao_social: 'Ana Silva Consultoria',
    documento: '987.654.321-00',
    status_sincronizacao: true,
    created_at: '2026-01-12T14:30:00Z',
    email: 'ana.silva@exemplo.com.br',
    telefone: '(11) 98765-4321',
    data_nascimento: '1985-04-15',
    status_base: 'ativo'
  },
  {
    id: 'entidade_3',
    tipo: 'fornecedor',
    nome_razao_social: 'Global Logistics Ltda',
    documento: '45.678.901/0002-33',
    status_sincronizacao: true,
    created_at: '2026-01-20T11:15:00Z',
    email: 'contato@globallogistics.com',
    telefone: '(21) 99888-7766',
    data_nascimento: '1982-11-20',
    status_base: 'inativo'
  },
  {
    id: 'entidade_4',
    tipo: 'cliente',
    nome_razao_social: 'João Silva',
    documento: '123.456.789-00',
    status_sincronizacao: true,
    created_at: '2026-02-02T16:00:00Z',
    email: 'joao.silva@exemplo.com.br',
    telefone: '(11) 98765-4321',
    data_nascimento: '1985-04-15',
    status_base: 'ativo'
  },
  {
    id: 'entidade_5',
    tipo: 'cliente',
    nome_razao_social: 'Hedgehog Tech Solutions',
    documento: '07.345.123/0001-55',
    status_sincronizacao: true,
    created_at: '2026-03-10T10:00:00Z',
    email: 'contacto@hedgehog.tech',
    telefone: '(11) 97777-6666',
    data_nascimento: '1995-09-30',
    status_base: 'ativo'
  },
];
