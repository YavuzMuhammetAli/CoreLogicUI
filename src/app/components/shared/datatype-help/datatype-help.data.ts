/**
 * Content map of the guide dialog.
 *
 * Each "topic" here corresponds to a data type, a relationship type or a
 * concept (child models / relationships). All texts are i18n keys
 * (the `help.*` namespace, see `src/app/i18n/datatype-help.i18n.ts`);
 * this file only holds the structure and language-independent sample values.
 *
 * The data type list comes from a single source: `table-detail.component.ts`
 * (`primitiveTypes` + `referenceTypes`) — 13 primitive + 4 reference = 17 types.
 * When a new type is added, an entry must be added here too.
 */

/** Inline SVG diagram to draw in the dialog. */
export type DiagramId =
  | 'oneToOne'
  | 'oneToMany'
  | 'manyToOne'
  | 'manyToMany'
  | 'selfReference'
  | 'subModelTree'
  | 'fkMechanisms'
  | 'lookupFlow'
  | 'enumFlow';

/** Description of a type-specific rule field. */
export interface HelpRule {
  labelKey: string;
  descKey: string;
}

/**
 * A row of the "Örnekler" (Examples) table.
 *
 * `value` is NOT language-dependent (a code/identifier example: `Customer.Orders`, `A → B → A`).
 * If the example is a sentence or explanation, `valueKey` must be used instead of `value` —
 * otherwise the text shows untranslated in EN.
 */
export interface HelpSample {
  /** Language-independent raw value. Ignored if `valueKey` is given. */
  value: string;
  /** Key of the value to translate; if set, this is shown instead of `value`. */
  valueKey?: string;
  ok: boolean;
  noteKey: string;
}

/** Full topic content shown in the dialog. */
export interface HelpTopic {
  titleKey: string;
  /** C# equivalent shown in the badge — empty for conceptual topics. */
  csharpType?: string;
  summaryKey: string;
  useCaseKeys: string[];
  rules: HelpRule[];
  samples: HelpSample[];
  diagram?: DiagramId;
  /** If set, the "Dikkat" (Caution) warning box is shown. */
  notesKey?: string;
  /** True only for the `string` type — enables the regex lab. */
  showRegexLab?: boolean;
}

/**
 * Topic id: a data type key ('string', 'int', ...), a concept
 * ('subModels', 'relationships') or a relationship type prefixed with 'rel:'.
 */
export type HelpTopicId = string;

/** Shared key builder for column rule fields. */
const rule = (name: string): HelpRule => ({
  labelKey: `help.rule.${name}.label`,
  descKey: `help.rule.${name}.desc`
});

/** Shared key builder for relationship popup fields. */
const relRule = (name: string): HelpRule => ({
  labelKey: `help.relField.${name}.label`,
  descKey: `help.relField.${name}.desc`
});

/** Keys of a topic's example notes numbered 1..3. */
const sample = (topic: string, index: number, value: string, ok: boolean): HelpSample => ({
  value,
  ok,
  noteKey: `help.type.${topic}.sample${index}`
});

/**
 * Example row whose value is translated too — used when the example is a sentence rather than
 * a raw identifier (e.g. "İki kayıt aynı profile bağlanır" — two records link to the same profile).
 */
const sampleT = (topic: string, index: number, ok: boolean): HelpSample => ({
  value: '',
  valueKey: `help.type.${topic}.sample${index}Value`,
  ok,
  noteKey: `help.type.${topic}.sample${index}`
});

const STRING_RULES = [rule('minLength'), rule('maxLength'), rule('regex'), rule('regexMessage')];
const NUMERIC_RULES = [rule('min'), rule('max')];

