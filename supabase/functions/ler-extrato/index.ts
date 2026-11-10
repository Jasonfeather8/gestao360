declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'
// @ts-expect-error Deno resolves this remote module in the Edge Function runtime.
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const limitePaginasConfigurado = Number(Deno.env.get('LOTE_MAXIMO_PAGINAS') ?? '20')
const LOTE_MAXIMO_PAGINAS = Number.isInteger(limitePaginasConfigurado) && limitePaginasConfigurado > 0
  ? limitePaginasConfigurado
  : 20
const PRECOS_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  'gpt-4.1': { entrada: 2, saida: 8 },
  'gpt-4.1-mini': { entrada: 0.4, saida: 1.6 },
  'gpt-5': { entrada: 1.25, saida: 10 },
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['banco', 'agencia', 'conta', 'periodo_inicio', 'periodo_fim', 'saldo_inicial', 'saldo_final', 'linhas', 'linhas_ignoradas', 'linhas_duvidosas'],
  properties: {
    banco: { type: ['string', 'null'] },
    agencia: { type: ['string', 'null'] },
    conta: { type: ['string', 'null'] },
    periodo_inicio: { type: ['string', 'null'], description: 'Data ISO yyyy-mm-dd' },
    periodo_fim: { type: ['string', 'null'], description: 'Data ISO yyyy-mm-dd' },
    saldo_inicial: { type: ['number', 'null'] },
    saldo_final: { type: ['number', 'null'] },
    linhas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'descricao', 'valor', 'direcao', 'documento', 'saldo_apos', 'pagina', 'texto_original', 'confianca'],
        properties: {
          data: { type: 'string', description: 'Data ISO yyyy-mm-dd' },
          descricao: { type: 'string' },
          valor: { type: 'number', description: 'Sempre positivo, em reais' },
          direcao: { type: 'string', enum: ['entrada', 'saida'] },
          documento: { type: ['string', 'null'] },
          saldo_apos: { type: ['number', 'null'] },
          pagina: { type: ['integer', 'null'] },
          texto_original: { type: 'string' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
      },
    },
    linhas_ignoradas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pagina', 'texto_original', 'motivo', 'data'],
        properties: {
          pagina: { type: ['integer', 'null'] },
          texto_original: { type: 'string' },
          motivo: { type: 'string', enum: ['saldo', 'totalizador', 'cabecalho', 'rodape', 'investimento', 'outro'] },
          data: { type: ['string', 'null'], description: 'Data ISO yyyy-mm-dd quando conhecida' },
        },
      },
    },
    linhas_duvidosas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pagina', 'texto_original', 'motivo'],
        properties: {
          pagina: { type: ['integer', 'null'] },
          texto_original: { type: 'string' },
          motivo: { type: 'string', enum: ['sem_data', 'sem_valor', 'valor_ilegivel', 'direcao_indefinida', 'data_impossivel'] },
        },
      },
    },
  },
}

// Regras de data acrescentadas ao prompt. Existem porque a data de uma transação
// em extrato agrupado por dia não está na linha: está no cabeçalho de dia da seção,
// que atravessa a quebra de página. Sem isso o modelo tende a usar a data de
// geração do documento ("Extrato gerado no dia ...") para as linhas de continuação.
const REGRAS_DE_DATA = `
Regras de data (têm prioridade sobre a regra 4):
12. A "data" de uma transação é o DIA A QUE ELA PERTENCE. Quando o extrato agrupa as transações por dia, esse dia vem do cabeçalho de dia da seção (ex.: "14/09/2026", "Data: 14/09/2026", "14/09") e não deve ser procurado na linha de transação, que nesse formato não traz data. Quando cada linha trouxer a própria data, use a data da linha.
13. A seção de um dia ATRAVESSA a quebra de página. Se a página não repetir o cabeçalho de dia, as linhas dela continuam pertencendo ao último dia informado antes delas — use esse dia. O mesmo vale para o dia informado no contexto do lote anterior. Se não houver nenhum cabeçalho de dia antes da linha e nenhum dia no contexto do lote, coloque a linha em "linhas_duvidosas" com motivo "sem_data" em vez de adivinhar o dia.
14. NUNCA use como data de transação datas de emissão, geração, impressão ou rodapé do documento (ex.: "Extrato gerado no dia 22/09/2026 às 13:20", "Emitido em ...", "Data de emissão"). Essas linhas são rodapé: vão para "linhas_ignoradas" com motivo "rodape".
15. A data herdada do cabeçalho de dia é uma informação do documento e NÃO reduz a confiança da linha: use "alta" ou "media" conforme a legibilidade da linha. Reserve "confianca": "baixa" para linhas realmente duvidosas (valor ilegível, texto ambíguo, direção incerta).
16. Devolva "linhas" na ordem do documento, de cima para baixo e em ordem crescente de página.`

