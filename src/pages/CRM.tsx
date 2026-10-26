import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  User,
  Users,
  Building,
  History,

  ShieldCheck, 
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
  ArrowRight
} from 'lucide-react';
import { useEntidades, useEntidadeDocuments } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { EntidadeNegocio } from '../types';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import Button from '../components/Button';
import { WalletCards, FileText, Download } from 'lucide-react';

export default function CRM() {
  const { role } = useAuth();
  const { data: entidades = [], createEntity, updateEntity, deleteEntity } = useEntidades();
  const { isCadastroRapidoOpen, setModalOpen, entidadeFormDraft, setEntidadeFormDraft, resetAllDrafts } = useUIStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'cliente' | 'fornecedor'>('all');
  const [selectedEntity, setSelectedEntity] = useState<EntidadeNegocio | null>(null);

  const { documents: existingDocuments, deleteDocument } = useEntidadeDocuments(selectedEntity?.id || null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Form states for profile
  const [profileNome, setProfileNome] = useState('');
  const [profileDocumento, setProfileDocumento] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileTelefone, setProfileTelefone] = useState('');
  const [profileStatus, setProfileStatus] = useState<'ativo' | 'inativo' | 'bpi'>('ativo');

  const maskCpfCnpj = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 11) {
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    } else {
      return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5').slice(0, 18);
    }
  };

  const maskPhone = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 10) {
      return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    } else {
      return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').slice(0, 15);
    }
  };

  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_user_id: user.id });
      if (error) throw error;
      return data;
    }
  });

  const filtered = useMemo(() => {
    return entidades.filter(ent => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        ent.nome_razao_social.toLowerCase().includes(searchLower) ||
        (ent.documento || '').includes(searchTerm) ||
        (ent as any).codigo_sequencial?.toString().includes(searchTerm);
      const matchesTipo = tipoFilter === 'all' ? true : ent.tipo === tipoFilter;
      return matchesSearch && matchesTipo;
    });
  }, [entidades, searchTerm, tipoFilter]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totalPages = Math.max(Math.ceil(filtered.length / itemsPerPage), 1);

  const handleOpenProfile = (ent: EntidadeNegocio) => {
    setSelectedEntity(ent);
    setProfileNome(ent.nome_razao_social);
    setProfileDocumento(ent.documento || '');
    setProfileEmail(ent.email || '');
    setProfileTelefone(ent.telefone || '');
    setProfileStatus(ent.status_base || 'ativo');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity) return;
    try {
      await updateEntity({
        id: selectedEntity.id,
        data: { nome_razao_social: profileNome, documento: profileDocumento, email: profileEmail, telefone: profileTelefone, status_base: profileStatus }
      });
      setSelectedEntity(null);
    } catch (err) {
      alert('Erro ao atualizar');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    // Use the global modal instead or logic already moved to CadastroRapidoModal
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">CRM de Entidades</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Gestão de Clientes, Fornecedores e Histórico de Relacionamento</p>
        </div>
        <Button
          onClick={() => setModalOpen('isCadastroRapidoOpen', true)}
        >
          Novo Cadastro
          <Plus className="w-4 h-4" />
        </Button>

      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border-2 border-neutral-100 p-6 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Total Entidades</p>
            <p className="text-2xl font-black text-neutral-900">{entidades.length}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Users className="w-6 h-6" /></div>
        </div>
        <div className="bg-white border-2 border-neutral-100 p-6 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Clientes Ativos</p>
            <p className="text-2xl font-black text-emerald-600">{entidades.filter(e => e.tipo === 'cliente').length}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
        </div>
        <div className="bg-white border-2 border-neutral-100 p-6 rounded-3xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Fornecedores Ativos</p>
            <p className="text-2xl font-black text-amber-600">
              {entidades.filter(e => e.tipo === 'fornecedor').length}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><Building className="w-6 h-6" /></div>
        </div>

      </div>

      <div className="bg-white border-2 border-neutral-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-neutral-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-neutral-50/30">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input 
              type="text" 
              placeholder="Pesquisar por nome ou documento..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 pl-11 pr-4 bg-white border-2 border-neutral-100 rounded-xl text-xs font-bold focus:border-primary outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={tipoFilter} 
              onChange={(e) => setTipoFilter(e.target.value as any)}
              className="h-11 px-4 bg-white border-2 border-neutral-100 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer"
            >
              <option value="all">Todos os Tipos</option>
              <option value="cliente">Clientes</option>
              <option value="fornecedor">Fornecedores</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest">
                <th className="py-4 px-8">Código</th>
                <th className="py-4 px-8">Entidade / Razão Social</th>
                <th className="py-4 px-8">CPF / CNPJ</th>
                <th className="py-4 px-8 text-center">Tipo</th>
                <th className="py-4 px-8 text-center">Status</th>
                <th className="py-4 px-8 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-bold">
              {paginated.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center opacity-40 uppercase tracking-widest font-black text-xs">Nenhum registro encontrado</td></tr>
              ) : (
                paginated.map(ent => (
                  <tr
                    key={ent.id}
                    onClick={() => handleOpenProfile(ent)}
                    className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all cursor-pointer group"
                  >
                    <td className="py-4 px-8">
                      <span className="text-primary font-black text-xs">#{(ent as any).codigo_sequencial || '-'}</span>
                    </td>
                    <td className="py-4 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center font-black uppercase group-hover:bg-primary/10 group-hover:text-primary transition-colors shadow-sm">
                          {ent.nome_razao_social.substring(0, 2)}
                        </div>
                        <div>
                          <p className="text-neutral-900 font-black uppercase tracking-tighter">{ent.nome_razao_social}</p>
                          <p className="text-[9px] text-neutral-400 lowercase font-medium">{ent.email || 'sem e-mail cadastrado'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-8 font-mono text-neutral-500">{ent.documento}</td>
                    <td className="py-4 px-8 text-center">
                      <span className={`rounded-lg px-3 py-1.5 uppercase font-black text-[9px] tracking-widest ${ent.tipo === 'cliente' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                        {ent.tipo}
                      </span>
                    </td>
                    <td className="py-4 px-8 text-center">
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-black uppercase text-[9px] ${ent.status_base === 'bpi' ? 'bg-red-50 text-alert-red' : 'bg-emerald-50 text-bank-truth-green'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ent.status_base === 'bpi' ? 'bg-alert-red' : 'bg-bank-truth-green'}`} />
                        {ent.status_base || 'Ativo'}
                      </span>
                    </td>
                    <td className="py-4 px-8 text-right">
                      {role === 'master' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteEntity(ent.id); }}
                          className="p-2 hover:bg-red-50 text-neutral-300 hover:text-alert-red rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="bg-neutral-50/50 px-8 py-4 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-neutral-400 font-bold text-[9px] uppercase tracking-widest">
            Exibindo {Math.min(filtered.length, itemsPerPage)} de {filtered.length} entidades
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
        {/* Profile Slide Panel */}
        {selectedEntity && (
          <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedEntity(null)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form 
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }} 
              transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
              onSubmit={handleUpdate}
              className="w-full md:w-[500px] h-full bg-white shadow-2xl flex flex-col relative z-20"
            >
              <header className="px-8 py-6 border-b border-neutral-100 bg-neutral-50 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-xl shadow-lg">
                      {profileNome.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">{profileNome}</h2>
                      <p className="text-[10px] text-neutral-400 font-mono">Edição de Perfil</p>
                    </div>
                  </div>

                  <button type="button" onClick={() => setSelectedEntity(null)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-10 space-y-10">
                {/* Form Section */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <User className="w-4 h-4" /> Informações do Cadastro
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome / Razão Social</label>
                      <input type="text" value={profileNome} onChange={(e) => setProfileNome(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">CPF / CNPJ</label>
                      <input type="text" value={profileDocumento} onChange={(e) => setProfileDocumento(maskCpfCnpj(e.target.value))} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all font-mono" placeholder="000.000.000-00" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Email Corporativo</label>
                        <input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Telefone</label>
                        <input type="text" value={profileTelefone} onChange={(e) => setProfileTelefone(maskPhone(e.target.value))} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" placeholder="(00) 00000-0000" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status na Base</label>
                      <select value={profileStatus} onChange={(e) => setProfileStatus(e.target.value as any)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none cursor-pointer appearance-none">
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                        <option value="bpi">BPI (Baixado)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Documents Section */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Documentos Vinculados ({existingDocuments.length})
                  </h3>
                  <div className="space-y-2">
                    {existingDocuments.length > 0 ? (
                      existingDocuments.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl group hover:border-primary/20 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-tight text-neutral-900">{doc.nome}</p>
                              <p className="text-[8px] text-neutral-400">{(doc.tamanho / 1024 / 1024).toFixed(2)} MB • PDF</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-white rounded-lg text-primary transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Excluir este documento?')) {
                                  const path = doc.url.split('documents/')[1];
                                  deleteDocument({ id: doc.id, path });
                                }
                              }}
                              className="p-2 hover:bg-white rounded-lg text-alert-red transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-3xl">
                        <FileText className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nenhum documento anexado</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <footer className="px-10 py-8 border-t border-neutral-100 bg-neutral-50/50 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setSelectedEntity(null)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors">Cancelar</button>
                <Button type="submit">
                  Atualizar
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </footer>

            </motion.form>
          </div>
        )}

        {/* Create Modal - Handled by global CadastroRapidoModal */}
      </AnimatePresence>
    </div>
  );
}
