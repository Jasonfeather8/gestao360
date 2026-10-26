// O client do Supabase devolve erros como objetos simples ({ message, details, hint, code }),
// não como instâncias de Error; sem isto a mensagem real do banco se perde na tela.
export function mensagemDoErro(error: unknown, padrao: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const { message, details } = error as { message?: unknown; details?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof details === 'string' && details.trim()) return details;
  }
  return padrao;
}