const REGRAS_DE_MAPA_DE_DIAS = `
Regras de data pelo mapa de dias (fonte autoritativa para o formato agrupado por dia; têm prioridade sobre as regras 4 e 12 a 16):
17. O "Mapa de dias deste lote" do contexto foi extraído do próprio PDF e informa, para cada página, qual dia está vigente no início dela ("inicia no dia") e onde aparecem os cabeçalhos de dia dentro da página. Use-o como a fonte correta do dia das linhas QUE NÃO TRAZEM DATA PRÓPRIA.
18. As linhas que aparecem ACIMA do primeiro cabeçalho de dia da página pertencem ao dia informado em "inicia no dia". Um cabeçalho de dia que aparece no meio da página vale apenas para as linhas ABAIXO dele. Nunca atribua a um dia as linhas que estão acima do cabeçalho desse dia.
19. Se a PRÓPRIA LINHA trouxer a data (ex.: "05/03/2026 Compra ... -50,00"), ela é uma TRANSAÇÃO: use a data da linha, coloque-a em "linhas" e NÃO a trate como cabeçalho. Cabeçalho de dia é a linha que separa seções de dias (ex.: "17/09/2026 Saldo do dia R$ 4.743,20"), não uma transação.
20. O bloco "Página anterior (contexto)" existe apenas para você entender a continuação do dia entre páginas. NUNCA crie linhas a partir dele; ele não faz parte das páginas deste lote.`

