import { normalizar } from '@/lib/base/texto';
import { recuperarConhecimento } from '@/lib/recuperacao/recuperar';
import { casoJuridicoIndividual } from '@/lib/chat/escopo';
import { escolherFontes } from '@/lib/recuperacao/fontes';
import { evidenciaSuficiente } from '@/lib/recuperacao/contexto';
import type { Caso, ResultadoCaso } from '@/lib/cerebro/casos';

const norm = (t: string) => normalizar(t).replace(/\s+/g, ' ');

/** Texto que a SINDI entrega ao modelo como fonte para a pergunta (nenhuma resposta pronta existe: o modelo sempre escreve). */
async function evidenciaDa(pergunta: string): Promise<{ origem: string; texto: string }> {
  const conhecimento = await recuperarConhecimento(pergunta);
  const escolhidas = escolherFontes(conhecimento.passages, pergunta, conhecimento.lista ? 8 : 4).slice(
    0,
    conhecimento.lista ? 8 : 3,
  );
  const texto = (evidenciaSuficiente(escolhidas, pergunta) ? escolhidas : [])
    .map((p) => `${p.title}\n${p.url}\n${p.content}`)
    .join('\n\n');
  // Caso jurídico individual: o modelo recebe a orientação de encaminhar ao Setor Jurídico, e isso também vale como evidência.
  if (!texto && casoJuridicoIndividual(pergunta))
    return { origem: 'encaminhamento', texto: 'Setor Jurídico (encaminhamento)' };
  return { origem: texto ? 'evidência' : 'sem evidência', texto };
}
/** Com `somenteResposta`, só a resposta final do modelo é conferida; a evidência não conta (necessário para `nao:` e para recusas, que a evidência poderia satisfazer ou contaminar). */
export async function avaliarCasos(
  casos: Caso[],
  textoExtra?: (pergunta: string) => Promise<string>,
  somenteResposta = false,
): Promise<ResultadoCaso[]> {
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    const { origem, texto } = await evidenciaDa(caso.pergunta);
    const completo = textoExtra
      ? somenteResposta
        ? await textoExtra(caso.pergunta)
        : `${texto}\n\n[MODELO]\n${await textoExtra(caso.pergunta)}`
      : texto;
    const alvo = norm(completo);
    const faltam = caso.espera.filter((e) => !alvo.includes(norm(e)));
    const proibidos = caso.nao.filter((n) => alvo.includes(norm(n)));
    resultados.push({
      pergunta: caso.pergunta,
      ok: !faltam.length && !proibidos.length,
      origem: textoExtra ? `${origem}+modelo` : origem,
      faltam,
      proibidos,
      evidencia: completo.slice(0, 400).replace(/\n/g, ' '),
      categoria: caso.categoria,
    });
  }
  return resultados;
}
