import { isPercent } from './format';
import type { Painel, PainelIndicator } from './painel';

/** Modelo do dashboard: calculado só a partir dos indicadores coletados (valor atual e anterior), usado pela tela e pelo PDF. */
export type Sentido = 'alta' | 'queda' | 'estavel';
export type Kpi = { id: string; rotulo: string; valor: string; unidade: string; periodo: string; anterior: string | null; delta: string | null; sentido: Sentido; favoravel: boolean | null; atual: number; ref: number | null };
export type Par = { rotulo: string; atual: number; anterior: number | null; atualTexto: string; anteriorTexto: string | null; url: string; periodo: string; fonte: string; delta: string | null; sentido: Sentido; favoravel: boolean | null };
export type Ponto = { periodo: string; rotulo: string; valor: number; texto: string };
export type Serie = { id: string; rotulo: string; pontos: Ponto[] };
export type Derivado = { rotulo: string; valor: string; nota: string };
export type Dashboard = { kpis: Kpi[]; emprego: Par[]; series: Serie[]; taxas: Par[]; derivados: Derivado[]; atualizadoEm: string | null; periodos: string };

/** true: alta é favorável; false: queda é favorável. Sem entrada: sem juízo de valor. */
const ALTA_FAVORAVEL: Record<string, boolean> = { 'bcb.selic-meta': false, 'ibge.ipca-12m': false, 'ibge.ipca-mensal': false, 'ibge.desocupacao': false, 'caged.saldo': true, 'caged.saldo-sp': true, 'caged.saldo-temporario': true, 'caged.saldo-servicos': true, 'ibge.servicos': true };
const NOMES: Record<string, string> = { 'bcb.selic-meta': 'Meta Selic', 'ibge.ipca-12m': 'IPCA em 12 meses', 'ibge.ipca-mensal': 'IPCA no mês', 'ibge.desocupacao': 'Taxa de desocupação', 'caged.saldo': 'Brasil', 'caged.saldo-sp': 'São Paulo', 'caged.saldo-temporario': 'Trabalho temporário', 'caged.saldo-servicos': 'Serviços administrativos', 'ibge.servicos': 'Volume de serviços (mês)' };
const KPIS = ['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.desocupacao', 'caged.saldo'];
const KPI_ROTULOS: Record<string, string> = { 'caged.saldo': 'Saldo de emprego formal' };

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const inteiro = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const formatar = (i: PainelIndicator, v: number) => isPercent(i.unit) ? pct(v) : inteiro(v);
const sinal = (v: number, texto: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${texto}`;

function delta(i: PainelIndicator): { texto: string | null; sentido: Sentido } {
  if (i.previous === null) return { texto: null, sentido: 'estavel' };
  const d = i.value - i.previous;
  if (Math.abs(d) < 1e-9) return { texto: isPercent(i.unit) ? '0,00 p.p.' : '0', sentido: 'estavel' };
  const texto = isPercent(i.unit) ? `${Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.` : inteiro(Math.abs(d));
  return { texto: sinal(d, texto), sentido: d > 0 ? 'alta' : 'queda' };
}
const FONTES: Record<string, string> = { bcb: 'Banco Central', ibge: 'IBGE', caged: 'Novo CAGED (MTE)' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "202608" vira "ago/26". */
export const rotuloDoMes = (periodo: string) => /^\d{6}$/.test(periodo) ? `${MESES[Number(periodo.slice(4)) - 1] ?? periodo.slice(4)}/${periodo.slice(2, 4)}` : periodo;
const compacto = (v: number) => v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const par = (i: PainelIndicator): Par => { const d = delta(i); const alta = ALTA_FAVORAVEL[i.id];
  return { rotulo: NOMES[i.id] ?? i.label, atual: i.value, anterior: i.previous, atualTexto: formatar(i, i.value), anteriorTexto: i.previous === null ? null : formatar(i, i.previous), url: i.url, periodo: i.period, fonte: FONTES[i.source] ?? i.source,
    delta: d.texto, sentido: d.sentido, favoravel: d.sentido === 'estavel' || alta === undefined ? null : (d.sentido === 'alta') === alta }; };

export function montarDashboard(painel: Painel): Dashboard | null {
  if (!painel.available || !painel.indicators.length) return null;
  const por = new Map(painel.indicators.map(i => [i.id, i]));
  const kpis = KPIS.flatMap(id => {
    const i = por.get(id); if (!i) return [];
    const d = delta(i); const alta = ALTA_FAVORAVEL[id];
    return [{ id, rotulo: KPI_ROTULOS[id] ?? NOMES[id] ?? i.label, valor: formatar(i, i.value), unidade: isPercent(i.unit) ? i.unit.replace(/^%\s*/, '') : i.unit, periodo: i.period, anterior: i.previous === null ? null : formatar(i, i.previous),
      delta: d.texto, sentido: d.sentido, favoravel: d.sentido === 'estavel' || alta === undefined ? null : (d.sentido === 'alta') === alta, atual: i.value, ref: i.previous } satisfies Kpi];
  });
  const ids = (lista: string[]) => lista.flatMap(id => { const i = por.get(id); return i ? [par(i)] : []; });
  const derivados: Derivado[] = [];
  const selic = por.get('bcb.selic-meta'); const ipca = por.get('ibge.ipca-12m');
  if (selic && ipca) derivados.push({ rotulo: 'Juro real aproximado', valor: `${(selic.value - ipca.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`, nota: 'Meta Selic menos IPCA em 12 meses' });
  const br = por.get('caged.saldo'); const sp = por.get('caged.saldo-sp'); const sv = por.get('caged.saldo-servicos');
  if (br && sp && br.value > 0) derivados.push({ rotulo: 'São Paulo no saldo do Brasil', valor: pct(sp.value / br.value * 100), nota: `${inteiro(sp.value)} de ${inteiro(br.value)} vagas` });
  if (br && sv && br.value > 0) derivados.push({ rotulo: 'Serviços administrativos no saldo do Brasil', valor: pct(sv.value / br.value * 100), nota: `${inteiro(sv.value)} de ${inteiro(br.value)} vagas` });
  const periodos = [...new Set(painel.indicators.map(i => i.period))].slice(0, 4).join(' · ');
  const series = ['caged.saldo', 'caged.saldo-sp', 'caged.saldo-servicos', 'caged.saldo-temporario'].flatMap((id): Serie[] => { const pontos = (painel.series?.[id] ?? []).slice(-6); return pontos.length >= 2 ? [{ id, rotulo: NOMES[id] ?? id, pontos: pontos.map(p => ({ periodo: p.period, rotulo: rotuloDoMes(p.period), valor: p.value, texto: compacto(p.value) })) }] : []; });
  return { kpis, series, emprego: ids(['caged.saldo', 'caged.saldo-sp', 'caged.saldo-servicos', 'caged.saldo-temporario']), taxas: ids(['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.ipca-mensal', 'ibge.desocupacao', 'ibge.servicos']), derivados, atualizadoEm: painel.updatedAt, periodos };
}