const REGRAS_BRADESCO = `Regras do layout Bradesco (valem quando o documento tiver o cabeçalho "Extrato de: Ag: ... | CC: ... | Entre ..." e/ou as seções "Últimos Lançamentos" e "Saldos Invest Fácil / Plus"; em caso de conflito, têm prioridade sobre as regras 1 a 20):
21. Neste layout a data é impressa UMA ÚNICA VEZ POR DIA, no primeiro item do dia. Os lançamentos seguintes do mesmo dia NÃO repetem a data: use o dia do último cabeçalho de dia acima deles. Uma linha que contém apenas uma data (ex.: "29/04/2026") é cabeçalho de dia, não é lançamento.
22. Um lançamento pode ocupar VÁRIAS linhas do PDF: a descrição e o par "Dcto. + Crédito/Débito + Saldo" podem estar em linhas separadas (ex.: "PIX ENVIADO" / "DES: MESQUITA SOLUCOES EMP 07/04" / "1208249 -15.000,00 6.762,24"). Junte o bloco em UM único item de "linhas", com a descrição completa e o valor da linha que traz o número.
23. Neste layout só é lançamento a linha que traz valor na coluna "Crédito (R$)" ou na coluna "Débito (R$)". A coluna "Saldo (R$)" NUNCA é lançamento: serve apenas para conferência. O débito aparece com sinal negativo (ex.: "-15.000,00"); em "valor" use sempre o número positivo e registre a natureza em "direcao".
24. A seção "Saldos Invest Fácil / Plus" (e qualquer bloco de saldo de investimento do Bradesco, com as colunas "Data | Histórico | Valor (R$)") NÃO é lançamento: coloque essas linhas em "linhas_ignoradas" com motivo "investimento" e informe a data em "data" quando existir. Nunca gere lançamento a partir dela, nunca some os valores dela e nunca a trate como lançamento ausente.
25. A seção "Últimos Lançamentos" É uma tabela de lançamentos e deve ser lida normalmente, MESMO que as datas dela estejam fora do período informado do extrato. Ignore apenas o "SALDO ANTERIOR" e a linha de "Total" dessa seção.
26. "SALDO ANTERIOR", o cabeçalho de colunas, a linha de "Total" e o rodapé "Os dados acima têm como base ..." nunca viram lançamento e nunca fornecem data de lançamento.
27. Nenhuma linha datada pode ser omitida: se a natureza (entrada/saída) não puder ser determinada, coloque a linha em "linhas_duvidosas" com o texto original, em vez de descartá-la.`

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  return value.trim().slice(0, maxLength) || null
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year >= 0 && year <= 99) date.setUTCFullYear(year)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function formatarMapaDeDias(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const paginas = value.flatMap((item) => {
    if (!isRecord(item) || !Number.isInteger(item.pagina) || item.pagina < 1) return []
    const diaInicial = validIsoDate(item.diaInicial) ? item.diaInicial : null
    const cabecalhos = Array.isArray(item.cabecalhos)
      ? item.cabecalhos.flatMap((cabecalho: unknown) => {
        if (!isRecord(cabecalho) || !validIsoDate(cabecalho.dia)) return []
        if (typeof cabecalho.topo !== 'number' || !Number.isFinite(cabecalho.topo) || cabecalho.topo < 0 || cabecalho.topo > 1) return []
        return [`${cabecalho.dia} (a ${Math.round(cabecalho.topo * 100)}% do topo)`]
      })
      : []
    return [`- página ${item.pagina}: inicia no dia ${diaInicial ?? 'não identificado'}; cabeçalhos de dia na página: ${cabecalhos.join(', ') || 'nenhum'}`]
  })
  return paginas.length ? `\nMapa de dias deste lote (extraído do PDF):\n${paginas.join('\n')}` : ''
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function estimarCusto(modelo: string, tokensEntrada: number, tokensSaida: number): number | null {
  const preco = PRECOS_POR_MILHAO[modelo]
  if (!preco) return null
  const custo = (tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1_000_000
  return Math.round(custo * 1e6) / 1e6
}

function normalizePage(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null
}

function normalizeModelData(model: unknown) {
  if (!isRecord(model) || !Array.isArray(model.linhas) || !Array.isArray(model.linhas_ignoradas) || !Array.isArray(model.linhas_duvidosas)) {
    throw new Error('JSON do modelo inválido')
  }

  const linhasIgnoradas = model.linhas_ignoradas.map((item: unknown) => {
    const row = isRecord(item) ? item : {}
    const motivo = ['saldo', 'totalizador', 'cabecalho', 'rodape', 'investimento', 'outro'].includes(row.motivo) ? row.motivo : 'outro'
    return {
      pagina: normalizePage(row.pagina),
      textoOriginal: cleanString(row.texto_original) ?? '',
      motivo,
      data: validIsoDate(row.data) ? row.data : null,
    }
  })

  const linhasDuvidosas = model.linhas_duvidosas.map((item: unknown) => {
    const row = isRecord(item) ? item : {}
    const motivos = ['sem_data', 'sem_valor', 'valor_ilegivel', 'direcao_indefinida', 'data_impossivel']
    const motivo = motivos.includes(row.motivo) ? row.motivo : 'direcao_indefinida'
    return {
      pagina: normalizePage(row.pagina),
      textoOriginal: cleanString(row.texto_original) ?? '',
      motivo,
    }
  })

  const linhas: Array<Record<string, unknown>> = []
  for (const item of model.linhas) {
    const row = isRecord(item) ? item : {}
    const descricao = cleanString(row.descricao) ?? 'Lançamento sem descrição'
    const textoOriginal = cleanString(row.texto_original) ?? descricao
    const pagina = normalizePage(row.pagina)
    const valor = Math.round(Math.abs(Number(row.valor)) * 100) / 100

    if (!Number.isFinite(valor) || valor === 0) {
      linhasDuvidosas.push({ pagina, textoOriginal, motivo: 'valor_ilegivel' })
      continue
    }
    if (!validIsoDate(row.data)) {
      linhasDuvidosas.push({ pagina, textoOriginal, motivo: 'data_impossivel' })
      continue
    }
    if (row.direcao !== 'entrada' && row.direcao !== 'saida') {
      linhasDuvidosas.push({ pagina, textoOriginal, motivo: 'direcao_indefinida' })
      continue
    }

    linhas.push({
      data: row.data,
      descricao,
      valor,
      direcao: row.direcao,
      documento: cleanString(row.documento),
      saldoApos: finiteNumberOrNull(row.saldo_apos),
      pagina,
      textoOriginal,
      confianca: ['alta', 'media', 'baixa'].includes(row.confianca) ? row.confianca : 'media',
    })
  }

  const banco = cleanString(model.banco)
  const agencia = cleanString(model.agencia)
  const conta = cleanString(model.conta)
  const periodoInicio = validIsoDate(model.periodo_inicio) ? model.periodo_inicio : null
  const periodoFim = validIsoDate(model.periodo_fim) ? model.periodo_fim : null
  const saldoInicial = finiteNumberOrNull(model.saldo_inicial)
  const saldoFinal = finiteNumberOrNull(model.saldo_final)
  const entradas = Math.round(linhas.filter((linha) => linha.direcao === 'entrada').reduce((sum, linha) => sum + Number(linha.valor), 0) * 100) / 100
  const saidas = Math.round(linhas.filter((linha) => linha.direcao === 'saida').reduce((sum, linha) => sum + Number(linha.valor), 0) * 100) / 100
  const diferenca = saldoInicial !== null && saldoFinal !== null
    ? Math.round((saldoFinal - (saldoInicial + entradas - saidas)) * 100) / 100
    : null

  return {
    meta: { banco, agencia, conta, periodoInicio, periodoFim, saldoInicial, saldoFinal },
    linhas,
    linhasIgnoradas,
    linhasDuvidosas,
    conferencia: {
      status: diferenca === null ? 'nao_verificavel' : Math.abs(diferenca) <= 0.05 ? 'ok' : 'divergente',
      entradas,
      saidas,
      saldoInicial,
      saldoFinal,
      diferenca,
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') throw new HttpError(400, 'Método não permitido')

    const authHeader = req.headers.get('Authorization')
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
    if (!tokenMatch) throw new HttpError(401, 'Token de autenticação ausente ou inválido')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(tokenMatch[1])
    if (authError || !user) throw new HttpError(401, 'Token de autenticação inválido')

    let role = user.app_metadata?.role
    if (!role) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      role = profile?.role
    }
    role = role || 'colaborador'
    if (role !== 'master' && role !== 'gerente') {
      throw new HttpError(403, 'Apenas usuários Master ou Gerente podem processar extratos')
    }

    let body: Record<string, any>
    try {
      const parsed: unknown = await req.json()
      if (!isRecord(parsed)) throw new Error('invalid body')
      body = parsed
    } catch {
      throw new HttpError(400, 'Corpo da requisição inválido')
    }
    if (typeof body.caminho !== 'string' || !body.caminho.trim()) {
      throw new HttpError(400, 'O campo caminho é obrigatório')
    }
    const caminho = body.caminho
    if (!caminho.startsWith(`extratos/${user.id}/`)) {
      throw new HttpError(403, 'Acesso negado ao arquivo solicitado')
    }

    const paginaInicio = body.paginaInicio === undefined ? 1 : body.paginaInicio
    const paginaFim = body.paginaFim
    if (!Number.isInteger(paginaInicio) || paginaInicio <= 0 || (paginaFim !== undefined && (!Number.isInteger(paginaFim) || paginaFim <= 0)) || (paginaFim !== undefined && paginaInicio > paginaFim)) {
      throw new HttpError(400, 'Intervalo de páginas inválido')
    }

    const { data: arquivo, error: storageError } = await supabaseAdmin.storage.from('extratos').download(caminho)
    if (storageError || !arquivo) throw new HttpError(400, 'Arquivo não encontrado no armazenamento')

    const originalBytes = new Uint8Array(await arquivo.arrayBuffer())
    let documento: any
    try {
      documento = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
    } catch {
      throw new HttpError(400, 'PDF ilegível ou protegido por senha')
    }

    const total = documento.getPageCount()
    if (total < 1) throw new HttpError(400, 'PDF sem páginas legíveis')
    const inicio = Math.min(paginaInicio, total)
    const fimSolicitado = paginaFim === undefined ? total : paginaFim
    if (fimSolicitado - paginaInicio + 1 > LOTE_MAXIMO_PAGINAS) {
      throw new HttpError(400, `O limite é de ${LOTE_MAXIMO_PAGINAS} páginas por lote. Reduza o intervalo solicitado.`)
    }
    const fim = Math.min(fimSolicitado, total)
    if (inicio > fim) throw new HttpError(400, 'Intervalo de páginas inválido para este PDF')

    let pdfBytes = originalBytes
    if (inicio !== 1 || fim !== total) {
      const lote = await PDFDocument.create()
      const paginas = await lote.copyPages(documento, Array.from({ length: fim - inicio + 1 }, (_, index) => inicio - 1 + index))
      paginas.forEach((pagina: unknown) => lote.addPage(pagina))
      pdfBytes = new Uint8Array(await lote.save())
    }
    const pdfBase64 = encodeBase64(pdfBytes)

    const contexto = isRecord(body.contexto) ? body.contexto : null
    const mapaDiasPrompt = contexto ? formatarMapaDeDias(contexto.diasPorPagina) : ''
    const textoPaginaAnterior = contexto && typeof contexto.textoPaginaAnterior === 'string'
      ? contexto.textoPaginaAnterior.slice(0, 6000)
      : ''
    const textoPaginaAnteriorPrompt = textoPaginaAnterior
      ? `\nPágina anterior (contexto, NÃO extrair linhas dela):\n"""\n${textoPaginaAnterior}\n"""`
      : ''
    // A frase de metadados só aparece quando há metadado real: no primeiro lote os
    // campos ainda são desconhecidos e "banco=null, conta=null" poderia levar o modelo
    // a devolver meta nula (o meta é lido apenas do primeiro lote).
    const temMetadados = Boolean(contexto && (contexto.banco || contexto.conta || contexto.periodoInicio || contexto.periodoFim))
    const metadadosPrompt = temMetadados && contexto
      ? `\nMetadados já identificados no início do documento: banco=${contexto.banco ?? null}, conta=${contexto.conta ?? null}, período de ${contexto.periodoInicio ?? null} a ${contexto.periodoFim ?? null}. Use-os para completar o ano de datas abreviadas.`
      : ''
    const ultimoDiaPrompt = contexto && contexto.ultimoDia
      ? `\nO lote anterior terminou no dia ${contexto.ultimoDia}; se este lote começar com uma continuação sem cabeçalho de dia, use esse dia.`
      : ''
    const contextoPrompt = `${metadadosPrompt}${ultimoDiaPrompt}${mapaDiasPrompt}${textoPaginaAnteriorPrompt}`
    const prompt = `Você é um extrator de dados de extratos bancários brasileiros. Converta o PDF recebido em JSON conforme o schema fornecido.\n\nContexto deste lote: páginas ${inicio} a ${fim} de um total de ${total} páginas do documento.${contextoPrompt}\n\nRegras obrigatórias:\n1. Uma linha de transação do extrato = um item em "linhas". Nunca agrupe, resuma ou some lançamentos.\n2. "valor" é SEMPRE positivo, em reais, com duas casas decimais. A natureza do lançamento vai em "direcao": "entrada" (crédito, depósito, transferência recebida, estorno a favor) ou "saida" (débito, pagamento, tarifa, saque, transferência enviada).\n3. Determine a direção pelo sinal negativo, pelo marcador de débito/crédito (D, C, Débito, Crédito), pelo texto do histórico e, quando disponível, pela variação do saldo entre linhas consecutivas.\n4. "data" SEMPRE no formato yyyy-mm-dd. Se a linha trouxer apenas dia/mês (ex.: "05/03"), use o ano do período do extrato.\n5. Valores no padrão brasileiro: "1.234,56" equivale a 1234.56; "(75,50)" e "-75,50" indicam saída de 75.50. Nunca trate o ponto como separador decimal quando houver vírgula.\n6. "texto_original" deve conter a linha inteira exatamente como aparece no PDF, sem tradução, resumo ou correção. Isso é obrigatório para conferência humana.\n7. Linhas de saldo, totalizadores, cabeçalhos e rodapés NÃO são transações: vão para "linhas_ignoradas" com o motivo adequado. O saldo inicial e o saldo final do período vão em "saldo_inicial" e "saldo_final".\n8. Se uma linha parecer transação mas faltar data, valor legível ou a direção não puder ser determinada, coloque-a em "linhas_duvidosas" com o motivo. NUNCA invente valores, datas ou descrições.\n9. "confianca" reflete sua certeza sobre a linha: "alta", "media" ou "baixa".\n10. Não inclua lançamentos que não estejam no PDF e não repita linhas.\n11. Preencha "banco", "agencia", "conta", "periodo_inicio" e "periodo_fim" com o que estiver no documento; use null quando a informação não existir.`

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new HttpError(500, 'Configuração da OpenAI indisponível')
    const modelo = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 110_000)
    const startedAt = Date.now()
    let openAiResponse: Response
    try {
      openAiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          store: false,
          max_output_tokens: 32000,
          input: [{ role: 'user', content: [
            { type: 'input_file', filename: 'extrato.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
            { type: 'input_text', text: prompt + REGRAS_DE_DATA + REGRAS_DE_MAPA_DE_DIAS + '\n' + REGRAS_BRADESCO },
          ] }],
          text: { format: { type: 'json_schema', name: 'extrato_bancario', strict: true, schema } },
        }),
        signal: controller.signal,
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? 'tempo limite excedido' : 'falha de conexão'
      console.error(`[ler-extrato] OpenAI indisponível: ${reason}; páginas=${inicio}-${fim}; duração=${Date.now() - startedAt}ms`)
      throw new HttpError(502, error instanceof Error && error.name === 'AbortError' ? 'A análise excedeu o tempo limite; tente um lote menor' : 'Falha ao comunicar com a OpenAI')
    } finally {
      clearTimeout(timeout)
    }

    let respostaOpenAi: any
    try {
      respostaOpenAi = await openAiResponse.json()
    } catch {
      throw new HttpError(502, 'Resposta inválida da OpenAI')
    }
    if (!openAiResponse.ok) {
      const mensagem = cleanString(respostaOpenAi?.error?.message, 500) ?? 'Falha ao processar o extrato na OpenAI'
      console.error(`[ler-extrato] Erro da OpenAI: status=${openAiResponse.status}; páginas=${inicio}-${fim}; duração=${Date.now() - startedAt}ms`)
      throw new HttpError(502, mensagem.includes(apiKey) ? 'Falha ao processar o extrato na OpenAI' : mensagem)
    }
    if (respostaOpenAi.status === 'incomplete') {
      throw new HttpError(502, 'A resposta ficou incompleta; tente processar um lote menor')
    }
    const conteudos = Array.isArray(respostaOpenAi.output)
      ? respostaOpenAi.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      : []
    if (conteudos.some((item: any) => item?.type === 'refusal')) {
      throw new HttpError(502, 'A OpenAI recusou a análise deste documento')
    }
    const textoJson = conteudos.filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string').map((item: any) => item.text).join('')
    let dadosModelo: unknown
    try {
      if (!textoJson) throw new Error('empty output')
      dadosModelo = JSON.parse(textoJson)
    } catch {
      throw new HttpError(502, 'A OpenAI retornou um JSON inválido')
    }

    let dadosNormalizados
    try {
      dadosNormalizados = normalizeModelData(dadosModelo)
    } catch {
      throw new HttpError(502, 'A OpenAI retornou dados em formato inválido')
    }

    const uso = isRecord(respostaOpenAi.usage) ? respostaOpenAi.usage : {}
    const tokensEntrada = Number(uso.input_tokens) || 0
    const tokensSaida = Number(uso.output_tokens) || 0
    const custoEstimadoUsd = estimarCusto(modelo, tokensEntrada, tokensSaida)
    console.info(`[ler-extrato] Processamento concluído: tamanho=${originalBytes.byteLength}; páginas=${inicio}-${fim}/${total}; duração=${Date.now() - startedAt}ms; tokens=${tokensEntrada}/${tokensSaida}; custo_estimado_usd=${custoEstimadoUsd ?? 'null'}`)
    return jsonResponse({
      paginas: { inicio, fim, total },
      ...dadosNormalizados,
      uso: {
        modelo,
        tokensEntrada,
        tokensSaida,
        custoEstimadoUsd,
      },
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar o extrato'
    if (!(error instanceof HttpError) || status >= 500 || status === 403) {
      console.error(`[ler-extrato] Erro: status=${status}; motivo=${message}`)
    }
    return jsonResponse({ error: message }, status)
  }
})
