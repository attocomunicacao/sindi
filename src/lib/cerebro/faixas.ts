import { SITE, normalize, type Passage } from '../knowledge/core';
import { trechosDoCerebro } from './carregar';

/**
 * Contribuições do sindicato por faixa. As tabelas têm dezenas de linhas e o modelo pequeno erra a faixa quando as recebe inteiras; aqui a SINDI acha a linha
 * que corresponde ao capital social ou ao número de colaboradores citado na pergunta e entrega só ela (mais os vencimentos) como evidência. O texto da resposta
 * continua sendo escrito pelo modelo.
 */
const numeroBr = (texto: string) => Number(texto.replace(/\./g, '').replace(',', '.'));
const MULTIPLICADOR: Record<string, number> = { mil: 1e3, k: 1e3, mi: 1e6, milhao: 1e6, milhoes: 1e6 };

/** Capital social citado ("capital social de R$ 800 mil", "R$ 1,5 milhão", "800.000"), em reais. */
export function capitalDaPergunta(pergunta: string): number | undefined {
  const q = normalize(pergunta);
  const m = q.match(/(?:capital(?: social)?(?: de| da empresa| igual a)?|r\$)\s*(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes|milhao|mil|mi|k)?\b/);
  if (!m) return undefined;
  if (m[2]) { const base = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(base) ? base * MULTIPLICADOR[m[2]] : undefined; }
  const valor = numeroBr(m[1]); return Number.isFinite(valor) ? valor : undefined;
}
/** Número de colaboradores citado ("200 colaboradores", "50 funcionários"). */
export function colaboradoresDaPergunta(pergunta: string): number | undefined {
  const m = normalize(pergunta).match(/(\d[\d.]*)\s*(?:colaboradores|funcionarios|empregados|trabalhadores|celetistas|temporarios)/);
  return m ? Number(m[1].replace(/\./g, '')) : undefined;
}
type Faixa = { texto: string; de?: number; ate?: number };
function faixasDa(secao: string): Faixa[] {
  const texto = trechosDoCerebro().find(t => t.arquivo.endsWith('contribuicoes.md') && t.secao.startsWith(secao))?.texto ?? '';
  return texto.split('\n').filter(l => l.startsWith('- ')).map(l => {
    const limpa = l.slice(2).trim();
    const entre = limpa.match(/de R\$ ([\d.,]+) até R\$ ([\d.,]+)/); const acima = limpa.match(/acima de R\$ ([\d.,]+)/);
    return { texto: limpa, de: entre ? numeroBr(entre[1]) : acima ? numeroBr(acima[1]) : undefined, ate: entre ? numeroBr(entre[2]) : undefined };
  });
}
const secao = (nome: string) => trechosDoCerebro().find(t => t.arquivo.endsWith('contribuicoes.md') && t.secao.startsWith(nome))?.texto;

export function faixasDeContribuicao(pergunta: string): Passage[] {
  const q = normalize(pergunta);
  if (!/contribui|mensalidade|associativ|confederativ|negocial|quanto (paga|pago|custa|pagam)|taxa/.test(q)) return [];
  const capital = capitalDaPergunta(pergunta); const colaboradores = colaboradoresDaPergunta(pergunta); const semColaboradores = /sem (colaboradores|funcionarios|empregados)/.test(q);
  if (capital === undefined && colaboradores === undefined && !semColaboradores) return [];
  const url = `${SITE}/contribuicao-sindical`; const fetchedAt = new Date().toISOString(); const passagens: Passage[] = [];
  if (capital !== undefined || semColaboradores) {
    for (const [nome, rotulo] of [['Tabela da contribuição associativa', 'Contribuição associativa (apenas empresas associadas)'], ['Tabela da contribuição confederativa', 'Contribuição confederativa (empresas associadas e filiadas)']] as const) {
      const faixas = faixasDa(nome);
      const faixa = semColaboradores && capital === undefined ? faixas.find(f => /sem colaboradores/.test(f.texto)) : faixas.find(f => capital !== undefined && f.de !== undefined && capital >= f.de - 0.005 && (f.ate === undefined || capital <= f.ate + 0.005));
      if (faixa) passagens.push({ url, title: rotulo, content: `${rotulo}, ${capital !== undefined ? `para capital social de R$ ${capital.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'para empresa sem colaboradores'}: ${faixa.texto}.`, fetchedAt, pinned: true });
    }
  }
  if (colaboradores !== undefined) {
    const cobrados = Math.min(colaboradores, 1600);
    passagens.push({ url, title: 'Contribuição negocial patronal', fetchedAt, pinned: true,
      content: `Contribuição negocial patronal (associadas e filiadas): R$ 1,25 por colaborador celetista ou temporário, por mês, limitada a 1.600 colaboradores por CNPJ (teto de R$ 2.000,00 por mês). Para ${colaboradores.toLocaleString('pt-BR')} colaboradores: R$ ${(cobrados * 1.25).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por mês.` });
  }
  if (!passagens.length) return [];
  const regras = secao('Regulamento e vencimentos');
  if (regras) passagens.push({ url, title: 'Contribuições: regulamento e vencimentos', content: regras.slice(0, 700), fetchedAt, pinned: true });
  return passagens;
}
