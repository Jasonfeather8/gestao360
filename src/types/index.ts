export type UserPerfil = 'master' | 'gerente' | 'colaborador';

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  perfil: UserPerfil;
  status: boolean;
  created_at: string;
}

export type EntidadeTipo = 'cliente' | 'fornecedor' | 'ambos';

export interface EntidadeNegocio {
  id: string;
  codigo_sequencial?: number;
  tipo: EntidadeTipo;
  nome_razao_social: string;
  documento: string; // CPF or CNPJ
  status_sincronizacao: boolean;
  created_at: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  status_base?: 'ativo' | 'inativo' | 'bpi';
}

export interface CentroCusto {
  id: string;
  nome: string;
  descricao: string;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida';
}

export interface CategoriaAjuste {
  id: string;
  nome: string;
  tipo: 'desconto' | 'acrescimo';
  status: 'ativo' | 'inativo';
}

export interface ContaBancaria {
  id: string;
  nome: string;
  nome_banco: string;
  agencia: string;
  conta: string;
  saldo_inicial: number;
  data_abertura: string;
  logo_url?: string;
  is_cofre_local?: boolean;
  status?: string;
}

export type StatusAprovacao = 'pendente_digital' | 'digital' | 'confirmado_master' | 'reprovado';
export type StatusPagamento = 'aberto' | 'pago' | 'pago_parcial' | 'bpi' | 'quitação_pendente';
export type TipoAjuste = 'valor' | 'porcentagem';

export interface AjusteFinanceiro {
  valor?: number;
  tipo?: TipoAjuste | null;
}

export interface LancamentoFinanceiro {
  id: string;
  codigo_sequencial?: number;
  tipo: 'entrada' | 'saida';
  valor_previsto: number;
  valor_recebido?: number;
  data_vencimento: string;
  data_emissao: string;
  data_competencia?: string;
  data_pagamento?: string;
  hora_pagamento?: string;
  condicao?: 'a_vista' | 'a_prazo';
  entidade_id: string;
  centro_custo_id: string;
  categoria_id: string;
  conta_bancaria_id: string;
  comprovante_url?: string;
  observacoes: string;
  recorrencia_id?: string; // Null if single parcel
  numero_parcela?: number; // parcel number if recurring
  quantidade_total_parcelas?: number;
  status_aprovacao: StatusAprovacao;
  status_pagamento: StatusPagamento;
  usuario_criador_id: string;
  status_sincronizacao?: boolean;
  transferencia_id?: string | null;
  transferencia_lado?: 'origem' | 'destino' | 'tarifa' | null;
  entidades_negocio?: { nome_razao_social: string } | null;
  conciliacoes?: Array<{ id: string; data_conciliacao: string | null }> | null;
 valor_original?: number;
 juros_previstos?: number;
 multa_prevista?: number;
 desconto_previsto?: number;
 documento_numero?: string;
 bpi_em?: string;
 desconto_valor?: AjusteFinanceiro['valor'];
 desconto_tipo?: AjusteFinanceiro['tipo'];
  acrescimo_valor?: AjusteFinanceiro['valor'];
  acrescimo_tipo?: AjusteFinanceiro['tipo'];
  motivo_desconto_id?: string;
  motivo_acrescimo_id?: string;
  motivo_ajuste?: string;
  created_at: string;
  updated_at: string;
}

export interface Recorrencia {
  id: string;
  periodicidade: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'personalizado';
  periodicidade_customizada_dias?: number;
  quantidade_total_parcelas: number;
  data_inicio: string;
}

export interface AuditoriaLog {
  id: string;
  tabela_afetada: string;
  registro_id: string;
  usuario_id: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  dados_anteriores?: Record<string, any>;
  dados_novos?: Record<string, any>;
  data_hora: string;
}

export interface ResumoSaldo {
  conta_bancaria_id: string;
  saldo_consolidado: number;
  saldo_simulado: number;
  ultima_atualizacao: string;
}

// ===========================================================================
// Módulo de Extrato — leitura, comparação em memória e proveniência persistida.
// ===========================================================================

export type DirecaoExtrato = 'entrada' | 'saida';

export type ConfiancaLinha = 'alta' | 'media' | 'baixa';

export interface MetaExtrato {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
}

export type StatusConferencia = 'ok' | 'divergente' | 'nao_verificavel';

export interface ConferenciaExtrato {
  status: StatusConferencia;
  entradas: number;
  saidas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  diferenca: number | null;
}

export type MotivoLinhaIgnorada = 'saldo' | 'totalizador' | 'cabecalho' | 'rodape' | 'outro';

export interface LinhaIgnorada {
  pagina: number | null;
  texto: string;
  motivo: MotivoLinhaIgnorada;
}

