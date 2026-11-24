// Fiscalizador das fontes do cérebro: confere de onde vem o que a SINDI sabe e se o que é jurídico se apoia em fonte oficial (governo, Constituição, tribunais, Congresso).
// 1. Arquivos de cerebro/conhecimento: nível da fonte do cabeçalho (`fonte:`), data (`atualizado:`) e validade (`valido_ate:`); arquivo de conteúdo jurídico sem fonte oficial,
//    sem data ou vencido é apontado.
// 2. Com `--perguntas`, passa as perguntas de avaliação pela decisão real do chat (sem chamar o modelo) e lista as perguntas jurídicas respondidas sem nenhuma fonte oficial.
// Uso: npm run fontes:fiscalizar [-- --perguntas] [-- --estrito]. `--estrito` sai com código 1 se houver pendência. A busca por significado usa o Gemini:
// npx tsx --env-file=.env.local scripts/cerebro/fiscalizar-fontes.ts --perguntas
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lerCabecalho, pastaCerebro } from '@/lib/cerebro/carregar';
import { exigeFonteOficial, fiscalizarFontes, nivelDaUrl, termosJuridicosEm } from '@/lib/fontes/fiscalizador';
import { conteudoVencido } from '@/lib/produtos/avisos';

const estrito = process.argv.includes('--estrito');
const comPerguntas = process.argv.includes('--perguntas');
/** Idade máxima de um arquivo jurídico sem data de validade própria: leis e prazos mudam (a EC 141 mostrou isso). */
const DIAS_MAXIMOS = 180;
/** Um arquivo com pelo menos esta quantidade de termos jurídicos trata de lei; menos que isso, só a cita de passagem. */
const LIMIAR_JURIDICO = 12;

const pendencias: string[] = [];
const pasta = path.join(pastaCerebro(), 'conhecimento');
console.log('Arquivos de conhecimento');
for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.md'))) {
  const texto = readFileSync(path.join(pasta, arquivo), 'utf8');
  const { cabecalho, corpo } = lerCabecalho(texto);
  const validoAte = texto.match(/^valido_ate:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  const nivel = nivelDaUrl(cabecalho.fonte);
  const juridico = termosJuridicosEm(corpo) >= LIMIAR_JURIDICO;
  const idade = cabecalho.atualizado
    ? Math.floor((Date.now() - new Date(cabecalho.atualizado).getTime()) / 86_400_000)
    : undefined;
  const problemas: string[] = [];
  if (juridico && nivel !== 'oficial') problemas.push('conteúdo jurídico sem fonte oficial no cabeçalho');
  if (juridico && !cabecalho.atualizado) problemas.push('sem data de atualização');
  else if (juridico && idade !== undefined && idade > DIAS_MAXIMOS) problemas.push(`atualizado há ${idade} dias`);
  if (conteudoVencido(validoAte)) problemas.push(`vencido em ${validoAte}`);
  console.log(
    `  ${problemas.length ? '✖' : '✔'} ${arquivo}  [fonte: ${nivel}${juridico ? ', jurídico' : ''}${cabecalho.atualizado ? `, ${cabecalho.atualizado}` : ''}]${problemas.length ? ' — ' + problemas.join('; ') : ''}`,
  );
  for (const p of problemas) pendencias.push(`${arquivo}: ${p}`);
}

if (comPerguntas) {
  const { decidirSituacao } = await import('@/lib/chat/situacao');
  const { carregarCasos } = await import('@/lib/cerebro/casos');
  const perguntas = [
    ...new Set(
      ['perguntas-ouro.md', 'perguntas-ouro-ampliado.md', 'treino-v1.md'].flatMap((a) =>
        carregarCasos(a).map((c) => c.pergunta),
      ),
    ),
  ];
  console.log(`\nPerguntas jurídicas que a SINDI recusa por falta de fonte oficial (de ${perguntas.length})`);
  let n = 0;
  for (const pergunta of perguntas) {
    if (!exigeFonteOficial(pergunta)) continue;
    const d = await decidirSituacao({ mensagens: [{ role: 'user', content: pergunta }] });
    // A decisão do chat já aplica a regra (jurídica sem fonte oficial vira "sem-fonte"): aqui se lista o que o conhecimento ainda não cobre.
    if (d.situacao === 'sem-fonte' || (!d.situacao && fiscalizarFontes(pergunta, d.escolhidas).semOficial)) {
      n++;
      console.log(`  ✖ ${pergunta}`);
      pendencias.push(`pergunta sem fonte oficial: ${pergunta}`);
    }
  }
  if (!n) console.log('  nenhuma');
}

console.log(`\n${pendencias.length} pendência(s).`);
if (estrito && pendencias.length) process.exit(1);
