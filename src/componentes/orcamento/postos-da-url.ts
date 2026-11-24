import type { FuncaoDoCatalogo } from '@/componentes/orcamento/catalogo';
import { novoPosto } from '@/componentes/orcamento/posto';

const QUANTIDADE_MAXIMA = 500;

/** Postos vindos do chat: ?postos=auxiliar-de-limpeza:3:diurno,auxiliar-de-limpeza:3:noturno. Partes inválidas são ignoradas. */
export function postosDaUrl(parametros: URLSearchParams, funcoes: FuncaoDoCatalogo[]) {
  return (parametros.get('postos') ?? '').split(',').flatMap((parte) => {
    const [id, texto, turno] = parte.split(':');
    const funcao = funcoes.find((f) => f.id === id);
    const quantidade = Number(texto);
    const valida = funcao && Number.isInteger(quantidade) && quantidade > 0 && quantidade <= QUANTIDADE_MAXIMA;
    return valida
      ? [novoPosto(id, quantidade, turno === 'noturno' && funcao.permiteNoturno ? 'noturno' : 'diurno')]
      : [];
  });
}

/** Área atendida vinda do chat (?m2=1200); vazio se ausente ou inválida. */
export function metrosDaUrl(parametros: URLSearchParams) {
  const metros = Number(parametros.get('m2'));
  return metros > 0 ? String(metros) : '';
}
