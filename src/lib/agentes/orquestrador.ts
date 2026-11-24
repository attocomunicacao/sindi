import { conectores, pontuarConectores, type Conector } from '@/lib/cerebro/conectores';

/**
 * A orquestra de especialistas do chat. Cada conector de `cerebro/conectores/` é um especialista de uma área (legislação, inteligência setorial, comercial,
 * RH, custos, relacionamento, a própria SINDI), com suas estantes, sua instrução de resposta e seu limite de palavras.
 *
 * O orquestrador decide por regras (gatilhos), sem chamar modelo — no nível gratuito, cada chamada ao modelo é o recurso escasso:
 *  - o especialista **principal** é o da área com mais gatilhos (o mesmo `escolherConector` de sempre, que também herda a área numa continuação curta);
 *  - quando a pergunta cai entre duas áreas (o segundo placar chega a 75% do primeiro, com ao menos uma expressão ou dois gatilhos), um especialista de
 *    **apoio** pesquisa também as estantes dele, e os achados dos dois disputam a vaga de fonte pela mesma régua de cobertura;
 *  - a escrita é uma só (a cascata de provedores), com a instrução do principal; a verificação de fatos revisa o texto de todos.
 */
export type Especialista = { conector: Conector; papel: 'principal' | 'apoio'; pontos: number };

export function montarOrquestra(
  pergunta: string,
  principal: Conector | undefined,
  todos: Conector[] = conectores(),
): Especialista[] {
  if (!principal) return [];
  const placar = pontuarConectores(pergunta, todos);
  const doPrincipal = placar.find((r) => r.conector.id === principal.id)?.pontos ?? 0;
  const orquestra: Especialista[] = [{ conector: principal, papel: 'principal', pontos: doPrincipal }];
  const topo = Math.max(doPrincipal, placar[0]?.pontos ?? 0);
  const apoio = placar.find(
    (r) => r.conector.id !== principal.id && r.conector.estantes.length > 0 && r.pontos >= 2 && r.pontos >= topo * 0.75,
  );
  if (apoio) orquestra.push({ conector: apoio.conector, papel: 'apoio', pontos: apoio.pontos });
  return orquestra;
}

/** Estantes pesquisadas pela orquestra: as do principal primeiro, depois as do apoio, sem repetir (até 6). */
export function estantesDaOrquestra(orquestra: Especialista[]): string[] {
  return [...new Set(orquestra.flatMap((e) => e.conector.estantes))].slice(0, 6);
}
