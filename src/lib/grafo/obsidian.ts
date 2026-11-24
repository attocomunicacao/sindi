import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LEGENDA, type Grafo, type No, type TipoDeNo } from './tipos';

/**
 * Exporta o grafo como um cofre do Obsidian: uma nota por nó, com `[[ligações]]` para os vizinhos e etiquetas por tipo. Abrir a pasta no Obsidian e usar
 * "Graph view" mostra a mesma rede da página /cerebro, para a apresentação. As notas só têm título, tipo, data e o endereço na SINDI — nenhum texto integral.
 * A pasta é refeita do zero a cada geração (fica em .data/, fora do versionamento).
 */
const PASTAS: Record<TipoDeNo, string> = {
  nucleo: '', conector: 'Especialistas', estante: 'Estantes', conhecimento: 'Conhecimento', documento: 'Documentos', lei: 'Leis', nr: 'NRs', proposicao: 'Projetos de lei', sistema: 'Sistema',
};
/** Nome de arquivo seguro e único (o Obsidian liga por nome de nota). */
function nomeDaNota(n: No, usados: Set<string>) {
  const base = n.rotulo.normalize('NFC').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || n.id;
  let nome = base; let i = 2; while (usados.has(nome.toLowerCase())) nome = `${base} (${i++})`;
  usados.add(nome.toLowerCase()); return nome;
}

export function exportarObsidian(grafo: Grafo, pasta: string, origem = 'http://localhost:3000') {
  rmSync(pasta, { recursive: true, force: true }); mkdirSync(path.join(pasta, '.obsidian'), { recursive: true });
  const usados = new Set<string>(); const nomes = new Map(grafo.nos.map(n => [n.id, nomeDaNota(n, usados)]));
  const vizinhos = new Map<string, { id: string; tipo: string }[]>();
  for (const a of grafo.arestas) { (vizinhos.get(a.de) ?? vizinhos.set(a.de, []).get(a.de)!).push({ id: a.para, tipo: a.tipo }); (vizinhos.get(a.para) ?? vizinhos.set(a.para, []).get(a.para)!).push({ id: a.de, tipo: a.tipo }); }
  for (const t of Object.values(PASTAS)) if (t) mkdirSync(path.join(pasta, t), { recursive: true });
  for (const n of grafo.nos) {
    const ligacoes = (vizinhos.get(n.id) ?? []).slice(0, 400).map(v => `- ${v.tipo}: [[${nomes.get(v.id)}]]`);
    const corpo = [
      '---', `tipo: ${n.tipo}`, `grupo: ${n.grupo}`, ...(n.data ? [`data: ${n.data.slice(0, 10)}`] : []), `tags: [sindi/${n.tipo}]`, '---', '',
      `# ${n.rotulo}`, '', `${LEGENDA[n.tipo].nome}${n.href ? ` · [abrir na SINDI](${origem}${n.href})` : ''}`, '', '## Ligações', ...ligacoes, '',
    ].join('\n');
    writeFileSync(path.join(pasta, PASTAS[n.tipo], `${nomes.get(n.id)}.md`), corpo, 'utf8');
  }
  // Cores por tipo no Graph view (consulta por etiqueta).
  const cor = (hex: string) => parseInt(hex.slice(1), 16);
  writeFileSync(path.join(pasta, '.obsidian', 'graph.json'), JSON.stringify({
    'collapse-filter': false, showTags: false, showAttachments: false, hideUnresolved: true, showOrphans: true,
    colorGroups: (Object.keys(LEGENDA) as TipoDeNo[]).map(t => ({ query: `tag:#sindi/${t}`, color: { a: 1, rgb: cor(LEGENDA[t].cor) } })),
    'center-strength': 0.5, 'repel-strength': 12, 'link-strength': 1, 'link-distance': 60, scale: 0.4, lineSizeMultiplier: 0.6, nodeSizeMultiplier: 1.1,
  }, null, 2));
  writeFileSync(path.join(pasta, 'LEIA-ME.md'), `# Cérebro da SINDI\n\nGerado em ${grafo.geradoEm.slice(0, 16).replace('T', ' ')} por \`npm run grafo:gerar\`. Abra esta pasta como cofre no Obsidian e use **Graph view**.\n\n${(Object.keys(grafo.resumo) as TipoDeNo[]).filter(t => grafo.resumo[t]).map(t => `- ${LEGENDA[t].nome}: ${grafo.resumo[t]}`).join('\n')}\n\nLigações: ${grafo.arestas.length}.\n`, 'utf8');
  return { notas: grafo.nos.length };
}
