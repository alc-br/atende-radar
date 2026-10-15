import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { LegalPage } from '@/components/site/legal'
import { SITE_URL } from '@/lib/hosts'
import { EMPRESA, TERMS_VERSION } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Termos de Uso — AtendeRadar',
  description: 'Regras de uso do AtendeRadar: conta, teste grátis, assinatura, arrependimento e reembolso, responsabilidades e uso do WhatsApp.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/termos` } : undefined,
}

const CONTATO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''

export default function TermosPage() {
  return (
    <BlogShell>
      <LegalPage titulo="Termos de Uso" atualizado={TERMS_VERSION}>
        <p>
          Estes termos regem o uso do AtendeRadar, serviço prestado por <strong>{EMPRESA.razaoSocial}</strong>, inscrita no CNPJ sob o nº{' '}
          {EMPRESA.cnpj}, com sede na {EMPRESA.endereco}. Ao criar uma conta ou usar o sistema, você concorda com estes termos e com a nossa{' '}
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
          Toda conta nova começa com 14 dias de teste grátis, sem pedir cartão de crédito e sem cobrança automática no fim. Terminado o teste,
          a análise das conversas fica pausada e o cadastro de novos itens fica bloqueado até a empresa contratar um plano; os dados continuam
          guardados. A conta de demonstração disponível no site é pública, somente para leitura, e contém dados fictícios.
        </p>

        <h2>4. Planos e cobrança</h2>
        <ul>
          <li>Os planos, preços e limites são os publicados no site no momento da contratação.</li>
          <li>
            A assinatura é cobrada no cartão de crédito informado, de forma recorrente, no ciclo escolhido (mensal ou anual), por meio do
            processador de pagamentos Pagar.me. A primeira cobrança é feita na contratação e as seguintes no início de cada novo ciclo.
          </li>
          <li>
            <strong>Mudança de preço:</strong> um preço novo vale somente para contratações novas. A assinatura em andamento continua sendo
            renovada pelo valor contratado.
          </li>
          <li>
            <strong>Troca de plano:</strong> a troca é feita no próprio sistema e cobra o plano novo na hora, iniciando um novo ciclo; não há
            cálculo proporcional do período anterior. A mudança para um plano menor só é aceita quando o uso atual cabe nos limites dele.
          </li>
          <li>Se um pagamento não for aprovado, o cadastro de novos itens fica bloqueado até a regularização (troca do cartão no sistema).</li>
        </ul>

        <h2>5. Direito de arrependimento e reembolso</h2>
        <p>
          Em até <strong>7 dias</strong> a partir do pagamento que abriu a contratação, a empresa pode desistir dela pelo próprio sistema
          (em Planos, “Desistir e receber reembolso”), sem precisar justificar, conforme o art. 49 do Código de Defesa do Consumidor. Nesse caso:
        </p>
        <ul>
          <li>o valor pago é <strong>estornado integralmente</strong> no mesmo cartão;</li>
          <li>a renovação automática é cancelada e o plano termina na hora;</li>
          <li>o crédito aparece na fatura do cartão conforme o prazo do banco emissor.</li>
        </ul>
        <p>
          O prazo vale para a contratação, não para as renovações. Se o estorno não puder ser concluído pelo sistema, a renovação é cancelada e
          o reembolso é feito pela nossa equipe.
        </p>

        <h2>6. Cancelamento da renovação</h2>
        <p>
          Fora do prazo de arrependimento, a empresa pode cancelar a renovação a qualquer momento, em Planos. Nenhuma nova cobrança é feita e o
          plano continua valendo até o fim do período já pago, que não é reembolsado. Até essa data, a renovação pode ser reativada sem nova
          cobrança imediata.
        </p>

        <h2>7. Uso do WhatsApp e das conversas</h2>
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

        <h2>8. Uso proibido</h2>
        <ul>
          <li>Usar o sistema para fins ilegais, para monitorar pessoas sem base legal ou para enviar spam;</li>
          <li>Tentar acessar dados de outras empresas, burlar limites do plano ou comprometer a segurança do sistema;</li>
          <li>Copiar, revender ou fazer engenharia reversa do sistema.</li>
        </ul>
        <p>O descumprimento pode levar à suspensão ou ao encerramento da conta.</p>

        <h2>9. Disponibilidade e responsabilidade</h2>
        <p>
          Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros. Na
          medida permitida pela lei, nossa responsabilidade se limita ao valor pago pela empresa nos últimos 12 meses e não inclui lucros
          cessantes ou vendas não realizadas.
        </p>

        <h2>10. Encerramento da conta</h2>
        <p>
          O administrador pode pedir o encerramento da conta a qualquer momento, em Configurações. A renovação da assinatura é cancelada e os
          WhatsApp são desconectados na hora; durante 7 dias é possível desistir do encerramento. Depois desse prazo, todos os dados da empresa
          são apagados de forma definitiva. Antes de pedir, exporte os relatórios e dados de que precisar. Os registros de pagamento mantidos
          pelo processador de pagamentos seguem os prazos legais dele.
        </p>

        <h2>11. Alterações, lei aplicável e contato</h2>
        <p>
          Estes termos podem ser atualizados; a data no topo da página indica a versão em vigor, e mudanças relevantes serão avisadas aos
          clientes. Aplica-se a lei brasileira.
        </p>
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
