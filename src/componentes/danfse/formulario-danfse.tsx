'use client';
import { useId, useRef, useState } from 'react';
import { Download, LoaderCircle, ShieldCheck } from 'lucide-react';
import { baixarArquivo } from '@/lib/base/baixar-arquivo';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { Botao } from '@/componentes/ui/botao';
import { CLASSE_CAIXA_DE_MARCACAO, GrupoDoCampo, classeDoCampo } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';
import { useAcao } from '@/componentes/ui/usar-acao';

// Mesmo limite do servidor (5 MiB): o navegador avisa antes de enviar.
const LIMITE_BYTES = 5 * 1024 * 1024;
const MENSAGEM_DE_FALHA = 'Não foi possível gerar o DANFSe.';

type Situacao = '0' | '1' | '2';

const lerTexto = (arquivo: File) =>
  new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ''));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsText(arquivo);
  });

export function FormularioDanfse() {
  const idArquivo = useId();
  const idSituacao = useId();
  const idErro = useId();
  const campoDoArquivo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [situacao, setSituacao] = useState<Situacao>('0');
  const [canhoto, setCanhoto] = useState(true);
  const [pronto, setPronto] = useState(false);
  const geracao = useAcao(MENSAGEM_DE_FALHA);
  const { erro, setErro } = geracao;
  const gerando = geracao.emAndamento !== null;

  const escolher = (novo: File | null) => {
    setPronto(false);
    setErro('');
    if (novo && novo.size > LIMITE_BYTES) {
      setArquivo(null);
      setErro('O arquivo passa do limite de 5 MiB.');
      return;
    }
    setArquivo(novo);
  };

  const gerar = async () => {
    if (!arquivo) {
      setErro('Escolha o arquivo XML da NFS-e.');
      campoDoArquivo.current?.focus();
      return;
    }
    setPronto(false);
    const concluiu = await geracao.executar('danfse', async () => {
      const xml = await lerTexto(arquivo);
      const resposta = await fetch('/api/danfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, stc: Number(situacao), canhoto }),
      });
      if (!resposta.ok) {
        const dados = (await resposta.json().catch(() => ({}))) as { error?: string };
        throw new Error(dados.error || MENSAGEM_DE_FALHA);
      }
      baixarArquivo(await resposta.blob(), 'danfse.pdf');
    });
    if (concluiu) setPronto(true);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void gerar();
      }}
      noValidate
    >
      <GrupoDoCampo id={idArquivo} rotulo="Arquivo XML da NFS-e nacional">
        <input
          id={idArquivo}
          ref={campoDoArquivo}
          type="file"
          accept=".xml,text/xml,application/xml"
          className={classeDoCampo()}
          aria-describedby={erro ? idErro : undefined}
          aria-invalid={erro ? true : undefined}
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
        {arquivo && (
          <p className="mt-1 text-xs text-slate-500">
            {arquivo.name} ({Math.max(1, Math.round(arquivo.size / 1024))} KB)
          </p>
        )}
      </GrupoDoCampo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor id={idSituacao} rotulo="Situação da nota" value={situacao} aoMudar={(v) => setSituacao(v as Situacao)}>
          <option value="0">Válida (sem marca d&apos;água)</option>
          <option value="1">Substituída (marca d&apos;água SUBSTITUÍDA)</option>
          <option value="2">Cancelada (marca d&apos;água CANCELADA)</option>
        </Seletor>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={canhoto}
            onChange={(e) => setCanhoto(e.target.checked)}
            className={CLASSE_CAIXA_DE_MARCACAO}
          />
          Incluir canhoto (recibo) no rodapé
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={gerando}>
          {gerando ? (
            <LoaderCircle className="animate-spin" size={16} aria-hidden />
          ) : (
            <Download size={16} aria-hidden />
          )}{' '}
          Gerar DANFSe (PDF)
        </Botao>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} aria-hidden /> O XML é processado na hora e não fica guardado.
        </p>
      </div>
      <div aria-live="polite">
        {erro && (
          <AvisoLateral id={idErro} role="alert">
            {erro}
          </AvisoLateral>
        )}
        {pronto && !erro && (
          <p role="status" className="text-sm text-slate-700">
            DANFSe gerado: o download do PDF começou.
          </p>
        )}
      </div>
    </form>
  );
}
