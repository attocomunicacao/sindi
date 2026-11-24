'use client';
import { useId, useState, type KeyboardEvent } from 'react';
import { AbaDas } from '@/componentes/tributos/aba-das';
import { AbaRegimeRegular } from '@/componentes/tributos/aba-regime-regular';
import { AbaSimples } from '@/componentes/tributos/aba-simples';
import { SaibaMais } from '@/componentes/ui/saiba-mais';

// Todo o cálculo roda no navegador, com as mesmas bibliotecas puras do servidor: nada é enviado nem gravado.
const ABAS = [
  { id: 'regular', nome: 'Regime regular (CBS/IBS de um serviço)', Conteudo: AbaRegimeRegular },
  { id: 'das', nome: 'Simples Nacional — DAS', Conteudo: AbaDas },
  { id: 'simples', nome: 'Simples Nacional — CBS/IBS', Conteudo: AbaSimples },
] as const;
type IdDaAba = (typeof ABAS)[number]['id'];

/** Abas das calculadoras, com a navegação por setas do padrão ARIA (esquerda e direita, circular). */
export function CalculadoraDeTributos() {
  const prefixo = useId();
  const [aba, setAba] = useState<IdDaAba>('regular');
  const moverFoco = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const destino = ABAS[(indice + passo + ABAS.length) % ABAS.length];
    setAba(destino.id);
    document.getElementById(`${prefixo}-aba-${destino.id}`)?.focus();
  };
  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Calculadoras de tributos"
        className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200"
      >
        {ABAS.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`${prefixo}-aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`${prefixo}-painel-${a.id}`}
            tabIndex={aba === a.id ? 0 : -1}
            onClick={() => setAba(a.id)}
            onKeyDown={(e) => moverFoco(e, i)}
            className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium ${aba === a.id ? 'border-amber-400 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {a.nome}
          </button>
        ))}
      </div>
      {ABAS.map(({ id, Conteudo }) => (
        <div
          key={id}
          role="tabpanel"
          id={`${prefixo}-painel-${id}`}
          aria-labelledby={`${prefixo}-aba-${id}`}
          hidden={aba !== id}
          tabIndex={0}
        >
          {aba === id && <Conteudo />}
        </div>
      ))}
      <SaibaMais titulo="Metodologia">
        <p>
          Estimativa para planejamento, calculada no seu navegador (nada é enviado). Regime regular e CBS/IBS do Simples
          seguem a lógica da Calculadora da Receita Federal (MIT); as tabelas do DAS vêm da LC 123/2006 e precisam de
          conferência antes de uso comercial. Não substitui contador nem parecer jurídico.
        </p>
      </SaibaMais>
    </div>
  );
}
