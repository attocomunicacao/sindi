'use client';
import { useId, useRef, useState } from 'react';
import { Download, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Mesmo limite do servidor (5 MiB): o navegador avisa antes de enviar.
const LIMITE_BYTES = 5 * 1024 * 1024;
const campo = 'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-amber-400 focus-visible:outline-none';
const rotulo = 'mb-1 block text-xs font-medium text-slate-600';

type Situacao = '0' | '1' | '2';

const lerTexto = (arquivo: File) => new Promise<string>((resolve, reject) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(String(leitor.result ?? ''));
  leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  leitor.readAsText(arquivo);
});

export function DanfseForm() {
  const idArquivo = useId(); const idSituacao = useId(); const idErro = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [situacao, setSituacao] = useState<Situacao>('0');
  const [canhoto, setCanhoto] = useState(true);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const escolher = (novo: File | null) => {
    setPronto(false); setErro('');
    if (novo && novo.size > LIMITE_BYTES) { setArquivo(null); setErro('O arquivo passa do limite de 5 MiB.'); return; }
    setArquivo(novo);
  };

  const gerar = async () => {
    if (!arquivo) { setErro('Escolha o arquivo XML da NFS-e.'); entrada.current?.focus(); return; }
    setGerando(true); setErro(''); setPronto(false);
    try {
      const xml = await lerTexto(arquivo);
      const resposta = await fetch('/api/danfse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml, stc: Number(situacao), canhoto }) });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({})) as { error?: string };
        throw new Error(dados.error || 'Não foi possível gerar o DANFSe.');
      }
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'danfse.pdf'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setPronto(true);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível gerar o DANFSe.'); } finally { setGerando(false); }
  };

  return <form className="space-y-6" onSubmit={e => { e.preventDefault(); void gerar(); }} noValidate>
    <div>
      <label htmlFor={idArquivo} className={rotulo}>Arquivo XML da NFS-e nacional</label>
      <input id={idArquivo} ref={entrada} type="file" accept=".xml,text/xml,application/xml" className={campo}
        aria-describedby={erro ? idErro : undefined} aria-invalid={erro ? true : undefined}
        onChange={e => escolher(e.target.files?.[0] ?? null)} />
      {arquivo && <p className="mt-1 text-xs text-slate-500">{arquivo.name} ({Math.max(1, Math.round(arquivo.size / 1024))} KB)</p>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={idSituacao} className={rotulo}>Situação da nota</label>
        <select id={idSituacao} className={campo} value={situacao} onChange={e => setSituacao(e.target.value as Situacao)}>
          <option value="0">Válida (sem marca d&apos;água)</option>
          <option value="1">Substituída (marca d&apos;água SUBSTITUÍDA)</option>
          <option value="2">Cancelada (marca d&apos;água CANCELADA)</option>
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
        <input type="checkbox" checked={canhoto} onChange={e => setCanhoto(e.target.checked)} className="size-4 accent-amber-500" />
        Incluir canhoto (recibo) no rodapé
      </label>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={gerando}>{gerando ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />} Gerar DANFSe (PDF)</Button>
      <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} aria-hidden /> O XML é processado na hora e não fica guardado.</p>
    </div>
    <div aria-live="polite">
      {erro && <p id={idErro} role="alert" className="border-l-2 border-amber-400 pl-3 text-sm text-slate-700">{erro}</p>}
      {pronto && !erro && <p role="status" className="text-sm text-slate-700">DANFSe gerado: o download do PDF começou.</p>}
    </div>
  </form>;
}
