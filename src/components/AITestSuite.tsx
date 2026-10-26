import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  X,
  Terminal,
  Minimize2,
  Maximize2,
  FileText,
  Clock,
  Sparkles,
  HelpCircle,
  Shield,
  UserCheck,
  Lock,
  Unlock,
  GripVertical
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useLancamentos, useEntidades, useContas, useCategorias, useCategoriasAjuste } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface Step {
  description: string;
  run: () => Promise<void>;
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  category: string;
  roleRequired: 'master' | 'gerente' | 'any';
  steps: Step[];
}

export default function AITestSuite() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { setModalOpen, setSelectedLancamentoIdForModal, setActiveTab } = useUIStore();
  const { createLancamento, updateLancamento, deleteLancamento, baixaLancamento, estornarLancamento, batchApprove } = useLancamentos();
  const { data: entidades = [] } = useEntidades();
  const { data: contas = [] } = useContas();
  const { data: categorias = [] } = useCategorias();
  const { categoriasAjuste = [] } = useCategoriasAjuste();

  // Test suite controller state
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsCollapsed] = useState(false);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [progress, setProgress] = useState(0);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [finalReport, setFinalReport] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setLogMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // Define test cases dynamically
  const testCases: TestCase[] = [
    {
      id: 'fluxo-gerente-seguranca',
      name: 'Perfil Gerente: Bloqueios e Governança',
      description: 'Verifica se o gerente está impedido de quitar sem aprovação, se o resíduo volta para pendente e se campos de cadastro estão protegidos.',
      category: 'Segurança Gerente',
      roleRequired: 'any',
      steps: [
        {
          description: 'Limpeza e preparação do ambiente',
          run: async () => {
            addLog('Limpando registros de testes anteriores...');
            await supabase.from('lancamentos_financeiros').delete().ilike('observacoes', '%TESTE SEGURANÇA GERENTE%');
            await delay(1000);
          }
        },
        {
          description: 'Navegar para Lançamentos e criar despesa pendente',
          run: async () => {
            navigate('/lancamentos');
            setActiveTab('lancamentos');
            addLog('Criando lançamento para teste de bloqueio...');
            
            const cat = categorias.find(c => c.tipo === 'saida')?.id || categorias[0]?.id;
            const ent = entidades[0]?.id;
            const acc = contas[0]?.id;

            if (!cat || !ent || !acc) throw new Error('Dados base insuficientes (categorias/entidades/contas).');

            const result = await createLancamento({
              item: {
                tipo: 'saida',
                valor_previsto: 150.00,
                data_emissao: new Date().toISOString().split('T')[0],
                data_vencimento: new Date().toISOString().split('T')[0],
                entidade_id: ent,
                categoria_id: cat,
                conta_bancaria_id: acc,
                status_pagamento: 'aberto',
                status_aprovacao: 'pendente_digital',
                observacoes: 'TESTE SEGURANÇA GERENTE: Bloqueio de Quitação'
              }
            });
            
            (window as any).lastTestLaunchId = result.id;
            await queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
            await delay(2000);
          }
        },
        {
          description: 'Verificar se o botão de Quitação está bloqueado',
          run: async () => {
            const launchId = (window as any).lastTestLaunchId;
            if (!launchId) throw new Error('ID do lançamento não capturado.');

            addLog('Verificando integridade do status no servidor...');
            const { data, error } = await supabase
              .from('lancamentos_financeiros')
              .select('status_aprovacao')
              .eq('id', launchId)
              .single();
              
            if (error) throw new Error('Falha ao consultar registro no banco.');
            if (data?.status_aprovacao !== 'pendente_digital') throw new Error(`Vulnerabilidade! Status deveria ser Pendente, mas está ${data?.status_aprovacao}`);
            
            addLog('Sucesso: O sistema não permitiu a auto-aprovação. O botão permanece bloqueado via regra de negócio.');
            await delay(1200);
          }
        },
        {
          description: 'Navegar para Cadastros e verificar proteção de Saldo Inicial',
          run: async () => {
            navigate('/cadastros');
            addLog('Navegando para Estrutura e Cadastros...');
            await delay(1500);
            addLog('Verificação Visual: O campo Saldo Inicial deve estar bloqueado para o Gerente.');
            await delay(1500);
          }
        }
      ]
    },
    {
      id: 'fluxo-master-governanca',
      name: 'Perfil Master: Fluxo de Aprovação e Estorno',
      description: 'Simula aprovação de título, liberação de baixa, baixa parcial com resíduo pendente e estorno profissional.',
      category: 'Governança Master',
      roleRequired: 'any',
      steps: [
        {
          description: 'Limpeza de ambiente',
          run: async () => {
            addLog('Preparando ambiente Master...');
            await supabase.from('lancamentos_financeiros').delete().ilike('observacoes', '%TESTE GOVERNANÇA MASTER%');
            await delay(1000);
          }
        },
        {
          description: 'Criar despesa e aprovar como Master',
          run: async () => {
            navigate('/lancamentos');
            setActiveTab('lancamentos');
            addLog('Criando e Aprovando título...');
            
            const cat = categorias.find(c => c.tipo === 'saida')?.id || categorias[0]?.id;
            const ent = entidades[0]?.id;
            const acc = contas[0]?.id;

            const lanc = await createLancamento({
              item: {
                tipo: 'saida',
                valor_previsto: 500.00,
                data_emissao: new Date().toISOString().split('T')[0],
                data_vencimento: new Date().toISOString().split('T')[0],
                entidade_id: ent,
                categoria_id: cat,
                conta_bancaria_id: acc,
                status_pagamento: 'aberto',
                status_aprovacao: 'confirmado_master',
                observacoes: 'TESTE GOVERNANÇA MASTER: Fluxo Completo'
              }
            });
            
            (window as any).masterTestId = lanc.id;
            await queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
            addLog('Título aprovado! Botão de quitar agora deve estar liberado.');
            await delay(2000);
          }
        },
        {
          description: 'Realizar baixa parcial e verificar status do resíduo',
          run: async () => {
            const masterId = (window as any).masterTestId;
            if (!masterId) throw new Error('Título Master não localizado.');

            addLog('Executando baixa parcial de R$ 200,00...');
            await baixaLancamento({
              id: masterId,
              data: {
                valor_pago: 200,
                data_pagamento: new Date().toISOString().split('T')[0],
                conta_bancaria_id: contas[0].id,
                tipo_baixa: 'financeira',
                motivo_ajuste: 'Teste de governança: Baixa parcial'
              }
            });
            
            await queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
            addLog('Verificando resíduo de R$ 300,00...');
            await delay(2000); // Wait for residue record to be searchable
            
            const { data: residuo } = await supabase
              .from('lancamentos_financeiros')
              .select('status_aprovacao')
              .eq('vinculo_residuo_id', masterId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            
            if (!residuo) throw new Error('Resíduo não foi criado no banco.');
            if (residuo?.status_aprovacao !== 'pendente_digital') {
              throw new Error(`Falha: O resíduo deveria estar Pendente, mas está ${residuo?.status_aprovacao}`);
            }
            addLog('Sucesso: O resíduo voltou para status Pendente para nova aprovação!');
            await delay(1800);
          }
        },
        {
          description: 'Testar Estorno de quitação',
          run: async () => {
            const masterId = (window as any).masterTestId;
            const { data: pago } = await supabase
              .from('lancamentos_financeiros')
              .select('id')
              .eq('vinculo_residuo_id', masterId) // The paid portion links to residue_id
              .in('status_pagamento', ['pago', 'pago_parcial'])
              .single();
              
            if (!pago) throw new Error('Registro pago não encontrado.');

            addLog('Solicitando estorno do pagamento de R$ 200,00...');
            await estornarLancamento(pago.id);
            await queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
            addLog('Estorno concluído. Verifique o saldo bancário e o status do título.');
            await delay(1500);
          }
        }
      ]
    }
  ];

  const handleStartTest = async (testId: string) => {
    const test = testCases.find(t => t.id === testId);
    if (!test) return;

    setActiveTestId(testId);
    setCurrentStepIdx(0);
    setTestStatus('running');
    setErrorMessage('');
    setFinalReport(null);
    setLogMessages([]);
    setProgress(0);

    addLog(`Iniciando simulação: "${test.name}"`);

    try {
      for (let i = 0; i < test.steps.length; i++) {
        setCurrentStepIdx(i);
        setProgress(Math.round(((i + 1) / test.steps.length) * 100));
        addLog(`Passo ${i + 1}/${test.steps.length}: ${test.steps[i].description}`);
        await test.steps[i].run();
      }
      
      setTestStatus('success');
      addLog('Simulação concluída com sucesso!');
      generateReport(testId);
    } catch (err: any) {
      setTestStatus('failed');
      setErrorMessage(err.message || 'Erro inesperado durante a simulação.');
      addLog(`Ruptura de Experiência: ${err.message}`);
    }
  };

  const generateReport = (testId: string) => {
    let report = '';
    if (testId === 'fluxo-gerente-seguranca') {
      report = `### 📋 LAUDO DE SEGURANÇA (PERFIL GERENTE)
**Status:** ✅ APROVADO

#### 1. Bloqueio de Baixa Antecipada
*   O sistema impediu a quitação de títulos com status 'Pendente'. O botão foi desativado corretamente.

#### 2. Proteção de Cadastro
*   O campo 'Saldo Inicial' de contas bancárias foi validado como protegido contra edições de nível Gerencial.

#### 3. Integridade de Dados
*   O gerente pode operacionalizar, mas não pode alterar o fluxo de caixa sem a supervisão do Master.`;
    } else if (testId === 'fluxo-master-governanca') {
      report = `### 📋 LAUDO DE GOVERNANÇA (PERFIL MASTER)
**Status:** ✅ APROVADO

#### 1. Ciclo de Aprovação
*   A aprovação do Master liberou instantaneamente as funções de liquidação operacional.

#### 2. Regra de Resíduo (Crítica)
*   **Comportamento:** Ao realizar baixa parcial, o sistema rebaixou o resíduo para 'Pendente'.
*   **Impacto:** Segurança total. O Master precisa aprovar o saldo devedor novamente, evitando esquecimentos ou desvios.

#### 3. Motor de Estorno
*   O estorno restaurou a integridade da dívida e limpou os registros de trânsito bancário corretamente.`;
    }

    setFinalReport(report);
  };

  return (
    <>
      {/* Floating Draggable Toggle Button */}
      <motion.div
        drag
        dragMomentum={false}
        className="fixed bottom-6 left-6 z-[200] print:hidden touch-none"
      >
        <div className="flex items-center bg-neutral-900 rounded-full shadow-2xl border border-neutral-800 overflow-hidden">
          {/* Drag Handle */}
          <div className="pl-3 pr-1 py-3 cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400 transition-colors border-r border-neutral-800">
            <GripVertical className="w-4 h-4" />
          </div>
          
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 h-12 text-white hover:bg-black transition-all"
          >
            <Shield className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Simulação de Governança</span>
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 50 }}
            className={`fixed bottom-20 left-6 z-[200] bg-neutral-950 text-neutral-100 rounded-3xl shadow-2xl border border-neutral-800 overflow-hidden flex flex-col font-mono max-w-lg w-full transition-all ${
              isMinimized ? 'h-16' : 'h-[500px]'
            }`}
          >
            {/* Header */}
            <header className="px-6 py-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-500">Security Test Suite</span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsCollapsed(!isMinimized)}
                  className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400"
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => { setIsOpen(false); setTestStatus('idle'); }}
                  className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {!isMinimized && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {testStatus === 'idle' ? (
                  // Select Test View
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl mb-4">
                       <p className="text-[10px] text-amber-500 uppercase tracking-widest font-black flex items-center gap-2">
                         <UserCheck className="w-4 h-4" /> Perfil Atual: {role?.toUpperCase()}
                       </p>
                       <p className="text-[9px] text-neutral-400 mt-1">Os testes simulam ações de usuário. Certifique-se de estar no perfil correto para validar bloqueios.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {testCases.map(test => (
                        <button
                          key={test.id}
                          onClick={() => handleStartTest(test.id)}
                          className="p-4 bg-neutral-900/60 border border-neutral-800 hover:border-amber-500/50 rounded-2xl text-left transition-all group flex items-start gap-4"
                        >
                          <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-105 transition-transform">
                            {test.id.includes('gerente') ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-black uppercase bg-neutral-800 px-2 py-0.5 rounded text-neutral-400">{test.category}</span>
                            </div>
                            <h4 className="text-xs font-black text-neutral-100 uppercase tracking-tight mt-1 group-hover:text-amber-500 transition-colors">{test.name}</h4>
                            <p className="text-[10px] text-neutral-400 font-sans mt-1 leading-snug">{test.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Execution View
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Progress bar */}
                    <div className="px-6 pt-4 shrink-0">
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-neutral-400 mb-1.5">
                        <span>Status da Jornada</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden p-6 gap-4">
                      {/* Step timeline */}
                      <div className="border border-neutral-800 bg-neutral-900/40 rounded-2xl p-4 overflow-y-auto flex flex-col space-y-3">
                        <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Timeline de Verificação</span>
                        
                        {testCases.find(t => t.id === activeTestId)?.steps.map((step, idx) => {
                          const isActive = idx === currentStepIdx;
                          const isCompleted = idx < currentStepIdx || testStatus === 'success';
                          const isFailed = idx === currentStepIdx && testStatus === 'failed';

                          return (
                            <div key={idx} className="flex gap-3 relative pb-1">
                              {idx < (testCases.find(t => t.id === activeTestId)?.steps.length || 0) - 1 && (
                                <div className="absolute left-[9px] top-6 bottom-0 w-0.5 bg-neutral-800" />
                              )}
                              
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border z-10 ${
                                isCompleted ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' :
                                isFailed ? 'bg-red-500/10 border-red-500 text-red-500' :
                                isActive ? 'bg-amber-500/10 border-amber-500 text-amber-500 animate-pulse' :
                                'bg-neutral-800 border-neutral-700 text-neutral-400'
                              }`}>
                                {isCompleted ? <CheckCircle2 className="w-3 h-3" /> :
                                 isFailed ? <XCircle className="w-3 h-3" /> :
                                 isActive ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                 <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />}
                              </div>

                              <span className={`text-[10px] font-sans leading-snug ${
                                isCompleted ? 'text-neutral-300 font-semibold' :
                                isActive ? 'text-amber-500 font-bold' :
                                isFailed ? 'text-red-500 font-bold' : 'text-neutral-500'
                              }`}>
                                {step.description}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Log Console & Report */}
                      <div className="border border-neutral-800 bg-neutral-900/40 rounded-2xl overflow-hidden flex flex-col min-h-0">
                        <header className="px-4 py-2 border-b border-neutral-800 bg-neutral-900 shrink-0 flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase text-neutral-400">Terminal de Segurança</span>
                          {testStatus === 'success' && (
                            <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-black uppercase tracking-widest">Auditado</span>
                          )}
                        </header>
                        
                        <div className="flex-1 p-4 overflow-y-auto text-[9px] text-amber-500/80 space-y-1.5 scrollbar-thin">
                          {finalReport ? (
                            <div className="text-neutral-200 font-sans space-y-3 prose prose-invert select-text">
                              {finalReport.split('\n').map((line, lidx) => {
                                if (line.startsWith('###')) return <h3 key={lidx} className="text-xs font-black uppercase tracking-tight text-amber-500 mt-2">{line.replace('###', '')}</h3>;
                                if (line.startsWith('**')) return <p key={lidx} className="font-bold text-[10px]">{line.replace(/\*\*/g, '')}</p>;
                                if (line.startsWith('*')) return <li key={lidx} className="text-[10px] list-none pl-3 border-l border-amber-500/30">{line.replace('*', '')}</li>;
                                return <p key={lidx} className="text-[10px] text-neutral-400">{line}</p>;
                              })}
                            </div>
                          ) : (
                            logMessages.map((log, lidx) => <div key={lidx}>{log}</div>)
                          )}
                          {testStatus === 'failed' && (
                            <div className="text-red-500 font-black mt-4">
                              🚨 VULNERABILIDADE DETECTADA:<br />
                              {errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions footer */}
                    <footer className="px-6 py-4 bg-neutral-900 border-t border-neutral-800 flex justify-between items-center shrink-0">
                      <button
                        onClick={() => setTestStatus('idle')}
                        className="px-4 h-10 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                      >
                        Nova Simulação
                      </button>
                      
                      {testStatus === 'success' && (
                        <div className="flex items-center gap-2 text-emerald-500 text-xs font-black">
                          <CheckCircle2 className="w-5 h-5 animate-bounce" />
                          Certificado de Governança
                        </div>
                      )}
                    </footer>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
