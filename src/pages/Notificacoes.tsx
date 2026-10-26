import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Search, 
  Filter, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  X,
  AlertTriangle,
  Info,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useData';

export default function Notificacoes() {
  const navigate = useNavigate();
  // Estado para filtrar por mês (yyyy-MM)
  const [selectedMonth, setSelectedMonth] = useState('all');
  const { notifications, markAsRead, markAllAsRead } = useNotifications();

  const filteredNotifications = useMemo(() => {
    if (selectedMonth === 'all') return notifications;
    return notifications.filter(n => n.created_at.startsWith(selectedMonth));
  }, [notifications, selectedMonth]);

  const months = useMemo(() => {
    const list: string[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push(d.toISOString().split('-').slice(0, 2).join('-'));
    }
    return list;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-neutral-900">Centro de Notificações</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-1">Histórico completo de alertas e atividades do sistema</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="pl-9 pr-8 h-11 bg-white border-2 border-neutral-100 rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer appearance-none focus:border-primary transition-all"
            >
              <option value="all">Todas as Datas</option>
              {months.map(m => {
                const [year, month] = m.split('-');
                const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
          </div>
          
          {notifications.some(n => !n.read) && (
            <button 
              onClick={() => markAllAsRead()}
              className="px-5 h-11 bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all flex items-center gap-2 shadow-lg"
            >
              <Check className="w-4 h-4" /> Marcar Tudo
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border-2 border-neutral-100 rounded-3xl overflow-hidden shadow-sm min-h-[400px]">
        <div className="p-8 space-y-4">
          {filteredNotifications.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-4 opacity-40">
              <Bell className="w-12 h-12 text-neutral-300" />
              <p className="text-xs font-black uppercase tracking-widest">Nenhuma notificação encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((n) => (
                <div 
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={`p-5 rounded-2xl border-2 transition-all flex items-start gap-4 cursor-pointer hover:shadow-md group ${
                    !n.read ? 'bg-primary/5 border-primary/20' : 'bg-neutral-50 border-neutral-100 opacity-70'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    n.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                    n.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                    n.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {n.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                     n.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                     n.type === 'error' ? <X className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className={`text-sm font-black uppercase tracking-tight ${!n.read ? 'text-neutral-900' : 'text-neutral-500'}`}>{n.title}</h3>
                      <span className="text-[9px] font-bold text-neutral-400 uppercase whitespace-nowrap flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 mt-1 leading-relaxed">{n.message}</p>
                  </div>
                  
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}