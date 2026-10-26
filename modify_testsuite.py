import re

with open('src/components/AITestSuite.tsx', 'r') as f:
    content = f.read()

new_cases = """
    {
      id: 'flow_novo_cadastro_entidade',
      name: 'Novo Cadastro de Entidade (CRM)',
      description: 'Testa o fluxo de cadastro rápido de cliente/fornecedor',
      category: 'Fluxo Principal',
      steps: [
        {
          id: 'step_nav_cadastros',
          description: 'Acessar CRM & Cadastros',
          execute: async () => {
            navigate('/cadastros');
            setActiveTab('cadastros');
            await wait(800);
          }
        },
        {
          id: 'step_open_modal_entidade',
          description: 'Abrir Modal de Cadastro Rápido',
          execute: async () => {
            setModalOpen('isCadastroRapidoOpen', true);
            await wait(1200);
          }
        },
        {
          id: 'step_validate_form',
          description: 'Validar formulário e feedback visual',
          execute: async () => {
            await wait(1500);
          }
        },
        {
          id: 'step_close_modal_entidade',
          description: 'Salvar e fechar',
          execute: async () => {
            setModalOpen('isCadastroRapidoOpen', false);
            await wait(800);
          }
        }
      ]
    },
    {
      id: 'flow_relatorios',
      name: 'Visualização de Relatórios',
      description: 'Testa a navegação e o carregamento dos gráficos analíticos',
      category: 'UI/UX',
      steps: [
        {
          id: 'step_nav_relatorios',
          description: 'Acessar módulo de Relatórios Analíticos',
          execute: async () => {
            navigate('/relatorios');
            setActiveTab('relatorios');
            await wait(1200);
          }
        },
        {
          id: 'step_check_charts',
          description: 'Verificar renderização dos componentes recharts',
          execute: async () => {
            await wait(1500);
          }
        }
      ]
    },
"""

content = content.replace("  const testCases: TestCase[] = [", "  const testCases: TestCase[] = [\n" + new_cases)

with open('src/components/AITestSuite.tsx', 'w') as f:
    f.write(content)

