import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Links externos só http(s)/mailto; caminhos do próprio site ("/painel", "/orcamento?postos=...") também, mas nunca "//host".
const INTERNO = /^\/(?!\/)[\w\-./%?=&:,#]*$/;
function safeUrl(url: string) {
  const safe = defaultUrlTransform(url);
  return /^(https?:\/\/|mailto:)/i.test(safe) || INTERNO.test(safe) ? safe : '';
}

export function ChatMessage({ content }: { content: string }) {
  return <div className="message text-sm">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={{
      a: ({ href, children }) => href
        ? (INTERNO.test(href) ? <a href={href}>{children}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>)
        : <span>{children}</span>,
      // External images can track readers; messages only render their description.
      img: ({ alt }) => <span>{alt}</span>,
    }}>{content}</Markdown>
  </div>;
}
