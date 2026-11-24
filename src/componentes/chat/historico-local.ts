// Histórico de conversas SÓ neste navegador (IndexedDB): nada daqui vai ao servidor. O servidor continua sem guardar conversa alguma; este arquivo só
// guarda, no dispositivo de quem conversa, o que essa pessoa já viu na tela. Dados pessoais e segredos são removidos ANTES de salvar (mesma redação do
// servidor), e quem usa pode pausar, apagar tudo, exportar e importar. Sem Zod no navegador (a CSP registra a tentativa de `Function("")`): validação manual.
import { redigirDadosSensiveis } from '@/lib/seguranca/redacao';
import { normalizar } from '@/lib/base/texto';
import type { MensagemDaConversa } from '@/componentes/chat/pedir-resposta';

export type ConversaSalva = {
  id: string;
  titulo: string;
  /** O título foi escolhido por quem usa: não é refeito a partir da primeira pergunta. */
  tituloManual?: boolean;
  fixada?: boolean;
  criadaEm: number;
  atualizadaEm: number;
  mensagens: MensagemDaConversa[];
};

export const LIMITE_DE_CONVERSAS = 100;
export const LIMITE_DE_MENSAGENS = 50;
const LIMITE_DO_TEXTO = 6000;
const LIMITE_DO_TITULO = 60;
const NOME_DO_BANCO = 'sindi-conversas';
const NOME_DA_LOJA = 'conversas';
const CHAVE_DA_PAUSA = 'sindi:historico:pausado';
export const TITULO_PADRAO = 'Nova conversa';
const UM_DIA = 86_400_000;

// ------------------------------------------------------------------------------------------------ funções puras
/** Identificador novo (UUID quando o navegador tem; senão, aleatório e datado). */
export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Título a partir da primeira pergunta (já sem dados pessoais): até 60 caracteres, sem cortar palavra ao meio. */
export function tituloDaConversa(mensagens: MensagemDaConversa[]): string {
  const primeira = mensagens
    .find((m) => m.role === 'user')
    ?.content.replace(/\s+/g, ' ')
    .trim();
  if (!primeira) return TITULO_PADRAO;
  const limpo = redigirDadosSensiveis(primeira);
  if (limpo.length <= LIMITE_DO_TITULO) return limpo;
  const corte = limpo.slice(0, LIMITE_DO_TITULO - 1);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > 20 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/** Mensagens prontas para guardar: só papéis e textos válidos, sem dados pessoais, no máximo as últimas 50. */
export function mensagensParaGuardar(mensagens: unknown): MensagemDaConversa[] {
  if (!Array.isArray(mensagens)) return [];
  const validas: MensagemDaConversa[] = [];
  for (const m of mensagens) {
    if (!m || typeof m !== 'object') continue;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) continue;
    validas.push({ role, content: redigirDadosSensiveis(content).slice(0, LIMITE_DO_TEXTO) });
  }
  return validas.slice(-LIMITE_DE_MENSAGENS);
}

/** Lê um registro vindo do banco ou de um arquivo importado: devolve a conversa limpa ou `undefined` se não tiver o formato esperado. */
export function validarConversa(bruto: unknown): ConversaSalva | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined;
  const c = bruto as Record<string, unknown>;
  const mensagens = mensagensParaGuardar(c.mensagens);
  if (typeof c.id !== 'string' || !/^[\w-]{1,64}$/.test(c.id) || !mensagens.length) return undefined;
  const numero = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : padrao);
  const agora = Date.now();
  const titulo =
    typeof c.titulo === 'string' && c.titulo.trim()
      ? c.titulo.trim().slice(0, LIMITE_DO_TITULO)
      : tituloDaConversa(mensagens);
  return {
    id: c.id,
    titulo: redigirDadosSensiveis(titulo),
    ...(c.tituloManual === true ? { tituloManual: true } : {}),
    ...(c.fixada === true ? { fixada: true } : {}),
    criadaEm: numero(c.criadaEm, agora),
    atualizadaEm: numero(c.atualizadaEm, agora),
    mensagens,
  };
}

/** Mais recentes primeiro; as fixadas ficam no alto. */
export const ordenarConversas = (conversas: ConversaSalva[]) =>
  [...conversas].sort(
    (a, b) => Number(b.fixada ?? false) - Number(a.fixada ?? false) || b.atualizadaEm - a.atualizadaEm,
  );

/** Mantém as fixadas e as mais recentes até o limite. */
export function podarConversas(conversas: ConversaSalva[], limite = LIMITE_DE_CONVERSAS) {
  return ordenarConversas(conversas).slice(0, limite);
}

/** Conversas cujo título ou texto contém a busca (sem acento nem caixa); busca de uma letra não filtra. */
export function filtrarConversas(conversas: ConversaSalva[], busca: string) {
  const termo = normalizar(busca.trim());
  if (termo.length < 2) return conversas;
  return conversas.filter(
    (c) => normalizar(c.titulo).includes(termo) || c.mensagens.some((m) => normalizar(m.content).includes(termo)),
  );
}

