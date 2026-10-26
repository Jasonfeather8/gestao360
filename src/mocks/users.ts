import { UserProfile } from '../types';

export const mockUsers: UserProfile[] = [
  {
    id: 'user_master_1',
    nome: 'Carlos Eduardo Silva',
    email: 'carlos.silva@empresa.com.br',
    perfil: 'master',
    status: true,
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'user_gerente_1',
    nome: 'Mariana Ribeiro',
    email: 'mariana.r@empresa.com.br',
    perfil: 'gerente',
    status: true,
    created_at: '2026-01-10T12:00:00Z',
  },
  {
    id: 'user_colab_1',
    nome: 'Fernando Costa',
    email: 'fernando.costa@empresa.com.br',
    perfil: 'colaborador',
    status: true,
    created_at: '2026-02-15T09:00:00Z',
  },
  {
    id: 'user_colab_disabled',
    nome: 'Ana Luiza',
    email: 'ana.luiza@empresa.com.br',
    perfil: 'colaborador',
    status: false,
    created_at: '2026-03-01T14:00:00Z',
  },
  {
    id: 'user_lucas',
    nome: 'Lucas da Vitória',
    email: 'lucasdavitoria8@gmail.com',
    perfil: 'master',
    status: true,
    created_at: '2026-01-01T10:00:00Z',
  },
];
