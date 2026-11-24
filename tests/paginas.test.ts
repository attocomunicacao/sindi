import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PAGINAS, paginaDe, paginasDoMenu, rotaDe, rotasSemPrevia } from '@/lib/paginas';
import robots from '@/app/robots';

test('registro de páginas: ids e rotas únicos, e toda rota tem uma página em src/app', () => {
  assert.equal(new Set(PAGINAS.map(p => p.id)).size, PAGINAS.length); assert.equal(new Set(PAGINAS.map(p => p.rota)).size, PAGINAS.length);
  for (const p of PAGINAS) {
    const arquivo = path.join(process.cwd(), 'src', 'app', p.rota === '/' ? '' : p.rota, 'page.tsx');
    assert.ok(existsSync(arquivo), `${p.rota} sem ${arquivo}`);
  }
});

test('toda página registrada tem glifo na marca; o cabeçalho monta o menu pelo registro e deixa de fora as páginas com menu: false', () => {
  const marca = readFileSync(path.join(process.cwd(), 'src', 'components', 'sindi-mark.tsx'), 'utf8');
  const cabecalho = readFileSync(path.join(process.cwd(), 'src', 'components', 'site-header.tsx'), 'utf8');
  for (const p of PAGINAS) assert.match(marca, new RegExp(`^\\s{2}${p.id}: \\[`, 'm'), `glifo de ${p.id}`);
  assert.match(cabecalho, /paginasDoMenu\(\)\.map/); assert.doesNotMatch(cabecalho, /\['\/painel'/, 'links escritos à mão voltaram ao cabeçalho');
  assert.ok(!paginasDoMenu().some(p => (p.id as string) === 'custos'), 'a página de custos é só pelo endereço');
  assert.ok(rotasSemPrevia().includes('/custos'));
});

test('paginaDe reconhece subcaminhos e cai em início para o resto; rotaDe devolve a rota', () => {
  assert.equal(paginaDe('/'), 'inicio'); assert.equal(paginaDe('/orcamento'), 'orcamento'); assert.equal(paginaDe('/base/documento/12'), 'base');
  assert.equal(paginaDe('/painel/'), 'painel'); assert.equal(paginaDe('/baseada'), 'inicio'); assert.equal(paginaDe('/qualquer-coisa'), 'inicio');
  assert.equal(rotaDe('uso'), '/uso');
});

test('robots: só os rastreadores de prévia leem o site, e as páginas sem prévia saem da lista dele', () => {
  const regras = robots().rules as { userAgent: string | string[]; allow?: string; disallow?: string | string[] }[];
  const previa = regras.find(r => Array.isArray(r.userAgent))!; const geral = regras.find(r => r.userAgent === '*')!;
  assert.equal(geral.disallow, '/');
  assert.deepEqual(previa.disallow, ['/api/', ...rotasSemPrevia()]);
  for (const p of PAGINAS) assert.equal((previa.disallow as string[]).includes(p.rota), !p.previa, p.rota);
});
