import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CheckCircle2, Clock3, FileSpreadsheet, LoaderCircle, RotateCcw, Upload } from 'lucide-react';
import { useCategorias, useCentrosCusto, useContas, useDesfazerImportacao, useEntidades, useImportacoesDados } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { chavesRepetidas, detectarColunas, importarLinhas, lerPlanilha, recalcularLinha, remontarLinhas } from '../../services/migracao';
import type { MigracaoEscolhasManuais } from '../../services/migracao';
import type { MigracaoCadastros, MigracaoCampo, MigracaoColunas, MigracaoLinha, PlanilhaMigracao } from '../../types';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const campos: { campo: MigracaoCampo; rotulo: string }[] = [
  { campo: 'valor', rotulo: 'Valor' }, { campo: 'data', rotulo: 'Data' }, { campo: 'competencia', rotulo: 'Data de Competência' },
  { campo: 'vencimento', rotulo: 'Data de Vencimento' }, { campo: 'descricao', rotulo: 'Descrição' }, { campo: 'cliente', rotulo: 'Cliente' },
  { campo: 'conta', rotulo: 'Conta' }, { campo: 'categoria', rotulo: 'Categoria' }, { campo: 'centro_custo', rotulo: 'Centro de Custo' },
  { campo: 'ref', rotulo: 'Ref.' }, { campo: 'anotacoes', rotulo: 'Anotações' }, { campo: 'recebido', rotulo: 'Recebido' },
];
const classeCampo = 'rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-on-surface outline-none transition focus-visible:ring-2 focus-visible:ring-primary dark:bg-surface';
type CampoManual = keyof MigracaoEscolhasManuais;
type CadastroRapido = { linhaId: string; campo: 'cliente' | 'categoria' | 'centroCusto'; nome: string; tipo: 'entrada' | 'saida' | null; erro: string; carregando: boolean };

