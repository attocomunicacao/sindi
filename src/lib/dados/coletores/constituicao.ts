import { apagarAusentes, vencido, lerEstado, gravarEstado, gravarDocumento } from '@/lib/dados/db';
import { buscarComEducacao } from '@/lib/dados/http';
import { decodificarHtml, htmlParaLinhas, dividirArtigos } from '@/lib/dados/legal';
import type { Coletor } from '@/lib/dados/coletores/tipos';

export const URL_DA_CONSTITUICAO = 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Constituição Federal (texto compilado do Planalto), um documento por artigo. Verificada uma vez por dia, com requisição condicional. */
export const constituicao: Coletor = {
  source: 'constituicao',
  label: 'Constituição Federal',
  async run({ db, full }) {
    if (!vencido(db, 'constituicao:check', UM_DIA_MS, full)) return { fetched: 0, changed: 0 };
    const anterior = lerEstado(db, 'constituicao:lastModified')?.value;
    const resposta = await buscarComEducacao(URL_DA_CONSTITUICAO, {
      headers: anterior && !full ? { 'If-Modified-Since': anterior } : {},
      mesmoHost: true,
    });
    gravarEstado(db, 'constituicao:check', new Date().toISOString());
    if (resposta.status === 304) return { fetched: 1, changed: 0 };
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} no Planalto`);
    // O texto compilado do Planalto traz a redação revogada riscada ao lado da vigente: sem descartar o riscado, a resposta citaria a lei antiga como se valesse.
    const texto = htmlParaLinhas(
      decodificarHtml(new Uint8Array(await resposta.arrayBuffer()), resposta.headers.get('content-type') ?? ''),
      { semRiscado: true },
    );
    const artigos = dividirArtigos(texto, { adct: true });
    if (artigos.length < 100) throw new Error(`Extração suspeita: apenas ${artigos.length} artigos`);
    let alterados = 0;
    for (const a of artigos) {
      if (
        gravarDocumento(db, {
          source: 'constituicao',
          url: `${URL_DA_CONSTITUICAO}#${a.key}`,
          title: `Constituição Federal — ${a.label}`,
          content: a.content,
        })
      )
        alterados++;
    }
    apagarAusentes(
      db,
      'constituicao',
      URL_DA_CONSTITUICAO,
      new Set(artigos.map((a) => `${URL_DA_CONSTITUICAO}#${a.key}`)),
    );
    const modificado = resposta.headers.get('last-modified');
    if (modificado) gravarEstado(db, 'constituicao:lastModified', modificado);
    return { fetched: 1, changed: alterados };
  },
};
