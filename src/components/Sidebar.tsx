import React, { useEffect, useState } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';
import {
  Coins,
  Settings,
  LayoutDashboard,
  FileSpreadsheet,
  UserSquare2,
  ShieldCheck,
  X,
  Repeat,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  Wallet
} from 'lucide-react';

import { useUIStore, TabType } from '../store/uiStore';
import { useAuth } from '../hooks/useAuth';
import { RECORRENCIAS_HABILITADA } from '../config/features';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
}

export default function Sidebar({ isOpen, onClose, isCollapsed }: SidebarProps) {
  const {
    setActiveTab,
  } = useUIStore();

  const { user, role } = useAuth();

  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { id: 'dashboard' as TabType, label: 'Painel Geral', icon: LayoutDashboard, path: '/dashboard', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'pagar' as TabType, label: 'Contas a Pagar', icon: ArrowDownLeft, path: '/pagar', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'receber' as TabType, label: 'Contas a Receber', icon: ArrowUpRight, path: '/receber', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'lancamentos' as TabType, label: 'Financeiro / Extrato', icon: Coins, path: '/lancamentos', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'conciliacao' as TabType, label: 'Conciliação Bancária', icon: FileSpreadsheet, path: '/conciliacao', roles: ['master'] },
    { id: 'cofre-local' as TabType, label: 'Cofre Local', icon: Wallet, path: '/cofre-local', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'recorrencias' as TabType, label: 'Gestão de Recorrências', icon: Repeat, path: '/recorrencias', roles: ['master', 'gerente'] },
    { id: 'crm' as TabType, label: 'CRM & Entidades', icon: UserSquare2, path: '/crm', roles: ['master', 'gerente', 'colaborador'] },
    { id: 'cadastros' as TabType, label: 'Estrutura & Cadastros', icon: ShieldCheck, path: '/cadastros', roles: ['master', 'gerente'] },
    { id: 'configuracoes' as TabType, label: 'Configurações', icon: Settings, path: '/configuracoes', roles: ['master'] }
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs z-45 lg:hidden"
        />
      )}

      <aside
        className={`bg-surface border-r border-surface-border flex flex-col h-screen lg:shrink-0 lg:sticky lg:top-0 focus-none select-none print:hidden z-50 transition-all duration-300
          fixed inset-y-0 left-0 lg:static lg:translate-x-0
          ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        `}
        id="main-sidebar-rail"
      >
        {/* Product branding */}
        <div className={`p-6 border-b border-surface-border flex items-center transition-all ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary font-black text-lg shadow-sm font-sans tracking-tighter shrink-0">
              G
            </div>
            {!isCollapsed && (
              <div className="animate-fade-in whitespace-nowrap overflow-hidden">
                <span className="font-extrabold text-sm tracking-tight text-on-background block">Gestão 360</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-primary block">CFO ERP Headquarters</span>
              </div>
            )}
          </div>

          {/* Close Button on mobile */}
          <button
            onClick={onClose}
            className={`p-1 px-2 rounded-lg text-secondary hover:bg-neutral-100 lg:hidden ${isCollapsed ? 'hidden' : ''}`}
            aria-label="Fechar Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className={`flex-1 p-4 space-y-1.5 scrollbar-thin ${isCollapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
          {/* Controle de exibição da tela de recorrências em ../config/features. */}
          {navItems.filter((item) => item.roles.includes(role) && (RECORRENCIAS_HABILITADA || item.path !== '/recorrencias')).map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setActiveTab(item.id);
                  onClose();
                }}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all text-left group ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-extrabold shadow-xs'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <Icon className={`shrink-0 transition-all ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                {!isCollapsed && <span className="animate-fade-in whitespace-nowrap overflow-hidden">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer controls */}
        <div className={`p-4 border-t border-surface-border bg-surface-container-low space-y-4 transition-all overflow-hidden ${isCollapsed ? 'items-center flex flex-col' : ''}`}>
          {/* User profile preview */}
          {user && (
            <div className={`p-2.5 rounded-lg border border-surface-border bg-surface flex items-center gap-2.5 shadow-xs transition-all ${isCollapsed ? 'justify-center w-12 h-12 p-0' : 'w-full'}`}>
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1 animate-fade-in overflow-hidden">
                  <span className="font-bold text-xs text-on-background truncate block" title={user.email}>
                    {user.user_metadata?.nome || user.email}
                  </span>
                  <span className="text-[10px] capital font-bold text-on-surface-variant uppercase tracking-wider block">
                    {role || 'Colaborador'}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className={`flex items-center transition-all ${isCollapsed ? 'flex-col gap-4' : 'justify-between pt-1'}`}>
            {!isCollapsed && <span className="text-[9px] font-bold text-on-surface-variant/40 animate-fade-in">v3.6.0 Stable</span>}
          </div>
        </div>
      </aside>
    </>
  );
}