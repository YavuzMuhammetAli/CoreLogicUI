import {
  flattenModelPayload,
  parseProposalPayload,
  toDashboardWidgets,
  toMemberMetadataUpdates,
  toRelationshipUpsert,
  toReportDefinition,
  validateModelChangePayload,
  validateModelPayload
} from './ai-import.mapper';
import { AiDashboardPayload, AiModelChangePayload, AiModelPayload, AiReportPayload } from '../models/ai.model';
import { PublishedTableSchema } from '../services/published-table.service';

/**
 * Tests for the pure functions that convert AI proposals (G4) into existing
 * service payloads.
 *
 * Mistakes here are silent: a wrong order or an un-inverted flag raises
 * no error, it just produces a broken model. That is why the conversion itself
 * is separated from orchestration and tested directly.
 */
describe('ai-import.mapper', () => {
  const column = (over: Partial<AiModelPayload['columns'][0]> = {}) => ({
    columnName: 'Ad',
    dataType: 'string',
    isNullable: true,
    label: 'Ad',
    ...over
  });

  const modelPayload = (over: Partial<AiModelPayload> = {}): AiModelPayload => ({
    entityName: 'Musteri',
    description: 'Müşteri kayıtları',
    columns: [column()],
    ...over
  });

  describe('parseProposalPayload', () => {
    it('returns null for corrupt JSON', () => {
      expect(parseProposalPayload('{ bozuk')).toBeNull();
    });

    it('parses valid JSON', () => {
      expect(parseProposalPayload<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    });
  });

  describe('flattenModelPayload', () => {
    it('puts the parent model BEFORE the sub-models', () => {
      const nodes = flattenModelPayload(
        modelPayload({
          subModels: [{ entityName: 'SiparisKalemi', columns: [column()] }]
        })
      );

      // The order is binding: addTable looks up the parent table when saving a sub-model.
      expect(nodes.map(n => n.entityName)).toEqual(['Musteri', 'SiparisKalemi']);
      expect(nodes[0].parentName).toBeNull();
      expect(nodes[1].parentName).toBe('Musteri');
    });

    it('returns a single node when there are no sub-models', () => {
      expect(flattenModelPayload(modelPayload()).length).toBe(1);
    });
  });

  describe('validateModelPayload', () => {
    it('returns null for a valid payload', () => {
      expect(validateModelPayload(modelPayload())).toBeNull();
    });

    it('rejects a non-PascalCase model name', () => {
      expect(validateModelPayload(modelPayload({ entityName: 'musteri' }))).toContain('name:');
    });

    it('rejects a data type outside the whitelist', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'money' })] });
      expect(validateModelPayload(payload)).toContain('type:');
    });

    it('enumValues is required for the enum type', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'enum' })] });
      expect(validateModelPayload(payload)).toContain('enum:');
    });

    it('a target table is required for the lookup type', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'lookup' })] });
      expect(validateModelPayload(payload)).toContain('lookup:');
    });

    it('also checks the sub-model columns', () => {
      const payload = modelPayload({
        subModels: [{ entityName: 'Kalem', columns: [column({ columnName: '1Adet' })] }]
      });
      expect(validateModelPayload(payload)).toContain('column:');
    });

    it('rejects a model without columns', () => {
      expect(validateModelPayload(modelPayload({ columns: [] }))).toBe('no-columns');
    });
  });

  describe('toRelationshipUpsert', () => {
    it('does not send depth/ID, carries the order', () => {
      const upsert = toRelationshipUpsert(
        {
          targetModel: 'Siparis',
          relationshipType: 2,
          propertyName: 'Siparisler',
          inverseProperty: 'Musteri',
          required: true,
          cascadeDelete: false
        },
        3
      );

      expect(upsert.order).toBe(3);
      expect(upsert.inverseProperty).toBe('Musteri');
      // The backend derives the FK and join table names.
      expect(upsert.foreignKeyName).toBeNull();
      expect(upsert.joinTableName).toBeNull();
    });
  });

  describe('toReportDefinition', () => {
    const reportPayload = (over: Partial<AiReportPayload> = {}): AiReportPayload => ({
      name: 'Aylık Ciro',
      modelName: 'Siparis',
      selectedColumns: ['Tutar'],
      chartType: 'column',
      ...over
    });

    it('converts the filter value to a string', () => {
      const result = toReportDefinition(
        reportPayload({
          filters: [{ field: 'Tutar', operator: 'gt', value: 100 as unknown as string }]
        })
      );
      expect(result.filters?.[0].value).toBe('100');
    });

    it('drops an operator outside the whitelist', () => {
      const result = toReportDefinition(
        reportPayload({ filters: [{ field: 'Tutar', operator: 'like', value: 'x' }] })
      );
      expect(result.filters?.length).toBe(0);
    });

    it('drops an aggregate function outside the whitelist', () => {
      const result = toReportDefinition(
        reportPayload({ aggregates: [{ field: 'Tutar', function: 'MEDIAN' }] })
      );
      expect(result.aggregates?.length).toBe(0);
    });

    it('falls back to table for an unknown chart type', () => {
      expect(toReportDefinition(reportPayload({ chartType: 'sankey' })).chartType).toBe('table');
    });

    it('turns an invalid sort direction into ASC', () => {
      const result = toReportDefinition(
        reportPayload({ sortBy: [{ field: 'SUM_Tutar', direction: 'yukari' }] })
      );
      expect(result.sortBy?.[0].direction).toBe('ASC');
    });
  });

  describe('toDashboardWidgets', () => {
    const dashboardPayload = (over: Partial<AiDashboardPayload> = {}): AiDashboardPayload => ({
      name: 'Satış Panosu',
      widgets: [{ reportName: 'Aylık Ciro', chartType: 'column', x: 0, y: 0, w: 6, h: 4 }],
      ...over
    });

    it('resolves the report name case-insensitively', () => {
      const ids = new Map([['aylık ciro', 42]]);
      const { widgets, unresolved } = toDashboardWidgets(dashboardPayload(), ids);

      expect(unresolved.length).toBe(0);
      expect(widgets[0].reportDefinitionId).toBe(42);
    });

    it('reports an unresolved report and produces no widget', () => {
      const { widgets, unresolved } = toDashboardWidgets(dashboardPayload(), new Map());

      expect(widgets.length).toBe(0);
      expect(unresolved).toEqual(['Aylık Ciro']);
    });

    it('clamps grid overflow (x + w <= 12)', () => {
      const ids = new Map([['aylık ciro', 1]]);
      const { widgets } = toDashboardWidgets(
        dashboardPayload({
          widgets: [{ reportName: 'Aylık Ciro', chartType: 'bar', x: 10, y: 0, w: 12, h: 1 }]
        }),
        ids
      );

      expect(widgets[0].w).toBe(12);
      expect(widgets[0].x).toBe(0);
      // h must be at least 2, otherwise the widget is too short to read.
      expect(widgets[0].h).toBe(2);
    });
  });
});

