'use client';
import { montarDashboard } from '@/lib/dados/dashboard';
import { DEFASADA_HORAS, fontesDefasadas } from '@/lib/dados/frescor';
import type { Painel } from '@/lib/dados/painel';
import { AvisoEmCaixa, Carregando } from '@/componentes/ui/aviso';
import { NOMES_DAS_FONTES, dataEHora } from '@/componentes/painel/formatacao';
import { PainelIndicadores } from '@/componentes/painel/painel-indicadores';
import {
  NoticiasDasFontes,
  NoticiasDoSindicato,
  ProjetosEmPauta,
  SituacaoDasFontes,
} from '@/componentes/painel/secoes-do-painel';
import { SaibaMais } from '@/componentes/ui/saiba-mais';
import { usePainel } from '@/componentes/painel/usar-painel';

const UM_MINUTO_MS = 60 * 1000;

function AvisoDeFontesDefasadas({ fontes }: { fontes: ReturnType<typeof fontesDefasadas> }) {
  const quantas = fontes.length === 1 ? 'uma fonte está' : `${fontes.length} fontes estão`;
  const nomes = fontes.map((f) => NOMES_DAS_FONTES[f.source] ?? f.source).join(', ');
  return (
    <AvisoEmCaixa role="status">
      Atenção: {quantas} sem coleta bem-sucedida há mais de {DEFASADA_HORAS} horas ({nomes}). Os números dessas fontes
      podem estar desatualizados.
    </AvisoEmCaixa>
  );
}

function FalhaAoCarregar({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="space-y-3 text-sm">
      <p>Não foi possível carregar o painel agora.</p>
      <button
        type="button"
        onClick={aoTentarDeNovo}
        className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-100"
      >
        Tentar de novo
      </button>
    </div>
  );
}

function ConteudoDoPainel({ dados, falhou }: { dados: Painel; falhou: boolean }) {
  const defasadas = fontesDefasadas(dados.sources);
  const dashboard = montarDashboard(dados);
  return (
    <div className="space-y-10">
      {falhou && (
        <AvisoEmCaixa role="status">
          Não foi possível atualizar agora. Os dados abaixo são os da última leitura.
        </AvisoEmCaixa>
      )}
      {defasadas.length > 0 && <AvisoDeFontesDefasadas fontes={defasadas} />}
      <p className="text-sm text-slate-500">Última coleta bem-sucedida: {dataEHora(dados.updatedAt)}.</p>
      {dashboard && <PainelIndicadores dados={dashboard} />}
      <NoticiasDoSindicato sindicato={dados.sindicato} />
      <ProjetosEmPauta projetos={dados.bills} />
      <NoticiasDasFontes noticias={dados.news} />
      <SituacaoDasFontes fontes={dados.sources} />
      {/* Os dois textos de fontes (coleta e indicadores) ficam juntos e recolhidos: o painel abre só com os números. */}
      <SaibaMais titulo="Sobre os dados">
        <p>
          Dados públicos do Banco Central, do IBGE e do Ministério do Trabalho (Novo CAGED), coletados pela SINDI a cada
          30 minutos neste computador. Indicadores como IPCA e PNAD são divulgados uma vez por mês, então só o último
          período e o anterior são mostrados e a coleta frequente só captura novidades; a evolução mensal existe hoje
          apenas para o emprego formal. Valores derivados são cálculos simples sobre esses dados.
        </p>
      </SaibaMais>
    </div>
  );
}

/** Página do painel: carrega os dados (atualiza a cada minuto) e mostra indicadores, notícias, projetos e a situação das fontes. */
export function PainelCompleto() {
  const { dados, falhou, recarregar } = usePainel(UM_MINUTO_MS);
  if (!dados)
    return falhou ? <FalhaAoCarregar aoTentarDeNovo={recarregar} /> : <Carregando>Carregando painel…</Carregando>;
  if (!dados.available)
    return (
      <p>
        O painel ainda não tem dados. Execute <code>npm run dados:sync</code> neste computador.
      </p>
    );
  return <ConteudoDoPainel dados={dados} falhou={falhou} />;
}