export interface ProgressoLeituraExtrato {
  etapa: 'preparando' | 'enviando' | 'lendo' | 'comparando';
  loteAtual: number;
  totalLotes: number;
  paginaInicio: number | null;
  paginaFim: number | null;
  totalPaginas: number | null;
  linhasLidas?: number;
}

export interface LinhaExtrato {
  id: string;
  /** Data da transação no formato ISO (yyyy-mm-dd). */
  data: string;
  descricao: string;
  /** Valor absoluto, em reais. */
  valor: number;
  direcao: DirecaoExtrato;
  pagina: number | null;
  textoOriginal: string;
  confianca?: ConfiancaLinha;
  documento?: string;
  /** Só existe depois que a linha foi persistida no banco. */
  transacaoBancoId?: string;
}

export interface TransacaoBanco {
  id: string;
  conta_bancaria_id: string;
  extrato_lote_id: string;
  data_transacao: string;
  valor: number;
  valor_centavos: number;
  tipo_movimento: 'credito' | 'debito';
  descricao_banco: string;
  status_conciliacao: boolean;
  pagina_origem: number;
  linha_origem: number;
  hash_transacao: string;
  confianca_extracao: number;
  estado_revisao: string;
}

export interface TransacaoBancoCandidata {
  id: string;
  data_transacao: string;
  valor: number;
  valor_centavos: number;
  tipo_movimento: 'credito' | 'debito' | null;
  descricao_banco: string;
  provenienciaCompleta: boolean;
  pendencias: string[];
}

export interface LoteExtrato {
  id: string;
  conta_bancaria_id: string;
  arquivo_nome: string;
  arquivo_tamanho: number;
  arquivo_mime_type: string;
  arquivo_hash: string;
  storage_path: string;
  formato_arquivo: string;
  origem_extracao: string;
  status: string;
  paginas: number | null;
  total_transacoes: number | null;
  data_inicio: string | null;
  data_fim: string | null;
}

export type MotivoNaoInterpretada =
  | 'sem_data'
  | 'direcao_indefinida'
  | 'sem_valor'
  | 'valor_ilegivel'
  | 'data_impossivel';

export interface LinhaNaoInterpretada {
  pagina: number | null;
  texto: string;
  motivo: MotivoNaoInterpretada;
}

export interface ExtratoLido {
  arquivoNome: string;
  paginas: number;
  dataInicio: string | null;
  dataFim: string | null;
  linhas: LinhaExtrato[];
  naoInterpretadas: LinhaNaoInterpretada[];
  meta?: MetaExtrato;
  conferencia?: ConferenciaExtrato;
  linhasIgnoradas?: LinhaIgnorada[];
}

export type StatusItemComparacao =
  | 'conciliado'
  | 'pendente_banco'
  | 'pendente_erp'
  | 'divergente';

export interface ItemComparacao {
  id: string;
  status: StatusItemComparacao;
  data: string;
  direcao: DirecaoExtrato;
  descricao: string;
  valorExtrato: number | null;
  valorErp: number | null;
  linhaExtrato: LinhaExtrato | null;
  lancamento: LancamentoFinanceiro | null;
}

export interface DiaComparacao {
  data: string;
  entradas: ItemComparacao[];
  saidas: ItemComparacao[];
  totalEntradas: number;
  totalSaidas: number;
  conciliados: number;
  pendentes: number;
  divergentes: number;
}

export interface ResumoComparacao {
  totalEntradas: number;
  totalSaidas: number;
  conciliados: number;
  pendentesBanco: number;
  pendentesErp: number;
  divergentes: number;
}

export interface ResultadoComparacao {
  dataInicio: string | null;
  dataFim: string | null;
  dias: DiaComparacao[];
  resumo: ResumoComparacao;
}

export interface DashboardSaldos {
  real: number;
  operacional: number;
  simulado: number;
}

export interface DashboardCoberturaItem {
  id: string;
  descricao: string;
  entidade: string | null;
  vencimento: string | null;
  valor: number;
  acumulado: number;
  coberto: boolean;
}

export interface DashboardPontoEstouro {
  vencimento: string | null;
  descricao: string;
  entidade: string | null;
  valor: number;
  acumulado: number;
  faltando: number;
}

export interface DashboardCobertura {
  total_provisoes: number;
  total_coberto: number;
  total_descoberto: number;
  percentual_coberto: number;
  itens: DashboardCoberturaItem[];
  ponto_estouro: DashboardPontoEstouro | null;
}

export interface DashboardCarteira {
  pago_regular: number;
  atrasado: number;
  baixa_inatividade: number;
  total: number;
}