/**
 * Model change proposal (propose_model_change). The endpoint does a FULL replacement; the proposal carries only
 * changed fields — if merging is wrong, rules the proposal does not mention are silently deleted.
 */
describe('toMemberMetadataUpdates', () => {
  const schema: PublishedTableSchema = {
    tableName: 'Musteri',
    description: '',
    version: 1,
    columns: [
      { name: 'Unvan', dataType: 'string', isRequired: false, label: 'Ünvan', maxLength: 100, regex: '^[A-Z]' },
      { name: 'Durum', dataType: 'enum', isRequired: true, label: 'Durum', enumValues: 'Aktif|Pasif' },
      { name: 'Logo', dataType: 'image', isRequired: false, label: 'Logo', maxLength: 1000 },
      { name: 'Yas', dataType: 'int', isRequired: false, label: 'Yaş', min: 0 }
    ]
  };

  function change(alterColumns: AiModelChangePayload['alterColumns']): AiModelChangePayload {
    return { entityName: 'Musteri', reason: 'test', alterColumns };
  }

  it('leaves an omitted field at its saved value', () => {
    const { updates, error } = toMemberMetadataUpdates(schema, change([{ columnName: 'Unvan', isNullable: false }]));

    expect(error).toBeNull();
    expect(updates).toEqual([jasmine.objectContaining({
      typeName: 'Musteri', memberName: 'Unvan', isRequired: true, label: 'Ünvan', maxLength: 100, regex: '^[A-Z]'
    })]);
  });

  it('matches the column name case-insensitively and uses the saved name', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'unvan', label: 'Ticari Ünvan' }]));

    expect(updates[0].memberName).toBe('Unvan');
    expect(updates[0].label).toBe('Ticari Ünvan');
  });

  it('replaces enum values entirely', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Durum', enumValues: 'Aktif|Askıda' }]));

    expect(updates[0].enumValues).toBe('Aktif|Askıda');
    expect(updates[0].isRequired).toBeTrue();
  });

  it('keeps a file column\'s KB limit without rounding', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Logo', label: 'Firma logosu' }]));

    expect(updates[0].maxLength).toBe(1000);
  });

  it('does not send a rule that does not fit the type', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Yas', regex: 'x', max: 120 }]));

    expect(updates[0]).toEqual(jasmine.objectContaining({ min: 0, max: 120, regex: null }));
  });

  it('produces no updates for an unknown column', () => {
    const result = toMemberMetadataUpdates(schema, change([
      { columnName: 'Unvan', label: 'X' },
      { columnName: 'Yok', label: 'Y' }
    ]));

    expect(result.error).toBe('column-missing:Yok');
    expect(result.updates).toEqual([]);
  });
});

describe('validateModelChangePayload', () => {
  it('rejects an empty proposal and one without changes', () => {
    expect(validateModelChangePayload(null)).toBe('payload');
    expect(validateModelChangePayload({ entityName: 'Musteri', reason: '' })).toBe('no-changes');
  });

  it('validates added columns with the new-model rules', () => {
    expect(validateModelChangePayload({
      entityName: 'Musteri', reason: '',
      addColumns: [{ columnName: 'Tür', dataType: 'string', isNullable: true, label: 'Tür' }]
    })).toBe('column:Tür');
    expect(validateModelChangePayload({
      entityName: 'Musteri', reason: '',
      addColumns: [{ columnName: 'Tur', dataType: 'enum', isNullable: true, label: 'Tür' }]
    })).toBe('enum:Tur');
    expect(validateModelChangePayload({
      entityName: 'Musteri', reason: '',
      addColumns: [{ columnName: 'Telefon', dataType: 'string', isNullable: true, label: 'Telefon' }]
    })).toBeNull();
  });
});
