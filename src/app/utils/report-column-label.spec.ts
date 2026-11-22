import { aggregateAlias, reportColumnLabel } from './report-column-label';

/** Fake translator that makes the key + parameters visible. */
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}(${Object.values(params).join(',')})` : key;

const columns = [
  { columnName: 'CustomerName', label: 'Müşteri Adı' },
  { columnName: 'NetAmount', label: ' Net Tutar ' },
  { columnName: 'Discount', label: null }
];

describe('report-column-label', () => {
  it('alias matches the server rule', () => {
    expect(aggregateAlias({ function: 'SUM', field: 'NetAmount' })).toBe('SUM_NetAmount');
    expect(aggregateAlias({ function: 'COUNT', field: '' })).toBe('COUNT_All');
  });

  it('gives a plain column its label, or its name when unlabelled', () => {
    expect(reportColumnLabel('CustomerName', columns, [], t)).toBe('Müşteri Adı');
    expect(reportColumnLabel('Discount', columns, [], t)).toBe('Discount');
    expect(reportColumnLabel('Bilinmeyen', columns, [], t)).toBe('Bilinmeyen');
  });

  it('translates an aggregate alias using the field label', () => {
    const aggregates = [{ function: 'SUM' as const, field: 'NetAmount' }, { function: 'MAX' as const, field: 'Discount' }];
    expect(reportColumnLabel('SUM_NetAmount', columns, aggregates, t)).toBe('report.columnLabel.sum(Net Tutar)');
    expect(reportColumnLabel('MAX_Discount', columns, aggregates, t)).toBe('report.columnLabel.max(Discount)');
  });

  it('COUNT is "Kayıt sayısı" (record count) regardless of field', () => {
    const aggregates = [{ function: 'COUNT' as const, field: 'ID' }, { function: 'COUNT' as const, field: '' }];
    expect(reportColumnLabel('COUNT_ID', columns, aggregates, t)).toBe('report.columnLabel.count');
    expect(reportColumnLabel('COUNT_All', columns, aggregates, t)).toBe('report.columnLabel.count');
  });

  it('does not guess an alias missing from the definition', () => {
    expect(reportColumnLabel('SUM_NetAmount', columns, [], t)).toBe('SUM_NetAmount');
  });
});
