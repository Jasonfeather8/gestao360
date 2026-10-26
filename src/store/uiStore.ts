import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LancamentoFinanceiro } from '../types';

export type TabType =
  | 'dashboard'
  | 'lancamentos'
  | 'pagar'
  | 'receber'
  | 'conciliacao'
  | 'cofre-local'
  | 'recorrencias'
  | 'crm'
  | 'cadastros'
  | 'configuracoes'
  | 'notificacoes';

interface UIState {
  // Theme and routing
  theme: 'light' | 'dark';
  activeTab: TabType;
  activeConfigSubTab: 'equipe' | 'auditoria' | 'legacy';
  currentUserId: string; // Enables easy testing of RLS (Master vs Gerente vs Colaborador)
  
  // Modals / Panels toggles
  isNovoLancamentoOpen: boolean;
  isCadastroRapidoOpen: boolean;
  isNovaCategoriaOpen: boolean;
  isNovoCentroCustoOpen: boolean;
  isNovaContaOpen: boolean;
  isComprovanteOpen: boolean;
  isInterceptorRecorrenciaOpen: boolean;
  isTransferenciaBancariaOpen: boolean;
  isNovoUsuarioOpen: boolean;
  isLegacyImportOpen: boolean;
  isBaixaLancamentoOpen: boolean;
  isAprovacaoModalOpen: boolean;
  isSidebarCollapsed: boolean;
  lancamentoPreset: { dataExtrato: string; transacaoBancoId?: string } | null;
  conciliacaoPosLancamento: { lancamentoId: string; dataExtrato: string } | null;
  baixaPreset: { lancamentoId: string; dataPagamento: string; aprovarDepois: boolean } | null;
  avrPreset: { lancamentoId: string; valor: string } | null;

  // Selected item contexts for modals

  selectedLancamentoIdForModal: string | null;
  selectedLancamentoIdsForBatch: string[];
  selectedRecorrenciaAction: 'single' | 'all' | null;

  // Temp Draft states so users don't lose typed progress
  lancamentoFormDraft: {
    tipo: 'entrada' | 'saida';
    valor_previsto: string;
    data_emissao: string;
    data_vencimento: string;
    data_competencia: string;
    data_pagamento: string;
    entidade_id: string;
    centro_custo_id: string;
    categoria_id: string;
    conta_bancaria_id: string;
    recorrencia: boolean;
    recorrencia_com_entrada: boolean;
    recorrencia_repeat: boolean;
    periodicidade: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'personalizado';
    periodicidade_customizada_dias: string;
    quantidade_total_parcelas: string;
    observacoes: string;
    condicao: 'a_vista' | 'a_prazo';
    ja_recebido: boolean;
    desconto_valor: string;
    desconto_tipo: 'valor' | 'porcentagem';
    motivo_desconto_id: string;
    acrescimo_valor: string;
    acrescimo_tipo: 'valor' | 'porcentagem';
    motivo_acrescimo_id: string;
    valor_recebido: string;
  };
  
  entidadeFormDraft: {
    tipo: 'cliente' | 'fornecedor' | 'ambos' | '';
    tipo_pessoa: 'PF' | 'PJ';
    nome_razao_social: string;
    documento: string;
    email: string;
    telefone: string;
    cep: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  };

  // Scroll locations to preserve context
  scrollPositions: Record<string, number>;

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveTab: (tab: TabType) => void;
  setActiveConfigSubTab: (sub: 'equipe' | 'auditoria' | 'legacy') => void;
  setCurrentUserId: (id: string) => void;
  
  setModalOpen: (modal: keyof Omit<UIState, 'theme' | 'activeTab' | 'activeConfigSubTab' | 'currentUserId' | 'scrollPositions' | 'selectedLancamentoIdForModal' | 'selectedLancamentoIdsForBatch' | 'selectedRecorrenciaAction' | 'lancamentoFormDraft' | 'lancamentoPreset' | 'conciliacaoPosLancamento' | 'baixaPreset' | 'avrPreset' | 'entidadeFormDraft' | 'setTheme' | 'setActiveTab' | 'setActiveConfigSubTab' | 'setCurrentUserId' | 'setModalOpen' | 'setSelectedLancamentoIdForModal' | 'setSelectedLancamentoIdsForBatch' | 'setSelectedRecorrenciaAction' | 'setLancamentoFormDraft' | 'setLancamentoPreset' | 'setConciliacaoPosLancamento' | 'setBaixaPreset' | 'setAvrPreset' | 'setEntidadeFormDraft' | 'setScrollPosition'>, value: boolean) => void;
  
  setSelectedLancamentoIdForModal: (id: string | null) => void;
  setSelectedLancamentoIdsForBatch: (ids: string[]) => void;
  setSelectedRecorrenciaAction: (action: 'single' | 'all' | null) => void;

