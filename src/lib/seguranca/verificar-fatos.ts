import { normalizar } from '@/lib/base/texto';

/** Contatos e domínio oficiais: sempre permitidos numa resposta, mesmo que o trecho entregue ao modelo não os contenha. */
export const CONTATOS_OFICIAIS = [
  'sindeprestem@sindeprestem.com.br',
  'juridico@sindeprestem.com.br',
  '(11) 3215-8250',
  '(11) 99205-3371',
  'sindeprestem.com.br',
  'Av. São Luís, 258',
];
export type Verificacao = { ok: boolean; inventados: string[] };
const soDigitos = (t: string) => t.replace(/\D/g, '');
const compacta = (t: string) => normalizar(t).replace(/\s+/g, '');

/**
 * Verificador de fatos para modelos pequenos: e-mails, endereços de site, telefones, valores em reais e números de lei que aparecem na resposta
 * precisam constar nas fontes entregues ao modelo (ou nos contatos oficiais). Qualquer um que não conste indica invenção.
 */
export function verificarFatos(resposta: string, fontes: string, pergunta = ''): Verificacao {
  const base = compacta(`${fontes} ${CONTATOS_OFICIAIS.join(' ')}`);
  const digitos = soDigitos(`${fontes} ${CONTATOS_OFICIAIS.join(' ')}`);
  const inventados: string[] = [];
  const confere = (achados: string[], presente: (item: string) => boolean) => {
    for (const item of achados) if (!presente(item)) inventados.push(item);
  };
  confere(resposta.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [], (e) => base.includes(compacta(e)));
  confere(
    (
      resposta.match(
        /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|gov|jus|leg|edu)(?:\.[a-z]{2})?\b/gi,
      ) ?? []
    ).filter((d) => !/@/.test(d)),
    (d) =>
      /\.(?:gov|jus|leg)\.br$/i.test(d) ||
      base.includes(compacta(d.replace(/^https?:\/\//i, '').replace(/^www\./i, ''))),
  );
  confere(resposta.match(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g) ?? [], (t) => digitos.includes(soDigitos(t)));
  confere(resposta.match(/R\$\s?[\d.]+(?:,\d{2})?/g) ?? [], (v) => base.includes(compacta(v.replace(/^R\$\s?/, ''))));
  // Número de norma só vale se aparece inteiro, como número, nas fontes; uma sequência de dígitos que atravessa outros números não conta.
  const numerosDasFontes = new Set((fontes.match(/\d+(?:\.\d{3})*/g) ?? []).map(soDigitos));
  confere(
    (resposta.match(/\b(?:Lei|Decreto|Portaria)[^\d]{0,12}[\d.]{3,}/gi) ?? []).map((l) =>
      l.replace(/^[^\d]*/, '').replace(/\.$/, ''),
    ),
    (n) => numerosDasFontes.has(soDigitos(n)),
  );
  // Números: percentuais, valores com casas decimais e números de três dígitos ou mais (anos, quantidades, saldos) precisam constar nas fontes ou na própria pergunta.
  // É a proteção contra o erro típico de modelo pequeno de trocar "44 horas" por "40" ou criar uma estatística; listas numeradas e números de um ou dois dígitos ficam de fora.
  const numerosDe = (texto: string) => texto.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const conhecidos = new Set(numerosDe(`${fontes} ${pergunta} ${CONTATOS_OFICIAIS.join(' ')}`).map(soDigitos));
  conhecidos.add(String(new Date().getFullYear()));
  confere(
    (resposta.match(/\d+(?:[.,]\d+)*(?:\s?%)?/g) ?? []).filter((n) => /%|[.,]\d/.test(n) || soDigitos(n).length >= 3),
    (n) => conhecidos.has(soDigitos(n)),
  );
  return { ok: inventados.length === 0, inventados: [...new Set(inventados)] };
}
