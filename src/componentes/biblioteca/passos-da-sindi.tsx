const PASSOS = [
  ['Compreensão', 'Identifica o assunto e o contexto da conversa, e recusa o que foge do setor.'],
  ['Consulta', 'Busca por palavras e por significado nas estantes e seleciona os trechos pertinentes.'],
  ['Redação', 'O modelo explica, com palavras próprias, o que os trechos dizem para o caso apresentado.'],
  ['Verificação', 'Valores, contatos e leis ausentes das fontes derrubam a resposta; as fontes usadas são citadas.'],
] as const;

/** Como a SINDI usa o acervo, em quatro passos, com o aviso de que o acervo não é parecer jurídico. */
export function PassosDaSindi() {
  return (
    <section aria-labelledby="como-funciona" className="mt-16">
      <div className="border-b-2 border-slate-800 pb-2">
        <h2 id="como-funciona" className="text-lg font-semibold text-slate-900">
          Como a SINDI usa o acervo
        </h2>
      </div>
      <ol className="divide-y divide-slate-200">
        {PASSOS.map(([titulo, descricao], i) => (
          <li key={titulo} className="grid grid-cols-[2rem_1fr] gap-x-4 py-4 sm:grid-cols-[2.5rem_9rem_1fr]">
            <span className="text-sm tabular-nums text-slate-500">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
            <p className="col-start-2 text-sm leading-6 text-slate-600 sm:col-start-auto">{descricao}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-6 text-slate-500">
        O acervo não é parecer jurídico nem determina a vigência de normas. PDFs digitalizados sem texto ficam listados,
        mas sem conteúdo para consulta pela SINDI.
      </p>
    </section>
  );
}
