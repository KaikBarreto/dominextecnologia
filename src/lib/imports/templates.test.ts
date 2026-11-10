import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseEntityImportWorkbook } from './parseWorkbook';
import {
  buildDominexImportTemplate,
  dominexImportTemplateFileName,
  DOMINEX_IMPORT_HEADERS,
} from './templates';
import type { ImportEntityKind } from './types';

describe('templates de importação Dominex', () => {
  it.each(['customers', 'suppliers', 'inventory', 'equipment'] as ImportEntityKind[])(
    'gera %s em memória, sem dados preenchidos e detectável pelo parser',
    async (entity) => {
      const data = await buildDominexImportTemplate(entity);
      const workbook = XLSX.read(data, { type: 'array', cellFormula: true });
      const sheet = workbook.Sheets.Dados;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

      expect(rows).toEqual([[...DOMINEX_IMPORT_HEADERS[entity]]]);
      expect(dominexImportTemplateFileName(entity)).toMatch(/^modelo-dominex-.+\.xlsx$/);

      const parsed = await parseEntityImportWorkbook({ entity, data });
      expect(parsed.source).toMatchObject({ provider: 'dominex', entity });
      expect(parsed.rows).toEqual([]);
      expect(parsed.errors).toContainEqual(expect.objectContaining({ code: 'nenhuma_linha' }));
      expect(parsed.errors).not.toContainEqual(expect.objectContaining({ code: 'formula_nao_permitida' }));
    },
  );
});
