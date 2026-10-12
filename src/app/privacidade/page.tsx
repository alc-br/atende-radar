import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { LegalPage } from '@/components/site/legal'
import { SITE_URL } from '@/lib/hosts'

export const metadata: Metadata = {
  title: 'Política de Privacidade — AtendeRadar',
  description: 'Como o AtendeRadar trata os dados pessoais de quem usa o sistema e dos clientes que conversam com as empresas pelo WhatsApp.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/privacidade` } : undefined,
}

const CONTATO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

export default function PrivacidadePage() {
  return (
    <BlogShell>
      <LegalPage titulo="Política de Privacidade" atualizado="2026-10-12">
        <p>
          Esta política explica quais dados pessoais o AtendeRadar trata, para quê, com quem eles são compartilhados e como você exerce os
          seus direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
        </p>

        <h2>1. Quem somos e qual é o nosso papel</h2>
        <p>
          O AtendeRadar é um sistema que analisa as conversas de atendimento do WhatsApp de empresas clientes para apontar oportunidades em
          risco, promessas sem retorno e indicadores do atendimento.
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
          <li>Nome, e-mail e senha (guardada de forma cifrada, nunca em texto puro);</li>
          <li>Nome da empresa, função na conta (administrador, gestor ou atendente) e convites enviados;</li>
          <li>Registros de uso necessários à segurança, como data e hora de ações importantes (registro de auditoria).</li>
        </ul>
        <h3>Dados de cobrança</h3>
        <p>
          Ao assinar um plano, os dados do cartão são enviados diretamente ao processador de pagamentos (Pagar.me). O AtendeRadar não armazena o
          número completo do cartão; guarda apenas o necessário para identificar a assinatura e o status dos pagamentos.
        </p>
        <h3>Conversas analisadas</h3>
        <p>
          Quando a empresa conecta um número de WhatsApp, o sistema recebe as mensagens desse número (texto, data e hora, nome e telefone do
          contato e quem respondeu) para gerar as análises. As análises são feitas pelo próprio AtendeRadar, nos nossos servidores; o conteúdo
          das conversas não é enviado a serviços de inteligência artificial de terceiros.
        </p>

        <h2>3. Para que usamos os dados</h2>
        <ul>
          <li>Prestar o serviço: conectar o WhatsApp, analisar conversas, gerar alertas, relatórios e indicadores;</li>
          <li>Criar e proteger a conta, autenticar o acesso e controlar permissões por função;</li>
          <li>Cobrar a assinatura e emitir os avisos de pagamento;</li>
          <li>Enviar e-mails do serviço, como confirmação de cadastro, convites, recuperação de senha e relatórios;</li>
          <li>Cumprir obrigações legais e nos defender em processos.</li>
        </ul>
        <p>Não vendemos dados pessoais e não usamos as conversas das empresas clientes para publicidade.</p>

        <h2>4. Com quem compartilhamos</h2>
        <ul>
          <li><strong>Pagar.me</strong>: processamento dos pagamentos da assinatura;</li>
          <li><strong>Resend</strong>: envio dos e-mails do serviço;</li>
          <li><strong>Provedor de infraestrutura</strong>: servidores onde o sistema e o banco de dados ficam hospedados;</li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </ul>

        <h2>5. Cookies e armazenamento no navegador</h2>
        <p>
          Usamos apenas o necessário para o sistema funcionar: o cookie da sessão de login (que expira em até 7 dias) e uma preferência de
          aparência guardada no seu navegador. Não usamos cookies de publicidade nem de rastreamento de terceiros.
        </p>

        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          Os dados da conta ficam guardados enquanto ela estiver ativa. As conversas ficam disponíveis para a empresa cliente enquanto ela usar o
          serviço, e podem ser apagadas por ela a qualquer momento, por contato. Registros exigidos por lei, como os de cobrança, são mantidos
          pelo prazo legal.
        </p>

        <h2>7. Segurança</h2>
        <ul>
          <li>Conexão protegida por HTTPS;</li>
          <li>Senhas guardadas com cifragem própria para senhas;</li>
          <li>Acesso restrito por função dentro de cada conta e separação dos dados entre empresas;</li>
          <li>Registro de auditoria das ações sensíveis, como exclusão de dados e mudanças de acesso.</li>
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
        </ul>
        {CONTATO ? (
          <p>
            Para dúvidas ou pedidos sobre esta política, escreva para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
          </p>
        ) : null}

        <h2>9. Mudanças nesta política</h2>
        <p>Quando esta política mudar, a data de atualização no topo da página será alterada. Mudanças relevantes serão avisadas aos clientes.</p>
      </LegalPage>
    </BlogShell>
  )
}
