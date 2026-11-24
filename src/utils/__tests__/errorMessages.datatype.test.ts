import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../errorMessages';

describe('mensagem de incompatibilidade de tipo do banco', () => {
  it('não expõe coluna, tipos internos, hint ou SQLSTATE 42804', () => {
    const message = getErrorMessage({
      code: '42804',
      message: 'column "form_template_id" is of type uuid but expression is of type text',
      hint: 'You will need to rewrite or cast the expression.',
    });

    expect(message).toBe(
      'Não foi possível processar os dados agora. Atualize a página e tente novamente.',
    );
    expect(message).not.toContain('form_template_id');
    expect(message).not.toContain('42804');
  });

  it('também sanitiza a incompatibilidade quando um wrapper perde o SQLSTATE', () => {
    const message = getErrorMessage(new Error(
      'column "form_template_id" is of type uuid but expression is of type text. '
      + 'You will need to rewrite or cast the expression.',
    ));

    expect(message).toBe('Ocorreu um erro inesperado. Tente novamente.');
    expect(message).not.toContain('form_template_id');
    expect(message).not.toContain('uuid');
  });

  it('não expõe coluna nem código interno quando o schema ainda não foi atualizado', () => {
    const message = getErrorMessage({
      code: 'PGRST204',
      message: "Could not find the 'white_label_logo_surface' column of 'company_settings' in the schema cache",
    });

    expect(message).toBe(
      'Esta configuração ainda não está disponível no servidor. Atualize a página e tente novamente em alguns instantes.',
    );
    expect(message).not.toContain('white_label_logo_surface');
    expect(message).not.toContain('PGRST204');
  });
});
