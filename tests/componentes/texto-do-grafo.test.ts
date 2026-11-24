import assert from 'node:assert/strict';
import test from 'node:test';
import {
  caberNaLargura,
  escolherRotulos,
  maisLigacoes,
  quebrarTexto,
  type Caixa,
} from '@/componentes/cerebro/texto-do-grafo';

// Medidor simulado: 7 pixels por caractere, como uma fonte monoespaçada.
const medir = (t: string) => t.length * 7;

test('quebrarTexto: nenhuma linha passa da largura, com qualquer texto (inclusive palavra enorme e espaços repetidos)', () => {
  const textos = [
    'Estantes da biblioteca com um título bem comprido que não cabe numa linha só',
    'https://www.sindeprestem.com.br/institucional-do-sindeprestem-sindicato-das-empresas',
    '   espaços    repetidos   e\nquebras\tde linha   ',
    'a',
    'Lei 13.467/2017 (Reforma Trabalhista) — alterações na CLT e na Lei 6.019/1974',
  ];
  for (const largura of [70, 140, 280]) {
    for (const t of textos) {
      for (const linha of quebrarTexto(t, largura, medir, 5)) {
        assert.ok(medir(linha) <= largura, `"${linha}" passa de ${largura}px`);
        assert.ok(linha.length > 0);
      }
    }
  }
});

test('quebrarTexto: respeita o máximo de linhas e termina em reticências quando corta', () => {
  const longo = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(' ');
  const linhas = quebrarTexto(longo, 140, medir, 3);
  assert.equal(linhas.length, 3);
  assert.ok(linhas[2].endsWith('…'), linhas[2]);
  assert.ok(medir(linhas[2]) <= 140);
  assert.deepEqual(quebrarTexto('curto', 140, medir, 3), ['curto']);
  assert.deepEqual(quebrarTexto('   ', 140, medir, 3), []);
});

test('quebrarTexto: palavra maior que a linha é cortada em pedaços, sem perder letras', () => {
  const palavra = 'x'.repeat(50);
  const linhas = quebrarTexto(palavra, 70, medir, 10);
  assert.equal(linhas.join(''), palavra);
  assert.ok(linhas.every((l) => medir(l) <= 70));
});

test('caberNaLargura: corta com reticências só quando preciso', () => {
  assert.equal(caberNaLargura('cabe', 100, medir), 'cabe');
  const cortado = caberNaLargura('um texto grande demais para a largura', 70, medir);
  assert.ok(cortado.endsWith('…') && medir(cortado) <= 70, cortado);
});

const caixa = (id: string, x: number, y: number, prioridade: number): Caixa => ({
  id,
  x,
  y,
  largura: 80,
  altura: 14,
  prioridade,
});

test('escolherRotulos: o de maior prioridade vence a sobreposição, e os que não se tocam ficam todos', () => {
  const escolhidos = escolherRotulos(
    [caixa('fraco', 10, 10, 1), caixa('forte', 20, 12, 9), caixa('longe', 300, 300, 2)],
    10,
  );
  assert.deepEqual(escolhidos.map((c) => c.id).sort(), ['forte', 'longe']);
});

test('escolherRotulos: nunca devolve duas caixas sobrepostas e respeita o máximo (mancha de textos empilhados)', () => {
  // 200 rótulos na mesma região, como os vizinhos de uma estante com centenas de documentos.
  const todos = Array.from({ length: 200 }, (_, i) => caixa(`n${i}`, (i % 20) * 9, Math.floor(i / 20) * 4, i));
  const escolhidos = escolherRotulos(todos, 36);
  assert.ok(escolhidos.length <= 36);
  for (let i = 0; i < escolhidos.length; i++)
    for (let j = i + 1; j < escolhidos.length; j++) {
      const a = escolhidos[i];
      const b = escolhidos[j];
      const sobrepoe = a.x < b.x + b.largura && a.x + a.largura > b.x && a.y < b.y + b.altura && a.y + a.altura > b.y;
      assert.equal(sobrepoe, false, `${a.id} × ${b.id}`);
    }
});

test('maisLigacoes: concordância no singular e separador de milhar', () => {
  assert.equal(maisLigacoes(1), '+ 1 outra ligação');
  assert.equal(maisLigacoes(2), '+ 2 outras ligações');
  assert.match(maisLigacoes(3988), /3\.988 outras ligações/);
});
