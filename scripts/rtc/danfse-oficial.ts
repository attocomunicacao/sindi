// Roda o gerador de DANFSe OFICIAL da Receita (calculadora-rtc-gerador-danfse, Go, MIT) dentro do Node, a partir do alvo WASM do próprio repositório
// (cmd/danfse-wasm), e extrai o texto de um PDF. Serve só de referência para conferir o porte em TypeScript (src/lib/danfse): nada disto vai para o site.
// Preparar: scripts/operacao/rtc-instalar.ps1 compila .tools/rtc/danfse-wasm/{danfse.wasm,wasm_exec.js} (ou SINDI_RTC_DANFSE_WASM aponta outra pasta).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { PDFParse } from 'pdf-parse';

const PASTA = resolve(process.env.SINDI_RTC_DANFSE_WASM ?? '.tools/rtc/danfse-wasm');

export class OficialIndisponivel extends Error {}
export type OpcoesOficial = { stc?: 0 | 1 | 2; canhoto?: boolean };
type DanfseWasm = {
  ready?: boolean;
  error?: string;
  gerarPdf?: (pedido: string) => { pdf?: string; size?: number; error?: string };
};

let carregado: Promise<(xml: string, opcoes?: OpcoesOficial) => Uint8Array> | undefined;

/** Carrega o WASM uma vez e devolve a função que gera o PDF oficial. Lança `OficialIndisponivel` se os artefatos não foram compilados. */
export function carregarOficial() {
  carregado ??= (async () => {
    const wasm = join(PASTA, 'danfse.wasm');
    const exec = join(PASTA, 'wasm_exec.js');
    if (!existsSync(wasm) || !existsSync(exec))
      throw new OficialIndisponivel(`faltam danfse.wasm e wasm_exec.js em ${PASTA}`);
    createRequire(import.meta.url)(exec); // define globalThis.Go
    const go = new (
      globalThis as unknown as {
        Go: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): Promise<void> };
      }
    ).Go();
    const { instance } = await WebAssembly.instantiate(readFileSync(wasm), go.importObject);
    void go.run(instance); // só termina com o programa: não se espera
    const global = globalThis as unknown as { danfseWasm?: DanfseWasm };
    for (let i = 0; i < 100 && !global.danfseWasm; i++) await new Promise((r) => setTimeout(r, 50));
    const api = global.danfseWasm;
    if (!api?.ready || !api.gerarPdf) throw new OficialIndisponivel(api?.error ?? 'o WASM não ficou pronto');
    return (xml: string, opcoes: OpcoesOficial = {}) => {
      const r = api.gerarPdf!(JSON.stringify({ xml, stc: opcoes.stc ?? 0, canhoto: opcoes.canhoto ?? true }));
      if (r.error || !r.pdf) throw new Error(r.error ?? 'sem PDF');
      return new Uint8Array(Buffer.from(r.pdf, 'base64'));
    };
  })();
  return carregado;
}

/** Texto do PDF, página a página, com espaços normalizados (a ordem e a quebra de linha dependem de cada gerador; o conteúdo, não). */
export async function textoDoPdf(pdf: Uint8Array): Promise<string[]> {
  const leitor = new PDFParse({ data: pdf.slice() });
  const { pages } = await leitor.getText();
  return pages.map((p) => p.text.replace(/\s+/g, ' ').trim());
}