  setLancamentoFormDraft: (draft: Partial<UIState['lancamentoFormDraft']>) => void;
  setLancamentoPreset: (preset: { dataExtrato: string; transacaoBancoId?: string } | null) => void;
  setConciliacaoPosLancamento: (pos: { lancamentoId: string; dataExtrato: string } | null) => void;
  setBaixaPreset: (preset: { lancamentoId: string; dataPagamento: string; aprovarDepois: boolean } | null) => void;
  setAvrPreset: (preset: { lancamentoId: string; valor: string } | null) => void;
  setEntidadeFormDraft: (draft: Partial<UIState['entidadeFormDraft']>) => void;
  setScrollPosition: (key: string, position: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  resetLancamentoFormDraft: () => void;
  resetEntidadeFormDraft: () => void;
  resetAllDrafts: () => void;
}

const initialDrafts = {
  lancamentoFormDraft: {
    tipo: 'entrada' as const,
    valor_previsto: '',
    data_emissao: new Date().toISOString().split('T')[0],
    data_vencimento: new Date().toISOString().split('T')[0],
    data_competencia: new Date().toISOString().split('T')[0],
    data_pagamento: new Date().toISOString().split('T')[0],
    entidade_id: '',
    centro_custo_id: '',
    categoria_id: '',
    conta_bancaria_id: '',
    recorrencia: false,
    recorrencia_com_entrada: false,
    recorrencia_repeat: false,
    periodicidade: 'mensal' as const,
    periodicidade_customizada_dias: '30',
    quantidade_total_parcelas: '1',
    observacoes: '',
    condicao: 'a_vista' as const,
    ja_recebido: false,
    desconto_valor: '0,00',
    desconto_tipo: 'valor' as const,
    motivo_desconto_id: '',
    acrescimo_valor: '0,00',
    acrescimo_tipo: 'valor' as const,
    motivo_acrescimo_id: '',
    valor_recebido: '0,00',
  },
  entidadeFormDraft: {
    tipo: '' as const,
    tipo_pessoa: 'PF' as const,
    nome_razao_social: '',
    documento: '',
    email: '',
    telefone: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  }
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      activeTab: 'dashboard',
      activeConfigSubTab: 'equipe',
      currentUserId: 'user_master_1', // Lucas da Vitória (Default)

      isNovoLancamentoOpen: false,
      isCadastroRapidoOpen: false,
      isNovaCategoriaOpen: false,
      isNovoCentroCustoOpen: false,
      isNovaContaOpen: false,
      isComprovanteOpen: false,
      isInterceptorRecorrenciaOpen: false,
      isTransferenciaBancariaOpen: false,
      isNovoUsuarioOpen: false,
      isLegacyImportOpen: false,
      isBaixaLancamentoOpen: false,
      isAprovacaoModalOpen: false,
      isSidebarCollapsed: false,
      lancamentoPreset: null,
      conciliacaoPosLancamento: null,
      baixaPreset: null,
      avrPreset: null,

      selectedLancamentoIdForModal: null,
      selectedLancamentoIdsForBatch: [],

      selectedRecorrenciaAction: null,

      lancamentoFormDraft: initialDrafts.lancamentoFormDraft,
      entidadeFormDraft: initialDrafts.entidadeFormDraft,
      scrollPositions: {},

      setTheme: (theme) => set({ theme }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setActiveConfigSubTab: (activeConfigSubTab) => set({ activeConfigSubTab }),
      setCurrentUserId: (currentUserId) => set({ currentUserId }),

      setModalOpen: (modal, value) => set({ [modal]: value }),
      
      setSelectedLancamentoIdForModal: (id) => set({ selectedLancamentoIdForModal: id }),
      setSelectedLancamentoIdsForBatch: (ids) => set({ selectedLancamentoIdsForBatch: ids }),
      setSelectedRecorrenciaAction: (action) => set({ selectedRecorrenciaAction: action }),

      setLancamentoFormDraft: (draft) => set((state) => ({
        lancamentoFormDraft: { ...state.lancamentoFormDraft, ...draft }
      })),
      setLancamentoPreset: (lancamentoPreset) => set({ lancamentoPreset }),
      setConciliacaoPosLancamento: (conciliacaoPosLancamento) => set({ conciliacaoPosLancamento }),
      setBaixaPreset: (baixaPreset) => set({ baixaPreset }),
      setAvrPreset: (avrPreset) => set({ avrPreset }),
      
      setEntidadeFormDraft: (draft) => set((state) => ({
        entidadeFormDraft: { ...state.entidadeFormDraft, ...draft }
      })),
      
      setScrollPosition: (key, position) => set((state) => ({
        scrollPositions: { ...state.scrollPositions, [key]: position }
      })),

      setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),

      resetLancamentoFormDraft: () => set({
        lancamentoFormDraft: { ...initialDrafts.lancamentoFormDraft }
      }),

      resetEntidadeFormDraft: () => set({
        entidadeFormDraft: { ...initialDrafts.entidadeFormDraft }
      }),

      resetAllDrafts: () => set({
        lancamentoFormDraft: { ...initialDrafts.lancamentoFormDraft },
        entidadeFormDraft: { ...initialDrafts.entidadeFormDraft }
      })
    }),
    {
      name: 'gestao360_ui_state',
    }
  )
);
export { initialDrafts };
