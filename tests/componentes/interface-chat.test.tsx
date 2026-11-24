import '../apoio/setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { NOVA_CONVERSA } from '@/componentes/chat/nova-conversa';

const original = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = original;
});
const ndjson = (...eventos: (object | string)[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const e of eventos)
          c.enqueue(new TextEncoder().encode((typeof e === 'string' ? e : JSON.stringify(e)) + '\n'));
        c.close();
      },
    }),
    { headers: { 'content-type': 'application/x-ndjson' } },
  );
const corpoEnviado = { pedidos: [] as { messages: { role: string; content: string }[] }[] };
const servir = (resposta: () => Response) => {
  corpoEnviado.pedidos = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    corpoEnviado.pedidos.push(JSON.parse(String(init?.body)));
    return resposta();
  }) as typeof fetch;
};
const caixa = () => screen.getByLabelText('Mensagem para SINDI') as HTMLTextAreaElement;
const perguntar = (texto: string) => {
  fireEvent.change(caixa(), { target: { value: texto } });
  fireEvent.click(screen.getByLabelText('Enviar'));
};
const aguardarFim = async () => {
  await waitFor(() => assert.ok(screen.queryByLabelText('Parar resposta') === null, 'a resposta terminou'));
};

test('chat: a resposta em fluxo aparece, o saldo de mensagens é mostrado e o leitor de tela recebe o texto completo uma vez', async () => {
  servir(() =>
    ndjson(
      { type: 'delta', text: 'O telefone ' },
      { type: 'delta', text: 'é (11) 3215-8250.' },
      { type: 'done', text: 'O telefone é (11) 3215-8250.', restantes: 5 },
    ),
  );
  render(<Home />);
  perguntar('Qual o telefone?');
  await screen.findByText('O telefone é (11) 3215-8250.');
  await aguardarFim();
  assert.ok(screen.getByText('Qual o telefone?'));
  assert.match(screen.getByText(/Restam 5 mensagens hoje/).textContent ?? '', /externos gratuitos/);
  assert.match(
    screen.getByRole('status', { hidden: true, name: '' }).textContent ?? '',
    /SINDI respondeu: O telefone é \(11\) 3215-8250\./,
  );
  assert.deepEqual(corpoEnviado.pedidos[0].messages, [{ role: 'user', content: 'Qual o telefone?' }]);
  assert.equal(caixa().value, '');
});

test('chat: o saldo usa o singular quando resta uma mensagem', async () => {
  servir(() => ndjson({ type: 'done', text: 'Olá!', restantes: 1 }));
  render(<Home />);
  perguntar('Oi');
  await screen.findByText('Olá!');
  assert.ok(screen.getByText(/Resta?m? 1 mensagem hoje/));
});

test('chat: conexão cai no meio da resposta: o texto parcial fica na tela com o aviso e a pergunta continua na conversa', async () => {
  servir(() => ndjson({ type: 'delta', text: 'A contribuição vence ' }));
  render(<Home />);
  perguntar('Quando vence a contribuição?');
  await screen.findByText(/A contribuição vence/);
  await aguardarFim();
  const alerta = await screen.findByRole('alert');
  assert.match(alerta.textContent ?? '', /A resposta foi interrompida/);
  assert.ok(screen.getByText('Quando vence a contribuição?'), 'a pergunta continua na conversa');
  assert.equal(caixa().value, '', 'e não volta para a caixa');
});

test('chat: erro enviado pelo servidor descarta o texto parcial (não é confiável) e devolve a pergunta à caixa', async () => {
  servir(() =>
    ndjson(
      { type: 'delta', text: 'Ligue para (11) 4002-8922.' },
      { type: 'error', error: 'Não foi possível gerar uma resposta confiável. Tente reformular a pergunta.' },
    ),
  );
  render(<Home />);
  perguntar('Qual o telefone?');
  const alerta = await screen.findByRole('alert');
  assert.match(alerta.textContent ?? '', /resposta confiável/);
  await aguardarFim();
  assert.equal(screen.queryByText(/4002-8922/), null, 'o texto não verificado some');
  assert.equal(caixa().value, 'Qual o telefone?', 'a pergunta volta para editar');
});

