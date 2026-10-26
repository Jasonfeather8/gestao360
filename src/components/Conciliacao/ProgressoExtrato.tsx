import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ProgressoLeituraExtrato } from '../../types';

interface ProgressoExtratoProps {
  progresso: ProgressoLeituraExtrato | null;
}

export default function ProgressoExtrato({ progresso }: ProgressoExtratoProps) {
  const [inicio] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());
  const [animacao, setAnimacao] = useState<{ loteAtual: number | null; fracao: number }>({ loteAtual: null, fracao: 0 });

  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (progresso?.etapa !== 'lendo') {
      setAnimacao({ loteAtual: null, fracao: 0 });
      return;
    }

    const loteAtual = progresso.loteAtual;
    setAnimacao({ loteAtual, fracao: 0 });
    const intervalo = window.setInterval(() => {
      setAnimacao((atual) => ({
        loteAtual,
        fracao: atual.loteAtual === loteAtual
          ? atual.fracao + (0.9 - atual.fracao) * 0.18
          : 0,
      }));
    }, 200);
    return () => window.clearInterval(intervalo);
  }, [progresso?.etapa, progresso?.loteAtual]);

  const label = !progresso || progresso.etapa === 'preparando'
    ? 'Preparando o arquivo…'
    : progresso.etapa === 'enviando'
      ? 'Enviando o PDF com segurança…'
      : progresso.etapa === 'comparando'
        ? 'Comparando com o ERP…'
        : progresso.paginaInicio === progresso.paginaFim
          ? `Lendo página ${progresso.paginaInicio ?? '?'} de ${progresso.totalPaginas ?? '?'}`
          : `Lendo páginas ${progresso.paginaInicio ?? '?'}–${progresso.paginaFim ?? '?'} de ${progresso.totalPaginas ?? '?'} · lote ${progresso.loteAtual ?? '?'} de ${progresso.totalLotes ?? '?'}`;

  const segundos = Math.floor((agora - inicio) / 1000);
  const tempo = `${segundos}s`;
  const textoSecundario = progresso?.linhasLidas !== undefined && progresso.linhasLidas > 0
    ? `${progresso.linhasLidas} linhas lidas · ${tempo}`
    : tempo;
  const percentagem = progresso?.etapa === 'comparando'
    ? 100
    : progresso?.etapa === 'lendo' && progresso.totalLotes > 0
      ? Math.min(100, Math.round(
        (((progresso.loteAtual - 1) / progresso.totalLotes) +
          (1 / progresso.totalLotes) * (animacao.loteAtual === progresso.loteAtual ? animacao.fracao : 0)) * 100,
      ))
      : 0;

  return (
    <>
      <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
      <span className="text-sm font-semibold text-on-surface">{label}</span>
      <span className="mt-1 text-xs text-on-surface-variant">{textoSecundario}</span>
      {progresso?.totalPaginas !== null && progresso?.totalPaginas !== undefined && (
        <div className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-container-low">
          <div className="h-full bg-primary transition-all" style={{ width: `${percentagem}%` }} />
        </div>
      )}
    </>
  );
}
