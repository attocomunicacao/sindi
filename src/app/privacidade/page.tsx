import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { AVISOS } from '@/lib/produtos/avisos';

export const metadata = { title: 'Privacidade e limites | SINDI' };

// Texto provisório: a política de dados definitiva é decisão do SINDEPRESTEM (parecer do advogado, 16/11/2026).
export default function PrivacidadePage() {
  return (
    <PaginaFerramenta
      largura="max-w-3xl"
      espaco="space-y-8"
      titulo="Privacidade e limites do serviço"
      descricao="O que a SINDI faz com o que você escreve e o que ela não oferece."
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">O que a SINDI não é</h2>
        <p>{AVISOS.naoEConsultoria}</p>
        <p>{AVISOS.custoNaoPreco}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Seus dados</h2>
        <p>{AVISOS.dadosNaoGuardados}</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            O servidor não guarda o histórico das conversas nem registra o conteúdo das perguntas. A cota diária usa só
            um código embaralhado (hash) do seu endereço de rede.
          </li>
          <li>
            Neste aparelho, o navegador guarda suas conversas (já sem dados pessoais) para você reabri-las. Você pode
            pausar, exportar ou apagar essa cópia na barra de conversas. A SINDI não recebe essa cópia.
          </li>
          <li>
            Dados pessoais e segredos (CPF, e-mail, telefone e semelhantes) são removidos da pergunta antes de ela ir a
            qualquer serviço de inteligência artificial, inclusive à busca por significado.
          </li>
          <li>
            As respostas são escritas por serviços gratuitos de IA, em cascata: Google (Gemini), Groq e Mistral, e, em
            último caso, um modelo local. Nos serviços gratuitos, as perguntas podem ser usadas pelas próprias empresas
            para melhorar seus produtos. Por isso, não envie dados pessoais nem confidenciais.
          </li>
          <li>
            O Kit Jornada 42 calcula tudo neste aparelho, sem enviar nada ao servidor. O nome da empresa e o contato do
            orçamento vão ao servidor só para montar o PDF, sem gravação.
          </li>
          <li>
            As estatísticas públicas de uso são só somas de requisições e tokens, sem mensagens nem identificação.
          </li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Conteúdo com data</h2>
        <p>
          Leis e prazos mudam. Toda informação deve ser lida com a data indicada e conferida na fonte oficial antes de
          decidir.
        </p>
      </section>
    </PaginaFerramenta>
  );
}
