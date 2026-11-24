/**
 * Lista CURADA das Normas Regulamentadoras (NR) vigentes que a SINDI lê do portal do Ministério do Trabalho e Emprego. Só endereços escritos aqui:
 * cada página abre e é a NR certa (conferido em 24/11/2026). O PDF do texto atual muda de nome a cada revisão ("nr-01-atualizada-2025-i-3.pdf"),
 * por isso é descoberto na própria página da NR, com a mesma validação de domínio, caminho e nome de arquivo (`pdfDaNR`).
 * Sem dependências, para o coletor e a busca usarem os mesmos dados.
 *
 * Ficam de fora: NR-2 e NR-27 (revogadas), NR-37 (a página não existe no portal) e as NRs que o portal não lista como vigentes.
 */
export type NRColetada = {
  numero: number;
  /** Nome oficial, como no cabeçalho do PDF ("Equipamentos de proteção individual - EPI"). Entra no título de cada documento. */
  titulo: string;
  /** Página da NR no portal, onde estão os PDFs. */
  pagina: string;
};

const PAGINAS =
  'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes';

const nr = (numero: number, titulo: string, fim = `norma-regulamentadora-no-${numero}-nr-${numero}`): NRColetada => ({
  numero,
  titulo,
  pagina: `${PAGINAS}/${fim}`,
});

export const NRS: NRColetada[] = [
  nr(1, 'Disposições gerais e gerenciamento de riscos ocupacionais', 'nr-1'),
  nr(3, 'Embargo e interdição'),
  nr(4, 'Serviços especializados em segurança e em medicina do trabalho - SESMT'),
  nr(5, 'Comissão interna de prevenção de acidentes e de assédio - CIPA'),
  nr(6, 'Equipamentos de proteção individual - EPI'),
  nr(7, 'Programa de controle médico de saúde ocupacional - PCMSO'),
  nr(8, 'Edificações'),
  nr(9, 'Avaliação e controle das exposições ocupacionais a agentes físicos, químicos e biológicos'),
  nr(10, 'Segurança em instalações elétricas e serviços em eletricidade'),
  nr(11, 'Transporte, movimentação, armazenagem e manuseio de materiais'),
  nr(12, 'Segurança no trabalho em máquinas e equipamentos'),
  nr(13, 'Caldeiras, vasos de pressão, tubulações e tanques metálicos de armazenamento'),
  nr(14, 'Fornos'),
  nr(15, 'Atividades e operações insalubres'),
  nr(16, 'Atividades e operações perigosas'),
  nr(17, 'Ergonomia'),
  nr(18, 'Segurança e saúde no trabalho na indústria da construção'),
  nr(19, 'Explosivos'),
  nr(20, 'Segurança e saúde no trabalho com inflamáveis e combustíveis'),
  nr(21, 'Trabalho a céu aberto'),
  nr(22, 'Segurança e saúde ocupacional na mineração'),
  nr(23, 'Proteção contra incêndios'),
  nr(24, 'Condições sanitárias e de conforto nos locais de trabalho'),
  nr(25, 'Resíduos industriais'),
  nr(26, 'Sinalização de segurança'),
  nr(28, 'Fiscalização e penalidades'),
  nr(29, 'Segurança e saúde no trabalho portuário'),
  nr(30, 'Segurança e saúde no trabalho aquaviário'),
  nr(31, 'Segurança e saúde no trabalho na agricultura, pecuária, silvicultura, exploração florestal e aquicultura'),
  nr(32, 'Segurança e saúde no trabalho em serviços de saúde'),
  nr(33, 'Segurança e saúde nos trabalhos em espaços confinados'),
  nr(34, 'Condições e meio ambiente de trabalho na indústria da construção, reparação e desmonte naval'),
  nr(35, 'Trabalho em altura'),
  nr(36, 'Segurança e saúde no trabalho em empresas de abate e processamento de carnes e derivados'),
  nr(38, 'Segurança e saúde no trabalho nas atividades de limpeza urbana e manejo de resíduos sólidos'),
];

const RAIZ_DO_PORTAL = '/trabalho-e-emprego/pt-br/';
const PASTA_DAS_NRS = `${RAIZ_DO_PORTAL}acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/`;

/** Só https do portal do Ministério (www.gov.br/trabalho-e-emprego), sem credenciais nem porta: a única origem que o coletor aceita para página e PDF. */
export function urlDoPortalDoTrabalho(endereco: string): boolean {
  try {
    const url = new URL(endereco);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.gov.br' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith(RAIZ_DO_PORTAL) &&
      !url.search
    );
  } catch {
    return false;
  }
}

/**
 * Entre os links de uma página de NR, escolhe o PDF do texto atual da própria norma: arquivo `nr-NN.pdf` ou `nr-NN-atualizada-ANO....pdf` na pasta
 * das NRs do portal. Anexos, manuais, guias, cartilhas, perguntas e respostas e atas não casam com o nome e ficam de fora. Havendo vários, vale o de
 * ano mais recente (a página guarda as versões anteriores), depois o da pasta "vigentes" e, por último, o nome maior ("2025-ii" vence "2025-i").
 */
export function pdfDaNR(numero: number, enderecos: string[]): string | undefined {
  const nome = new RegExp(`^nr[-_]?0?${numero}(?:[-_]?atualizad[ao][-_a-z0-9]*)?\\.pdf$`, 'i');
  const candidatos = enderecos
    .filter(urlDoPortalDoTrabalho)
    .map((e) => new URL(e))
    .filter(
      (u) => u.pathname.startsWith(PASTA_DAS_NRS) && nome.test(decodeURIComponent(u.pathname.split('/').pop() ?? '')),
    )
    .map((u) => {
      const arquivo = decodeURIComponent(u.pathname.split('/').pop() ?? '').toLowerCase();
      return {
        href: u.href,
        ano: Number(arquivo.match(/20\d\d/)?.[0] ?? 0),
        vigentes: u.pathname.includes('/normas-regulamentadoras-vigentes/') ? 1 : 0,
        arquivo,
      };
    })
    .sort((a, b) => b.ano - a.ano || b.vigentes - a.vigentes || b.arquivo.localeCompare(a.arquivo));
  return candidatos[0]?.href;
}
