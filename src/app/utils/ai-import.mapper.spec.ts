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
 * Yapay Zeka önerilerini (G4) mevcut servis payload'larına çeviren saf
 * fonksiyonların testleri.
 *
 * Buradaki hatalar sessizdir: yanlış sıra ya da ters çevrilmemiş bir bayrak
 * hata vermez, sadece bozuk bir model üretir. Bu yüzden dönüşümün kendisi
 * orkestrasyondan ayrılıp doğrudan test edilir.
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
    it('bozuk JSON için null döner', () => {
      expect(parseProposalPayload('{ bozuk')).toBeNull();
    });

    it('geçerli JSON çözülür', () => {
      expect(parseProposalPayload<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    });
  });

  describe('flattenModelPayload', () => {
    it('ana modeli alt modellerden ÖNCE koyar', () => {
      const nodes = flattenModelPayload(
        modelPayload({
          subModels: [{ entityName: 'SiparisKalemi', columns: [column()] }]
        })
      );

      // Sıra bağlayıcı: addTable alt modeli kaydederken ana tabloyu arar.
      expect(nodes.map(n => n.entityName)).toEqual(['Musteri', 'SiparisKalemi']);
      expect(nodes[0].parentName).toBeNull();
      expect(nodes[1].parentName).toBe('Musteri');
    });

    it('alt model yoksa tek düğüm döner', () => {
      expect(flattenModelPayload(modelPayload()).length).toBe(1);
    });
  });

  describe('validateModelPayload', () => {
    it('geçerli yük için null döner', () => {
      expect(validateModelPayload(modelPayload())).toBeNull();
    });

    it('PascalCase olmayan model adını reddeder', () => {
      expect(validateModelPayload(modelPayload({ entityName: 'musteri' }))).toContain('ad:');
    });

    it('beyaz liste dışı veri tipini reddeder', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'money' })] });
      expect(validateModelPayload(payload)).toContain('tip:');
    });

    it('enum tipinde enumValues zorunludur', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'enum' })] });
      expect(validateModelPayload(payload)).toContain('enum:');
    });

    it('lookup tipinde hedef tablo zorunludur', () => {
      const payload = modelPayload({ columns: [column({ dataType: 'lookup' })] });
      expect(validateModelPayload(payload)).toContain('lookup:');
    });

    it('alt modelin kolonlarını da denetler', () => {
      const payload = modelPayload({
        subModels: [{ entityName: 'Kalem', columns: [column({ columnName: '1Adet' })] }]
      });
      expect(validateModelPayload(payload)).toContain('kolon:');
    });

    it('kolonsuz modeli reddeder', () => {
      expect(validateModelPayload(modelPayload({ columns: [] }))).toBe('kolon-yok');
    });
  });

  describe('toRelationshipUpsert', () => {
    it('derinlik/ID göndermez, sırayı taşır', () => {
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
      // FK ve join tablosu adlarını backend türetir.
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

    it('filtre değerini string\'e çevirir', () => {
      const result = toReportDefinition(
        reportPayload({
          filters: [{ field: 'Tutar', operator: 'gt', value: 100 as unknown as string }]
        })
      );
      expect(result.filters?.[0].value).toBe('100');
    });

    it('beyaz liste dışı operatörü eler', () => {
      const result = toReportDefinition(
        reportPayload({ filters: [{ field: 'Tutar', operator: 'like', value: 'x' }] })
      );
      expect(result.filters?.length).toBe(0);
    });

    it('beyaz liste dışı aggregate fonksiyonunu eler', () => {
      const result = toReportDefinition(
        reportPayload({ aggregates: [{ field: 'Tutar', function: 'MEDIAN' }] })
      );
      expect(result.aggregates?.length).toBe(0);
    });

    it('bilinmeyen grafik tipinde table\'a düşer', () => {
      expect(toReportDefinition(reportPayload({ chartType: 'sankey' })).chartType).toBe('table');
    });

    it('geçersiz sıralama yönünü ASC yapar', () => {
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

    it('rapor adını büyük/küçük harf duyarsız çözer', () => {
      const ids = new Map([['aylık ciro', 42]]);
      const { widgets, unresolved } = toDashboardWidgets(dashboardPayload(), ids);

      expect(unresolved.length).toBe(0);
      expect(widgets[0].reportDefinitionId).toBe(42);
    });

    it('çözülemeyen raporu bildirir ve widget üretmez', () => {
      const { widgets, unresolved } = toDashboardWidgets(dashboardPayload(), new Map());

      expect(widgets.length).toBe(0);
      expect(unresolved).toEqual(['Aylık Ciro']);
    });

    it('grid taşmasını kırpar (x + w <= 12)', () => {
      const ids = new Map([['aylık ciro', 1]]);
      const { widgets } = toDashboardWidgets(
        dashboardPayload({
          widgets: [{ reportName: 'Aylık Ciro', chartType: 'bar', x: 10, y: 0, w: 12, h: 1 }]
        }),
        ids
      );

      expect(widgets[0].w).toBe(12);
      expect(widgets[0].x).toBe(0);
      // h en az 2 olmalı, aksi halde widget okunamaz yükseklikte kalır.
      expect(widgets[0].h).toBe(2);
    });
  });
});

/**
 * Model değişikliği önerisi (propose_model_change). Uç TAM değiştirme yapar; öneri yalnız
 * değişen alanları taşır — birleştirme yanlışsa önerinin söylemediği kurallar sessizce silinir.
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

  it('verilmeyen alanı kayıtlı değerinde bırakır', () => {
    const { updates, error } = toMemberMetadataUpdates(schema, change([{ columnName: 'Unvan', isNullable: false }]));

    expect(error).toBeNull();
    expect(updates).toEqual([jasmine.objectContaining({
      typeName: 'Musteri', memberName: 'Unvan', isRequired: true, label: 'Ünvan', maxLength: 100, regex: '^[A-Z]'
    })]);
  });

  it('kolon adını büyük/küçük harfe duyarsız eşler, kayıtlı adı kullanır', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'unvan', label: 'Ticari Ünvan' }]));

    expect(updates[0].memberName).toBe('Unvan');
    expect(updates[0].label).toBe('Ticari Ünvan');
  });

  it('enum değerlerini tamamen değiştirir', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Durum', enumValues: 'Aktif|Askıda' }]));

    expect(updates[0].enumValues).toBe('Aktif|Askıda');
    expect(updates[0].isRequired).toBeTrue();
  });

  it('dosya kolonunun KB sınırını yuvarlamadan korur', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Logo', label: 'Firma logosu' }]));

    expect(updates[0].maxLength).toBe(1000);
  });

  it('tipe uymayan kuralı göndermez', () => {
    const { updates } = toMemberMetadataUpdates(schema, change([{ columnName: 'Yas', regex: 'x', max: 120 }]));

    expect(updates[0]).toEqual(jasmine.objectContaining({ min: 0, max: 120, regex: null }));
  });

  it('bilinmeyen kolonda hiçbir güncelleme üretmez', () => {
    const result = toMemberMetadataUpdates(schema, change([
      { columnName: 'Unvan', label: 'X' },
      { columnName: 'Yok', label: 'Y' }
    ]));

    expect(result.error).toBe('kolon-yok:Yok');
    expect(result.updates).toEqual([]);
  });
});

describe('validateModelChangePayload', () => {
  it('boş öneriyi ve değişikliksiz öneriyi reddeder', () => {
    expect(validateModelChangePayload(null)).toBe('payload');
    expect(validateModelChangePayload({ entityName: 'Musteri', reason: '' })).toBe('degisiklik-yok');
  });

  it('eklenen kolonları yeni model kurallarıyla doğrular', () => {
    expect(validateModelChangePayload({
      entityName: 'Musteri', reason: '',
      addColumns: [{ columnName: 'Tür', dataType: 'string', isNullable: true, label: 'Tür' }]
    })).toBe('kolon:Tür');
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
