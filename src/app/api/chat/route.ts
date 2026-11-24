import { historicoParaOModelo, mensagensRecentes } from '@/lib/chat/esquema';
import { semReferencias } from '@/lib/chat/historico';
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
import { erroJson, jsonSemCache } from '@/lib/http/guarda';
import { redigirDadosSensiveis } from '@/lib/seguranca/redacao';
import { fontesApoiadas, referenciasDasFontes } from '@/lib/recuperacao/fontes';
import { registrarUso as registrarUsoReal } from '@/lib/infra/uso';
import { chavesDeMetricaDoCerebro, resumirUsoDoCerebro } from '@/lib/chat/uso-do-cerebro';

export const runtime = 'nodejs';
export const maxDuration = 300;
const erro = erroJson;

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
  const inicio = Date.now();
  const registrarUso: typeof registrarUsoReal = aquecimento ? async () => true : registrarUsoReal;
  const controlador = new AbortController();

  async function gerar(onDelta?: (trecho: string) => void, onReset?: () => void) {
    let concluirGeracao: ((texto?: string) => void) | undefined;
    try {
      const sinal = AbortSignal.any([request.signal, controlador.signal, AbortSignal.timeout(90000)]);
      // Cota esgotada: avisa antes de buscar (a busca por significado também gasta o provedor).
      const semCota = await conferirCotaAntes(request, aquecimento);
      if (semCota) return semCota;
      // Dados pessoais e segredos nunca chegam ao modelo: a pergunta e o histórico seguem com o trecho removido.
      const recentes = mensagensRecentes(mensagens).map((mensagem) => ({
        ...mensagem,
        content: redigirDadosSensiveis(mensagem.content),
      }));
      const pergunta = recentes.at(-1)!.content;
      const historico = historicoParaOModelo(recentes.slice(0, -1));
      const respostaAnterior = semReferencias(recentes.filter((m) => m.role === 'assistant').at(-1)?.content ?? '');
      const { situacao, escolhidas, lista, relatorio, conector, anteriores, ehRedacao, perguntaAtual } =
        await decidirSituacao({ mensagens });

      // O que muda a cada pergunta custa tokens do limite gratuito (as regras e os exemplos vêm sempre iguais, primeiro): as fontes têm orçamento de caracteres
      // e a resposta tem limite de palavras, definido pelo conector da área.
      const base: Mensagem[] = [{ role: 'system', content: sistema() }, ...exemplos(), ...(historico as Mensagem[])];
      const pedido = construirPedido({ ehRedacao, lista, relatorio, conector, escolhidas, pergunta });
      const tentativas = tentativasDeResposta(situacao, escolhidas);
      const primeira = pedido(tentativas[0].nota, tentativas[0].fontes);
      // Nível por tipo de pedido: o rápido só para o que é curto e roteirizado (saudação, recusa, encaminhamento: o servidor já decidiu o que dizer);
      // o principal para tudo o que exige ler fontes. Medido: nas perguntas sobre a própria SINDI o rápido errou 3 de 10 (chegou a dizer que a SINDI é o sindicato).
      // A cascata escolhe o provedor; a memória de respostas é por nível, então uma resposta já verificada serve qualquer que seja o provedor que a escreveu.
      const nivel = rapidoLigado() && situacao ? ('rapido' as const) : ('principal' as const);

      // Primeira pergunta de uma conversa com as mesmas regras, exemplos e fontes: a resposta já escrita e verificada sai da memória, ou vem de quem está gerando agora.
      const chave = chaveDaGeracao({ mensagens, situacao, modelo: nivel, base, texto: primeira.texto });
      const reuso = await reaproveitarOuAbrir(chave, sinal);
      if ('texto' in reuso) {
        onDelta?.(reuso.texto);
        const cerebro = resumirUsoDoCerebro({ conector, situacao, fontes: escolhidas });
        const metricasRegistradas = await registrarUso({
          success: true,
          durationMs: Date.now() - inicio,
          cerebro: chavesDeMetricaDoCerebro(cerebro),
        });
        return jsonSemCache({ text: reuso.texto, metricsRecorded: metricasRegistradas, cerebro });
      }
      concluirGeracao = reuso.concluir;
      // A cota é gasta antes de escrever e verificar os fatos: a geração já consome o limite do provedor, mesmo quando a verificação reprova e manda reescrever.
      const gasto = await gastarCota(request, aquecimento);
      if ('resposta' in gasto) return gasto.resposta;

      const { texto, uso, fontesUsadas, confiavel, provedor } = await escreverComVerificacao({
        base,
        tentativas,
        pedido,
        primeira,
        nivel,
        signal: sinal,
        onDelta,
        onReset,
        manterColchetes: ehRedacao || PEDE_MODELO.test(perguntaAtual),
        // O que o usuário já disse e a última resposta que a SINDI deu (já verificada): números e contatos repetidos numa continuação não reprovam.
        perguntas: [...anteriores, respostaAnterior, perguntaAtual].filter(Boolean).join(' '),
      });
      if (!confiavel) {
        await registrarUso({ success: false, durationMs: Date.now() - inicio, usage: uso, provedor });
        return erro('Não foi possível gerar uma resposta confiável. Tente reformular a pergunta.', 502);
      }
      // O que o cérebro entregou nesta resposta (áreas, origem e nós das fontes): vai ao navegador para acender o /cerebro e vira contador agregado.
      const apoiadas = fontesApoiadas(texto, fontesUsadas);
      const cerebro = resumirUsoDoCerebro({ conector, situacao, fontes: apoiadas });
      const referencias = !ehRedacao && texto.trim() && apoiadas.length ? referenciasDasFontes(apoiadas) : '';
      if (referencias) onDelta?.(referencias);
      const metricasRegistradas = await registrarUso({
        success: Boolean(texto.trim()),
        durationMs: Date.now() - inicio,
        usage: uso,
        provedor,
        cerebro: chavesDeMetricaDoCerebro(cerebro),
      });
      if (!texto.trim()) return erro('Não foi possível gerar uma resposta. Tente novamente.', 502);
      if (chave && fontesUsadas === escolhidas) {
        guardarResposta(chave, texto + referencias);
        concluirGeracao?.(texto + referencias);
      }
      return jsonSemCache({
        text: texto + referencias,
        metricsRecorded: metricasRegistradas,
        restantes: gasto.cota?.restantes,
        cerebro,
      });
    } catch (causa) {
      await registrarUso({ success: false, durationMs: Date.now() - inicio });
      if (causa instanceof LlmError) return erro(causa.message, causa.status);
      if (causa instanceof Error && ['TimeoutError', 'AbortError'].includes(causa.name))
        return erro('O serviço de IA demorou para responder. Tente novamente.', 504);
      console.warn('SINDI AI service failure', { type: causa instanceof Error ? causa.name : 'unknown' });
      return erro(MENSAGEM_NEUTRA, 503);
    } finally {
      concluirGeracao?.();
    }
  }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return gerar();
  return respostaEmFluxo(gerar, controlador);
}