/** Non-decimal numeric types share the same rule set and example structure. */
function integerTopic(id: string, csharpType: string, ok: string, fail: string): HelpTopic {
  return {
    titleKey: `help.type.${id}.title`,
    csharpType,
    summaryKey: `help.type.${id}.summary`,
    useCaseKeys: [`help.type.${id}.useCase1`, `help.type.${id}.useCase2`],
    rules: NUMERIC_RULES,
    samples: [
      sample(id, 1, ok, true),
      sample(id, 2, fail, false),
      sample(id, 3, '2,5', false)
    ],
    notesKey: `help.type.${id}.notes`
  };
}

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {

  // ══ Primitive types ══════════════════════════════════════════════════════

  string: {
    titleKey: 'help.type.string.title',
    csharpType: 'string',
    summaryKey: 'help.type.string.summary',
    useCaseKeys: ['help.type.string.useCase1', 'help.type.string.useCase2', 'help.type.string.useCase3'],
    rules: STRING_RULES,
    samples: [
      sample('string', 1, 'Kablosuz Kulaklık', true),
      sample('string', 2, 'ali@ornek', false),
      // The quotes are intentional: so a whitespace-only value is visible in the table.
      sample('string', 3, '"   "', false)
    ],
    notesKey: 'help.type.string.notes',
    showRegexLab: true
  },

  text: {
    titleKey: 'help.type.text.title',
    csharpType: 'string',
    summaryKey: 'help.type.text.summary',
    useCaseKeys: ['help.type.text.useCase1', 'help.type.text.useCase2'],
    rules: STRING_RULES,
    samples: [
      sample('text', 1, 'Müşteri teslimatı öne çekilmesini istedi…', true),
      sample('text', 2, '100.001 karakter', false)
    ],
    notesKey: 'help.type.text.notes'
  },

  int: integerTopic('int', 'int', '1250', '3000000000'),
  long: integerTopic('long', 'long', '9007199254740991', '1e30'),
  short: integerTopic('short', 'short', '1200', '40000'),
  byte: integerTopic('byte', 'byte', '200', '300'),

  decimal: {
    titleKey: 'help.type.decimal.title',
    csharpType: 'decimal',
    summaryKey: 'help.type.decimal.summary',
    useCaseKeys: ['help.type.decimal.useCase1', 'help.type.decimal.useCase2', 'help.type.decimal.useCase3'],
    rules: NUMERIC_RULES,
    samples: [
      sample('decimal', 1, '1499.90', true),
      sample('decimal', 2, '0.1 + 0.2 = 0.3', true),
      sample('decimal', 3, '1.499,90', false)
    ],
    notesKey: 'help.type.decimal.notes'
  },

  double: {
    titleKey: 'help.type.double.title',
    csharpType: 'double',
    summaryKey: 'help.type.double.summary',
    useCaseKeys: ['help.type.double.useCase1', 'help.type.double.useCase2'],
    rules: NUMERIC_RULES,
    samples: [
      sample('double', 1, '36.6', true),
      sample('double', 2, '0.1 + 0.2 = 0.30000000000000004', false),
      sample('double', 3, '1499.90', false)
    ],
    notesKey: 'help.type.double.notes'
  },

  float: {
    titleKey: 'help.type.float.title',
    csharpType: 'float',
    summaryKey: 'help.type.float.summary',
    useCaseKeys: ['help.type.float.useCase1', 'help.type.float.useCase2'],
    rules: NUMERIC_RULES,
    samples: [
      sample('float', 1, '1.5', true),
      sample('float', 2, '16777217', false),
      sample('float', 3, '1499.90', false)
    ],
    notesKey: 'help.type.float.notes'
  },

  boolean: {
    titleKey: 'help.type.boolean.title',
    csharpType: 'bool',
    summaryKey: 'help.type.boolean.summary',
    useCaseKeys: ['help.type.boolean.useCase1', 'help.type.boolean.useCase2', 'help.type.boolean.useCase3'],
    rules: [],
    samples: [
      sample('boolean', 1, 'true / false', true),
      sample('boolean', 2, 'NULL', false),
      sample('boolean', 3, '0 / 1 / 2', false)
    ],
    notesKey: 'help.type.boolean.notes'
  },

  datetime: {
    titleKey: 'help.type.datetime.title',
    csharpType: 'DateTime',
    summaryKey: 'help.type.datetime.summary',
    useCaseKeys: ['help.type.datetime.useCase1', 'help.type.datetime.useCase2', 'help.type.datetime.useCase3'],
    rules: [],
    samples: [
      sample('datetime', 1, '2026-08-01T14:30:00', true),
      sample('datetime', 2, '01.08.2026', true),
      sample('datetime', 3, '14:30', false)
    ],
    notesKey: 'help.type.datetime.notes'
  },

  dateonly: {
    titleKey: 'help.type.dateonly.title',
    csharpType: 'DateOnly',
    summaryKey: 'help.type.dateonly.summary',
    useCaseKeys: ['help.type.dateonly.useCase1', 'help.type.dateonly.useCase2', 'help.type.dateonly.useCase3'],
    rules: [],
    samples: [
      sample('dateonly', 1, '2026-08-01', true),
      sample('dateonly', 2, '2026-08-01T14:30:00', false),
      sample('dateonly', 3, '31.02.2026', false)
    ],
    notesKey: 'help.type.dateonly.notes'
  },

  timeonly: {
    titleKey: 'help.type.timeonly.title',
    csharpType: 'TimeOnly',
    summaryKey: 'help.type.timeonly.summary',
    useCaseKeys: ['help.type.timeonly.useCase1', 'help.type.timeonly.useCase2'],
    rules: [],
    samples: [
      sample('timeonly', 1, '09:00', true),
      sample('timeonly', 2, '18:30:00', true),
      sample('timeonly', 3, '25:00', false)
    ],
    notesKey: 'help.type.timeonly.notes'
  },

  guid: {
    titleKey: 'help.type.guid.title',
    csharpType: 'Guid',
    summaryKey: 'help.type.guid.summary',
    useCaseKeys: ['help.type.guid.useCase1', 'help.type.guid.useCase2', 'help.type.guid.useCase3'],
    rules: [],
    samples: [
      sample('guid', 1, '3f2504e0-4f89-11d3-9a0c-0305e82c3301', true),
      sample('guid', 2, '00000000-0000-0000-0000-000000000000', false),
      sample('guid', 3, '3f2504e04f8911d3', false)
    ],
    notesKey: 'help.type.guid.notes'
  },

  // ══ Reference types ══════════════════════════════════════════════════════

  lookup: {
    titleKey: 'help.type.lookup.title',
    csharpType: 'int (FK)',
    summaryKey: 'help.type.lookup.summary',
    useCaseKeys: ['help.type.lookup.useCase1', 'help.type.lookup.useCase2', 'help.type.lookup.useCase3'],
    rules: [rule('lookupTarget'), rule('lookupDisplayColumn')],
    samples: [
      sample('lookup', 1, 'Kategori → Category.Name', true),
      sample('lookup', 2, 'Kategori → Category.ID', false),
      sample('lookup', 3, 'Kategori → (boş)', false)
    ],
    diagram: 'lookupFlow',
    notesKey: 'help.type.lookup.notes'
  },

  enum: {
    titleKey: 'help.type.enum.title',
    csharpType: 'enum',
    summaryKey: 'help.type.enum.summary',
    useCaseKeys: ['help.type.enum.useCase1', 'help.type.enum.useCase2', 'help.type.enum.useCase3'],
    rules: [rule('enumValues')],
    samples: [
      sample('enum', 1, 'Beklemede|Onaylandi|Iptal', true),
      sample('enum', 2, 'Beklemede, Onaylandi, Iptal', false),
      sample('enum', 3, 'Beklemede|Onaylandı', false)
    ],
    diagram: 'enumFlow',
    notesKey: 'help.type.enum.notes'
  },

  image: {
    titleKey: 'help.type.image.title',
    csharpType: 'string (yol)',
    summaryKey: 'help.type.image.summary',
    useCaseKeys: ['help.type.image.useCase1', 'help.type.image.useCase2'],
    rules: [],
    samples: [
      sample('image', 1, 'urun-4512.jpg', true),
      sample('image', 2, 'urun-4512.pdf', false),
      sample('image', 3, '(60 MB PNG)', false)
    ],
    notesKey: 'help.type.image.notes'
  },

  file: {
    titleKey: 'help.type.file.title',
    csharpType: 'string (yol)',
    summaryKey: 'help.type.file.summary',
    useCaseKeys: ['help.type.file.useCase1', 'help.type.file.useCase2'],
    rules: [],
    samples: [
      sample('file', 1, 'sozlesme-2026.pdf', true),
      sample('file', 2, 'kurulum.exe', false),
      sample('file', 3, '(200 MB arşiv)', false)
    ],
    notesKey: 'help.type.file.notes'
  },

  // ══ Concepts ═════════════════════════════════════════════════════════════

  subModels: {
    titleKey: 'help.subModels.title',
    summaryKey: 'help.subModels.summary',
    useCaseKeys: ['help.subModels.useCase1', 'help.subModels.useCase2', 'help.subModels.useCase3'],
    rules: [rule('subModelName'), rule('subModelDepth')],
    samples: [
      sample('subModels', 1, 'Order → OrderItem', true),
      sample('subModels', 2, 'Order → OrderItem → ItemNote → Attachment', true),
      sample('subModels', 3, '5. seviye', false)
    ],
    diagram: 'subModelTree',
    notesKey: 'help.subModels.notes'
  },

  relationships: {
    titleKey: 'help.relationships.title',
    summaryKey: 'help.relationships.summary',
    useCaseKeys: ['help.relationships.useCase1', 'help.relationships.useCase2', 'help.relationships.useCase3'],
    rules: [rule('mechanismTree'), rule('mechanismLookup'), rule('mechanismRelationship')],
    samples: [
      sample('relationships', 1, 'Customer → Order (1-N)', true),
      sample('relationships', 2, 'A → B → C → D', false),
      sample('relationships', 3, 'A → B → A', false)
    ],
    diagram: 'fkMechanisms',
    notesKey: 'help.relationships.notes'
  },

  // ══ Relationship types ════════════════════════════════════════════════════════

  'rel:OneToOne': {
    titleKey: 'help.rel.oneToOne.title',
    csharpType: '1 — 1',
    summaryKey: 'help.rel.oneToOne.summary',
    useCaseKeys: ['help.rel.oneToOne.useCase1', 'help.rel.oneToOne.useCase2'],
    rules: [relRule('target'), relRule('property'), relRule('inverse'), relRule('foreignKey'), relRule('required'), relRule('cascade')],
    samples: [
      sample('relOneToOne', 1, 'User.Profile ↔ Profile.User', true),
      sampleT('relOneToOne', 2, true),
      sampleT('relOneToOne', 3, false)
    ],
    diagram: 'oneToOne',
    notesKey: 'help.rel.oneToOne.notes'
  },

  'rel:OneToMany': {
    titleKey: 'help.rel.oneToMany.title',
    csharpType: '1 — N',
    summaryKey: 'help.rel.oneToMany.summary',
    useCaseKeys: ['help.rel.oneToMany.useCase1', 'help.rel.oneToMany.useCase2', 'help.rel.oneToMany.useCase3'],
    rules: [relRule('target'), relRule('property'), relRule('inverse'), relRule('foreignKey'), relRule('required'), relRule('cascade')],
    samples: [
      sample('relOneToMany', 1, 'Customer.Orders ↔ Order.Customer', true),
      sampleT('relOneToMany', 2, false),
      sampleT('relOneToMany', 3, false)
    ],
    diagram: 'oneToMany',
    notesKey: 'help.rel.oneToMany.notes'
  },

  'rel:ManyToOne': {
    titleKey: 'help.rel.manyToOne.title',
    csharpType: 'N — 1',
    summaryKey: 'help.rel.manyToOne.summary',
    useCaseKeys: ['help.rel.manyToOne.useCase1', 'help.rel.manyToOne.useCase2', 'help.rel.manyToOne.useCase3'],
    rules: [relRule('target'), relRule('property'), relRule('inverse'), relRule('foreignKey'), relRule('required'), relRule('cascade')],
    samples: [
      sample('relManyToOne', 1, 'Order.Customer → Customer', true),
      sampleT('relManyToOne', 2, true),
      sampleT('relManyToOne', 3, false)
    ],
    diagram: 'manyToOne',
    notesKey: 'help.rel.manyToOne.notes'
  },

  'rel:ManyToMany': {
    titleKey: 'help.rel.manyToMany.title',
    csharpType: 'N — N',
    summaryKey: 'help.rel.manyToMany.summary',
    useCaseKeys: ['help.rel.manyToMany.useCase1', 'help.rel.manyToMany.useCase2', 'help.rel.manyToMany.useCase3'],
    rules: [relRule('target'), relRule('property'), relRule('inverse'), relRule('joinTable'), relRule('cascade')],
    samples: [
      sample('relManyToMany', 1, 'Product.Tags ↔ Tag.Products', true),
      sampleT('relManyToMany', 2, true),
      sampleT('relManyToMany', 3, false)
    ],
    diagram: 'manyToMany',
    notesKey: 'help.rel.manyToMany.notes'
  },

  'rel:SelfReference': {
    titleKey: 'help.rel.selfReference.title',
    csharpType: 'N — 1 ⟲',
    summaryKey: 'help.rel.selfReference.summary',
    useCaseKeys: ['help.rel.selfReference.useCase1', 'help.rel.selfReference.useCase2', 'help.rel.selfReference.useCase3'],
    rules: [relRule('property'), relRule('inverse'), relRule('foreignKey'), relRule('required'), relRule('cascade')],
    samples: [
      sample('relSelfReference', 1, 'Category.ParentCategory', true),
      sampleT('relSelfReference', 2, true),
      sampleT('relSelfReference', 3, false)
    ],
    diagram: 'selfReference',
    notesKey: 'help.rel.selfReference.notes'
  }
};

/**
 * When an unknown topic id arrives (e.g. a type added later with no content
 * written yet), a general topic is returned so the dialog isn't empty.
 */
export const FALLBACK_TOPIC: HelpTopic = {
  titleKey: 'help.fallback.title',
  summaryKey: 'help.fallback.summary',
  useCaseKeys: [],
  rules: [],
  samples: []
};

export function resolveHelpTopic(id: HelpTopicId): HelpTopic {
  return HELP_TOPICS[id] ?? FALLBACK_TOPIC;
}
