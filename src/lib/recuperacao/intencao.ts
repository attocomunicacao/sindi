import { normalizar } from '@/lib/base/texto';

// Intenções que decidem de onde vêm os trechos. Ficam num só lugar para que as regras de recuperação e as de situação do chat leiam o mesmo critério.

/** Pedido de escrita ou tradução: não pergunta fato do sindicato, então nenhuma busca de documento se aplica. Comparar com o texto já normalizado. */
export const PEDIDO_DE_REDACAO = /redij|escrev|reescrev|traduz|draft|write|translate/;
const REDACAO =/redij|escrev|reescrev|traduz|draft|write|translate|melhore o texto/;
// Só tarefas de escrita e organização; "explique", "resuma" e "ajude" pedem fatos e dependem de fonte.
const AJUDA = /como (organizar|escrever|preparar|montar|melhorar|estruturar|planejar)|dica|apresenta[cç][aã]o|e-?mail|carta|oficio|modelo de|ideia|sugest|how to|tips/;
/** Redação, tradução e pedidos de orientação "como fazer": o modelo pode ajudar mesmo sem fonte, porque não afirmam fatos do sindicato. */
export function pedidoDeAjuda(question: string) { const q = normalizar(question); return REDACAO.test(q) || AJUDA.test(q); }

/** Perguntas sobre as fontes externas coletadas (Câmara, Senado, TST, WEC, IBGE, MTE, CAGED, Constituição, regimentos). */
export const INTENCAO_EXTERNA = /c[aâ]mara|senado|deputad|senador|projeto de lei|\bpls?\b|\bplp\b|\bpec\b|tramita|congresso|\btst\b|tribunal superior|s[uú]mula|\bibge\b|\bwec\b|world employment|\bmte\b|minist[eé]rio do trabalho|norma regulamentadora|\bnr-?\s?\d|\bcaged\b|constitui[cç][aã]o|regimento/i;
/**
 * Pergunta sobre a atuação da entidade ("o que o Sindeprestem está fazendo sobre a NR-1?", "onde acompanho essa discussão?"): a resposta está nas notícias,
 * nos artigos e nas cartilhas do sindicato, com data, e não no texto da norma ou da lei citada.
 */
export const PERGUNTA_DE_ATUACAO = /(sindeprestem|sindicato|fenaserhtt|entidade).{0,40}(esta fazendo|tem feito|\bfez\b|\bfaz\b|atua|defende|acompanha)|(esta fazendo|atuacao|o que faz).{0,40}(sindeprestem|sindicato|fenaserhtt|entidade)|onde (posso )?acompanhar/;

export const PERGUNTA_DE_CONVENCAO = /convenc|\bccts?\b|aditivo|acordo coletivo|collective (agreement|bargaining)/;
// Perguntas sobre o conteúdo de uma cláusula seguem para a busca no texto das convenções, não para a lista de documentos.
const CLAUSULA_RE = /clausula|piso|salario|reajuste|vale|auxilio|jornada|hora extra|adicional|beneficio|ferias|rescis|multa|estabilidade|contribuicao|quanto|valor|prazo|direito|obrigat|pode |posso /;
/**
 * Pergunta sobre o conteúdo de uma cláusula de convenção coletiva (e não sobre a lista de documentos). `q` já normalizada.
 * "Como apresentar ao cliente o reajuste da convenção?" pede método, não o texto da cláusula.
 */
export const perguntaDeClausula = (q: string) => PERGUNTA_DE_CONVENCAO.test(q) && !/artigo|noticia|cliente|apresentar|explicar/.test(q) && CLAUSULA_RE.test(q);
/** Categorias de convenção que a pergunta pode citar, com o rótulo usado nos metadados dos documentos. */
export const CATEGORIAS_DE_CONVENCAO: [RegExp, string][] = [[/poupatempo|detran/, 'Poupatempo'], [/portaria|porteir|controle de acesso|controlador de acesso/, 'Portaria'], [/promo[cç]|merchandising/, 'Promoção e merchandising'], [/leiturista|leitura|agua|energia/, 'Leiturista'],
  [/promotores? de credito|credito/, 'Promotores de crédito'], [/bombeiro/, 'Bombeiros'], [/\bgeral\b/, 'Geral']];
