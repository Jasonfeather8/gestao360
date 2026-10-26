import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Plus, Menu, LogOut, Bell, Check, Clock } from 'lucide-react';

import NotificationButton from './components/NotificationButton';

// Persisted store & services

import { useUIStore } from './store/uiStore';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useData';
import { RECORRENCIAS_HABILITADA } from './config/features';

// Custom layout components
import Sidebar from './components/Sidebar';
import NovoLancamentoDrawer from './components/NovoLancamentoDrawer';
import LancamentoDetailsSlide from './components/Lancamentos/LancamentoDetailsSlide';
import CadastroRapidoModal from './components/CadastroRapidoModal';
import BaixaLancamentoModal from './components/BaixaLancamentoModal';
import AprovacaoModal from './components/AprovacaoModal';
import PosLancamentoModal from './components/Conciliacao/PosLancamentoModal';
import AITestSuite from './components/AITestSuite';

import NewLaunchButton from './components/NewLaunchButton';

// Custom pages

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Lancamentos from './pages/Lancamentos';
import Conciliacao from './pages/Conciliacao';
import Recorrencias from './pages/Recorrencias';
import CRM from './pages/CRM';
import Cadastros from './pages/Cadastros';
import Configuracoes from './pages/Configuracoes';
import Notificacoes from './pages/Notificacoes';
import Pagar from './pages/Pagar';
import Receber from './pages/Receber';
import CofreLocal from './pages/CofreLocal';

// Create a client for React Query caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1050,
      retry: (failureCount, error: any) => {
        // Retry for 9 seconds total
        if (failureCount >= 2) return false;
        return true;
      },
      retryDelay: 4500, // 4.5s delay between retries = ~9s total
    }
  }
});

function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <NotificationButton
        unreadCount={unreadCount}
        onClick={handleToggle}
      />

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 bg-surface border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-low-low">
              <h3 className="text-xs font-black uppercase tracking-wider text-on-surface">Notificações</h3>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAllAsRead(); }}
                  className="text-[10px] font-bold text-primary hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}

            </div>
            <div className="max-h-[350px] overflow-y-auto scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant/40">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id);
                      if (n.link) {
                        // Navegação com Deep Link
                        navigate(n.link);
                      }
                      setIsOpen(false);
                    }}
                    className={`p-4 border-b border-surface-border hover:bg-neutral-50 transition-colors cursor-pointer relative ${!n.read ? 'bg-primary/5' : ''}`}
                  >
                    {!n.read && <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full"></div>}
                    <div className="flex flex-col gap-0.5">
                      <p className={`text-xs font-bold ${!n.read ? 'text-neutral-900' : 'text-neutral-500'}`}>{n.title}</p>
                      <p className="text-[11px] text-on-surface-variant line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] font-bold text-secondary uppercase tracking-tight">
                        <Clock className="w-3 h-3" />
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 bg-surface-low-low border-t border-surface-border text-center">
              <button
                onClick={() => { navigate('/notificacoes'); setIsOpen(false); }}
                className="text-[10px] font-bold text-secondary hover:text-primary transition-colors"
              >
                Ver todas as notificações
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function MasterRoute({ children }: { children: React.ReactNode }) {
  const { session, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'master') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { setModalOpen, setSelectedLancamentoIdForModal, isSidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { signOut } = useAuth();
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="*"
        element={
          <PrivateRoute>
            <div className={`flex h-screen bg-background text-on-background relative transition-all duration-300 overflow-hidden`}>
              {/* Nav rails */}
              <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} isCollapsed={isSidebarCollapsed} />

              {/* Content body space */}
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                
                {/* Fixed Top Bar */}
                <header className="h-16 bg-surface border-b border-surface-border flex items-center justify-between px-4 md:px-6 shrink-0 print:hidden select-none sticky top-0 z-40 shadow-sm">
                  <div className="flex items-center gap-3">
                    {/* Menu Toggle for desktop collapse */}
                    <button
                      type="button"
                      onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
                      className="p-2 -ml-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-secondary hidden lg:block transition-transform duration-300"
                      style={{ transform: isSidebarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                    {/* Menu Toggle for mobile/tablet */}
                    <button
                      type="button"
                      onClick={() => setMobileSidebarOpen(true)}
                      className="p-2 -ml-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-secondary lg:hidden block"
                      aria-label="Abrir menu"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-3">
                    <NotificationDropdown />
                    <NewLaunchButton
                      onClick={() => {
                        // "Novo Lançamento" é sempre criação: fecha a visão de um
                        // registro e descarta a seleção (edição/AVR) para o painel
                        // não abrir preenchido com os dados de uma conta existente.
                        setModalOpen('isComprovanteOpen', false);
                        setSelectedLancamentoIdForModal(null);
                        setModalOpen('isNovoLancamentoOpen', true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="p-2 text-secondary hover:text-alert-red transition-colors"
                      title="Sair"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>

                </header>

                {/* Core Page layout content container - SCROLLABLE AREA */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                  <div className="max-w-7xl mx-auto space-y-6">
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/lancamentos" element={<Lancamentos />} />
                      <Route path="/pagar" element={<Pagar />} />
                      <Route path="/receber" element={<Receber />} />
                      <Route path="/cofre-local" element={<CofreLocal />} />
                      <Route path="/crm" element={<CRM />} />

                      {/* Rota exclusiva do Master */}
                      <Route path="/conciliacao" element={<MasterRoute><Conciliacao /></MasterRoute>} />
                      {/* Destino do deep link de notificação de aprovação do Master. */}
                      <Route path="/aprovacao-master" element={<Navigate to="/conciliacao?aba=transferencias" replace />} />
                      <Route path="/recorrencias" element={RECORRENCIAS_HABILITADA ? <Recorrencias /> : <Navigate to="/dashboard" replace />} />
                      <Route path="/cadastros" element={<Cadastros />} />

                      {/* Rotas exclusivas do Master */}
                      <Route path="/configuracoes" element={<Configuracoes />} />
                      <Route path="/notificacoes" element={<Notificacoes />} />

                      {/* Rota desconhecida cai no painel, evitando área vazia em links antigos. */}
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </div>
                </main>

              </div>

              {/* Global Drawers & Slide Panels */}
              <NovoLancamentoDrawer />
              <LancamentoDetailsSlide />
              <CadastroRapidoModal />
              <BaixaLancamentoModal />
              <AprovacaoModal />
              <PosLancamentoModal />
              {/* <AITestSuite /> */}

            </div>

          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export { queryClient };