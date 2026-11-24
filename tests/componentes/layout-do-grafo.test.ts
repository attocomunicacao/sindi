import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acharNos,
  AJUSTES_PADRAO,
  aplicarForcas,
  conjuntoVisivel,
  criarSimulacao,
  documentosDaLista,
  enquadramento,
  ligacoesDaSimulacao,
  montarAdjacencia,
  nosDaFisica,
  nosDaSimulacao,
  ordenarVizinhos,
  raioBase,
  seguirAsEstantes,
  vizinhosDoNo,
  type DadosDoGrafo,
  type NoSim,
} from '@/componentes/cerebro/layout-do-grafo';
import type { No } from '@/lib/grafo/tipos';

const no = (id: string, tipo: No['tipo'], extra: Partial<No> = {}): No => ({
  id,
  tipo,
  rotulo: id,
  grupo: 'g',
  x: 0,
  y: 0,
  grau: 0,
  ...extra,
});
const dados = (): DadosDoGrafo => {
  const nos: No[] = [
    no('sindi', 'nucleo', { x: 0, y: 20 }),
    no('conector:a', 'conector', { x: -250, y: -250, regiao: 'a' }),
    no('estante:n', 'estante', { x: -100, y: 100, regiao: 'geral' }),
    no('ent:lei', 'lei', { x: -90, y: 140, grau: 5 }),
    no('doc:1', 'documento', { x: -110, y: 110, pai: 'estante:n', data: '2025-01-01' }),
    no('doc:2', 'documento', { x: -90, y: 90, pai: 'estante:n', data: '2026-06-01' }),
    no('doc:3', 'documento', { x: -100, y: 120, pai: 'estante:n', data: '2024-03-01' }),
  ];
  const arestas = [
    { de: 'sindi', para: 'conector:a', tipo: 'especialista' as const, peso: 1 },
    { de: 'conector:a', para: 'estante:n', tipo: 'consulta' as const, peso: 1 },
    { de: 'estante:n', para: 'ent:lei', tipo: 'cita' as const, peso: 1 },
    { de: 'doc:1', para: 'estante:n', tipo: 'guarda' as const, peso: 1 },
    { de: 'doc:2', para: 'estante:n', tipo: 'guarda' as const, peso: 1 },
    { de: 'doc:3', para: 'estante:n', tipo: 'guarda' as const, peso: 1 },
    { de: 'doc:1', para: 'ent:lei', tipo: 'cita' as const, peso: 1 },
  ];
  return { nos, arestas };
};
const preparar = () => {
  const d = dados();
  const adj = montarAdjacencia(d.arestas);
  const v = conjuntoVisivel(d, new Set(), true, undefined, adj);
  const nos = nosDaSimulacao(d, v.ids, 'rede', new Map());
  return { d, adj, v, nos };
};

test('layout: os documentos ficam presos à estante (nada de física neles) e acompanham quando ela se mexe', () => {
  const { nos } = preparar();
  const docs = documentosDaLista(nos);
  assert.equal(docs.length, 3);
  assert.ok(docs.every((n) => n.paiRef?.id === 'estante:n'));
  const fisica = nosDaFisica(nos);
  assert.deepEqual(fisica.map((n) => n.id).sort(), ['conector:a', 'ent:lei', 'estante:n', 'sindi']);
  const estante = nos.find((n) => n.id === 'estante:n')!;
  estante.x = 500;
  estante.y = -300;
  seguirAsEstantes(docs);
  const doc1 = nos.find((n) => n.id === 'doc:1')!;
  assert.equal(doc1.x, 500 - 10, 'mantém o deslocamento de origem (-10, +10)');
  assert.equal(doc1.y, -300 + 10);
  assert.equal(estante.filhos, 3, 'a estante sabe quantos documentos agrupa');
});

test('layout: as ligações da física não incluem as dos documentos; as do desenho incluem todas', () => {
  const { d, nos } = preparar();
  const ids = new Set(nosDaFisica(nos).map((n) => n.id));
  assert.equal(ligacoesDaSimulacao(d.arestas, ids).length, 3);
  assert.equal(ligacoesDaSimulacao(d.arestas).length, d.arestas.length);
});

test('layout: o nó nasce na posição de casa e a simulação o mantém em equilíbrio, sem desmontar o cérebro', () => {
  const { d, nos } = preparar();
  const fisica = nosDaFisica(nos);
  const ids = new Set(fisica.map((n) => n.id));
  const sim = criarSimulacao(fisica, ligacoesDaSimulacao(d.arestas, ids), false, false, () => {});
  aplicarForcas(sim, AJUSTES_PADRAO);
  sim.stop();
  sim.alpha(0.3);
  for (let i = 0; i < 120; i++) sim.tick();
  for (const n of fisica) {
    if (n.tipo === 'nucleo') continue;
    assert.ok(Math.hypot((n.x ?? 0) - n.hx, (n.y ?? 0) - n.hy) < 90, `${n.id} ficou perto de casa`);
  }
  const sindi = nos.find((n) => n.id === 'sindi')!;
  assert.deepEqual([sindi.fx, sindi.fy], [0, 20], 'a SINDI fica fixa no centro');
});

