import '../apoio/setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { MensagemDoChat } from '@/componentes/chat/mensagem-do-chat';
import { PainelCompleto } from '@/componentes/painel/painel-completo';
import { painelVazio, type Painel } from '@/lib/dados/painel';

afterEach(() => { cleanup(); });

// O texto que o modelo escreve pode carregar o que o usuário ou uma fonte colocou nele: tudo que vira HTML precisa passar pelo filtro.
const PERIGOSOS = [
  '[clique](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x](java\tscript:alert(1))', '[x](  javascript:alert(1))', '[x](vbscript:msgbox(1))', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)', '[x](//evil.example/roubo)', '[x](file:///C:/Windows/win.ini)',
  '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<a href="javascript:alert(1)">x</a>', '<svg onload=alert(1)><circle/></svg>', '<iframe src="https://evil.example"></iframe>', '<div style="background:url(https://evil.example/t)" onclick="alert(1)">x</div>',
  '<form action="https://evil.example"><input name=senha></form>', '<meta http-equiv="refresh" content="0;url=https://evil.example">', '<base href="https://evil.example/">', '<object data="https://evil.example/x.swf"></object>',
  '![rastreador](https://track.example/pixel.png)', '![x](javascript:alert(1))', '[x]: javascript:alert(1)\n\n[ref][x]', '<https://evil.example>', '`<script>alert(1)</script>`', '\u202e<script>alert(1)</script>',
];
const ATRIBUTOS_DE_EVENTO = /^on/i;

test('markdown do chat: nenhum elemento ativo, nenhum manipulador de evento e nenhum link com esquema perigoso, para cada carga maliciosa', () => {
  for (const carga of PERIGOSOS) {
    const { container, unmount } = render(<MensagemDoChat conteudo={`Resposta: ${carga}\n\nFim.`} />);
    for (const proibido of ['script', 'img', 'iframe', 'svg', 'form', 'input', 'meta', 'base', 'object', 'embed', 'style', 'link']) assert.equal(container.querySelectorAll(proibido).length, 0, `<${proibido}> renderizado para ${JSON.stringify(carga)}`);
    for (const elemento of Array.from(container.querySelectorAll('*'))) for (const atributo of Array.from(elemento.attributes)) {
      assert.ok(!ATRIBUTOS_DE_EVENTO.test(atributo.name), `${atributo.name} em <${elemento.tagName}> para ${JSON.stringify(carga)}`);
      assert.ok(atributo.name !== 'style', `style em <${elemento.tagName}> para ${JSON.stringify(carga)}`);
    }
    for (const a of Array.from(container.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? '';
      assert.ok(/^(https?:\/\/|mailto:)/i.test(href) || /^\/(?!\/)/.test(href), `href perigoso "${href}" para ${JSON.stringify(carga)}`);
      if (!href.startsWith('/')) { assert.equal(a.getAttribute('target'), '_blank'); assert.match(a.getAttribute('rel') ?? '', /noopener/); assert.match(a.getAttribute('rel') ?? '', /noreferrer/); }
    }
    assert.ok(container.textContent?.includes('Fim.'), 'o texto continua legível'); unmount();
  }
});

test('markdown do chat: links legítimos continuam funcionando (https, mailto e caminhos do próprio site), abrindo fora com rel seguro', () => {
  const { container } = render(<MensagemDoChat conteudo={'Veja [a convenção](https://www.sindeprestem.com.br/convencao.pdf), escreva para [o jurídico](mailto:juridico@sindeprestem.com.br) ou use [a calculadora](/orcamento?postos=zelador%3A2%3Adiurno).'} />);
  const links = Array.from(container.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), alvo: a.getAttribute('target') }));
  assert.deepEqual(links, [{ href: 'https://www.sindeprestem.com.br/convencao.pdf', alvo: '_blank' }, { href: 'mailto:juridico@sindeprestem.com.br', alvo: '_blank' }, { href: '/orcamento?postos=zelador%3A2%3Adiurno', alvo: null }]);
});

test('painel: endereços perigosos vindos das fontes coletadas viram "#" nos links de notícias, projetos e artigos', async () => {
  const agora = new Date().toISOString();
  const painel: Painel = { ...painelVazio(), available: true, updatedAt: agora, sources: [{ source: 'ibge', lastOk: agora, status: 'ok' }],
    news: [{ source: 'ibge', title: 'Notícia com link ruim', publishedAt: agora, url: 'javascript:alert(document.cookie)' }],
    bills: [{ source: 'camara', title: 'PL malicioso', summary: '<img src=x onerror=alert(1)>', situacao: null, movedAt: null, url: 'data:text/html,<script>alert(1)</script>' }],
    sindicato: { noticias: [{ source: 'sindeprestem', title: 'Do sindicato', publishedAt: agora, url: 'JaVaScRiPt:alert(1)' }], artigos: [{ source: 'sindeprestem', title: 'Artigo', publishedAt: agora, url: 'https://www.sindeprestem.com.br/post/a' }] } };
  const original = globalThis.fetch; globalThis.fetch = (async () => Response.json(painel)) as typeof fetch;
  try {
    const { container } = render(<PainelCompleto />);
    await screen.findByText('Notícias do SINDEPRESTEM');
    const href = (texto: string) => (screen.getByText(texto).closest('a') as HTMLAnchorElement).getAttribute('href');
    assert.equal(href('Notícia com link ruim'), '#'); assert.equal(href('PL malicioso'), '#'); assert.equal(href('Do sindicato'), '#'); assert.equal(href('Artigo'), 'https://www.sindeprestem.com.br/post/a');
    assert.equal(container.querySelectorAll('img, script').length, 0, 'o resumo com HTML aparece como texto, não vira elemento');
    assert.ok(screen.getByText('<img src=x onerror=alert(1)>'));
  } finally { globalThis.fetch = original; }
});
