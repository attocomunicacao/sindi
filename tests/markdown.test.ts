import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessage } from '../src/components/chat-message';
const render = (content: string) => renderToStaticMarkup(createElement(ChatMessage, { content }));
test('formats bold, markdown links and automatic URL links', () => {
  const html = render('**Importante**\n\n[Site](https://www.sindeprestem.com.br/)\n\nhttps://www.sindeprestem.com.br/juridico');
  assert.match(html, /<strong>Importante<\/strong>/);
  assert.match(html, /href="https:\/\/www.sindeprestem.com.br\/"/);
  assert.match(html, /href="https:\/\/www.sindeprestem.com.br\/juridico"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test('does not execute HTML, unsafe links or external image requests', () => {
  const html = render('<script>alert(1)</script>\n\n[click](javascript:alert%281%29)\n\n![image](https://tracker.example/pixel)');
  assert.doesNotMatch(html, /<script|javascript:|<img|href=""/);
});

test('same-site paths are clickable links, but protocol-relative and script URLs are not', () => {
  const html = render('[ferramenta](/orcamento?postos=zelador%3A2%3Adiurno&m2=500) [painel](/painel) [externo](//evil.example/x) [fonte](https://www.sindeprestem.com.br/contato)');
  assert.match(html, /<a href="\/orcamento\?postos=zelador%3A2%3Adiurno&(amp;)?m2=500">/);
  assert.match(html, /<a href="\/painel">/);
  assert.doesNotMatch(html, /evil\.example/);
  assert.match(html, /<a href="https:\/\/www\.sindeprestem\.com\.br\/contato" target="_blank"/);
});
