import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  History, 
  Database, 
  UserCheck, 
  Search, 
  ShieldAlert, 
  User, 
  X,
  FileCode,
  Check,
  UserPlus,
  Filter,
  Download,
  Calendar,
  DollarSign,
  Briefcase,
  FileText,
  Mail,
  Info,
  ChevronLeft,
  ChevronRight,
  Upload,
  Clock,
  Eye,
  Key,
  Webhook,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useUsuarios, useAuditoriaLogs } from '../hooks/useData';
import { useUIStore } from '../store/uiStore';
import { UserPerfil, AuditoriaLog } from '../types';
import { useDragScroll } from '../hooks/useDragScroll';
import { supabase } from '@/integrations/supabase/client';

export default function Configuracoes() {
  const dragScrollTabs = useDragScroll();
  const { data: usuarios = [], inviteUser, updateUser, isInviting } = useUsuarios();
  const { data: auditLogs = [], isLoading: loadingAudit } = useAuditoriaLogs();

  const { 
    activeConfigSubTab, 
    setActiveConfigSubTab, 
    currentUserId, 
    setCurrentUserId,
    isNovoUsuarioOpen,
    isLegacyImportOpen,
    setModalOpen
  } = useUIStore();

  const [teamSearch, setTeamSearch] = useState('');
  const [teamPage, setTeamPage] = useState(1);

  const [newUserNome, setNewUserNome] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newUserPerfil, setNewUserPerfil] = useState<UserPerfil>('colaborador');

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const [auditSearchUser, setAuditSearchUser] = useState('all');
  const [auditSearchAction, setAuditSearchAction] = useState('all');
  const [auditStartDate, setAuditStartDate] = useState('2023-10-01');
  const [auditEndDate, setAuditEndDate] = useState('2023-10-31');
  const [auditPage, setAuditPage] = useState(1);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditoriaLog | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedCSVFile, setSelectedCSVFile] = useState<File | null>(null);
  const [isImportingProgress, setIsImportingProgress] = useState(false);

  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  const activeUserProfile = usuarios.find(u => u.id === currentUserId);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleConnected(true);
        showToast('Conta do Google conectada com sucesso!', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) throw new Error('Auth error');
      const { url } = await response.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (error) {
      showToast('Erro ao conectar Google.', 'error');
    }
  };

  const filteredUsers = useMemo(() => {
    return usuarios.filter(u => {
      const matchQuery = teamSearch.toLowerCase();
      const nome = (u.nome || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return nome.includes(matchQuery) || email.includes(matchQuery);
    });
  }, [usuarios, teamSearch]);

  const paginatedUsers = useMemo(() => {
    const start = (teamPage - 1) * 50;
    return filteredUsers.slice(start, start + 50);
  }, [filteredUsers, teamPage]);

  const finalAuditLogs = useMemo(() => {
    const actualLogsMapped = auditLogs.map((log: any) => {
      const user = usuarios.find(u => u.id === log.usuario_id);
      return {
        ...log,
        usuario_nome: user?.nome || 'Sistema',
        usuario_avatar_letter: user && user.nome ? user.nome.split(' ').map((n: string) => n[0]).join('').substring(0, 2) : 'SY',
        usuario_avatar_color: 'bg-slate-500',
        acao_label: log.acao === 'INSERT' ? 'Novo Registro' : log.acao === 'UPDATE' ? 'Atualização' : 'Exclusão',
        acao_badge_color: log.acao === 'INSERT' ? 'bg-green-100 text-green-800' : log.acao === 'UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800',
        acao_dot_color: log.acao === 'INSERT' ? 'bg-emerald-500' : log.acao === 'UPDATE' ? 'bg-blue-500' : 'bg-red-500',
        modulo: 'Financeiro',
        data_hora: log.data_hora.substring(0, 19).replace('T', ' ')
      };
    });

    return actualLogsMapped.filter(log => {
      if (auditSearchAction !== 'all' && log.acao !== auditSearchAction) return false;
      if (auditStartDate && log.data_hora.split(' ')[0] < auditStartDate) return false;
      if (auditEndDate && log.data_hora.split(' ')[0] > auditEndDate) return false;
      return true;
    });
  }, [auditLogs, usuarios, auditSearchAction, auditStartDate, auditEndDate]);

  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * 50;
    return finalAuditLogs.slice(start, start + 50);
  }, [finalAuditLogs, auditPage]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserNome || !newUserEmail || !newUserPassword) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Token de autenticação não encontrado.');

      const response = await fetch('https://rfjolkadxfixxagpidws.supabase.co/functions/v1/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          nome: newUserNome,
          role: newUserPerfil,
          telefone: ''
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro desconhecido ao criar usuário.');
      }

      setNewUserNome('');
      setNewUserEmail('');
      setNewUserPassword('');
      setShowPassword(false);
      setModalOpen('isNovoUsuarioOpen', false);
      showToast('Usuário cadastrado com sucesso!', 'success');
      
      // Recarregar a lista se necessário (opcional, pode depender do polling)
      window.location.reload();
    } catch (err: any) {
      showToast('Erro: ' + err.message, 'error');
    }
  };

  const handleToggleUserActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateUser({ id, data: { status: !currentStatus } });
      showToast('Status atualizado!', 'success');
    } catch (err: any) {
      showToast('Erro ao atualizar status.', 'error');
    }
  };

  const handleRoleChange = async (id: string, newRole: UserPerfil) => {
    try {
      await updateUser({ id, data: { perfil: newRole } });
      showToast('Perfil atualizado!', 'success');
    } catch (err: any) {
      showToast('Erro ao atualizar perfil.', 'error');
    }
  };

  const executeLegacyCSVImport = () => {
    if (!selectedCSVFile) return;
    setIsImportingProgress(true);
    setTimeout(() => {
      setIsImportingProgress(false);
      setModalOpen('isLegacyImportOpen', false);
      setSelectedCSVFile(null);
      showToast('Dados legados importados!', 'success');
    }, 3000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedCSVFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedCSVFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hierarchy simulator */}
      <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase text-primary tracking-widest block">Simulador de Hierarquia</span>
          <p className="text-xs font-bold text-neutral-500">Usuário ativo: <span className="text-neutral-900">{activeUserProfile?.nome || 'Sistema'} ({activeUserProfile?.perfil?.toUpperCase() || 'MASTER'})</span></p>

        </div>
        <select value={currentUserId} onChange={(e) => { setCurrentUserId(e.target.value); setTeamPage(1); }} className="bg-white border-2 border-neutral-200 text-xs font-black rounded-lg px-4 py-2 appearance-none cursor-pointer focus:border-primary outline-none">
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.perfil})</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div ref={dragScrollTabs.ref} {...dragScrollTabs.props} className="flex border-b border-neutral-200 overflow-x-auto scrollbar-none whitespace-nowrap">
        <button onClick={() => setActiveConfigSubTab('equipe')} className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeConfigSubTab === 'equipe' ? 'border-primary text-primary' : 'border-transparent text-neutral-400 hover:text-neutral-900'}`}>Equipe</button>
      </div>

      {/* Team tab */}
      {(activeConfigSubTab === 'equipe' || true) && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">Gestão de Equipe</h1>
            <button onClick={() => setModalOpen('isNovoUsuarioOpen', true)} className="px-6 py-3 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-neutral-800 transition-all flex items-center gap-2"><UserPlus className="w-4 h-4" /> Novo Usuário</button>
          </div>

          <div className="bg-white border-2 border-neutral-100 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-neutral-100 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:max-w-md"><Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" /><input type="text" placeholder="Pesquisar..." value={teamSearch} onChange={(e) => { setTeamSearch(e.target.value); setTeamPage(1); }} className="w-full h-11 pl-11 pr-4 bg-neutral-50 border-2 border-neutral-100 rounded-xl text-xs font-bold focus:border-primary transition-all outline-none" /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-neutral-50 text-neutral-400 border-b border-neutral-100 text-[9px] font-black uppercase tracking-widest"><th className="py-4 px-8">Usuário</th><th className="py-4 px-8">Nível</th><th className="py-4 px-8 text-center">Status</th><th className="py-4 px-8 text-right">Cargo</th></tr></thead>
                <tbody className="text-[11px] font-bold">
                  {usuarios.length === 0 ? <tr><td colSpan={4} className="py-20 text-center opacity-40 uppercase tracking-widest">Nenhum usuário</td></tr> :
                  usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-all">
                      <td className="py-4 px-8"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black uppercase shadow-sm">{(u.nome || u.email || 'U').substring(0, 2)}</div><div><p className="text-neutral-900 font-black uppercase tracking-tighter">{u.nome || 'Pendente'}</p><p className="text-[10px] text-neutral-400 lowercase">{u.email}</p></div></div></td>
                      <td className="py-4 px-8"><span className="rounded-lg bg-neutral-100 text-neutral-600 px-3 py-1.5 uppercase font-black text-[9px] tracking-widest">{u.perfil || 'colaborador'}</span></td>
                      <td className="py-4 px-8 text-center"><button onClick={() => handleToggleUserActive(u.id, u.status)} className={`w-12 h-6 rounded-full p-1 transition-all ${u.status ? 'bg-bank-truth-green' : 'bg-neutral-200'}`}><div className={`w-4 h-4 bg-white rounded-full transition-all ${u.status ? 'ml-6' : 'ml-0'}`} /></button></td>
                      <td className="py-4 px-8 text-right"><select value={u.perfil || 'colaborador'} onChange={(e) => handleRoleChange(u.id, e.target.value as any)} className="bg-white border-2 border-neutral-100 rounded-lg text-[10px] font-black uppercase px-3 py-2 focus:border-primary outline-none cursor-pointer"><option value="colaborador">Analista</option><option value="gerente">Gestor</option><option value="master">Master</option></select></td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals with AnimatePresence */}
      <AnimatePresence>
        {isNovoUsuarioOpen && (
          <div key="config-novo-usuario" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen('isNovoUsuarioOpen', false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.form initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onSubmit={handleInviteSubmit} className="bg-white w-full max-w-[480px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm"><UserPlus className="w-6 h-6" /></div><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">Novo Convite</h2></div><button type="button" onClick={() => setModalOpen('isNovoUsuarioOpen', false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome Completo</label><input type="text" required placeholder="João da Silva" value={newUserNome} onChange={(e) => setNewUserNome(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none transition-all" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">E-mail Corporativo</label><input type="email" required placeholder="joao@empresa.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none transition-all" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Senha Provisória</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} required placeholder="Mínimo 6 caracteres" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl pl-5 pr-12 text-xs font-black focus:border-primary outline-none transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 transition-colors">
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Cargo e Acesso</label><select value={newUserPerfil} onChange={(e) => setNewUserPerfil(e.target.value as any)} className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black focus:border-primary outline-none appearance-none cursor-pointer"><option value="colaborador">Colaborador</option><option value="gerente">Gerente</option><option value="master">Master Admin</option></select></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen('isNovoUsuarioOpen', false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Voltar</button><button type="submit" className="px-8 py-3 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg hover:bg-neutral-800 transition-all">Criar Usuário</button></footer>

            </motion.form>
          </div>
        )}

        {isLegacyImportOpen && (
          <div key="config-importacao-legado" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isImportingProgress && setModalOpen('isLegacyImportOpen', false)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-[550px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50"><h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">Migração de Dados Legados</h2><button type="button" disabled={isImportingProgress} onClick={() => setModalOpen('isLegacyImportOpen', false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors disabled:opacity-30"><X className="w-6 h-6" /></button></header>
              <div className="p-10 space-y-8">
                <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`border-4 border-dashed rounded-3xl p-12 flex flex-col items-center gap-4 transition-all ${dragActive ? 'border-primary bg-primary/5' : 'border-neutral-100 bg-neutral-50 hover:bg-neutral-100'}`}><input type="file" id="legacy-file-input" accept=".csv" onChange={handleFileSelect} className="hidden" /><label htmlFor="legacy-file-input" className="cursor-pointer flex flex-col items-center gap-4"><div className="w-16 h-16 rounded-2xl bg-white border-2 border-neutral-100 shadow-sm flex items-center justify-center text-neutral-400"><Upload className="w-8 h-8" /></div><p className="text-[10px] font-black uppercase tracking-widest text-neutral-800">{selectedCSVFile ? selectedCSVFile.name : 'Selecione o arquivo .csv'}</p></label></div>
                <div className="p-6 bg-neutral-50 rounded-2xl border-2 border-neutral-100 flex items-start gap-4"><Info className="w-6 h-6 text-primary shrink-0" /><p className="text-xs font-bold text-neutral-600 leading-relaxed uppercase tracking-tighter">Lançamentos importados serão aprovados e conciliados automaticamente para manter o histórico fiscal íntegro.</p></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50/50 flex justify-end gap-3"><button type="button" disabled={isImportingProgress} onClick={() => setModalOpen('isLegacyImportOpen', false)} className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500">Cancelar</button><button type="button" onClick={executeLegacyCSVImport} disabled={isImportingProgress || !selectedCSVFile} className="px-8 py-3 bg-[#f3b233] text-on-background font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg border-2 border-[#df9d1d] hover:bg-[#e2a225] transition-all disabled:opacity-50">{isImportingProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Processar Carga'}</button></footer>
            </motion.div>
          </div>
        )}

        {selectedAuditLog && (
          <div key="config-log-auditoria" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedAuditLog(null)} className="absolute inset-0 bg-black/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-[500px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden">
              <header className="px-8 py-6 border-b border-neutral-50 flex justify-between items-center bg-neutral-50"><div className="flex items-center gap-3"><ShieldAlert className="w-6 h-6 text-primary" /><h3 className="text-xs font-black uppercase tracking-widest text-neutral-900">Inspetor de Auditoria</h3></div><button onClick={() => setSelectedAuditLog(null)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors"><X className="w-5 h-5" /></button></header>
              <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2"><span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest block">Metadados Origem</span><div className="bg-neutral-50 p-6 rounded-2xl border-2 border-neutral-100 font-mono text-[10px] text-neutral-700 leading-relaxed whitespace-pre-wrap select-text">{JSON.stringify(selectedAuditLog.dados_novos || selectedAuditLog.dados_anteriores, null, 2)}</div></div>
                <div className="p-6 bg-amber-50 rounded-2xl border-2 border-amber-100 text-[10px] font-black uppercase tracking-widest text-amber-800 flex gap-4"><Info className="w-6 h-6 shrink-0" /><p>Esses dados são protegidos por criptografia e assinados pelo operador no ato da transação.</p></div>
              </div>
              <footer className="px-10 py-8 border-t border-neutral-50 bg-neutral-50 flex justify-end"><button onClick={() => setSelectedAuditLog(null)} className="px-10 py-3 bg-neutral-900 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl">Concluído</button></footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Portal */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none select-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} className="pointer-events-auto p-5 rounded-2xl border-2 shadow-2xl flex items-start gap-4 bg-white border-neutral-100">
              <div className="shrink-0 mt-1">{toast.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <XCircle className="w-6 h-6 text-alert-red" />}</div>
              <div><p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-1">{toast.type}</p><p className="text-xs font-black text-neutral-900">{toast.message}</p></div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
