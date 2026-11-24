import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { brl } from '@/lib/base/formato';
import { Botao } from '@/componentes/ui/botao';

type Valores = { vCBS: number; vIBS: number };
type Resposta = {
  local: Valores;
  oficial: (Valores & { estado: string }) | null;
  iguais?: boolean;
  motivo: string | null;
};

/**
 * "Conferir com a Receita": pede ao servidor o mesmo cálculo na calculadora oficial da Receita Federal (serviço local) e mostra se os valores são idênticos.
 * Sem o serviço no ar o botão continua funcionando e explica o motivo; a conta da tela é sempre a do SINDI.
 */
export function ConferenciaOficial({ rota = '/api/rtc/regime-geral', entrada }: { rota?: string; entrada: object }) {
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<Resposta>();
  const [erro, setErro] = useState('');
  async function conferir() {
    setCarregando(true);
    setErro('');
    try {
      const r = await fetch(rota, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entrada),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || 'Não foi possível conferir.');
      setResposta(dados as Resposta);
    } catch (e) {
      setResposta(undefined);
      setErro(e instanceof Error ? e.message : 'Não foi possível conferir.');
    } finally {
      setCarregando(false);
    }
  }
  return (
    <section
      aria-label="Conferência com a calculadora da Receita"
      className="space-y-2 rounded-lg border border-slate-200 p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="contorno" disabled={carregando} onClick={() => void conferir()}>
          <ShieldCheck size={16} aria-hidden />
          Conferir com a calculadora da Receita
        </Botao>
        <p className="text-xs text-slate-600">
          Compara este cálculo com a calculadora oficial (RTC) da Receita Federal.
        </p>
      </div>
      <div aria-live="polite" className="text-sm">
        {erro && <p className="text-amber-900">{erro}</p>}
        {resposta?.oficial && resposta.iguais && (
          <p className="text-emerald-800">
            Conferido: a calculadora oficial deu exatamente os mesmos valores (CBS {brl(resposta.oficial.vCBS)}, IBS{' '}
            {brl(resposta.oficial.vIBS)}
            {resposta.oficial.estado === 'CALCULO_SIMULADO'
              ? '; cálculo simulado pela própria Receita, com as alíquotas informadas'
              : ''}
            ).
          </p>
        )}
        {resposta?.oficial && !resposta.iguais && (
          <p className="text-amber-900">
            Diferença com a calculadora oficial. Oficial: CBS {brl(resposta.oficial.vCBS)}, IBS{' '}
            {brl(resposta.oficial.vIBS)}. Aqui: CBS {brl(resposta.local.vCBS)}, IBS {brl(resposta.local.vIBS)}. Use o
            valor oficial e avise a equipe.
          </p>
        )}
        {resposta && !resposta.oficial && <p className="text-slate-700">{resposta.motivo}</p>}
      </div>
    </section>
  );
}