test('layout: arrastar estica e a força de centro traz de volta ao lugar de casa', () => {
  const { d, nos } = preparar();
  const fisica = nosDaFisica(nos);
  const ids = new Set(fisica.map((n) => n.id));
  const sim = criarSimulacao(fisica, ligacoesDaSimulacao(d.arestas, ids), false, false, () => {});
  aplicarForcas(sim, AJUSTES_PADRAO);
  sim.stop();
  const conector = nos.find((n) => n.id === 'conector:a')!;
  conector.x = (conector.hx ?? 0) + 300;
  conector.y = (conector.hy ?? 0) - 300;
  sim.alpha(0.6);
  for (let i = 0; i < 400; i++) sim.tick();
  assert.ok(
    Math.hypot((conector.x ?? 0) - conector.hx, (conector.y ?? 0) - conector.hy) < 120,
    'voltou para perto de casa',
  );
});

test('layout: vizinhos — áreas/estantes/leis antes dos documentos, os mais ligados primeiro e os documentos mais recentes primeiro', () => {
  const { d, adj } = preparar();
  const todos = vizinhosDoNo('estante:n', d, adj, 15);
  assert.equal(todos.total, 5);
  assert.deepEqual(
    todos.lista.map((n) => n.id),
    ['ent:lei', 'conector:a', 'doc:2', 'doc:1', 'doc:3'],
    'não documentos primeiro (mais ligados antes); depois os documentos, os mais recentes antes',
  );
  const limitado = vizinhosDoNo('estante:n', d, adj, 2);
  assert.equal(limitado.lista.length, 2);
  assert.equal(limitado.total, 5, 'total conta todos, mesmo os que não cabem na lista');
  assert.ok(
    limitado.lista.every((n) => n.tipo !== 'documento'),
    'sem documento enquanto há área/lei',
  );
  const docs = ordenarVizinhos([
    no('a', 'documento', { data: '2024-01-01' }),
    no('b', 'documento', { data: '2026-01-01' }),
  ]);
  assert.deepEqual(
    docs.map((n) => n.id),
    ['b', 'a'],
  );
});

test('layout: raio — a SINDI é a maior, a estante cresce com os documentos (com teto), documento é um ponto', () => {
  const sindi = raioBase(no('s', 'nucleo'));
  const estanteVazia = raioBase(no('e', 'estante'), 0);
  const estanteGrande = raioBase(no('e', 'estante'), 3900);
  assert.ok(sindi > estanteGrande && estanteGrande > estanteVazia);
  assert.ok(raioBase(no('e', 'estante'), 1_000_000) <= 24, 'teto do raio');
  assert.ok(raioBase(no('d', 'documento')) < 3);
});

test('layout: o enquadramento da rede mostra o cérebro inteiro; o da arquitetura, os nós', () => {
  const rede = enquadramento([], 900, 600, 'rede');
  assert.ok(rede.k > 0.3 && rede.k < 1, `zoom ${rede.k}`);
  const { nos } = preparar();
  const arq = enquadramento(nos, 900, 600, 'arquitetura');
  assert.ok(Number.isFinite(arq.k) && Number.isFinite(arq.x));
});

test('layout: busca acha por trecho sem acento e caixa; termo de uma letra não busca', () => {
  const { d, v } = preparar();
  d.nos[3].rotulo = 'Lei 13.467/2017 — Reforma Trabalhista';
  assert.equal(acharNos(d, v.ids, 'REFORMA')[0].id, 'ent:lei');
  assert.deepEqual(acharNos(d, v.ids, 'r'), []);
});

test('layout: nós guardam a posição entre filtros (o cérebro não "pula")', () => {
  const d = dados();
  const adj = montarAdjacencia(d.arestas);
  const memoria = new Map<string, NoSim>();
  const v = conjuntoVisivel(d, new Set(), true, undefined, adj);
  const primeira = nosDaSimulacao(d, v.ids, 'rede', memoria);
  primeira.find((n) => n.id === 'estante:n')!.x = 999;
  const filtrado = conjuntoVisivel(d, new Set(['documento']), true, undefined, adj);
  const segunda = nosDaSimulacao(d, filtrado.ids, 'rede', memoria);
  assert.equal(segunda.find((n) => n.id === 'estante:n')!.x, 999);
  assert.ok(!segunda.some((n) => n.tipo === 'documento'));
});
