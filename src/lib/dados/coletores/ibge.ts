import { dataIso, buscarJson, listaOuErro } from '@/lib/dados/http';
import { gravarIndicador, gravarDocumento } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';

type Sidra = { resultados: { series: { serie: Record<string, string> }[] }[] }[];
const BASE_DA_API = 'https://servicodados.ibge.gov.br/api/v3';

/** Indicadores do IBGE (SIDRA): tabela, variável, classificação opcional. */
export const INDICADORES_DO_IBGE = [
  {
    id: 'ibge.desocupacao',
    group: 'Emprego',
    label: 'Taxa de desocupação (PNAD Contínua)',
    unit: '% da força de trabalho',
    table: 6381,
    variable: 4099,
    url: 'https://sidra.ibge.gov.br/tabela/6381',
  },
  {
    id: 'ibge.ipca-mensal',
    group: 'Preços',
    label: 'IPCA — variação mensal',
    unit: '% no mês',
    table: 7060,
    variable: 63,
    classification: '315[7169]',
    url: 'https://sidra.ibge.gov.br/tabela/7060',
  },
  {
    id: 'ibge.ipca-12m',
    group: 'Preços',
    label: 'IPCA — acumulado em 12 meses',
    unit: '% em 12 meses',
    table: 7060,
    variable: 2265,
    classification: '315[7169]',
    url: 'https://sidra.ibge.gov.br/tabela/7060',
  },
  {
    id: 'ibge.servicos',
    group: 'Serviços',
    label: 'Volume de serviços (PMS) — variação mensal',
    unit: '% vs. mês anterior',
    table: 5906,
    variable: 11623,
    classification: '11046[56726]',
    url: 'https://sidra.ibge.gov.br/tabela/5906',
  },
] as const;

/** Converte o código de período do SIDRA (202609 ou 20263) em texto legível. */
export function rotuloDoPeriodo(codigo: string) {
  if (/^\d{6}$/.test(codigo)) return `${codigo.slice(4)}/${codigo.slice(0, 4)}`;
  return codigo;
}
export function ultimosDois(dados: Sidra): { period: string; value: number; previous?: number } | undefined {
  const serie = dados[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie) return undefined;
  const entradas = Object.entries(serie)
    .filter(([, v]) => v !== '...' && v !== '-' && Number.isFinite(Number(v)))
    .sort(([a], [b]) => a.localeCompare(b));
  const ultima = entradas.at(-1);
  if (!ultima) return undefined;
  return {
    period: ultima[0],
    value: Number(ultima[1]),
    previous: entradas.length > 1 ? Number(entradas.at(-2)![1]) : undefined,
  };
}
type Noticia = {
  id: number;
  titulo: string;
  introducao: string;
  data_publicacao: string;
  link: string;
  editorias?: string;
};

export const ibge: Coletor = {
  source: 'ibge',
  label: 'IBGE',
  async run({ db, full }) {
    let buscados = 0;
    let alterados = 0;
    for (const indicador of INDICADORES_DO_IBGE) {
      const classificacao =
        'classification' in indicador ? `&classificacao=${encodeURIComponent(indicador.classification)}` : '';
      const dados = await buscarJson<Sidra>(
        `${BASE_DA_API}/agregados/${indicador.table}/periodos/-3/variaveis/${indicador.variable}?localidades=N1%5Ball%5D${classificacao}`,
      );
      const ponto = ultimosDois(dados);
      buscados++;
      if (ponto) {
        gravarIndicador(db, {
          id: indicador.id,
          source: 'ibge',
          group: indicador.group,
          label: indicador.label,
          value: ponto.value,
          unit: indicador.unit,
          period: rotuloDoPeriodo(ponto.period),
          previous: ponto.previous,
          url: indicador.url,
        });
        alterados++;
      }
    }
    const paginas = full ? 40 : 1;
    for (let pagina = 1; pagina <= paginas; pagina++) {
      const noticias = await buscarJson<{ items: Noticia[]; totalPages: number }>(
        `${BASE_DA_API}/noticias/?qtd=50&page=${pagina}`,
      );
      buscados++;
      for (const n of listaOuErro<Noticia>(noticias.items, 'servicodados.ibge.gov.br/noticias')) {
        if (!n.link || !n.titulo) continue;
        const [d, m, y] = (n.data_publicacao || '').slice(0, 10).split('/');
        const publicadoEm = y ? dataIso(`${y}-${m}-${d}T12:00:00Z`) : undefined;
        if (
          gravarDocumento(db, {
            source: 'ibge',
            url: n.link,
            title: n.titulo,
            content: n.introducao || n.titulo,
            publishedAt: publicadoEm,
            meta: { editorias: n.editorias },
          })
        )
          alterados++;
      }
      if (pagina >= noticias.totalPages) break;
    }
    return { fetched: buscados, changed: alterados };
  },
};
