import { CategoriaFinanceira } from '../types';

export const mockCategorias: CategoriaFinanceira[] = [
  {
    id: 'cat_servicos',
    nome: 'Serviços Prestados',
    tipo: 'entrada',
  },
  {
    id: 'cat_escritorio',
    nome: 'Material de Escritório',
    tipo: 'saida',
  },
  {
    id: 'cat_consultoria',
    nome: 'Consultoria',
    tipo: 'entrada',
  },
  {
    id: 'cat_aluguel',
    nome: 'Aluguel',
    tipo: 'saida',
  },
  {
    id: 'cat_software',
    nome: 'Licença de Software ERP',
    tipo: 'saida',
  },
  {
    id: 'cat_salsa',
    nome: 'Manutenção Servidores AWS',
    tipo: 'saida',
  },
  {
    id: 'cat_venda_prod',
    nome: 'Venda de Produtos',
    tipo: 'entrada',
  },
  {
    id: 'cat_impostos',
    nome: 'Impostos e Contribuições',
    tipo: 'saida',
  }
];
