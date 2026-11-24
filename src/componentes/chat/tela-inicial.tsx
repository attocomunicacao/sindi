import { ArrowUpRight } from 'lucide-react';
import { BarraDeDestaque } from '@/componentes/ui/pagina-ferramenta';

type PropsDaTelaInicial = { sugestoes: string[]; desabilitada: boolean; aoEscolher: (pergunta: string) => void };

/** Tela de abertura do chat: o nome da assistente e três perguntas sugeridas, que enviam a pergunta ao toque. */
export function TelaInicial({ sugestoes, desabilitada, aoEscolher }: PropsDaTelaInicial) {
  return (
    <div className="anim-rise flex flex-1 flex-col justify-center pb-10 pt-12 baixo:pb-6 baixo:pt-6">
      <BarraDeDestaque className="mb-6" />
      <h1 className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-7xl">
        <span className="marca-texto">SINDI</span>
      </h1>
      <p className="mt-4 text-xl text-slate-500 sm:text-2xl">Assistente virtual do SINDEPRESTEM.</p>
      <ul className="mt-12 grid gap-3 sm:grid-cols-3">
        {sugestoes.map((sugestao) => (
          <li key={sugestao}>
            <button
              disabled={desabilitada}
              onClick={() => aoEscolher(sugestao)}
              className="group flex h-full w-full items-start justify-between gap-4 rounded-3xl bg-surface p-5 text-left text-base text-slate-700 shadow-suave hover:bg-amber-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {sugestao}
              <ArrowUpRight
                size={16}
                className="shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-amber-600"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
