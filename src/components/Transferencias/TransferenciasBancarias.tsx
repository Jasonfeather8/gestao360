import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, CheckCircle2, Info, Landmark, LoaderCircle } from 'lucide-react';
import MoneyInput from '../MoneyInput';
import AccountFilterCards from '../Lancamentos/AccountFilterCards';
import DecisaoTransferenciaModal from './DecisaoTransferenciaModal';
import { useCategorias, useCentrosCusto, useContas, useContasSaldos, useCriarTransferencia, useDecidirTransferencia, useEstornarTransferencia, useTransferencias } from '../../hooks/useData';
import { useDragScroll } from '../../hooks/useDragScroll';
import { useAuth } from '../../hooks/useAuth';
import type { TransferenciaBancaria, TransferenciaStatus } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dataHoraFormatada = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const classeCampo = 'w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm text-on-surface outline-none transition focus-visible:ring-2 focus-visible:ring-primary dark:bg-surface disabled:cursor-not-allowed disabled:opacity-60';
const classeRotulo = 'mb-1.5 block text-xs font-black uppercase tracking-widest text-secondary';

function hojeLocal(): string {
  const hoje = new Date();
  const offset = hoje.getTimezoneOffset() * 60000;
  return new Date(hoje.getTime() - offset).toISOString().slice(0, 10);
}

function emCentavos(valor: string): number {
  if (!valor.trim()) return 0;
  const convertido = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
  return Number.isFinite(convertido) ? convertido : 0;
}

const statusTransferencia: Record<TransferenciaStatus, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'text-secondary' },
  aguardando_destino: { label: 'Aguardando destino', cor: 'text-pending-amber' },
  conciliada_pendente_master: { label: 'Conciliada — aguardando Master', cor: 'text-primary' },
  conciliada: { label: 'Concluída', cor: 'text-bank-truth-green' },
  estornada: { label: 'Estornada', cor: 'text-alert-red' },
};
const statusPendentesMaster: TransferenciaStatus[] = ['aberta', 'aguardando_destino', 'conciliada_pendente_master'];
const gruposSituacao = [
  { id: 'pendentes', label: 'Pendentes de aprovação', statuses: ['aberta', 'aguardando_destino', 'conciliada_pendente_master'] },
  { id: 'concluidas', label: 'Concluídas', statuses: ['conciliada'] },
  { id: 'estornadas', label: 'Estornadas', statuses: ['estornada'] },
] as const;
type GrupoSituacaoId = typeof gruposSituacao[number]['id'];

function formatarData(data: string): string {
  return dataFormatada.format(new Date(`${data}T00:00:00Z`));
}

