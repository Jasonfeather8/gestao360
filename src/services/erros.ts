// O client do Supabase devolve erros como objetos simples ({ message, details, hint, code }),
// não como instâncias de Error; sem isto a mensagem real do banco se perde na tela.
const traducoesDeErroSistema: { padrao: string; mensagem: string }[] = [
  { padrao: 'statement timeout', mensagem: 'A operação demorou mais que o limite do banco e foi cancelada. Tente novamente; se persistir, importe em partes menores.' },
  { padrao: 'canceling statement', mensagem: 'A operação demorou mais que o limite do banco e foi cancelada. Tente novamente; se persistir, importe em partes menores.' },
  { padrao: '57014', mensagem: 'A operação demorou mais que o limite do banco e foi cancelada. Tente novamente; se persistir, importe em partes menores.' },
  { padrao: 'permission denied', mensagem: 'Você não tem permissão para esta operação.' },
  { padrao: 'insufficient privilege', mensagem: 'Você não tem permissão para esta operação.' },
  { padrao: '42501', mensagem: 'Você não tem permissão para esta operação.' },
  { padrao: 'duplicate key value', mensagem: 'Já existe um registro com estes dados.' },
  { padrao: 'unique constraint', mensagem: 'Já existe um registro com estes dados.' },
  { padrao: '23505', mensagem: 'Já existe um registro com estes dados.' },
  { padrao: 'foreign key', mensagem: 'Um dos registros vinculados não existe mais. Atualize a tela e tente novamente.' },
  { padrao: '23503', mensagem: 'Um dos registros vinculados não existe mais. Atualize a tela e tente novamente.' },
  { padrao: 'deadlock detected', mensagem: 'O sistema estava ocupado no momento. Tente novamente.' },
  { padrao: '40P01', mensagem: 'O sistema estava ocupado no momento. Tente novamente.' },
  { padrao: 'could not connect', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'connection refused', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'econnrefused', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'fetch failed', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'failed to fetch', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'network', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'etimedout', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'econnreset', mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.' },
  { padrao: 'jwt expired', mensagem: 'Sua sessão expirou. Entre novamente para continuar.' },
  { padrao: 'invalid jwt', mensagem: 'Sua sessão expirou. Entre novamente para continuar.' },
  { padrao: 'token is expired', mensagem: 'Sua sessão expirou. Entre novamente para continuar.' },
  { padrao: 'value too long', mensagem: 'Um dos textos informados é longo demais.' },
  { padrao: '22001', mensagem: 'Um dos textos informados é longo demais.' },
  { padrao: 'invalid input syntax', mensagem: 'Um dos valores informados está em formato inválido.' },
  { padrao: '22P02', mensagem: 'Um dos valores informados está em formato inválido.' },
  { padrao: 'null value in column', mensagem: 'Um campo obrigatório não foi preenchido.' },
  { padrao: '23502', mensagem: 'Um campo obrigatório não foi preenchido.' },
  { padrao: 'check constraint', mensagem: 'Um dos valores informados não é aceito pelas regras do sistema.' },
  { padrao: '23514', mensagem: 'Um dos valores informados não é aceito pelas regras do sistema.' },
  { padrao: 'too many requests', mensagem: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.' },
  { padrao: 'rate limit', mensagem: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.' },
  { padrao: 'serialization failure', mensagem: 'A operação conflitou com outra alteração. Tente novamente.' },
  { padrao: '40001', mensagem: 'A operação conflitou com outra alteração. Tente novamente.' },
];

export function mensagemDoErro(error: unknown, padrao: string): string {
  let mensagem: string | undefined;
  let codigo: string | undefined;
  if (error instanceof Error && error.message.trim()) mensagem = error.message;
  else if (error && typeof error === 'object') {
    const { message, details, code } = error as { message?: unknown; details?: unknown; code?: unknown };
    if (typeof message === 'string' && message.trim()) mensagem = message;
    else if (typeof details === 'string' && details.trim()) mensagem = details;
    if (typeof code === 'string' && code.trim()) codigo = code;
  }
  const origem = mensagem ?? codigo;
  if (!origem) return padrao;
  const normalizada = origem.toLowerCase();
  const traducao = traducoesDeErroSistema.find(({ padrao: trecho }) => normalizada.includes(trecho.toLowerCase()))?.mensagem;
  return traducao ?? mensagem ?? padrao;
}
