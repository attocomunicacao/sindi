import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FERRAMENTAS, executarFerramentas } from '@/lib/ferramentas/registro';
import type { Ferramenta } from '@/lib/ferramentas/tipos';
import { PAGINAS } from '@/lib/paginas';

const raiz = process.cwd();
const ler = (...partes: string[]) => readFileSync(path.join(raiz, ...partes), 'utf8');

// O contrato de uma ferramenta é conferido aqui: quem acrescentar uma ferramenta ao registro recebe a lista do que falta em vez de descobrir em produção.
for (const ferramenta of FERRAMENTAS) {
  test(`ferramenta "${ferramenta.id}": página, rotas com guarda, variáveis de ambiente e testes declarados existem`, () => {
    if (ferramenta.pagina) {
      const pagina = PAGINAS.find(p => p.id === ferramenta.pagina); assert.ok(pagina, `página ${ferramenta.pagina} fora de src/lib/paginas.ts`);
      assert.ok(existsSync(path.join(raiz, 'src', 'app', pagina.rota, 'page.tsx')), `sem src/app${pagina.rota}/page.tsx`);
    }
    for (const rota of ferramenta.api ?? []) {
      const arquivo = path.join('src', 'app', ...rota.split('/').filter(Boolean), 'route.ts');
      assert.ok(existsSync(path.join(raiz, arquivo)), `sem ${arquivo}`);
      // Toda rota passa pela guarda compartilhada (origem, limite por minuto, tamanho do corpo): direto ou por um leitor que a usa.
      assert.match(ler(arquivo), /guardaDe(Escrita|Leitura)|lerRequisicao/, `${arquivo} não usa a guarda de rotas (src/lib/http/guarda.ts)`);
    }
    const exemplo = ler('env.example');
    for (const variavel of ferramenta.env ?? []) assert.match(exemplo, new RegExp(`^${variavel}=`, 'm'), `${variavel} não consta em env.example`);
    assert.ok(ferramenta.testes.length > 0, 'a ferramenta declara ao menos um teste');
    for (const teste of ferramenta.testes) assert.ok(existsSync(path.join(raiz, teste)), `teste ${teste} não existe`);
  });
}

test('registro: ids únicos e nenhuma rota de API repetida entre ferramentas', () => {
  assert.equal(new Set(FERRAMENTAS.map(f => f.id)).size, FERRAMENTAS.length);
  const rotas = FERRAMENTAS.flatMap(f => f.api ?? []); assert.equal(new Set(rotas).size, rotas.length);
});

const fake = (id: string, executar: NonNullable<Ferramenta['chat']>['executar']): Ferramenta => ({ id, testes: [], chat: { executar } });

test('executarFerramentas: a primeira que reconhece o pedido responde, com a marca e a orientação dela, e a fonte é fixada', async () => {
  const chamadas: string[] = [];
  const ferramentas = [
    fake('a', () => { chamadas.push('a'); return undefined; }),
    fake('b', async pergunta => { chamadas.push('b'); return pergunta.includes('cnpj') ? { passagem: { url: '/cnpj', title: 'Consulta de CNPJ', content: 'Razão social: Acme' }, orientacao: 'Cite só os dados da fonte.' } : undefined; }),
    fake('c', () => { chamadas.push('c'); return { passagem: { url: '/c', title: 'C', content: 'c' }, orientacao: 'c' }; }),
  ];
  const resposta = await executarFerramentas('consulte o cnpj 00.000.000/0001-91', {}, ferramentas);
  assert.deepEqual(chamadas, ['a', 'b'], 'a seguinte não é chamada depois de uma resposta');
  assert.equal(resposta.length, 1); assert.equal(resposta[0].title, 'Consulta de CNPJ'); assert.equal(resposta[0].pinned, true);
  assert.deepEqual(resposta[0].ferramenta, { id: 'b', orientacao: 'Cite só os dados da fonte.' }); assert.match(resposta[0].fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(await executarFerramentas('bom dia', {}, [ferramentas[0], ferramentas[1]]), []);
  assert.deepEqual(await executarFerramentas('qualquer coisa', {}, [{ id: 'sem-chat', testes: [] }]), []);
});

test('executarFerramentas: uma ferramenta que lança erro não derruba o chat, e a seguinte ainda é consultada', async () => {
  const aviso = console.warn; const avisos: unknown[][] = []; console.warn = (...a: unknown[]) => { avisos.push(a); };
  try {
    const ferramentas = [fake('quebrada', () => { throw new Error('serviço fora do ar'); }), fake('boa', () => ({ passagem: { url: '/b', title: 'B', content: 'ok' }, orientacao: 'o' }))];
    const resposta = await executarFerramentas('pergunta', {}, ferramentas);
    assert.equal(resposta[0]?.ferramenta?.id, 'boa'); assert.equal(avisos.length, 1);
    assert.deepEqual(avisos[0][1], { ferramenta: 'quebrada' }, 'o aviso traz só o id da ferramenta, nunca a pergunta nem o erro');
  } finally { console.warn = aviso; }
});

test('o orçamento é a ferramenta do chat para pedidos de orçamento e ignora as outras perguntas', async () => {
  const resposta = await executarFerramentas('Preciso de um orçamento para 3 auxiliares de limpeza diurno', {});
  assert.equal(resposta[0]?.ferramenta?.id, 'orcamento'); assert.match(resposta[0].url, /^\/orcamento/);
  assert.deepEqual(await executarFerramentas('Qual o telefone do sindicato?', {}), []);
});