export default function MigracaoDados() {
  const inputRef = useRef<HTMLInputElement>(null);
  const nomesOriginais = useRef<Record<string, string>>({});
  const escolhasManuais = useRef(new Map<string, string>());
  const [cadastroRapido, setCadastroRapido] = useState<CadastroRapido | null>(null);
  const [planilha, setPlanilha] = useState<PlanilhaMigracao | null>(null);
  const [aba, setAba] = useState('');
  const [linhaCabecalho, setLinhaCabecalho] = useState(0);
  const [colunas, setColunas] = useState<MigracaoColunas>({});
  const [naoReconhecidas, setNaoReconhecidas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<MigracaoLinha[]>([]);
  const [duplicadosBanco, setDuplicadosBanco] = useState<number[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [somentePendencias, setSomentePendencias] = useState(false);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof importarLinhas>> | null>(null);
  const [remapeando, setRemapeando] = useState(false);
  const { data: contas = [] } = useContas();
  const { data: categorias = [], createCategory } = useCategorias();
  const { data: centrosCusto = [], createCC } = useCentrosCusto();
  const { data: entidades = [], createEntity } = useEntidades();
  const { data: lotes = [], isLoading: carregandoLotes } = useImportacoesDados();
  const desfazer = useDesfazerImportacao();
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const cadastros = useMemo<MigracaoCadastros>(() => ({
    contas: contas.filter((item) => !('status' in item) || item.status !== 'excluido').map((item) => ({ id: item.id, nome: item.nome })),
    clientes: entidades.filter((item) => item.tipo === 'cliente' || item.tipo === 'ambos').map((item) => ({ id: item.id, nome: item.nome_razao_social })),
    categorias: categorias.filter((item) => !('status' in item) || item.status !== 'excluido').map((item) => ({ id: item.id, nome: item.nome })),
    centrosCusto: centrosCusto.filter((item) => !('status' in item) || item.status !== 'excluido').map((item) => ({ id: item.id, nome: item.nome })),
  }), [contas, entidades, categorias, centrosCusto]);
  const cadastrosAnteriores = useRef(cadastros);

  const contadores = useMemo(() => {
    const selecionadas = linhas.filter((linha) => linha.incluir);
    return {
      total: linhas.length,
      prontas: linhas.filter((linha) => linha.situacao === 'pronta').length,
      pendentes: linhas.filter((linha) => linha.situacao === 'pendente').length,
      duplicadas: linhas.filter((linha) => linha.situacao === 'duplicada').length,
      canceladas: linhas.filter((linha) => linha.situacao === 'cancelada').length,
      selecionadas: selecionadas.length,
      valor: selecionadas.reduce((total, linha) => total + (linha.valor ?? 0), 0),
    };
  }, [linhas]);

  const escolhasDaLinha = (linha: MigracaoLinha): MigracaoEscolhasManuais => {
    const escolhas: MigracaoEscolhasManuais = {};
    (['tipo', 'cliente', 'conta', 'categoria', 'centroCusto'] as CampoManual[]).forEach((campo) => {
      const escolha = escolhasManuais.current.get(`${linha.linhaOrigem}:${campo}`);
      if (escolha) escolhas[campo] = escolha;
    });
    return escolhas;
  };

  const montar = async (raw: PlanilhaMigracao, nomeAba: string, header?: number, mapa?: MigracaoColunas) => {
    const selecionada = raw.abas.find((item) => item.nome === nomeAba) ?? raw.abas[0];
    if (!selecionada) return;
    const deteccao = detectarColunas(selecionada.linhas);
    const cabecalho = header ?? deteccao.linhaCabecalho;
    const mapaColunas = mapa ?? deteccao.colunas;
    setLinhaCabecalho(cabecalho);
    setColunas(mapaColunas);
    setNaoReconhecidas(deteccao.naoReconhecidas);
    setRemapeando(true);
    try {
      const reconstruidas = await remontarLinhas({
        linhas: selecionada.linhas, linhaCabecalho: cabecalho, colunas: mapaColunas, cadastros,
        nomesTipo: [selecionada.nome, raw.nome],
      });
      nomesOriginais.current = Object.fromEntries(reconstruidas.linhas.flatMap((linha) => [
        [`${linha.id}:cliente`, linha.clienteNome], [`${linha.id}:conta`, linha.contaNome],
        [`${linha.id}:categoria`, linha.categoriaNome], [`${linha.id}:centroCusto`, linha.centroCustoNome],
      ]));
      const repetidas = chavesRepetidas(reconstruidas.linhas);
      const linhasComEscolhas = reconstruidas.linhas.map((linha) => {
        const escolhas = escolhasDaLinha(linha);
        if (Object.keys(escolhas).length === 0) return linha;
        return recalcularLinha(linha, cadastros, reconstruidas.duplicados, repetidas, escolhas);
      });
      setLinhas(linhasComEscolhas);
      setDuplicadosBanco(reconstruidas.duplicados);
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível montar as linhas da planilha.');
    } finally {
      setRemapeando(false);
    }
  };

  useEffect(() => {
    if (cadastrosAnteriores.current === cadastros) return;
    cadastrosAnteriores.current = cadastros;
    if (planilha && aba) void montar(planilha, aba, linhaCabecalho, colunas);
  }, [cadastros, planilha, aba, linhaCabecalho, colunas]);

  const carregarArquivo = async (file?: File) => {
    if (!file) return;
    if (linhas.some((linha) => linha.situacao === 'pendente') && !window.confirm('Há linhas pendentes nesta grade. Deseja substituir a planilha atual?')) return;
    setLendo(true);
    setProgresso(15);
    setErro('');
    setResultado(null);
    try {
      const lida = await lerPlanilha(file);
      setProgresso(65);
      setPlanilha(lida);
      const primeiraAba = lida.abas[0]?.nome ?? '';
      setAba(primeiraAba);
      await montar(lida, primeiraAba);
      setProgresso(100);
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  const registrarEscolha = (linha: MigracaoLinha, campo: CampoManual, valor: string) => {
    const chave = `${linha.linhaOrigem}:${campo}`;
    if (valor) escolhasManuais.current.set(chave, valor);
    else escolhasManuais.current.delete(chave);
  };

  const atualizarLinha = (id: string, alteracoes: Partial<MigracaoLinha>) => {
    setLinhas((atuais) => {
      const repetidas = chavesRepetidas(atuais);
      const original = atuais.find((linha) => linha.id === id);
      if (!original) return atuais;
      const atualizada = recalcularLinha({ ...original, ...alteracoes }, cadastros, duplicadosBanco, repetidas, escolhasDaLinha(original));
      return atuais.map((linha) => linha.id === id ? atualizada : linha);
    });
  };

  const mapearColuna = async (campo: MigracaoCampo, value: string) => {
    if (!planilha) return;
    const mapa: MigracaoColunas = { ...colunas };
    if (value === '') delete mapa[campo];
    else mapa[campo] = Number(value);
    setColunas(mapa);
    await montar(planilha, aba, linhaCabecalho, mapa);
  };

  const selecionarAba = async (nomeAba: string) => {
    setAba(nomeAba);
    if (planilha) await montar(planilha, nomeAba);
  };

  const aplicarGrupo = (linha: MigracaoLinha, field: 'cliente' | 'conta' | 'categoria' | 'centroCusto', id: string, selecionadoExterno?: { id: string; nome: string }) => {
    const nomeOriginal = nomesOriginais.current[`${linha.id}:${field}`];
    const cadastrosDoCampo = field === 'cliente' ? cadastros.clientes : field === 'conta' ? cadastros.contas : field === 'categoria' ? cadastros.categorias : cadastros.centrosCusto;
    const selecionado = selecionadoExterno ?? cadastrosDoCampo.find((item) => item.id === id);
    setLinhas((atuais) => {
      const repetidas = chavesRepetidas(atuais);
      return atuais.map((item) => {
        const nome = nomesOriginais.current[`${item.id}:${field}`];
        if (nome !== nomeOriginal) return item;
        escolhasManuais.current.set(`${item.linhaOrigem}:${field}`, id);
        const alteracoes: Partial<MigracaoLinha> = field === 'cliente' ? { clienteId: id, clienteNome: selecionado?.nome ?? '' }
          : field === 'conta' ? { contaId: id, contaNome: selecionado?.nome ?? '' }
            : field === 'categoria' ? { categoriaId: id, categoriaNome: selecionado?.nome ?? '' }
              : { centroCustoId: id, centroCustoNome: selecionado?.nome ?? '' };
        return recalcularLinha({ ...item, ...alteracoes }, cadastros, duplicadosBanco, repetidas, escolhasDaLinha(item));
      });
    });
  };

  const abrirCadastroRapido = (linha: MigracaoLinha, campo: 'cliente' | 'categoria' | 'centroCusto') => {
    const nomeOriginal = nomesOriginais.current[`${linha.id}:${campo}`] ?? '';
    setCadastroRapido({ linhaId: linha.id, campo, nome: nomeOriginal, tipo: campo === 'categoria' ? linha.tipo : null, erro: '', carregando: false });
  };

  const cadastrarRapido = async (linha: MigracaoLinha) => {
    if (!cadastroRapido) return;
    const formulario = cadastroRapido;
    const nome = formulario.nome.trim();
    if (!nome) return;
    if (formulario.campo === 'categoria' && !formulario.tipo) {
      setCadastroRapido({ ...formulario, erro: 'Selecione Entrada ou Saída.' });
      return;
    }
    setCadastroRapido({ ...formulario, carregando: true, erro: '' });
    try {
      if (formulario.campo === 'cliente') {
        const criado = await createEntity({ tipo: 'cliente', nome_razao_social: nome, documento: null, status_sincronizacao: true, status_base: 'ativo' } as Parameters<typeof createEntity>[0]);
        aplicarGrupo(linha, 'cliente', criado.id, { id: criado.id, nome: criado.nome_razao_social });
      } else if (formulario.campo === 'categoria') {
        const tipo = formulario.tipo as 'entrada' | 'saida';
        const criado = await createCategory({ nome, tipo });
        aplicarGrupo(linha, 'categoria', criado.id, { id: criado.id, nome: criado.nome });
      } else {
        const criado = await createCC({ nome, descricao: '' });
        aplicarGrupo(linha, 'centroCusto', criado.id, { id: criado.id, nome: criado.nome });
      }
      setCadastroRapido(null);
    } catch (cause) {
      setCadastroRapido({ ...formulario, carregando: false, erro: cause instanceof Error ? cause.message : 'Não foi possível cadastrar.' });
    }
  };

  const importar = async () => {
    const selecionadas = linhas.filter((linha) => linha.incluir);
    if (!planilha || selecionadas.length === 0) return;
    setImportando(true);
    setErro('');
    try {
      const resposta = await importarLinhas(planilha.nome, selecionadas);
      setResultado(resposta);
      for (const key of ['lancamentos', 'contasSaldos', 'dashboardStats', 'dashboardIndicadores', 'importacoesDados', 'auditoriaLogs', 'notifications']) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível importar as linhas selecionadas.');
    } finally {
      setImportando(false);
    }
  };

  const undo = async (id: string) => {
    if (!window.confirm('Deseja desfazer este lote? Os lançamentos importados serão removidos.')) return;
    try { await desfazer.mutateAsync(id); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível desfazer o lote.'); }
  };

  const opcoesCampo = (campo: 'cliente' | 'conta' | 'categoria' | 'centroCusto') => campo === 'cliente' ? cadastros.clientes : campo === 'conta' ? cadastros.contas : campo === 'categoria' ? cadastros.categorias : cadastros.centrosCusto;
  const linhasVisiveis = somentePendencias ? linhas.filter((linha) => linha.situacao === 'pendente') : linhas;
  const labelSituacao: Record<string, string> = { pronta: 'Pronta', pendente: 'Pendente', duplicada: 'Duplicada', cancelada: 'Cancelada', erro: 'Erro' };
  const corSituacao: Record<string, string> = { pronta: 'text-bank-truth-green', pendente: 'text-pending-amber', duplicada: 'text-alert-red', cancelada: 'text-secondary', erro: 'text-alert-red' };

  return (
    <div className="space-y-5">
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onDragOver={(event) => { event.preventDefault(); setArrastando(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArrastando(false); }} onDrop={(event) => { if (event.defaultPrevented) return; event.preventDefault(); setArrastando(false); void carregarArquivo(event.dataTransfer.files[0]); }} className={`rounded-xl border border-surface-border bg-white p-5 transition dark:bg-surface ${arrastando ? 'ring-2 ring-primary' : ''}`}>
        <header className="mb-4 flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-black text-on-surface">Migração de Dados</h2><p className="mt-1 text-sm text-on-surface-variant">Revise o mapeamento e complete as informações antes de importar.</p></div></header>
        {!planilha && !lendo && <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={(event) => { event.preventDefault(); setArrastando(false); void carregarArquivo(event.dataTransfer.files[0]); }} className={`flex min-h-52 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition focus-visible:ring-2 focus-visible:ring-primary ${arrastando ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-primary/60'}`}><Upload className="mb-3 h-8 w-8 text-primary" /><span className="font-bold text-on-surface">Arraste um arquivo para cá ou clique para selecionar</span><span className="mt-2 text-xs text-on-surface-variant">Formatos aceitos: .xlsx e .csv</span></button>}
        <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Selecionar planilha para migração" className="hidden" onChange={(event) => { void carregarArquivo(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        {lendo && <div className="rounded-xl border border-surface-border p-6"><div className="flex items-center gap-3 text-sm font-semibold text-on-surface"><LoaderCircle className="h-5 w-5 animate-spin text-primary" />Lendo e interpretando a planilha… {progresso}%</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-low"><div className="h-full bg-primary transition-all" style={{ width: `${progresso}%` }} /></div></div>}
        {erro && <p role="alert" className="mt-4 rounded-lg bg-alert-red/10 p-3 text-sm text-alert-red">{erro}</p>}
        {planilha && <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low p-3"><div><p className="text-sm font-bold text-on-surface">{planilha.nome}</p><p className="text-xs text-on-surface-variant">{(planilha.tamanho / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB · {linhas.length} linhas</p></div><div className="flex gap-2"><button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-surface-border px-3 py-2 text-xs font-bold text-on-surface focus-visible:ring-2 focus-visible:ring-primary">Trocar arquivo</button><button type="button" onClick={() => { setPlanilha(null); setLinhas([]); setResultado(null); setErro(''); }} className="rounded-lg border border-surface-border px-3 py-2 text-xs font-bold text-on-surface focus-visible:ring-2 focus-visible:ring-primary">Limpar</button></div></div>
          {planilha.abas.length > 1 && <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-widest text-secondary">Aba da planilha<select aria-label="Selecionar aba da planilha" value={aba} onChange={(event) => void selecionarAba(event.target.value)} className={`${classeCampo} max-w-sm text-sm font-normal`}>{planilha.abas.map((item) => <option key={item.nome} value={item.nome}>{item.nome}</option>)}</select></label>}
          <section className="rounded-xl border border-surface-border p-4"><h3 className="text-xs font-black uppercase tracking-widest text-secondary">Mapeamento de colunas</h3><p className="mt-1 text-xs text-on-surface-variant">Confira as colunas reconhecidas ou selecione outro cabeçalho. {naoReconhecidas.length > 0 && `Não reconhecidas: ${naoReconhecidas.join(', ')}`}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{campos.map(({ campo, rotulo }) => { const headers = planilha.abas.find((item) => item.nome === aba)?.linhas[linhaCabecalho] ?? []; return <label key={campo} className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">{rotulo}<select aria-label={`Mapear coluna ${rotulo}`} value={colunas[campo] === undefined ? '' : String(colunas[campo])} onChange={(event) => void mapearColuna(campo, event.target.value)} className={classeCampo}><option value="">Não usar</option>{headers.map((head, index) => <option key={`${index}-${String(head)}`} value={index}>{String(head ?? '').trim() || `Coluna ${index + 1}`}</option>)}</select></label>; })}</div></section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">{[['Total', contadores.total], ['Prontas', contadores.prontas], ['Pendentes', contadores.pendentes], ['Duplicadas', contadores.duplicadas], ['Canceladas', contadores.canceladas], ['Selecionadas', contadores.selecionadas], ['Valor selecionado', moeda.format(contadores.valor)]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-surface-border bg-white p-3 dark:bg-surface"><p className="text-[10px] font-black uppercase tracking-widest text-secondary">{label}</p><p className="mt-1 text-sm font-bold text-on-surface">{value}</p></div>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-on-surface"><input type="checkbox" checked={somentePendencias} onChange={(event) => setSomentePendencias(event.target.checked)} className="h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-primary" />Somente pendências</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={importando || remapeando} onClick={() => setLinhas((current) => current.map((linha) => ({ ...linha, incluir: linha.situacao === 'pronta', incluirManual: true })))} className="rounded-lg border border-surface-border px-3 py-2 text-xs font-bold text-on-surface focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Selecionar todas</button>
              <button type="button" disabled={importando || remapeando} onClick={() => setLinhas((current) => current.map((linha) => ({ ...linha, incluir: false, incluirManual: true })))} className="rounded-lg border border-surface-border px-3 py-2 text-xs font-bold text-on-surface focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Limpar seleção</button>
              <button type="button" disabled={contadores.selecionadas === 0 || remapeando || importando} onClick={() => void importar()} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{importando ? 'Importando…' : `Importar ${contadores.selecionadas}`}</button>
            </div>
          </div>
          {remapeando && <p className="flex items-center gap-2 text-xs text-on-surface-variant"><LoaderCircle className="h-4 w-4 animate-spin" />Recalculando linhas…</p>}
          {importando && <div role="status" className="space-y-2 text-xs font-semibold text-on-surface-variant"><div className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-primary" />Importando linhas selecionadas…</div><div className="h-1.5 overflow-hidden rounded-full bg-surface-container-low"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div></div>}
          {resultado && <section role="status" className="rounded-xl border border-bank-truth-green/30 bg-bank-truth-green/10 p-4"><div className="flex items-center gap-2 font-bold text-bank-truth-green"><CheckCircle2 className="h-5 w-5" />Importação concluída</div><div className="mt-2 grid gap-2 text-sm text-on-surface sm:grid-cols-2"><p>Importadas: <strong>{resultado.importadas}</strong></p><p>Valor total: <strong>{moeda.format(resultado.valor_total)}</strong></p><p className="sm:col-span-2">ID do lote: <strong className="break-all">{resultado.lote_id}</strong></p></div>{resultado.erros.length > 0 && <div className="mt-3 text-sm text-alert-red"><p className="font-bold">Erros ({resultado.erros.length})</p><ul className="mt-1 list-inside list-disc">{resultado.erros.map((item, index) => <li key={`${item.linha}-${index}`}>Linha {item.linha}: {item.motivo}</li>)}</ul></div>}</section>}
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="min-w-[1500px] w-full border-collapse text-left text-xs">
              <thead className="bg-surface-container-low"><tr>{['Incluir', 'Linha', 'Situação', 'Valor', 'Entrada/Saída', 'Vencimento', 'Cliente', 'Conta', 'Categoria', 'Centro de Custo', 'Descrição', 'Resultado previsto'].map((title) => <th key={title} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-secondary">{title}</th>)}</tr></thead>
              <tbody>{linhasVisiveis.map((linha) => {
                const pendente = linha.situacao === 'pendente';
                return <tr key={linha.id} className={`border-t border-surface-border ${pendente ? 'bg-pending-amber/5' : ''}`}>
                  <td className="px-3 py-3"><label className="flex items-center gap-2 text-xs font-semibold text-on-surface"><input aria-label={`Incluir linha ${linha.linhaOrigem}`} type="checkbox" checked={linha.incluir} disabled={['duplicada', 'cancelada', 'erro'].includes(linha.situacao)} onChange={(event) => atualizarLinha(linha.id, { incluir: event.target.checked, incluirManual: true })} className="h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-primary" />Incluir</label></td>
                  <td className="px-3 py-3 text-on-surface">{linha.linhaOrigem}</td>
                  <td className={`px-3 py-3 font-bold ${corSituacao[linha.situacao]}`}>{labelSituacao[linha.situacao]}</td>
                  <td className="px-3 py-3"><input aria-label={`Valor da linha ${linha.linhaOrigem}`} type="number" min="0" step="0.01" value={linha.valor ?? ''} onChange={(event) => { const valor = event.target.value === '' ? null : Math.abs(Number(event.target.value)); atualizarLinha(linha.id, { valor }); }} className={`${classeCampo} w-28 ${pendente && linha.valor === null ? 'border-pending-amber ring-1 ring-pending-amber' : ''}`} /></td>
                  <td className="px-3 py-3"><select aria-label={`Entrada ou saída da linha ${linha.linhaOrigem}`} value={linha.tipo ?? ''} onChange={(event) => { const tipo = event.target.value as 'entrada' | 'saida' | ''; registrarEscolha(linha, 'tipo', tipo); atualizarLinha(linha.id, { tipo: tipo || null }); }} className={`${classeCampo} w-24 ${pendente && !linha.tipo ? 'border-pending-amber ring-1 ring-pending-amber' : ''}`}><option value="">Definir…</option><option value="entrada">Entrada</option><option value="saida">Saída</option></select></td>
                  <td className="px-3 py-3"><input aria-label={`Data de vencimento da linha ${linha.linhaOrigem}`} type="date" value={linha.vencimento ?? ''} onChange={(event) => atualizarLinha(linha.id, { vencimento: event.target.value || null })} className={`${classeCampo} w-36 ${pendente && !linha.vencimento ? 'border-pending-amber ring-1 ring-pending-amber' : ''}`} /></td>
                  {([['cliente', 'clienteId'], ['conta', 'contaId'], ['categoria', 'categoriaId'], ['centroCusto', 'centroCustoId']] as const).map(([field, idField]) => {
                    const options = opcoesCampo(field);
                    const currentId = linha[idField] ?? '';
                    const nomeOriginal = nomesOriginais.current[`${linha.id}:${field}`] ?? '';
                    const formularioAberto = cadastroRapido?.linhaId === linha.id && cadastroRapido.campo === field;
                    const podeCadastrar = nomeOriginal.trim() !== '' && (field === 'cliente' ? !!user : field === 'categoria' || field === 'centroCusto' ? hasRole(['master', 'gerente']) : false);
                    const rotulosCadastro = { cliente: 'cliente', conta: 'conta', categoria: 'categoria', centroCusto: 'centro de custo' };
                    return <td key={field} className="px-3 py-3"><div className="flex min-w-40 flex-col gap-1">
                      <select aria-label={`${field} da linha ${linha.linhaOrigem}`} value={currentId} onChange={(event) => {
                        registrarEscolha(linha, field, event.target.value);
                        const selected = options.find((item) => item.id === event.target.value);
                        const fieldName = field === 'centroCusto' ? 'centroCustoNome' : `${field}Nome` as 'clienteNome' | 'contaNome' | 'categoriaNome';
                        atualizarLinha(linha.id, { [idField]: event.target.value || null, [fieldName]: selected?.nome ?? (field === 'centroCusto' ? linha.centroCustoNome : '') });
                      }} className={`${classeCampo} ${pendente && !currentId ? 'border-pending-amber ring-1 ring-pending-amber' : ''}`}><option value="">Selecionar…</option>{options.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
                      <button type="button" disabled={!currentId} onClick={() => aplicarGrupo(linha, field, currentId)} className="text-left text-[10px] font-bold text-primary underline disabled:opacity-40">Aplicar a linhas com o mesmo nome</button>
                      {podeCadastrar && field !== 'conta' && <button type="button" onClick={() => formularioAberto ? setCadastroRapido(null) : abrirCadastroRapido(linha, field)} className="text-left text-[10px] font-bold text-primary">+ Cadastrar {rotulosCadastro[field]}</button>}
                      {formularioAberto && <div className="space-y-2 rounded-lg border border-surface-border bg-surface-container-low p-2">
                        <input aria-label={`Nome do novo ${field}`} value={cadastroRapido.nome} onChange={(event) => setCadastroRapido({ ...cadastroRapido, nome: event.target.value, erro: '' })} className={`${classeCampo} w-full`} />
                        {field === 'categoria' && !cadastroRapido.tipo && <div className="flex gap-1"><button type="button" onClick={() => setCadastroRapido({ ...cadastroRapido, tipo: 'entrada' })} className="rounded border border-surface-border px-2 py-1 text-[10px] font-bold text-on-surface">Entrada</button><button type="button" onClick={() => setCadastroRapido({ ...cadastroRapido, tipo: 'saida' })} className="rounded border border-surface-border px-2 py-1 text-[10px] font-bold text-on-surface">Saída</button></div>}
                        {cadastroRapido.erro && <p role="alert" className="text-[10px] text-alert-red">{cadastroRapido.erro}</p>}
                        <div className="flex gap-2"><button type="button" disabled={cadastroRapido.carregando} onClick={() => void cadastrarRapido(linha)} className="rounded bg-primary px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">{cadastroRapido.carregando ? 'Cadastrando…' : 'Cadastrar'}</button><button type="button" disabled={cadastroRapido.carregando} onClick={() => setCadastroRapido(null)} className="rounded border border-surface-border px-2 py-1 text-[10px] font-bold text-on-surface">Cancelar</button></div>
                      </div>}
                    </div></td>;
                  })}
                  <td className="max-w-52 px-3 py-3 text-on-surface-variant">{linha.descricao || '—'}</td>
                  <td className={`max-w-64 px-3 py-3 font-semibold ${corSituacao[linha.situacao]}`}>{linha.resultadoPrevisto}</td>
                </tr>;
              })}</tbody>
            </table>
            {linhasVisiveis.length === 0 && <p className="p-6 text-center text-sm text-on-surface-variant">{somentePendencias ? 'Nenhuma linha pendente.' : 'Nenhuma linha encontrada na aba selecionada.'}</p>}
          </div>
        </div>}
      </motion.section>
      <section className="rounded-xl border border-surface-border bg-white p-5 dark:bg-surface"><header className="mb-4 flex items-center gap-2"><Clock3 className="h-4 w-4 text-secondary" /><h2 className="text-xs font-black uppercase tracking-widest text-secondary">Histórico de lotes</h2></header>{carregandoLotes ? <p className="text-sm text-on-surface-variant">Carregando histórico…</p> : lotes.length === 0 ? <p className="text-sm text-on-surface-variant">Nenhum lote de importação encontrado.</p> : <div className="space-y-2">{lotes.map((lote) => <div key={lote.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border p-3"><div className="min-w-48 flex-1"><p className="break-all text-sm font-bold text-on-surface">{lote.arquivo_nome ?? 'Arquivo sem nome'}</p><p className="mt-1 text-xs text-on-surface-variant">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lote.created_at))} · {lote.importadas} importadas · {lote.erros} erros · {moeda.format(lote.valor_total)}</p><p className="mt-1 text-xs font-bold text-on-surface-variant">Status: {lote.status}</p></div><button type="button" disabled={lote.status === 'desfeita' || desfazer.isPending} onClick={() => void undo(lote.id)} className="inline-flex items-center gap-2 rounded-lg border border-alert-red/30 px-3 py-2 text-xs font-bold text-alert-red transition hover:bg-alert-red/10 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Desfazer</button></div>)}</div>}</section>
    </div>
  );
}