export interface DashboardKpis {
  realizado_entrada: number;
  realizado_saida: number;
  previsto_entrada: number;
  previsto_saida: number;
  liquidez: number;
  saldo_projetado: number;
  margem: number;
}

export interface DashboardFluxoDia {
  data: string;
  realizado: number;
  previsto: number;
}

export interface DashboardCategoriaValor {
  categoria: string;
  valor: number;
}

export interface DashboardClienteValor {
  cliente: string;
  valor: number;
}

export interface DashboardPeriodo {
  inicio: string | null;
  fim: string | null;
  kpis: DashboardKpis;
  fluxo_diario: DashboardFluxoDia[];
  saidas_por_categoria: DashboardCategoriaValor[];
  receita_por_cliente: DashboardClienteValor[];
}

export interface DashboardCentroCustoResumo {
  id: string;
  nome: string;
  receitas: number;
  despesas: number;
  resultado: number;
}

export interface DashboardCentrosCusto {
  total_receitas: number;
  total_despesas: number;
  resultado: number;
  melhores: DashboardCentroCustoResumo[];
  deficitarios: DashboardCentroCustoResumo[];
}

export interface DashboardIndicadores {
  saldos: DashboardSaldos;
  cobertura: DashboardCobertura;
  carteira: DashboardCarteira;
  periodo: DashboardPeriodo;
  centros_custo: DashboardCentrosCusto | null;
  /** Meses com lançamentos, no formato 'YYYY-MM', para alimentar o seletor de período. */
  meses: string[];
}

export type MigracaoCampo =
  | 'recebido'
  | 'data'
  | 'competencia'
  | 'vencimento'
  | 'descricao'
  | 'cliente'
  | 'conta'
  | 'categoria'
  | 'centro_custo'
  | 'ref'
  | 'anotacoes'
  | 'valor';

export type MigracaoColunas = Partial<Record<MigracaoCampo, number>>;

export type MigracaoStatusPlanilha = 'recebido' | 'em_aberto' | 'atrasado' | 'cancelado' | 'desconhecido';

export type MigracaoSituacao = 'pronta' | 'pendente' | 'duplicada' | 'cancelada' | 'erro';

export interface MigracaoLinha {
  id: string;
  linhaOrigem: number;
  statusPlanilha: MigracaoStatusPlanilha;
  recebidoTexto: string;
  recebido: boolean;
  tipo: 'entrada' | 'saida' | null;
  valor: number | null;
  data: string | null;
  competencia: string | null;
  vencimento: string | null;
  descricao: string;
  anotacoes: string;
  ref: string;
  clienteNome: string;
  contaNome: string;
  categoriaNome: string;
  centroCustoNome: string;
  clienteId: string | null;
  contaId: string | null;
  categoriaId: string | null;
  centroCustoId: string | null;
  pendencias: string[];
  incluir: boolean;
  incluirManual?: boolean;
  situacao: MigracaoSituacao;
  resultadoPrevisto: string;
}

export interface MigracaoCadastros {
  contas: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  centrosCusto: { id: string; nome: string }[];
}

export interface AbaMigracao {
  nome: string;
  linhas: (string | number | Date | null)[][];
}

export interface PlanilhaMigracao {
  nome: string;
  tamanho: number;
  abas: AbaMigracao[];
}

export interface ImportacaoDados {
  id: string;
  user_id: string;
  arquivo_nome: string | null;
  arquivo_hash: string | null;
  total_linhas: number;
  importadas: number;
  erros: number;
  valor_total: number;
  status: string;
  created_at: string;
  desfeita_em: string | null;
  desfeita_por: string | null;
}

export type TransferenciaStatus = 'aberta' | 'aguardando_destino' | 'conciliada_pendente_master' | 'conciliada' | 'estornada';

export interface TransferenciaBancaria {
  id: string;
  conta_origem_id: string;
  conta_destino_id: string;
  valor: number;
  data_transferencia: string;
  status: TransferenciaStatus;
  lancamento_saida_id: string | null;
  lancamento_entrada_id: string | null;
  tarifa_lancamento_id: string | null;
  transacao_origem_id: string | null;
  transacao_destino_id: string | null;
  criado_por: string;
  created_at: string;
  updated_at: string;
  aprovado_em: string | null;
  reprovado_em: string | null;
  motivo_reprovacao: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  conta_origem?: { nome: string } | null;
  conta_destino?: { nome: string } | null;
  transacao_origem?: { data_transacao: string; descricao_banco: string; valor: number } | null;
  transacao_destino?: { data_transacao: string; descricao_banco: string; valor: number } | null;
  tarifa?: { valor_previsto: number; categoria_id: string | null; centro_custo_id: string | null } | null;
}
