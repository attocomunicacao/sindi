import { historicoParaOModelo, recentMessages } from '@/lib/chat/esquema';
import { guardarResposta } from '@/lib/infra/cache-respostas';
import { sistema, exemplos } from '@/lib/cerebro/instrucoes';
import type { Mensagem } from '@/lib/base/tipos';
import { escreverComVerificacao, tentativasDeResposta } from '@/lib/chat/geracao';
import { construirPedido, PEDE_MODELO } from '@/lib/chat/prompt';
import { chaveDaGeracao, conferirCotaAntes, gastarCota, reaproveitarOuAbrir } from '@/lib/chat/respostas';
import { lerRequisicaoDoChat } from '@/lib/chat/requisicao';
import { decidirSituacao } from '@/lib/chat/situacao';
import { respostaEmFluxo } from '@/lib/chat/stream';
import { LlmError, MENSAGEM_NEUTRA, rapidoLigado } from '@/lib/ia/cascata';
import { erroJson } from '@/lib/http/guarda';
import { redigirDadosSensiveis, sourceReferences } from '@/lib/knowledge/grounded';
import { registrarUso as registrarUsoReal } from '@/lib/infra/uso';

export const runtime = 'nodejs';
export const maxDuration = 300;
const error = erroJson;
const headers = { 'Cache-Control': 'no-store' };

/**
 * Chat da SINDI. A rota só orquestra; cada etapa mora em src/lib/chat:
 *   requisicao (origem, formato, aquecimento) → situacao (regras e fontes) → prompt (o pedido ao modelo) → respostas (memória, espera e cota)
 *   → geracao (escrita com verificação de fatos) → stream (NDJSON). Nenhuma resposta é escrita pelo servidor: a SINDI decide a situação e a área por regras,
 *   busca as fontes (ou o resultado de uma ferramenta, ver src/lib/ferramentas) e o modelo escreve.
 */
export async function POST(request: Request) {
  const lida = await lerRequisicaoDoChat(request);
  if ('resposta' in lida) return lida.resposta;
  const { mensagens, aquecimento } = lida;
  const language = 'pt'; const started = Date.now();
  const registrarUso: typeof registrarUsoReal = aquecimento ? async () => true : registrarUsoReal;
  const controller = new AbortController();

  async function generate(onDelta?: (text: string) => void, onReset?: () => void) {
    let concluirGeracao: ((texto?: string) => void) | undefined;
    try {
      const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(90000)]);
      // Cota esgotada: avisa antes de buscar (a busca por significado também gasta o provedor).
      const semCota = await conferirCotaAntes(request, aquecimento);
      if (semCota) return semCota;
      // Dados pessoais e segredos nunca chegam ao modelo: a pergunta e o histórico seguem com o trecho removido.
      const recentes = recentMessages(mensagens).map(message => ({ ...message, content: redigirDadosSensiveis(message.content) }));
      const pergunta = recentes.at(-1)!.content; const historico = historicoParaOModelo(recentes.slice(0, -1));
      const { situacao, choices, lista, relatorio, conector, anteriores, writing, question } = await decidirSituacao({ mensagens, language });

      // O que muda a cada pergunta custa tokens do limite gratuito (as regras e os exemplos vêm sempre iguais, primeiro): as fontes têm orçamento de caracteres
      // e a resposta tem limite de palavras, definido pelo conector da área.
      const base: Mensagem[] = [{ role: 'system', content: sistema() }, ...exemplos(), ...historico as Mensagem[]];
      const pedido = construirPedido({ writing, lista, relatorio, conector, choices, pergunta });
      const tentativas = tentativasDeResposta(situacao, choices);
      const primeira = pedido(tentativas[0].nota, tentativas[0].fontes);
      // Nível por tipo de pedido: o rápido só para o que é curto e roteirizado (saudação, recusa, encaminhamento: o servidor já decidiu o que dizer);
      // o principal para tudo o que exige ler fontes. Medido: nas perguntas sobre a própria SINDI o rápido errou 3 de 10 (chegou a dizer que a SINDI é o sindicato).
      // A cascata escolhe o provedor; a memória de respostas é por nível, então uma resposta já verificada serve qualquer que seja o provedor que a escreveu.
      const nivel = rapidoLigado() && situacao ? 'rapido' as const : 'principal' as const;

      // Primeira pergunta de uma conversa com as mesmas regras, exemplos e fontes: a resposta já escrita e verificada sai da memória, ou vem de quem está gerando agora.
      const chave = chaveDaGeracao({ mensagens, situacao, modelo: nivel, base, texto: primeira.texto });
      const reuso = await reaproveitarOuAbrir(chave, signal);
      if ('texto' in reuso) {
        onDelta?.(reuso.texto);
        const metricsRecorded = await registrarUso({ success: true, durationMs: Date.now() - started });
        return Response.json({ text: reuso.texto, metricsRecorded }, { headers });
      }
      concluirGeracao = reuso.concluir;
      const gasto = await gastarCota(request, aquecimento);
      if ('resposta' in gasto) return gasto.resposta;

      const { texto, uso, fontesUsadas, confiavel, provedor } = await escreverComVerificacao({
        base, tentativas, pedido, primeira, nivel, signal, onDelta, onReset, manterColchetes: writing || PEDE_MODELO.test(question), perguntas: [...anteriores, question].join(' '),
      });
      if (!confiavel) { await registrarUso({ success: false, durationMs: Date.now() - started, usage: uso, provedor }); return error('Não foi possível gerar uma resposta confiável. Tente reformular a pergunta.', 502); }
      const references = !writing && texto.trim() && fontesUsadas.length ? sourceReferences(fontesUsadas, language) : '';
      if (references) onDelta?.(references);
      const metricsRecorded = await registrarUso({ success: Boolean(texto.trim()), durationMs: Date.now() - started, usage: uso, provedor });
      if (!texto.trim()) return error('Não foi possível gerar uma resposta. Tente novamente.', 502);
      if (chave && fontesUsadas === choices) { guardarResposta(chave, texto + references); concluirGeracao?.(texto + references); }
      return Response.json({ text: texto + references, metricsRecorded, restantes: gasto.cota?.restantes }, { headers });
    } catch (cause) {
      await registrarUso({ success: false, durationMs: Date.now() - started });
      if (cause instanceof LlmError) return error(cause.message, cause.status);
      if (cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name)) return error('O serviço de IA demorou para responder. Tente novamente.', 504);
      console.warn('SINDI AI service failure', { type: cause instanceof Error ? cause.name : 'unknown' });
      return error(MENSAGEM_NEUTRA, 503);
    } finally { concluirGeracao?.(); }
  }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return generate();
  return respostaEmFluxo(generate, controller);
}
