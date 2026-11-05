import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Coins,
  Tag,
  Briefcase,
  Plus,
  Trash2,
  X,
  Building,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  TrendingUp,
  Mail,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Receipt,
  ArrowRight,
  Loader2,
  Edit2,
  Upload,
  Camera,
  Image as ImageIcon,
  Search
} from 'lucide-react';

import { useContas, useCentrosCusto, useCategorias, useCategoriasAjuste, useUsuarios } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useDragScroll } from '../hooks/useDragScroll';
import MoneyInput from '../components/MoneyInput';
import Button from '../components/Button';
import { supabase } from '@/integrations/supabase/client';
import { acessoPadraoDoPerfil, usuarioTemAcessoAConta } from '../config/permissions';
import type { UserProfile } from '../types';
import { mensagemErroNomeDuplicado, podeSalvarNome } from '../utils/validacaoNomes';

type SubTabType = 'contas' | 'centros' | 'categorias' | 'ajustes';

export default function Cadastros() {
  const { role, hasRole } = useAuth();
  const dragScrollTabs = useDragScroll();
  const { data: contas = [], createAccount, updateAccount, deleteAccount } = useContas();
  const { data: usuarios = [], updateUser } = useUsuarios();

  // Gerentes e colaboradores são os únicos perfis que podem ser limitados por
  // conta bancária; o Master nunca aparece nesta gestão.
  const usuariosGerenciados = useMemo(
    () => usuarios.filter(u => u.perfil === 'gerente' || u.perfil === 'colaborador'),
    [usuarios]
  );
  const [acessosConta, setAcessosConta] = useState<Record<string, boolean>>({});

  const { data: centrosCusto = [], createCC, updateCC, deleteCC } = useCentrosCusto();
  const { data: categorias = [], createCategory, updateCategory, deleteCategory } = useCategorias();
  const { categoriasAjuste = [], createCategoriaAjuste, updateCategoriaAjuste, deleteCategoriaAjuste } = useCategoriasAjuste();

  // O Gerente não cadastra bancos: a aba de contas bancárias só existe para o
  // Master, e ele entra pela primeira aba que pode administrar.
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>(() => (role === 'master' ? 'contas' : 'centros'));

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Modals visibility & Edition
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const [isNewCCOpen, setIsNewCCOpen] = useState(false);
  const [editingCC, setEditingCC] = useState<any>(null);

  const [isNewCatOpen, setIsNewCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);

  const [isNewAjusteOpen, setIsNewAjusteOpen] = useState(false);
  const [editingAjuste, setEditingAjuste] = useState<any>(null);

  // Deletion Confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'conta' | 'cc' | 'categoria' | 'ajuste', name: string } | null>(null);

  const isMaster = role === 'master';

  // Form states

  const [bankName, setBankName] = useState('');
  const [bankInitial, setBankInitial] = useState('');
  const [bankLogoUrl, setBankLogoUrl] = useState('');
  const [isCofreLocal, setIsCofreLocal] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [ccName, setCCName] = useState('');
  const [ccDesc, setCCDesc] = useState('');
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'entrada' | 'saida'>('entrada');
  const [ajusteName, setAjusteName] = useState('');
  const [ajusteType, setAjusteType] = useState<'desconto' | 'acrescimo'>('desconto');

  const [searchTerm, setSearchTerm] = useState('');

  const valueFormatter = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // ID da conta em edição; vazio ao criar uma conta nova, onde ainda não existe
  // estado salvo e o switch parte do padrão do perfil.
  const contaEmEdicaoId = editingAccount?.id ?? '';

  const estadoEfetivo = (usuario: UserProfile, contaId: string) =>
    usuarioTemAcessoAConta(usuario.perfil, contaId, usuario.contasLiberadas ?? null, usuario.contasBloqueadas ?? null);

  // O que o Master acabou de alternar tem prioridade; sem alteração, o switch
  // reflete o que já está salvo para a conta em edição — ou o padrão do perfil,
  // quando a conta ainda está sendo criada.
  const acessoDe = (usuario: UserProfile) => acessosConta[usuario.id]
    ?? (editingAccount ? estadoEfetivo(usuario, contaEmEdicaoId) : acessoPadraoDoPerfil(usuario.perfil));

  const openNewAccount = () => {
    setEditingAccount(null);
    setBankName('');
    setBankInitial('');
    setBankLogoUrl('');
    setIsCofreLocal(false);
    setAcessosConta({});
    setIsNewAccountOpen(true);
  };

  const openEditAccount = (c: any) => {
    setEditingAccount(c);
    setBankName(c.nome_banco || c.nome);
    setBankInitial(c.saldo_inicial.toFixed(2).replace('.', ','));
    setBankLogoUrl(c.logo_url || '');
    setIsCofreLocal(!!c.is_cofre_local);
    setAcessosConta({});
    setIsNewAccountOpen(true);
  };

  // Grava só quem mudou de estado. O Colaborador é governado pela lista de contas
  // liberadas (falha fechada) e o Gerente pela lista de contas bloqueadas (falha
  // aberta), então cada perfil mantém o seu padrão.
  const salvarAcessosDaConta = async (contaId: string) => {
    const alterados = usuariosGerenciados.filter(usuario => estadoEfetivo(usuario, contaId) !== acessoDe(usuario));
    await Promise.all(alterados.map(usuario => {
      const permitido = acessoDe(usuario);
      if (usuario.perfil === 'colaborador') {
        const liberadas = permitido
          ? Array.from(new Set([...(usuario.contasLiberadas ?? []), contaId]))
          : (usuario.contasLiberadas ?? []).filter(id => id !== contaId);
        return updateUser({ id: usuario.id, data: { contas_liberadas: liberadas } });
      }
      const bloqueadas = permitido
        ? (usuario.contasBloqueadas ?? []).filter(id => id !== contaId)
        : Array.from(new Set([...(usuario.contasBloqueadas ?? []), contaId]));
      return updateUser({ id: usuario.id, data: { contas_bloqueadas: bloqueadas } });
    }));
  };

  const openEditCC = (cc: any) => {
    setEditingCC(cc);
    setCCName(cc.nome);
    setCCDesc(cc.descricao || '');
    setIsNewCCOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setCatName(cat.nome);
    setCatType(cat.tipo as any);
    setIsNewCatOpen(true);
  };

  const openEditAjuste = (aj: any) => {
    setEditingAjuste(aj);
    setAjusteName(aj.nome);
    setAjusteType(aj.tipo as any);
    setIsNewAjusteOpen(true);
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!podeSalvarNome<(typeof contas)[number]>(bankName, contas, { nomeDe: (conta) => conta.nome_banco || conta.nome, ignorarId: editingAccount?.id, rotulo: 'banco' })) return;
    try {
      const saldo = parseFloat(bankInitial.replace(/\D/g, '')) / 100 || 0;
      if (editingAccount) {
        await updateAccount({
          id: editingAccount.id,
          data: {
            nome_banco: bankName,
            nome: bankName,
            saldo_inicial: saldo,
            logo_url: bankLogoUrl,
            is_cofre_local: isCofreLocal
          }
        });
        await salvarAcessosDaConta(editingAccount.id);
      } else {
        const novaConta: any = await createAccount({
          nome_banco: bankName,
          nome: bankName,
          agencia: '0001',
          conta: '00000-0',
          saldo_inicial: saldo,
          data_abertura: new Date().toISOString(),
          logo_url: bankLogoUrl,
          is_cofre_local: isCofreLocal
        });
        if (novaConta?.id) await salvarAcessosDaConta(novaConta.id);
      }
      setAcessosConta({});
      setIsNewAccountOpen(false);
      setEditingAccount(null);
      setBankName('');
      setBankInitial('');
      setBankLogoUrl('');
      setIsCofreLocal(false);
    } catch (err: any) {
      const errorMessages = [err?.message, err?.details, err?.hint, err?.cause?.message]
        .filter((message): message is string => typeof message === 'string')
        .join(' ');
      const errorCode = err?.code ?? err?.cause?.code;
      if (errorMessages.includes('contas_bancarias_nome_normalizado_unico')) {
        alert('Já existe uma conta com esse nome. Escolha outro nome.');
      } else if (errorCode === '23505' || errorMessages.includes('contas_bancarias_unico_cofre_local')) {
        alert('Apenas uma conta bancária pode ser o Cofre Local. Desmarque o Cofre Local da conta existente antes de marcar outra.');
      } else {
        alert('Erro ao salvar conta');
      }
    }
  };

  const handleCCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvarNome(ccName, centrosCusto, { nomeDe: (centro) => centro.nome, ignorarId: editingCC?.id, rotulo: 'centro de custo' })) return;
    try {
      if (editingCC) {
        await updateCC({ id: editingCC.id, data: { nome: ccName, descricao: ccDesc }});
      } else {
        await createCC({ nome: ccName, descricao: ccDesc });
      }
      setIsNewCCOpen(false);
      setEditingCC(null);
      setCCName('');
      setCCDesc('');
    } catch (err) { alert(mensagemErroNomeDuplicado(err) ?? 'Erro ao salvar centro de custo'); }
  };

  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvarNome(catName, categorias, { nomeDe: (categoria) => categoria.nome, ignorarId: editingCat?.id, rotulo: 'categoria' })) return;
    try {
      if (editingCat) {
        await updateCategory({ id: editingCat.id, data: { nome: catName, tipo: catType }});
      } else {
        await createCategory({ nome: catName, tipo: catType });
      }
      setIsNewCatOpen(false);
      setEditingCat(null);
      setCatName('');
    } catch (err) { alert(mensagemErroNomeDuplicado(err) ?? 'Erro ao salvar categoria'); }
  };

  const handleAjusteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvarNome(ajusteName, categoriasAjuste, { nomeDe: (motivo) => motivo.nome, ignorarId: editingAjuste?.id, rotulo: 'motivo de ajuste' })) return;
    try {
      if (editingAjuste) {
        await updateCategoriaAjuste({ id: editingAjuste.id, data: { nome: ajusteName, tipo: ajusteType }});
      } else {
        await createCategoriaAjuste({ nome: ajusteName, tipo: ajusteType });
      }
      setIsNewAjusteOpen(false);
      setEditingAjuste(null);
      setAjusteName('');
    } catch (err) { alert(mensagemErroNomeDuplicado(err) ?? 'Erro ao salvar categoria de ajuste'); }
  };

  const confirmDelete = async () => {

    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'conta') {
        await deleteAccount(deleteConfirm.id);
      } else if (deleteConfirm.type === 'cc') {
        await deleteCC(deleteConfirm.id);
      } else if (deleteConfirm.type === 'categoria') {
        await deleteCategory(deleteConfirm.id);
      } else if (deleteConfirm.type === 'ajuste') {
        await deleteCategoriaAjuste(deleteConfirm.id);
      }
      setDeleteConfirm(null);

    } catch (err: any) {
      if (err?.code === '23503') {
        alert('Este registro não pode ser inativado pois existem movimentos críticos vinculados. Recomendamos revisão contábil.');
      } else {
        alert('Erro ao excluir registro.');
      }
    }
  };

  const paginatedData = useMemo(() => {
    const rawData = activeSubTab === 'contas' ? contas :
                   activeSubTab === 'centros' ? centrosCusto :
                   activeSubTab === 'categorias' ? categorias : categoriasAjuste;
    const data = rawData.filter((item: any) => {
      const isNotExcluido = item.status !== 'excluido';
      const name = (item.nome_banco || item.nome || '').toLowerCase();
      const matchesSearch = name.includes(searchTerm.toLowerCase());
      return isNotExcluido && matchesSearch;
    });
    const start = (currentPage - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [activeSubTab, contas, centrosCusto, categorias, categoriasAjuste, currentPage, itemsPerPage, searchTerm]);

  const totalPages = useMemo(() => {
    const rawData = activeSubTab === 'contas' ? contas :
                   activeSubTab === 'centros' ? centrosCusto :
                   activeSubTab === 'categorias' ? categorias : categoriasAjuste;
    const data = rawData.filter((item: any) => {
      const isNotExcluido = item.status !== 'excluido';
      const name = (item.nome_banco || item.nome || '').toLowerCase();
      const matchesSearch = name.includes(searchTerm.toLowerCase());
      return isNotExcluido && matchesSearch;
    });
    return Math.max(Math.ceil(data.length / itemsPerPage), 1);
  }, [activeSubTab, contas, centrosCusto, categorias, categoriasAjuste, itemsPerPage, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">Configurações de Estrutura</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Defina a espinha dorsal financeira do seu sistema</p>
        </div>
        <Button
          onClick={() => {
            if (activeSubTab === 'contas' && isMaster) {
              openNewAccount();
            } else if (activeSubTab === 'centros') {
              setEditingCC(null); setCCName(''); setCCDesc(''); setIsNewCCOpen(true);
            } else if (activeSubTab === 'categorias') {
              setEditingCat(null); setCatName(''); setIsNewCatOpen(true);
            } else {
              setEditingAjuste(null); setAjusteName(''); setIsNewAjusteOpen(true);
            }
          }}
        >
          Novo Registro
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div ref={dragScrollTabs.ref} {...dragScrollTabs.props} className="flex border-b border-neutral-200 overflow-x-auto scrollbar-none whitespace-nowrap">
        {isMaster && (
          <button onClick={() => { setActiveSubTab('contas'); setCurrentPage(1); setSearchTerm(''); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeSubTab === 'contas' ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-900'}`}>Contas Bancárias</button>
        )}
        <button onClick={() => { setActiveSubTab('centros'); setCurrentPage(1); setSearchTerm(''); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeSubTab === 'centros' ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-900'}`}>Centros de Custo</button>
        <button onClick={() => { setActiveSubTab('categorias'); setCurrentPage(1); setSearchTerm(''); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeSubTab === 'categorias' ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-900'}`}>Categorias</button>
        <button onClick={() => { setActiveSubTab('ajustes'); setCurrentPage(1); setSearchTerm(''); }} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeSubTab === 'ajustes' ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-900'}`}>Motivos de Ajuste</button>
      </div>

      <div className="bg-white border-2 border-neutral-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-4 bg-neutral-50/50 border-b border-neutral-100">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-11 pr-4 bg-white border-2 border-neutral-100 rounded-xl text-xs font-bold outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {isMaster && activeSubTab === 'contas' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Instituição / Nome</th><th className="py-4 px-8">Data de Abertura</th><th className="py-4 px-8 text-right">Saldo Inicial</th><th className="py-4 px-8 text-center">Status</th><th className="py-4 px-8 text-right">Ações</th></tr></thead>
              <tbody className="text-[11px] font-bold">
                {paginatedData.length === 0 ? <tr><td colSpan={5} className="py-20 text-center opacity-40 uppercase tracking-widest">Nenhuma conta encontrada</td></tr> :
                (paginatedData as any[]).map(c => (
                  <tr key={c.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all">
                    <td className="py-4 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black uppercase shadow-sm overflow-hidden">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                            <Coins className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-neutral-900 font-black uppercase tracking-tighter">{c.nome_banco || c.nome}</p>
                          {c.is_cofre_local && <span className="rounded-full border border-surface-border bg-surface px-2 py-1 text-[9px] font-bold text-primary">Cofre Local</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-8 font-mono text-neutral-500">{new Date(c.data_abertura).toLocaleDateString()}</td>
                    <td className="py-4 px-8 text-right font-mono text-bank-truth-green">{valueFormatter(c.saldo_inicial)}</td>
                    <td className="py-4 px-8 text-center"><span className="rounded-lg bg-emerald-50 text-bank-truth-green px-3 py-1.5 uppercase font-black text-[9px] tracking-widest">Operacional</span></td>
                    <td className="py-4 px-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditAccount(c)} data-testid={`editar-conta-${c.id}`} className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                        {hasRole(['master']) && (
                          <button onClick={() => setDeleteConfirm({ id: c.id, type: 'conta', name: c.nome_banco || c.nome })} className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSubTab === 'centros' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Nome do Centro</th><th className="py-4 px-8">Descrição / Finalidade</th><th className="py-4 px-8 text-right">Ações</th></tr></thead>
              <tbody className="text-[11px] font-bold">
                {paginatedData.length === 0 ? <tr><td colSpan={3} className="py-20 text-center opacity-40 uppercase tracking-widest">Nenhum centro encontrado</td></tr> :
                (paginatedData as any[]).map(cc => (
                  <tr key={cc.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all">
                    <td className="py-4 px-8 font-black uppercase tracking-tighter text-neutral-900">{cc.nome}</td>
                    <td className="py-4 px-8 text-neutral-500">{cc.descricao || 'Sem descrição'}</td>
                    <td className="py-4 px-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCC(cc)} className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                        {hasRole(['master']) && (
                          <button onClick={() => setDeleteConfirm({ id: cc.id, type: 'cc', name: cc.nome })} className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSubTab === 'categorias' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Classificador</th><th className="py-4 px-8 text-center">Tipo de Fluxo</th><th className="py-4 px-8 text-right">Ações</th></tr></thead>
              <tbody className="text-[11px] font-bold">
                {paginatedData.length === 0 ? <tr><td colSpan={3} className="py-20 text-center opacity-40 uppercase tracking-widest">Nenhuma categoria encontrada</td></tr> :
                (paginatedData as any[]).map(cat => (
                  <tr key={cat.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all">
                    <td className="py-4 px-8 font-black uppercase tracking-tighter text-neutral-900">{cat.nome}</td>
                    <td className="py-4 px-8 text-center"><span className={`rounded-lg px-3 py-1.5 uppercase font-black text-[9px] tracking-widest ${cat.tipo === 'entrada' ? 'bg-emerald-50 text-bank-truth-green' : 'bg-red-50 text-alert-red'}`}>{cat.tipo}</span></td>
                    <td className="py-4 px-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCat(cat)} className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                        {hasRole(['master']) && (
                          <button onClick={() => setDeleteConfirm({ id: cat.id, type: 'categoria', name: cat.nome })} className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSubTab === 'ajustes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Motivo de Ajuste</th><th className="py-4 px-8 text-center">Tipo</th><th className="py-4 px-8 text-right">Ações</th></tr></thead>
              <tbody className="text-[11px] font-bold">
                {paginatedData.length === 0 ? <tr><td colSpan={3} className="py-20 text-center opacity-40 uppercase tracking-widest">Nenhum motivo encontrado</td></tr> :
                (paginatedData as any[]).map(aj => (
                  <tr key={aj.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all">
                    <td className="py-4 px-8 font-black uppercase tracking-tighter text-neutral-900">{aj.nome}</td>
                    <td className="py-4 px-8 text-center">
                      <span className={`rounded-lg px-3 py-1.5 uppercase font-black text-[9px] tracking-widest ${aj.tipo === 'desconto' ? 'bg-emerald-50 text-bank-truth-green' : 'bg-red-50 text-alert-red'}`}>
                        {aj.tipo}
                      </span>
                    </td>
                    <td className="py-4 px-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditAjuste(aj)} className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                        {hasRole(['master']) && (
                          <button onClick={() => setDeleteConfirm({ id: aj.id, type: 'ajuste', name: aj.nome })} className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}

        <div className="bg-neutral-50/50 px-8 py-4 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
            Exibindo registros da página {currentPage} de {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
            >
              Anterior
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                    currentPage === pageNum
                      ? 'bg-neutral-900 text-white shadow-md'
                      : 'border-2 border-neutral-100 text-neutral-400 hover:bg-neutral-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="h-10 px-4 rounded-xl border-2 border-neutral-100 text-neutral-500 font-bold hover:bg-neutral-50 disabled:opacity-50 text-[10px] uppercase tracking-widest transition-all"
            >
              Próximo
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* Modal Nova/Edita Conta */}
        {isNewAccountOpen && (
          <div key="cadastro-conta" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewAccountOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleAccountSubmit} className="bg-white w-full max-w-[560px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">{editingAccount ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</h2><button type="button" onClick={() => setIsNewAccountOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-6 overflow-y-auto max-h-[65vh]">
                <div className="flex flex-col items-center gap-4 mb-2">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-neutral-100 border-2 border-dashed border-neutral-300 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
                      {bankLogoUrl ? (
                        <img src={bankLogoUrl} alt="Logo do Banco" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-neutral-300" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    {isUploadingLogo && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-full">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        setIsUploadingLogo(true);
                        try {
                          const fileExt = file.name.split('.').pop();
                          const fileName = `${Math.random()}.${fileExt}`;
                          const filePath = `logos-bancos/${fileName}`;

                          const { error: uploadError } = await supabase.storage
                            .from('documents')
                            .upload(filePath, file);

                          if (uploadError) throw uploadError;

                          const { data: { publicUrl } } = supabase.storage
                            .from('documents')
                            .getPublicUrl(filePath);

                          setBankLogoUrl(publicUrl);
                        } catch (err) {
                          alert('Erro ao subir logo');
                        } finally {
                          setIsUploadingLogo(false);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Logo do Banco</p>
                </div>

                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome da Conta / Banco</label><input type="text" required value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none" /></div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Saldo Inicial (R$)</label>
                  <MoneyInput
                    value={bankInitial}
                    onChange={setBankInitial}
                    disabled={!isMaster && !!editingAccount}
                    className={`w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none ${(!isMaster && !!editingAccount) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="0,00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Esse Banco é Cofre Local?</span>
                  <div className="flex gap-2">
                    {[{ label: 'Sim', value: true }, { label: 'Não', value: false }].map(option => (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={isCofreLocal === option.value}
                        onClick={() => setIsCofreLocal(option.value)}
                        className={`flex-1 rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${isCofreLocal === option.value ? 'border-primary bg-primary text-white' : 'border-surface-border bg-surface text-on-surface hover:border-primary'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-medium text-neutral-500">Conta usada para movimentar dinheiro em espécie.</p>
                </div>

                {isMaster && (
                  <div className="space-y-3 pt-2 border-t border-neutral-100" data-testid="acessos-conta">
                    <div className="flex items-center justify-between pt-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Quem pode usar esta conta</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                        {usuariosGerenciados.filter(acessoDe).length} de {usuariosGerenciados.length}
                      </span>
                    </div>
                    <div className="rounded-2xl border-2 border-neutral-100 overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-neutral-50 text-neutral-400 text-[9px] font-black uppercase tracking-widest">
                            <th className="py-3 px-4">Usuário</th>
                            <th className="py-3 px-4 text-center">Conta</th>
                            <th className="py-3 px-4 text-right">Acesso</th>
                          </tr>
                        </thead>
                        <tbody className="text-[11px] font-bold">
                          {usuariosGerenciados.length === 0 ? (
                            <tr><td colSpan={3} className="py-6 px-4 text-center text-neutral-400 uppercase tracking-widest text-[9px]">Nenhum gerente ou colaborador cadastrado</td></tr>
                          ) : usuariosGerenciados.map((usuario) => (
                            <tr key={usuario.id} className="border-t border-neutral-100">
                              <td className="py-3 px-4">
                                <p className="text-neutral-900 font-black uppercase tracking-tighter">{usuario.nome || usuario.email}</p>
                                <p className="text-[9px] text-neutral-400 uppercase tracking-widest">{usuario.perfil}</p>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center">
                                  {bankLogoUrl ? (
                                    <img src={bankLogoUrl} alt="Logo da conta" className="w-8 h-8 rounded-full object-cover border border-neutral-100" />
                                  ) : (
                                    <span className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center text-[10px] font-black uppercase">
                                      {(bankName || '?').substring(0, 2)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={acessoDe(usuario)}
                                  aria-label={`Acesso de ${usuario.nome || usuario.email}`}
                                  data-testid={`acesso-conta-${usuario.id}`}
                                  onClick={() => setAcessosConta(prev => ({ ...prev, [usuario.id]: !acessoDe(usuario) }))}
                                  className={`w-12 h-6 rounded-full p-1 transition-all ${acessoDe(usuario) ? 'bg-bank-truth-green' : 'bg-neutral-200'}`}
                                >
                                  <div className={`w-4 h-4 bg-white rounded-full transition-all ${acessoDe(usuario) ? 'ml-6' : 'ml-0'}`} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] font-medium text-neutral-500">
                      Gerentes e colaboradores desativados não veem esta conta nos filtros e seletores de conta, nem os lançamentos dela.
                    </p>
                  </div>
                )}

              </div>

              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNewAccountOpen(false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Cancelar</button>
                <Button type="submit">
                  Salvar
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </footer>
            </motion.form>
          </div>
        )}

        {/* Modal Novo/Edita Centro de Custo */}
        {isNewCCOpen && (
          <div key="cadastro-centro-custo" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewCCOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleCCSubmit} className="bg-white w-full max-w-[440px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">{editingCC ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</h2><button type="button" onClick={() => setIsNewCCOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome do Centro</label><input type="text" required value={ccName} onChange={(e) => setCCName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Descrição</label><textarea value={ccDesc} onChange={(e) => setCCDesc(e.target.value)} className="w-full p-5 bg-neutral-50 border-2 border-neutral-100 rounded-2xl text-xs font-black focus:border-primary outline-none resize-none" rows={3} /></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNewCCOpen(false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Cancelar</button>
                <Button type="submit">
                  Salvar
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </footer>
            </motion.form>
          </div>
        )}

        {/* Modal Nova/Edita Categoria */}
        {isNewCatOpen && (
          <div key="cadastro-categoria" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewCatOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleCatSubmit} className="bg-white w-full max-w-[440px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</h2><button type="button" onClick={() => setIsNewCatOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome da Categoria</label><input type="text" required value={catName} onChange={(e) => setCatName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Fluxo</label><select value={catType} onChange={(e) => setCatType(e.target.value as any)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none cursor-pointer appearance-none"><option value="entrada">Entrada / Receita</option><option value="saida">Saída / Despesa</option></select></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNewCatOpen(false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Cancelar</button>
                <Button type="submit">
                  Salvar
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </footer>
            </motion.form>
          </div>
        )}

        {/* Modal Novo/Edita Categoria Ajuste */}
        {isNewAjusteOpen && (
          <div key="cadastro-motivo-ajuste" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewAjusteOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleAjusteSubmit} className="bg-white w-full max-w-[440px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">{editingAjuste ? 'Editar Motivo' : 'Novo Motivo de Ajuste'}</h2><button type="button" onClick={() => setIsNewAjusteOpen(false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome do Motivo</label><input type="text" required value={ajusteName} onChange={(e) => setAjusteName(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none" placeholder="Ex: Pagamento Antecipado" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Tipo de Ajuste</label><select value={ajusteType} onChange={(e) => setAjusteType(e.target.value as any)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none cursor-pointer appearance-none"><option value="desconto">Desconto</option><option value="acrescimo">Acréscimo / Juros</option></select></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsNewAjusteOpen(false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Cancelar</button>
                <Button type="submit">
                  Salvar
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </footer>
            </motion.form>
          </div>
        )}

        {/* Confirmation Modal */}

        {deleteConfirm && (
          <div key="cadastro-exclusao" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirm(null)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 text-alert-red rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter text-neutral-900 mb-2">Excluir {deleteConfirm.name}?</h2>
                <p className="text-sm font-bold text-neutral-500 leading-relaxed">
                  Por segurança e integridade fiscal, o sistema não apaga o registro do banco de dados, apenas o move para a lixeira (Inativo). Confirma esta ação?
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 h-14 rounded-xl border-2 border-neutral-100 text-[11px] font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 h-14 rounded-xl bg-alert-red text-[11px] font-black uppercase tracking-widest text-white hover:opacity-90 transition-all shadow-lg shadow-alert-red/20">Sim, Inativar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
