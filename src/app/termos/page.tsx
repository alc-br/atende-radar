import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { LegalPage } from '@/components/site/legal'
import { SITE_URL } from '@/lib/hosts'

export const metadata: Metadata = {
  title: 'Termos de Uso — AtendeRadar',
  description: 'Regras de uso do AtendeRadar: conta, teste grátis, assinatura, responsabilidades e uso do WhatsApp.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/termos` } : undefined,
}

const CONTATO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

export default function TermosPage() {
  return (
    <BlogShell>
      <LegalPage titulo="Termos de Uso" atualizado="2026-10-12">
        <p>
          Estes termos regem o uso do AtendeRadar. Ao criar uma conta ou usar o sistema, você concorda com eles e com a nossa{' '}
          <a href="/privacidade">Política de Privacidade</a>.
        </p>

        <h2>1. O serviço</h2>
        <p>
          O AtendeRadar analisa as conversas de atendimento do WhatsApp conectado pela empresa e apresenta alertas, oportunidades em risco,
          indicadores e relatórios. O sistema <strong>não envia mensagens</strong> pelo número da empresa: o atendimento continua sendo feito
          pela equipe dela.
        </p>
        <p>
          As análises são automáticas e servem de apoio à gestão. Elas podem conter imprecisões e não substituem a avaliação de quem conhece o
          negócio. As decisões tomadas a partir delas são de responsabilidade da empresa.
        </p>

        <h2>2. Conta e acesso</h2>
        <ul>
          <li>Quem cria a conta declara ter poderes para contratar em nome da empresa.</li>
          <li>Cada pessoa deve usar o próprio acesso. Login e senha são pessoais e não devem ser compartilhados.</li>
          <li>O administrador da conta é responsável por convidar pessoas, definir funções e remover acessos que não forem mais necessários.</li>
        </ul>

        <h2>3. Teste grátis</h2>
        <p>
          Toda conta nova começa com 14 dias de teste grátis, sem pedir cartão de crédito. Ao fim do teste, para continuar usando o sistema é
          preciso assinar um plano. A conta de demonstração disponível no site é pública, somente para leitura, e contém dados fictícios.
        </p>

        <h2>4. Planos, cobrança e cancelamento</h2>
        <ul>
          <li>Os planos, preços e limites são os publicados no site no momento da contratação.</li>
          <li>A assinatura é cobrada de forma recorrente no cartão informado, no ciclo escolhido (mensal ou anual), por meio do Pagar.me.</li>
          <li>Você pode cancelar a qualquer momento pelo sistema. O acesso continua até o fim do período já pago, sem novas cobranças.</li>
          <li>Se um pagamento não for aprovado, o acesso pode ser limitado até a regularização.</li>
          <li>Mudanças de preço serão avisadas com antecedência e só valem a partir do ciclo seguinte.</li>
        </ul>

        <h2>5. Uso do WhatsApp e das conversas</h2>
        <ul>
          <li>
            A empresa conecta o próprio número lendo um QR Code. Ela é responsável por usar o WhatsApp de acordo com os termos do próprio
            WhatsApp e por ter base legal para tratar os dados dos seus clientes.
          </li>
          <li>
            Nas conversas analisadas, a empresa é a controladora dos dados e o AtendeRadar atua como operador, conforme a{' '}
            <a href="/privacidade">Política de Privacidade</a>.
          </li>
          <li>A conexão depende do funcionamento do WhatsApp e do aparelho da empresa; quedas fora do nosso controle podem interromper a análise.</li>
        </ul>

        <h2>6. Uso proibido</h2>
        <ul>
          <li>Usar o sistema para fins ilegais, para monitorar pessoas sem base legal ou para enviar spam;</li>
          <li>Tentar acessar dados de outras empresas, burlar limites do plano ou comprometer a segurança do sistema;</li>
          <li>Copiar, revender ou fazer engenharia reversa do sistema.</li>
        </ul>
        <p>O descumprimento pode levar à suspensão ou ao encerramento da conta.</p>

        <h2>7. Disponibilidade e responsabilidade</h2>
        <p>
          Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros. Na
          medida permitida pela lei, nossa responsabilidade se limita ao valor pago pela empresa nos últimos 12 meses e não inclui lucros
          cessantes ou vendas não realizadas.
        </p>

        <h2>8. Encerramento</h2>
        <p>
          A empresa pode pedir o encerramento da conta a qualquer momento. Antes disso, pode exportar os relatórios e dados de que precisar. Após
          o encerramento, os dados são apagados, exceto os que a lei obriga a manter.
        </p>

        <h2>9. Alterações e lei aplicável</h2>
        <p>
          Estes termos podem ser atualizados; a data no topo da página indica a versão em vigor, e mudanças relevantes serão avisadas aos
          clientes. Aplica-se a lei brasileira.
        </p>
        {CONTATO ? (
          <p>
            Dúvidas sobre estes termos: <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
          </p>
        ) : null}
      </LegalPage>
    </BlogShell>
  )
}
