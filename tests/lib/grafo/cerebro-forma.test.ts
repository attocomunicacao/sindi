import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CENTRO,
  contornoOndulado,
  dentroDoCerebro,
  ELIPSES,
  REGIAO_GERAL,
  regiaoDoConector,
  todasAsRegioes,
} from '@/lib/grafo/cerebro-forma';
import { conectores } from '@/lib/cerebro/conectores';

test('cérebro: dois hemisférios (esquerdo e direito), simétricos, com a SINDI no meio e uma fissura entre eles', () => {
  assert.deepEqual(
    ELIPSES.map((e) => e.lado),
    ['esquerdo', 'direito'],
  );
  assert.equal(ELIPSES[0].cx, -ELIPSES[1].cx);
  assert.equal(CENTRO.x, 0, 'a SINDI fica na linha média');
  assert.ok(dentroDoCerebro(-240, 20) && dentroDoCerebro(240, 20));
  assert.equal(dentroDoCerebro(900, 0), false);
  assert.equal(dentroDoCerebro(0, 900), false);
  // A fissura: entre os hemisférios há um vão, para os dois lados se distinguirem.
  assert.equal(dentroDoCerebro(0, -300), false, 'a linha média alta é fissura');
});

test('cérebro: toda região de área mora dentro do hemisfério do lado dela (as da linha média ficam no eixo)', () => {
  for (const r of todasAsRegioes()) {
    if (!r.lado) {
      assert.ok(Math.abs(r.x) < 20, `${r.id} fica na linha média`);
      continue;
    }
    assert.ok(dentroDoCerebro(r.x, r.y, 0.95), `${r.id} dentro da silhueta`);
    assert.equal(r.x < 0, r.lado === 'esquerdo', `${r.id} no lado ${r.lado}`);
  }
});

test('cérebro: cada área (conector) tem uma região própria; ids repetidos de reserva não colidem com as regiões conhecidas', () => {
  const ancoras = conectores().map((c) => regiaoDoConector(c.id));
  assert.equal(ancoras.length, conectores().length);
  assert.equal(
    new Set(ancoras.map((r) => `${r.x},${r.y}`)).size,
    ancoras.length,
    'duas áreas não dividem a mesma âncora',
  );
  assert.ok(ancoras.every((r) => r.anatomia && /^#[0-9a-f]{6}$/i.test(r.cor)));
  // Área nova (ainda sem tabela): cai num lugar de reserva, dentro do cérebro.
  const nova = regiaoDoConector('area-que-nao-existe', 0);
  assert.ok(dentroDoCerebro(nova.x, nova.y, 0.95));
  assert.equal(REGIAO_GERAL.id, 'geral');
});

test('cérebro: o contorno ondulado é finito, determinístico e acompanha o hemisfério (a silhueta é o único desenho do cérebro)', () => {
  for (const e of ELIPSES) {
    const a = contornoOndulado(e);
    assert.deepEqual(a, contornoOndulado(e));
    assert.ok(a.length > 100 && a.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    // A borda ondulada varia poucos por cento do raio: todos os pontos ficam perto da elipse.
    assert.ok(a.every(([x, y]) => dentroDoCerebro(x, y, 1.12) && !dentroDoCerebro(x, y, 0.9)));
  }
});
