import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  UserPlus, 
  CheckCircle2, 
  Loader2, 
  MapPin, 
  FileText, 
  User, 
  Upload,
  Trash2,
  FileIcon,
  Search
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useEntidades } from '../hooks/useData';
import { supabase } from '@/integrations/supabase/client';
import Button from './Button';

type TabType = 'dados' | 'endereco' | 'documentos';

interface LocalFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

export default function CadastroRapidoModal() {
  const {
    isCadastroRapidoOpen,
    setModalOpen,
    entidadeFormDraft,
    setEntidadeFormDraft,
    lancamentoFormDraft,
    setLancamentoFormDraft,
    resetEntidadeFormDraft
  } = useUIStore();
  
  const { createEntity } = useEntidades();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dados');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  const maskCpfCnpj = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 11) {
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    } else {
      return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5').slice(0, 18);
    }
  };

  const maskCep = (value: string) => {
    return value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').slice(0, 9);
  };

  const maskPhone = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 10) {
      return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    } else {
      return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
  };

  const handleCepBlur = async () => {
    const cep = entidadeFormDraft.cep.replace(/\D/g, '');
    if (cep.length === 8) {
      setIsSearchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setEntidadeFormDraft({
            endereco: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            uf: data.uf
          });
        }
      } catch (err) {
        console.error('Erro ao buscar CEP', err);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files) as File[];
      const newFiles: LocalFile[] = fileList.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        file: f
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const newEntityData = {
        tipo: (entidadeFormDraft.tipo || 'cliente') as any,
        tipo_pessoa: entidadeFormDraft.tipo_pessoa,
        nome_razao_social: entidadeFormDraft.nome_razao_social,
        documento: entidadeFormDraft.documento || null,
        email: entidadeFormDraft.email || null,
        telefone: entidadeFormDraft.telefone || null,
        cep: entidadeFormDraft.cep || null,
        endereco: entidadeFormDraft.endereco || null,
        numero: entidadeFormDraft.numero || null,
        complemento: entidadeFormDraft.complemento || null,
        bairro: entidadeFormDraft.bairro || null,
        cidade: entidadeFormDraft.cidade || null,
        uf: entidadeFormDraft.uf || null,
        status_base: 'ativo',
        status_sincronizacao: true,
        user_id: user?.id
      };

      const newEntity = await createEntity(newEntityData as any);

      // Handle file uploads if any
      if (newEntity && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const fileItem = files[i] as LocalFile;
          const fileExt = fileItem.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `entidades/${(newEntity as any).id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, fileItem.file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('documents')
              .getPublicUrl(filePath);

            await (supabase.from('entidade_documentos') as any).insert({
              entidade_id: (newEntity as any).id,
              nome: fileItem.name,
              url: publicUrl,
              tamanho: fileItem.size,
              tipo_arquivo: fileItem.type,
              user_id: user?.id
            });
          }
        }
      }

      // Limpa apenas o rascunho da entidade: o rascunho do painel de lançamento
      // em andamento é preservado (só a nova entidade passa a ser selecionada).
      resetEntidadeFormDraft();

      // Auto-select in the launch form
      if (newEntity) {
        setLancamentoFormDraft({
          tipo: lancamentoFormDraft.tipo,
          entidade_id: (newEntity as any).id
        });
      }

      setFiles([]);
      setActiveTab('dados');
      setModalOpen('isCadastroRapidoOpen', false);
    } catch (err) {
      console.error(err);
      alert('Erro ao criar entidade. Verifique se os campos estão corretos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isCadastroRapidoOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={() => setModalOpen('isCadastroRapidoOpen', false)} 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs" 
          />
          <motion.form 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.9, opacity: 0 }} 
            onSubmit={handleCreate}
            className="bg-white w-full max-w-[500px] rounded-3xl shadow-2xl border-2 border-neutral-100 flex flex-col relative z-20 overflow-hidden"
          >
            <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-neutral-900">Cadastro do Colaborador</h2>
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">Inserir Novo Registro Profissional</span>
                </div>
              </div>
              <button type="button" onClick={() => setModalOpen('isCadastroRapidoOpen', false)} className="p-2 hover:bg-neutral-200 rounded-xl transition-colors">
                <X className="w-6 h-6" />
              </button>
            </header>

            {/* Tabs Navigation */}
            <div className="flex border-b border-neutral-100 px-4 bg-white select-none">
              <button 
                type="button"
                onClick={() => setActiveTab('dados')}
                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all flex items-center justify-center gap-2 ${activeTab === 'dados' ? 'border-primary text-primary' : 'border-transparent text-neutral-400'}`}
              >
                <User className="w-3.5 h-3.5" />
                Dados do Colaborador
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('endereco')}
                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all flex items-center justify-center gap-2 ${activeTab === 'endereco' ? 'border-primary text-primary' : 'border-transparent text-neutral-400'}`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Endereço
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('documentos')}
                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all flex items-center justify-center gap-2 ${activeTab === 'documentos' ? 'border-primary text-primary' : 'border-transparent text-neutral-400'}`}
              >
                <FileText className="w-3.5 h-3.5" />
                Documentos
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {activeTab === 'dados' && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Nome do Colaborador <span className="text-alert-red">*</span></label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Informe o nome do colaborador"
                      value={entidadeFormDraft.nome_razao_social} 
                      onChange={(e) => setEntidadeFormDraft({ nome_razao_social: e.target.value })}
                      className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Tipo do Colaborador</label>
                      <select 
                        value={entidadeFormDraft.tipo} 
                        onChange={(e) => setEntidadeFormDraft({ tipo: e.target.value as any })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none cursor-pointer appearance-none"
                      >
                        <option value="cliente">Cliente</option>
                        <option value="fornecedor">Fornecedor</option>
                        <option value="ambos">Ambos</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Tipo de Pessoa</label>
                      <div className="flex bg-neutral-100 rounded-xl p-1 h-12">
                        <button 
                          type="button" 
                          onClick={() => setEntidadeFormDraft({ tipo_pessoa: 'PF' })}
                          className={`flex-1 text-[10px] font-black rounded-lg uppercase tracking-widest transition-all ${entidadeFormDraft.tipo_pessoa === 'PF' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
                        >
                          Pessoa Física
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setEntidadeFormDraft({ tipo_pessoa: 'PJ' })}
                          className={`flex-1 text-[10px] font-black rounded-lg uppercase tracking-widest transition-all ${entidadeFormDraft.tipo_pessoa === 'PJ' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
                        >
                          Pessoa Jurídica
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">CPF / CNPJ <span className="text-alert-red">*</span></label>
                    <input
                      type="text"
                      required
                      value={entidadeFormDraft.documento}
                      onChange={(e) => setEntidadeFormDraft({ documento: maskCpfCnpj(e.target.value) })}
                      className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all font-mono"
                      placeholder={entidadeFormDraft.tipo_pessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">E-mail</label>
                      <input 
                        type="email" 
                        placeholder="Informe o e-mail de contato"
                        value={entidadeFormDraft.email} 
                        onChange={(e) => setEntidadeFormDraft({ email: e.target.value })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Telefone</label>
                      <input 
                        type="text" 
                        placeholder="(__) ____-____"
                        value={entidadeFormDraft.telefone} 
                        onChange={(e) => setEntidadeFormDraft({ telefone: maskPhone(e.target.value) })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'endereco' && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">CEP</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="00000-000"
                          value={entidadeFormDraft.cep} 
                          onChange={(e) => setEntidadeFormDraft({ cep: maskCep(e.target.value) })}
                          onBlur={handleCepBlur}
                          className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                        />
                        {isSearchingCep && <Loader2 className="w-4 h-4 animate-spin absolute right-4 top-1/2 -translate-y-1/2 text-primary" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">UF</label>
                      <input 
                        type="text" 
                        maxLength={2}
                        placeholder="Ex: SP"
                        value={entidadeFormDraft.uf} 
                        onChange={(e) => setEntidadeFormDraft({ uf: e.target.value.toUpperCase() })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Endereço</label>
                    <input 
                      type="text" 
                      placeholder="Exemplo: Rua das Flores"
                      value={entidadeFormDraft.endereco} 
                      onChange={(e) => setEntidadeFormDraft({ endereco: e.target.value })}
                      className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Número</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 123"
                        value={entidadeFormDraft.numero} 
                        onChange={(e) => setEntidadeFormDraft({ numero: e.target.value })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Complemento</label>
                      <input 
                        type="text" 
                        placeholder="Apto 101, Bloco A"
                        value={entidadeFormDraft.complemento} 
                        onChange={(e) => setEntidadeFormDraft({ complemento: e.target.value })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Bairro</label>
                      <input 
                        type="text" 
                        placeholder="Exemplo: Centro"
                        value={entidadeFormDraft.bairro} 
                        onChange={(e) => setEntidadeFormDraft({ bairro: e.target.value })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Cidade</label>
                      <input 
                        type="text" 
                        placeholder="Exemplo: São Paulo"
                        value={entidadeFormDraft.cidade} 
                        onChange={(e) => setEntidadeFormDraft({ cidade: e.target.value })}
                        className="w-full h-12 bg-neutral-50 border-2 border-neutral-100 rounded-2xl px-5 text-xs font-black outline-none focus:border-primary transition-all" 
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'documentos' && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Carregar Documentos</label>
                    <div className="relative group cursor-pointer h-32 border-2 border-dashed border-neutral-200 rounded-3xl hover:border-primary transition-all flex flex-col items-center justify-center gap-3 text-secondary hover:text-primary bg-neutral-50/50">
                      <Upload className="w-8 h-8" />
                      <div className="text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest">Clique ou arraste arquivos</p>
                        <p className="text-[9px] font-bold opacity-50 uppercase mt-1">PDF, JPG, PNG (Max 5MB)</p>
                      </div>
                      <input 
                        type="file" 
                        multiple
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Lista de Documentos ({files.length})</label>
                    <div className="space-y-2 min-h-[100px]">
                      {files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30">
                          <FileIcon className="w-8 h-8 mb-2" />
                          <p className="text-[10px] font-black uppercase">Não há documentos</p>
                        </div>
                      ) : (
                        files.map((f: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-neutral-50 border-2 border-neutral-100 rounded-2xl group hover:border-primary/30 transition-all">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-primary">
                                <FileIcon className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-black text-neutral-900 truncate max-w-[200px]">{f.name}</span>
                                <span className="text-[9px] font-bold text-neutral-400">{(f.size / 1024).toFixed(1)} KB</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="p-2 text-neutral-300 hover:text-alert-red transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <footer className="px-10 py-8 border-t border-neutral-100 bg-neutral-50/50 flex justify-end gap-4">
              <button 
                type="button" 
                onClick={() => setModalOpen('isCadastroRapidoOpen', false)} 
                className="px-6 py-2 font-black text-[10px] uppercase tracking-widest text-neutral-500"
              >
                Cancelar
              </button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isSubmitting ? 'Salvando...' : 'Adicionar Colaborador'}
              </Button>
            </footer>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}
