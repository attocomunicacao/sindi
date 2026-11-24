import {
  casoJuridicoIndividual,
  foraDoEscopo,
  lacunaConhecida,
  obrigacaoLegalDeContratacao,
  semFonteSemChute,
} from '@/lib/chat/escopo';
import { contemDadosSensiveis, redigirDadosSensiveis } from '@/lib/seguranca/redacao';
import { escolherFontes, trechoDeContato } from '@/lib/recuperacao/fontes';
import { type Situacao } from '@/lib/chat/notas';
import { evidenciaSuficiente } from '@/lib/recuperacao/contexto';
import type { Passagem } from '@/lib/base/tipos';
import { recuperarConhecimento } from '@/lib/recuperacao/recuperar';
import { escolherConector, type Conector } from '@/lib/cerebro/conectores';
import { maximoDeFontes, PEDE_REDACAO } from '@/lib/chat/prompt';

// Decide, por regras, o que fazer com a pergunta: dados sensíveis, caso jurídico, saudação, fora do escopo ou busca de fontes. Nenhuma resposta é escrita aqui.

type Conhecimento = Awaited<ReturnType<typeof recuperarConhecimento>>;
async function referenciaDentroDoOrcamento(
  pergunta: string,
  conector: Conector | undefined,
): Promise<Pick<Conhecimento, 'passages' | 'semResposta' | 'lista' | 'relatorio'>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      recuperarConhecimento(pergunta, conector),
      new Promise<{ passages: Passagem[]; semResposta: undefined; lista: false; relatorio: false }>((resolve) => {
        timer = setTimeout(
          () => resolve({ passages: [], semResposta: undefined, lista: false, relatorio: false }),
          6500,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const SAUDACAO = /^(olá|ola|oi|hello|hi|bom dia|boa tarde|boa noite)(?:[,!?.\s]+(?:sindi|tudo bem))*[!.?\s]*$/i;

/** A situação (se a pergunta é tratada por regra), as fontes escolhidas e o conector da área. O modelo só escreve depois disto. */
export async function decidirSituacao({ mensagens }: { mensagens: { role: string; content: string }[] }) {
  const perguntaAtual = mensagens.at(-1)!.content;
  const ehRedacao = PEDE_REDACAO.test(perguntaAtual);
  let situacao: Situacao | undefined;
  let escolhidas: Passagem[] = [];
  let lista = false;
  let relatorio = false;
  // As perguntas anteriores entram na busca (inclusive na por significado, que vai ao provedor de IA): dados pessoais e segredos já ditos saem delas.
  const anteriores = mensagens
    .filter((m) => m.role === 'user')
    .slice(-3, -1)
    .map((m) => redigirDadosSensiveis(m.content));
  const conector = escolherConector(perguntaAtual, anteriores);
  // Porta de escopo: fora do assunto do setor a SINDI recusa antes de buscar. Uma busca fraca não decide isto, pois acertos de palavras comuns
  // ("São Paulo") e de significado (similaridade alta para tudo) também aparecem em perguntas sem relação. Perguntas de continuação herdam o assunto das anteriores.
  // O conector "sobre a SINDI" casa com "você pode…", que serve a qualquer assunto; por isso ele sozinho não põe a pergunta dentro do escopo.
  const naArea = Boolean(conector) && conector!.id !== 'sobre-a-sindi-e-limites';
  if (contemDadosSensiveis(perguntaAtual)) situacao = 'dados-sensiveis';
  else if (casoJuridicoIndividual(perguntaAtual) || obrigacaoLegalDeContratacao(perguntaAtual)) {
    situacao = 'caso-juridico';
    escolhidas = [trechoDeContato()];
  } else if (SAUDACAO.test(perguntaAtual.trim())) situacao = 'saudacao';
  else if (!naArea && foraDoEscopo([...anteriores, perguntaAtual].join(' '))) situacao = 'fora-do-escopo';
  else {
    // Continuação curta ("e para empresa filiada?"): a busca usa também a pergunta anterior, que carrega o assunto.
    // A busca por significado manda a consulta ao provedor de embeddings: a pergunta atual também sai redigida, sem depender só do detector acima.
    const atual = redigirDadosSensiveis(perguntaAtual);
    const consulta =
      anteriores.length && atual.trim().split(/\s+/).length <= 6 ? `${anteriores.at(-1)} ${atual}` : atual;
    const conhecimento = await referenciaDentroDoOrcamento(consulta, conector);
    lista = conhecimento.lista === true;
    relatorio = conhecimento.relatorio === true;
    // A ordem de relevância vem da busca; aqui só se limpa o texto das fontes escolhidas.
    const candidatas = relatorio
      ? conhecimento.passages
      : escolherFontes(conhecimento.passages.slice(0, lista ? 8 : maximoDeFontes()), consulta, 8);
    // As páginas oficiais fixadas respondem sozinhas à pergunta; trechos extras de notícias só atrapalham.
    escolhidas = evidenciaSuficiente(candidatas, consulta)
      ? candidatas.some((p) => p.pinned)
        ? candidatas.filter((p) => p.pinned)
        : candidatas
      : [];
    // NR, artigo ou cláusula pedidos que não constam dos textos coletados; fato que a base sabidamente não tem (CNPJ, salário de dirigentes); pergunta sem nenhuma fonte
    // (as áreas de orientação — comercial, RH, custos — podem responder com método geral, sem fato institucional).
    if (ehRedacao) escolhidas = escolhidas.filter((p) => /orientação geral/i.test(p.title));
    if (
      conhecimento.semResposta ||
      lacunaConhecida(perguntaAtual, escolhidas.map((p) => p.content).join(' ')) ||
      (!escolhidas.length && conector?.modo !== 'orientacao' && semFonteSemChute(perguntaAtual))
    ) {
      situacao = 'sem-fonte';
      escolhidas = [trechoDeContato()];
      lista = false;
      relatorio = false;
    }
  }
  return { situacao, escolhidas, lista, relatorio, conector, anteriores, ehRedacao, perguntaAtual };
}