/** Agrupa para a barra lateral: Fixadas, Hoje, Ontem, Últimos 7 dias e Mais antigas (dia local de quem usa). */
export function agruparPorData(conversas: ConversaSalva[], agora = Date.now()) {
  const inicioDeHoje = new Date(agora).setHours(0, 0, 0, 0);
  const grupos = [
    { rotulo: 'Fixadas', conversas: [] as ConversaSalva[] },
    { rotulo: 'Hoje', conversas: [] as ConversaSalva[] },
    { rotulo: 'Ontem', conversas: [] as ConversaSalva[] },
    { rotulo: 'Últimos 7 dias', conversas: [] as ConversaSalva[] },
    { rotulo: 'Mais antigas', conversas: [] as ConversaSalva[] },
  ];
  for (const c of ordenarConversas(conversas)) {
    const i = c.fixada
      ? 0
      : c.atualizadaEm >= inicioDeHoje
        ? 1
        : c.atualizadaEm >= inicioDeHoje - UM_DIA
          ? 2
          : c.atualizadaEm >= inicioDeHoje - 7 * UM_DIA
            ? 3
            : 4;
    grupos[i].conversas.push(c);
  }
  return grupos.filter((g) => g.conversas.length);
}

/** Texto do arquivo de exportação (as conversas como estão guardadas, com versão do formato). */
export const serializarConversas = (conversas: ConversaSalva[]) =>
  JSON.stringify({ formato: 'sindi-conversas', versao: 1, exportadoEm: new Date().toISOString(), conversas }, null, 2);

/** Conversas válidas de um arquivo importado; qualquer outra coisa é descartada (e o arquivo inteiro, se não for do formato). */
export function lerArquivoDeConversas(texto: string): ConversaSalva[] {
  try {
    const dados = JSON.parse(texto) as { formato?: unknown; conversas?: unknown };
    if (dados?.formato !== 'sindi-conversas' || !Array.isArray(dados.conversas)) return [];
    return dados.conversas.map(validarConversa).filter((c): c is ConversaSalva => Boolean(c));
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------------------------------------ pausa (localStorage)
export function historicoPausado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DA_PAUSA) === '1';
  } catch {
    return false;
  }
}
export function definirPausaDoHistorico(pausado: boolean) {
  try {
    if (pausado) localStorage.setItem(CHAVE_DA_PAUSA, '1');
    else localStorage.removeItem(CHAVE_DA_PAUSA);
  } catch {
    /* sem armazenamento: a pausa vale só até recarregar */
  }
}

// ------------------------------------------------------------------------------------------------ IndexedDB
function abrirBanco(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(undefined);
    try {
      const pedido = indexedDB.open(NOME_DO_BANCO, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(NOME_DA_LOJA, { keyPath: 'id' });
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => resolve(undefined);
      pedido.onblocked = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Executa uma operação numa transação da loja; sem banco (janela privada, bloqueio), devolve o `padrao`. */
async function naLoja<T>(
  modo: IDBTransactionMode,
  padrao: T,
  operar: (loja: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const banco = await abrirBanco();
  if (!banco) return padrao;
  return new Promise<T>((resolve) => {
    try {
      const transacao = banco.transaction(NOME_DA_LOJA, modo);
      const pedido = operar(transacao.objectStore(NOME_DA_LOJA));
      let resultado: T = padrao;
      if (pedido) pedido.onsuccess = () => (resultado = pedido.result);
      transacao.oncomplete = () => {
        banco.close();
        resolve(resultado);
      };
      transacao.onerror = transacao.onabort = () => {
        banco.close();
        resolve(padrao);
      };
    } catch {
      banco.close();
      resolve(padrao);
    }
  });
}

/** O navegador permite guardar conversas aqui? (falso em janela privada de alguns navegadores ou com o armazenamento bloqueado). */
export async function historicoDisponivel() {
  return Boolean(await abrirBanco().then((b) => (b?.close(), b)));
}

export async function listarConversas(): Promise<ConversaSalva[]> {
  const todas = await naLoja<unknown[]>('readonly', [], (loja) => loja.getAll());
  return ordenarConversas(todas.map(validarConversa).filter((c): c is ConversaSalva => Boolean(c)));
}

/** Guarda (ou atualiza) uma conversa e poda as mais antigas além do limite. */
export async function salvarConversa(conversa: ConversaSalva): Promise<boolean> {
  const limpa = validarConversa(conversa);
  if (!limpa) return false;
  const existentes = await listarConversas();
  const excedentes = podarConversas([...existentes.filter((c) => c.id !== limpa.id), limpa]);
  const mantidos = new Set(excedentes.map((c) => c.id));
  const aRemover = existentes.filter((c) => !mantidos.has(c.id)).map((c) => c.id);
  await naLoja('readwrite', undefined, (loja) => {
    if (mantidos.has(limpa.id)) loja.put(limpa);
    for (const id of aRemover) loja.delete(id);
  });
  return mantidos.has(limpa.id);
}

export const excluirConversa = (id: string) =>
  naLoja('readwrite', undefined, (loja) => {
    loja.delete(id);
  });

export const apagarTodasAsConversas = () =>
  naLoja('readwrite', undefined, (loja) => {
    loja.clear();
  });

/** Junta as conversas de um arquivo às já guardadas (o mesmo id é substituído); devolve quantas entraram. */
export async function importarConversas(texto: string): Promise<number> {
  const novas = lerArquivoDeConversas(texto);
  if (!novas.length) return 0;
  const existentes = await listarConversas();
  const ids = new Set(novas.map((c) => c.id));
  const final = podarConversas([...existentes.filter((c) => !ids.has(c.id)), ...novas]);
  await naLoja('readwrite', undefined, (loja) => {
    loja.clear();
    for (const c of final) loja.put(c);
  });
  return novas.filter((c) => final.some((f) => f.id === c.id)).length;
}