function linhaTransferencia(
  transferencia: TransferenciaBancaria,
  role: string,
  abrirDecisao: (transferencia: TransferenciaBancaria, modo: 'aprovar' | 'reprovar' | 'estornar') => void,
) {
  const status = statusTransferencia[transferencia.status];
  return (
    <article key={transferencia.id} className="border-b border-surface-border/70 py-4 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface-variant">{formatarData(transferencia.data_transferencia)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-on-surface">
            <span>{transferencia.conta_origem?.nome || 'Conta de origem'}</span>
            <ArrowLeftRight aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary" />
            <span>{transferencia.conta_destino?.nome || 'Conta de destino'}</span>
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Conciliação: origem {transferencia.transacao_origem_id ? 'conciliada' : 'pendente'} · destino {transferencia.transacao_destino_id ? 'conciliada' : 'pendente'}
          </p>
          {(transferencia.status === 'aberta' || transferencia.status === 'aguardando_destino') && <p className="mt-1 text-xs text-primary">Aprovação pendente do Master · a conciliação do extrato é opcional e pode ser feita depois · os saldos das contas são ajustados na aprovação.</p>}
          {transferencia.status === 'conciliada_pendente_master' && <p className="mt-1 text-xs text-primary">Os dois lados estão conciliados e aguardam aprovação do Master.</p>}
          {transferencia.tarifa && <p className="mt-1 text-xs text-on-surface-variant">Tarifa: {moeda.format(Number(transferencia.tarifa.valor_previsto))}</p>}
          {transferencia.status === 'conciliada' && transferencia.aprovado_em && <p className="mt-1 text-xs text-bank-truth-green">Aprovada em {dataHoraFormatada.format(new Date(transferencia.aprovado_em))}</p>}
          {transferencia.status === 'conciliada' && <p className="mt-1 text-xs text-bank-truth-green">Saldos ajustados: {moeda.format(-Number(transferencia.valor))} em {transferencia.conta_origem?.nome || 'conta de origem'} · {moeda.format(Number(transferencia.valor))} em {transferencia.conta_destino?.nome || 'conta de destino'}{transferencia.tarifa ? ` · tarifa de ${moeda.format(Number(transferencia.tarifa.valor_previsto))} em ${transferencia.conta_origem?.nome || 'conta de origem'}` : ''}</p>}
          {transferencia.reprovado_em && <p className="mt-1 text-xs text-alert-red">Reprovada em {dataHoraFormatada.format(new Date(transferencia.reprovado_em))}{transferencia.motivo_reprovacao ? ` · ${transferencia.motivo_reprovacao}` : ''}</p>}
          {transferencia.estornado_em && <p className="mt-1 text-xs text-alert-red">Estornada em {dataHoraFormatada.format(new Date(transferencia.estornado_em))}{transferencia.motivo_estorno ? ` · ${transferencia.motivo_estorno}` : ''}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
          <span className="text-sm font-black text-on-surface">{moeda.format(Number(transferencia.valor))}</span>
          <span className={`text-xs font-bold ${status.cor}`}>{status.label}</span>
          {role === 'master' && statusPendentesMaster.includes(transferencia.status) && <>
            <button type="button" onClick={() => abrirDecisao(transferencia, 'aprovar')} className="rounded-lg bg-bank-truth-green px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Aprovar</button>
            <button type="button" onClick={() => abrirDecisao(transferencia, 'reprovar')} className="rounded-lg bg-alert-red px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Reprovar</button>
          </>}
          {role === 'master' && transferencia.status !== 'estornada' && <button type="button" onClick={() => abrirDecisao(transferencia, 'estornar')} className="rounded-lg border border-alert-red/40 px-3 py-2 text-xs font-bold text-alert-red transition hover:bg-alert-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Estornar</button>}
        </div>
      </div>
    </article>
  );
}

export default function TransferenciasBancarias() {
  const { role } = useAuth();
  const { data: contasData = [] } = useContas();
  const { data: contasSaldos = [] } = useContasSaldos();
  const { data: categoriasData = [] } = useCategorias();
  const { data: centrosData = [] } = useCentrosCusto();
  const { data: transferencias = [], isLoading, isError } = useTransferencias();
  const dragScrollContas = useDragScroll();
  const transferenciasPendentesMaster = transferencias.filter((transferencia) => statusPendentesMaster.includes(transferencia.status)).length;
  const { criarTransferencia, isCreating } = useCriarTransferencia();
  const { decidirTransferencia, isDecidindo } = useDecidirTransferencia();
  const { estornarTransferencia, isEstornando } = useEstornarTransferencia();
  const contas = useMemo(() => contasData.filter((conta) => !('status' in conta) || conta.status !== 'excluido'), [contasData]);
  const categorias = useMemo(() => categoriasData.filter((categoria) => !('status' in categoria) || categoria.status !== 'excluido'), [categoriasData]);
  const centros = useMemo(() => centrosData.filter((centro) => !('status' in centro) || centro.status !== 'excluido'), [centrosData]);
  const accountCardsData = useMemo(() => contas.map((conta) => {
    const saldo = contasSaldos.find((item) => item.conta_id === conta.id);
    return {
      ...conta,
      auditadoBalance: saldo ? Number(saldo.saldo_confirmado) : (conta.saldo_inicial || 0),
      operacionalBalance: saldo ? Number(saldo.saldo_operacional) : (conta.saldo_inicial || 0),
    };
  }), [contas, contasSaldos]);

  const [contasSelecionadas, setContasSelecionadas] = useState<string[]>([]);
  const [gruposAtivos, setGruposAtivos] = useState<GrupoSituacaoId[]>(() => gruposSituacao.map((grupo) => grupo.id));
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valor, setValor] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState(hojeLocal);
  const [observacao, setObservacao] = useState('');
  const [tarifa, setTarifa] = useState('');
  const [tarifaCategoriaId, setTarifaCategoriaId] = useState('');
  const [tarifaCentroCustoId, setTarifaCentroCustoId] = useState('');
  const [erro, setErro] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [transferenciaDecisao, setTransferenciaDecisao] = useState<TransferenciaBancaria | null>(null);
  const [modoDecisao, setModoDecisao] = useState<'aprovar' | 'reprovar' | 'estornar' | null>(null);
  const [erroDecisao, setErroDecisao] = useState('');
  const tarifaCentavos = emCentavos(tarifa);
  const statusesAtivos = useMemo(() => gruposSituacao
    .filter((grupo) => gruposAtivos.includes(grupo.id))
    .flatMap((grupo) => grupo.statuses), [gruposAtivos]);
  const transferenciasFiltradas = useMemo(() => transferencias.filter((transferencia) => {
    const correspondeConta = contasSelecionadas.length === 0
      || contasSelecionadas.includes(transferencia.conta_origem_id)
      || contasSelecionadas.includes(transferencia.conta_destino_id);
    return correspondeConta && statusesAtivos.includes(transferencia.status);
  }), [transferencias, contasSelecionadas, statusesAtivos]);
  const filtroAtivo = contasSelecionadas.length > 0 || gruposAtivos.length !== gruposSituacao.length;

  const abrirDecisao = (transferencia: TransferenciaBancaria, modo: 'aprovar' | 'reprovar' | 'estornar') => {
    setTransferenciaDecisao(transferencia);
    setModoDecisao(modo);
    setErroDecisao('');
    setConfirmacao('');
  };

  const cancelarDecisao = () => {
    setModoDecisao(null);
    setTransferenciaDecisao(null);
    setErroDecisao('');
  };

  const confirmarDecisao = async (justificativa: string) => {
    if (!transferenciaDecisao || !modoDecisao) return;
    setErroDecisao('');
    try {
      if (modoDecisao === 'estornar') {
        await estornarTransferencia({ transferenciaId: transferenciaDecisao.id, motivo: justificativa });
      } else {
        await decidirTransferencia({ transferenciaId: transferenciaDecisao.id, aprovado: modoDecisao === 'aprovar', justificativa });
      }
      setErro('');
      setConfirmacao(modoDecisao === 'aprovar' ? 'Transferência aprovada.' : modoDecisao === 'reprovar' ? 'Transferência reprovada.' : 'Transferência estornada.');
      cancelarDecisao();
    } catch (error) {
      setErroDecisao(error instanceof Error ? error.message : 'Não foi possível concluir a ação na transferência.');
    }
  };

  const limparFormulario = () => {
    setContaOrigemId('');
    setContaDestinoId('');
    setValor('');
    setDataTransferencia(hojeLocal());
    setObservacao('');
    setTarifa('');
    setTarifaCategoriaId('');
    setTarifaCentroCustoId('');
  };

  const enviar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');
    setConfirmacao('');
    const valorCentavos = emCentavos(valor);

    if (!contaOrigemId || !contaDestinoId) {
      setErro('Selecione as contas de origem e destino.');
      return;
    }
    if (contaOrigemId === contaDestinoId) {
      setErro('As contas de origem e destino devem ser diferentes.');
      return;
    }
    if (valorCentavos <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    if (!dataTransferencia) {
      setErro('Informe a data da transferência.');
      return;
    }

    const origemNome = contas.find((conta) => conta.id === contaOrigemId)?.nome || 'Conta de origem';
    const destinoNome = contas.find((conta) => conta.id === contaDestinoId)?.nome || 'Conta de destino';
    try {
      await criarTransferencia({
        contaOrigemId,
        contaDestinoId,
        valorCentavos,
        dataTransferencia,
        tarifaCentavos,
        tarifaCategoriaId: tarifaCategoriaId || undefined,
        tarifaCentroCustoId: tarifaCentroCustoId || undefined,
        observacao,
      });
      setConfirmacao(`Transferência registrada: ${origemNome} → ${destinoNome} · ${moeda.format(valorCentavos / 100)} · ${formatarData(dataTransferencia)}.`);
      limparFormulario();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível registrar a transferência.');
    }
  };

  return (
    <div className="space-y-5">
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-surface-border bg-white p-5 dark:bg-surface">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Landmark aria-hidden="true" className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-black text-on-surface">Nova transferência</h1>
            <p className="text-sm text-on-surface-variant">Registre uma movimentação entre contas bancárias.</p>
          </div>
        </header>

        <p className="mb-5 flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm text-on-surface-variant"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />A transferência é uma movimentação entre contas e não entra no resultado (DRE).</p>

        <form onSubmit={enviar} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="transferencia-origem" className={classeRotulo}>Conta de origem</label>
              <select id="transferencia-origem" aria-label="Conta de origem" value={contaOrigemId} onChange={(event) => setContaOrigemId(event.target.value)} className={classeCampo}>
                <option value="">Selecione a conta de origem</option>
                {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="transferencia-destino" className={classeRotulo}>Conta de destino</label>
              <select id="transferencia-destino" aria-label="Conta de destino" value={contaDestinoId} onChange={(event) => setContaDestinoId(event.target.value)} className={classeCampo}>
                <option value="">Selecione a conta de destino</option>
                {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="transferencia-valor" className={classeRotulo}>Valor</label>
              <MoneyInput id="transferencia-valor" aria-label="Valor da transferência" value={valor} onChange={setValor} placeholder="0,00" className={`${classeCampo} text-right font-bold`} />
            </div>
            <div>
              <label htmlFor="transferencia-data" className={classeRotulo}>Data da transferência</label>
              <input id="transferencia-data" aria-label="Data da transferência" type="date" value={dataTransferencia} onChange={(event) => setDataTransferencia(event.target.value)} className={classeCampo} />
            </div>
          </div>

          <div>
            <label htmlFor="transferencia-observacao" className={classeRotulo}>Observação (opcional)</label>
            <input id="transferencia-observacao" aria-label="Observação da transferência" value={observacao} onChange={(event) => setObservacao(event.target.value)} className={classeCampo} placeholder="Observação" />
          </div>

          <fieldset className="rounded-lg border border-surface-border p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-widest text-secondary">Tarifa bancária (opcional)</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="transferencia-tarifa" className={classeRotulo}>Valor da tarifa</label>
                <MoneyInput id="transferencia-tarifa" aria-label="Valor da tarifa bancária" value={tarifa} onChange={setTarifa} placeholder="0,00" className={`${classeCampo} text-right font-bold`} />
              </div>
              <div>
                <label htmlFor="transferencia-tarifa-categoria" className={classeRotulo}>Categoria</label>
                <select id="transferencia-tarifa-categoria" aria-label="Categoria da tarifa" value={tarifaCategoriaId} onChange={(event) => setTarifaCategoriaId(event.target.value)} disabled={tarifaCentavos <= 0} className={classeCampo}>
                  <option value="">Selecione a categoria</option>
                  {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="transferencia-tarifa-centro" className={classeRotulo}>Centro de custo</label>
                <select id="transferencia-tarifa-centro" aria-label="Centro de custo da tarifa" value={tarifaCentroCustoId} onChange={(event) => setTarifaCentroCustoId(event.target.value)} disabled={tarifaCentavos <= 0} className={classeCampo}>
                  <option value="">Selecione o centro de custo</option>
                  {centros.map((centro) => <option key={centro.id} value={centro.id}>{centro.nome}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {erro && <p role="alert" className="rounded-lg bg-alert-red/10 p-3 text-sm font-semibold text-alert-red">{erro}</p>}
          {confirmacao && <p role="status" className="flex items-start gap-2 rounded-lg bg-bank-truth-green/10 p-3 text-sm font-semibold text-bank-truth-green"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{confirmacao}</p>}
          <button type="submit" disabled={isCreating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {isCreating ? <><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Registrando…</> : <><ArrowLeftRight aria-hidden="true" className="h-4 w-4" />Registrar transferência</>}
          </button>
        </form>
      </motion.section>

      <div className="space-y-4">
        <AccountFilterCards
          accounts={accountCardsData}
          selectedIds={contasSelecionadas}
          onSelect={setContasSelecionadas}
          dragScrollProps={dragScrollContas.props}
          dragScrollRef={dragScrollContas.ref}
          valueFormatter={(val: number) => moeda.format(val)}
        />
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por situação da transferência">
          <span className="mr-1 text-xs font-bold text-on-surface-variant">Situação:</span>
          {gruposSituacao.map((grupo) => {
            const selecionado = gruposAtivos.includes(grupo.id);
            return <button
              key={grupo.id}
              type="button"
              aria-pressed={selecionado}
              onClick={() => setGruposAtivos((ativos) => selecionado
                ? ativos.filter((id) => id !== grupo.id)
                : [...ativos, grupo.id])}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selecionado ? 'border-primary bg-primary/5 text-primary' : 'border-surface-border text-on-surface-variant'}`}
            >
              {grupo.label}
            </button>;
          })}
        </div>
      </div>

      <section className="rounded-xl border border-surface-border bg-white p-5 dark:bg-surface">
        <header className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-secondary">Transferências registradas</h2>
          <div className="flex items-center gap-2">
            {role === 'master' && transferenciasPendentesMaster > 0 && <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">{transferenciasPendentesMaster} aguardando decisão do Master</span>}
            <span className="text-xs text-on-surface-variant">{filtroAtivo ? `${transferenciasFiltradas.length} de ${transferencias.length}` : transferencias.length}</span>
          </div>
        </header>
        {isLoading ? <p role="status" className="py-5 text-sm text-on-surface-variant">Carregando transferências…</p>
          : isError ? <p role="alert" className="py-5 text-sm text-alert-red">Não foi possível carregar o histórico de transferências.</p>
            : transferencias.length === 0 ? <p className="py-5 text-sm text-on-surface-variant">Nenhuma transferência registrada</p>
              : transferenciasFiltradas.length === 0 ? <p className="py-5 text-sm text-on-surface-variant">Nenhuma transferência corresponde aos filtros selecionados.</p>
                : <div>{transferenciasFiltradas.map((transferencia) => linhaTransferencia(
                  transferencia,
                  role,
                  abrirDecisao,
                ))}</div>}
      </section>
      <DecisaoTransferenciaModal
        modo={modoDecisao}
        transferencia={transferenciaDecisao}
        processando={isDecidindo || isEstornando}
        erro={erroDecisao}
        onCancelar={cancelarDecisao}
        onConfirmar={(justificativa) => void confirmarDecisao(justificativa)}
      />
    </div>
  );
}
