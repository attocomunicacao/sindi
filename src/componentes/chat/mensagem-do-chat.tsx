import { memo } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Links externos só http(s)/mailto; caminhos do próprio site ("/painel", "/orcamento?postos=...") também, mas nunca "//host".
const CAMINHO_INTERNO = /^\/(?!\/)[\w\-./%?=&:,#]*$/;

function urlSegura(url: string) {
  const segura = defaultUrlTransform(url);
  return /^(https?:\/\/|mailto:)/i.test(segura) || CAMINHO_INTERNO.test(segura) ? segura : '';
}

// `memo`: durante o stream só a última resposta muda; as anteriores não são interpretadas de novo a cada token.
export const MensagemDoChat = memo(function MensagemDoChat({ conteudo }: { conteudo: string }) {
  return <div className="message text-sm">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={urlSegura} components={{
      a: ({ href, children }) => href
        ? (CAMINHO_INTERNO.test(href) ? <a href={href}>{children}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>)
        : <span>{children}</span>,
      // Imagens externas podem rastrear quem lê; a mensagem mostra só a descrição.
      img: ({ alt }) => <span>{alt}</span>,
    }}>{conteudo}</Markdown>
  </div>;
});
