import { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  Users,
  Building,
  CheckCircle2
} from 'lucide-react';
import { useEntidades } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { EntidadeNegocio } from '../types';
import Button from '../components/Button';

export default function CRM() {
  const { role } = useAuth();
  const { data: entidades = [], deleteEntity } = useEntidades();
  const { setModalOpen, setEntidadeFormDraft, setEntidadeEmEdicaoId } = useUIStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'cliente' | 'fornecedor'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

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

  // Abre o mesmo modal completo do cadastro, já preenchido com os dados da entidade.
  const handleOpenProfile = (ent: EntidadeNegocio) => {
    setEntidadeFormDraft({
      tipo: ent.tipo,
      tipo_pessoa: ent.tipo_pessoa || 'PF',
      nome_razao_social: ent.nome_razao_social,
      documento: ent.documento || '',
      email: ent.email || '',
      telefone: ent.telefone || '',
      cep: ent.cep || '',
      endereco: ent.endereco || '',
      numero: ent.numero || '',
      complemento: ent.complemento || '',
      bairro: ent.bairro || '',
      cidade: ent.cidade || '',
      uf: ent.uf || '',
      status_base: ent.status_base || 'ativo',
    });
    setEntidadeEmEdicaoId(ent.id);
    setModalOpen('isCadastroRapidoOpen', true);
  };

  const handleNovoCadastro = () => {
    setEntidadeEmEdicaoId(null);
    setModalOpen('isCadastroRapidoOpen', true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">CRM de Entidades</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Gestão de Clientes, Fornecedores e Histórico de Relacionamento</p>
        </div>
        <Button onClick={handleNovoCadastro}>
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
                <tr><td colSpan={6} className="py-20 text-center opacity-40 uppercase tracking-widest font-black text-xs">Nenhum registro encontrado</td></tr>
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
    </div>
  );
}