test('chat: cota esgotada (429) mostra a mensagem do servidor', async () => {
  servir(() =>
    Response.json(
      {
        error: 'Você atingiu o limite de 20 mensagens de hoje. Ela volta a responder para você em cerca de 5 h.',
        restantes: 0,
      },
      { status: 429 },
    ),
  );
  render(<Home />);
  perguntar('Oi');
  assert.match((await screen.findByRole('alert')).textContent ?? '', /limite de 20 mensagens/);
  assert.equal(caixa().value, 'Oi');
});

test('chat: erro 502 do repasse com corpo em HTML mostra uma mensagem clara, não um erro de leitura', async () => {
  servir(
    () =>
      new Response('<html><body>Bad Gateway</body></html>', { status: 502, headers: { 'content-type': 'text/html' } }),
  );
  render(<Home />);
  perguntar('Oi');
  const alerta = await screen.findByRole('alert');
  assert.match(alerta.textContent ?? '', /O serviço está indisponível agora/);
  assert.doesNotMatch(alerta.textContent ?? '', /JSON|Unexpected|token/i);
});

test('chat: linha inválida no fluxo vira "resposta interrompida", sem mostrar o erro técnico', async () => {
  servir(() => ndjson('{isto não é json', { type: 'done', text: 'Texto' }));
  render(<Home />);
  perguntar('Oi');
  const alerta = await screen.findByRole('alert');
  assert.match(alerta.textContent ?? '', /A resposta foi interrompida/);
  assert.doesNotMatch(alerta.textContent ?? '', /JSON|Unexpected/i);
});

test('chat: a sugestão da tela inicial envia a pergunta, e a conversa vai junto na pergunta seguinte', async () => {
  servir(() => ndjson({ type: 'done', text: 'Resposta um.' }));
  render(<Home />);
  const sugestao = (await screen.findAllByRole('button')).find(
    (b) => /\?$/.test(b.textContent?.trim() ?? '') && b.getAttribute('aria-label') === null,
  )!;
  const pergunta = sugestao.textContent!.trim();
  fireEvent.click(sugestao);
  await screen.findByText('Resposta um.');
  await aguardarFim();
  servir(() => ndjson({ type: 'done', text: 'Resposta dois.' }));
  perguntar('E para filiadas?');
  await screen.findByText('Resposta dois.');
  assert.deepEqual(
    corpoEnviado.pedidos[0].messages.map((m) => m.role),
    ['user', 'assistant', 'user'],
    'o histórico segue com a nova pergunta',
  );
  assert.equal(corpoEnviado.pedidos[0].messages[0].content, pergunta);
});

test('chat: Esc ou o botão Parar interrompem a resposta e, sem texto recebido, a pergunta volta para a caixa', async () => {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_, rejeitar) => {
      init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
    })) as typeof fetch;
  render(<Home />);
  perguntar('Pergunta longa');
  const parar = await screen.findByLabelText('Parar resposta');
  fireEvent.click(parar);
  await aguardarFim();
  assert.equal(caixa().value, 'Pergunta longa');
  assert.equal(screen.queryByRole('alert'), null, 'parar não é erro');
});

test('chat: "Nova conversa" limpa também o texto escondido que o leitor de tela recebeu (não fica a resposta anterior no documento)', async () => {
  servir(() => ndjson({ type: 'done', text: 'Resposta antiga.' }));
  render(<Home />);
  perguntar('Oi');
  await screen.findAllByText(/Resposta antiga\./);
  assert.match(
    screen.getByRole('status', { hidden: true, name: '' }).textContent ?? '',
    /SINDI respondeu: Resposta antiga\./,
  );
  fireEvent(window, new window.Event(NOVA_CONVERSA));
  await waitFor(() => assert.equal(screen.queryAllByText(/Resposta antiga\./).length, 0));
});
