import type { Ferramenta } from '@/lib/ferramentas/tipos';

/** Gerador do DANFSe em PDF (porte do projeto da Receita Federal): recebe o XML da NFS-e, valida e desenha o PDF; o XML não é gravado nem registrado. */
export const ferramentaDanfse: Ferramenta = {
  id: 'danfse',
  pagina: 'danfse',
  api: ['/api/danfse'],
  testes: [
    'tests/lib/danfse/danfse.test.ts',
    'tests/app/danfse-rotas.test.ts',
    'tests/seguranca/ataques-danfse.test.ts',
  ],
};
