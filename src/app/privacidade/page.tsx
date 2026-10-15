import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { LegalPage } from '@/components/site/legal'
import { SITE_URL } from '@/lib/hosts'
import { EMPRESA, PRIVACY_VERSION } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Política de Privacidade — AtendeRadar',
  description: 'Como o AtendeRadar trata os dados pessoais de quem usa o sistema e dos clientes que conversam com as empresas pelo WhatsApp.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/privacidade` } : undefined,
}

const CONTATO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

export default function PrivacidadePage() {
  return (
    <BlogShell>
      <LegalPage titulo="Política de Privacidade" atualizado={PRIVACY_VERSION}>
        <p>
          Esta política explica quais dados pessoais o AtendeRadar trata, para quê, com quem eles são compartilhados, por quanto tempo ficam
          guardados e como você exerce os seus direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
        </p>

        <h2>1. Quem somos e qual é o nosso papel</h2>
        <p>
          O AtendeRadar é prestado por <strong>{EMPRESA.razaoSocial}</strong>, CNPJ {EMPRESA.cnpj}, com sede na {EMPRESA.endereco}. É um
          sistema que analisa as conversas de atendimento do WhatsApp de empresas clientes para apontar oportunidades em risco, promessas sem
          retorno e indicadores do atendimento.
        </p>
        <ul>
          <li>
            <strong>Dados da conta</strong> (quem se cadastra e usa o sistema): o AtendeRadar é o <strong>controlador</strong>.
          </li>
          <li>
            <strong>Conversas do WhatsApp e dados dos clientes finais</strong> das empresas: a empresa cliente é a controladora e o AtendeRadar
            atua como <strong>operador</strong>, tratando esses dados somente para prestar o serviço contratado e conforme as instruções dela.
          </li>
        </ul>

        <h2>2. Dados que tratamos</h2>
        <h3>Dados de quem usa o sistema</h3>
        <ul>
          <li>Nome, e-mail e senha (guardada com cifragem própria para senhas, nunca em texto puro);</li>
          <li>Nome da empresa, função na conta (administrador, gestor ou atendente), equipe e convites enviados;</li>
          <li>Data do cadastro, do último acesso e da confirmação do e-mail;</li>
          <li>Registro de auditoria das ações importantes (quem fez, o quê e quando), para segurança;</li>
          <li>Chamados abertos no suporte, com a descrição, a tela em que a pessoa estava e a captura de tela, se ela anexar.</li>
        </ul>
        <h3>Dados de cobrança</h3>
        <p>
          Ao assinar um plano, os dados do cartão são enviados diretamente ao processador de pagamentos (Pagar.me). O AtendeRadar não recebe nem
          guarda o número completo do cartão; guarda apenas o necessário para identificar a assinatura, as faturas e o status dos pagamentos.
        </p>
        <h3>Conversas analisadas</h3>
        <p>
          Quando a empresa conecta um número de WhatsApp, o sistema recebe as mensagens desse número (texto, data e hora, nome e telefone do
          contato e quem respondeu) para gerar as análises. As análises são feitas pelo próprio AtendeRadar, nos nossos servidores; o conteúdo
          das conversas não é enviado a serviços de inteligência artificial de terceiros. O AtendeRadar não envia mensagens pelo número da
          empresa.
        </p>
        <h3>Visitas ao site</h3>
        <p>
          No site de apresentação contamos apenas quantas visitas cada página teve por dia, sem cookie, sem endereço IP e sem nenhum
          identificador de quem visitou.
        </p>

        <h2>3. Para que usamos os dados</h2>
        <ul>
          <li>Prestar o serviço: conectar o WhatsApp, analisar conversas, gerar alertas, relatórios e indicadores;</li>
          <li>Criar e proteger a conta, autenticar o acesso e controlar permissões por função;</li>
          <li>Cobrar a assinatura, processar reembolsos e emitir os avisos de pagamento;</li>
          <li>Enviar e-mails do serviço, como confirmação de cadastro, convites, recuperação de senha, avisos da assinatura e relatórios;</li>
          <li>Responder aos chamados de suporte;</li>
          <li>Entender o uso do produto de forma agregada (por exemplo, quantas empresas conectaram o primeiro número) para melhorá-lo;</li>
          <li>
            Manter o cadastro de contato de quem usa o sistema e, se enviarmos novidades por e-mail, sempre com link para deixar de receber;
          </li>
          <li>Cumprir obrigações legais e nos defender em processos.</li>
        </ul>
        <p>Não vendemos dados pessoais e não usamos as conversas das empresas clientes para publicidade.</p>

        <h2>4. Com quem compartilhamos</h2>
        <ul>
          <li>
            <strong>Pagar.me</strong>: processamento dos pagamentos e reembolsos da assinatura;
          </li>
          <li>
            <strong>Brevo</strong>: envio dos e-mails do serviço (o destinatário, o assunto e o conteúdo de cada e-mail);
          </li>
          <li>
            <strong>Mautic</strong> (ferramenta de relacionamento operada por nós, em servidor próprio): cadastro de contato de quem usa o
            sistema, com nome, e-mail, empresa, função na conta, plano, situação da assinatura, fim do teste grátis, data do cadastro, do último
            acesso e da confirmação do e-mail. Um endereço extra que a empresa cadastra só para receber relatórios também entra, marcado
            como destinatário de relatórios;
          </li>
          <li>
            <strong>Provedor de infraestrutura</strong>: servidores onde o sistema, o banco de dados e as cópias de segurança ficam hospedados;
          </li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
        <p>
          A narração em voz do manual do sistema é gerada a partir do texto do próprio manual; nenhum dado de pessoas ou de empresas é enviado
          para isso.
        </p>

        <h2>5. Cookies e armazenamento no navegador</h2>
        <p>Usamos apenas o necessário para o sistema funcionar. Não usamos cookies de publicidade nem de rastreamento de terceiros.</p>
        <ul>
          <li>Cookie da sessão de login, que expira em até 7 dias;</li>
          <li>Preferências guardadas só no seu navegador: aparência clara ou escura e velocidade da leitura em voz alta do manual;</li>
          <li>Rascunho do cadastro inicial da empresa, para você não perder o que digitou se fechar a página no meio.</li>
        </ul>

        <h2>6. Por quanto tempo guardamos</h2>
        <ul>
          <li>
            <strong>Texto das mensagens</strong>: apagado automaticamente depois de 365 dias. A empresa pode escolher outro prazo nas
            configurações de privacidade.
          </li>
          <li>
            <strong>Conversas e registro de auditoria</strong>: apagados automaticamente depois de 730 dias, também ajustável pela empresa.
          </li>
          <li>
            <strong>Eventos de uso do produto</strong>: apagados depois de 400 dias; os números agregados (sem identificar pessoas) podem ser
            mantidos.
          </li>
          <li>
            <strong>Dados da conta</strong>: enquanto a conta estiver ativa. Quando o administrador pede o encerramento, há 7 dias para
            desistir; depois disso, todos os dados da empresa são apagados de forma definitiva.
          </li>
          <li>A empresa também pode apagar a qualquer momento as conversas e os dados de um contato.</li>
          <li>Registros que a lei exige guardar, como os de cobrança, são mantidos pelo prazo legal.</li>
        </ul>

        <h2>7. Segurança</h2>
        <ul>
          <li>Conexão protegida por HTTPS;</li>
          <li>Senhas guardadas com cifragem própria para senhas;</li>
          <li>Telefone completo dos contatos guardado cifrado no banco de dados, com chave que fica só no servidor;</li>
          <li>Credenciais de conexão do WhatsApp guardadas cifradas no servidor;</li>
          <li>Acesso restrito por função dentro de cada conta e separação dos dados entre empresas;</li>
          <li>Registro de auditoria das ações sensíveis, como exclusão de dados e mudanças de acesso;</li>
          <li>Cópias de segurança do banco de dados.</li>
        </ul>

        <h2>8. Seus direitos</h2>
        <p>
          Pela LGPD, você pode pedir confirmação de tratamento, acesso, correção, portabilidade, eliminação e informações sobre compartilhamento,
          entre outros direitos.
        </p>
        <ul>
          <li>
            <strong>Se você usa o sistema</strong>, o administrador da sua conta pode alterar a sua função ou remover o seu acesso; os demais
            pedidos podem ser feitos diretamente a nós.
          </li>
          <li>
            <strong>Se você conversou com uma empresa que usa o AtendeRadar</strong>, faça o pedido à própria empresa, que é a controladora dos
            seus dados. O sistema permite que ela exporte, exclua da análise ou apague de forma definitiva as suas conversas e dados.
          </li>
          <li>Você pode deixar de receber e-mails de novidades a qualquer momento pelo link no próprio e-mail.</li>
        </ul>

        <h2>9. Mudanças nesta política e contato</h2>
        <p>Quando esta política mudar, a data de atualização no topo da página será alterada. Mudanças relevantes serão avisadas aos clientes.</p>
        <p>
          {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · {EMPRESA.endereco}
          {CONTATO ? (
            <>
              {' '}· <a href={`mailto:${CONTATO}`}>{CONTATO}</a>
            </>
          ) : null}
        </p>
      </LegalPage>
    </BlogShell>
  )
}
