/**
 * Model ilişkileri (G1) — backend Entities.DTOs.Relationship* karşılıkları.
 *
 * Bu ÜÇÜNCÜ ve bağımsız bir FK mekanizmasıdır; mevcut alt-model ağacı
 * (parentTableName) ve `lookup` kolon tipi aynen çalışmaya devam eder.
 */

/** Backend Core.Entities.Concrete.RelationshipType enum'ı ile birebir eşleşir. */
export enum RelationshipType {
  OneToOne = 1,
  OneToMany = 2,
  ManyToOne = 3,
  ManyToMany = 4,
  SelfReference = 5
}

/** UI dropdown'ında gösterilecek ilişki tipi seçenekleri (etiketler i18n anahtarıdır). */
export const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; labelKey: string }[] = [
  { value: RelationshipType.OneToOne,      labelKey: 'relationship.type.oneToOne' },
  { value: RelationshipType.OneToMany,     labelKey: 'relationship.type.oneToMany' },
  { value: RelationshipType.ManyToOne,     labelKey: 'relationship.type.manyToOne' },
  { value: RelationshipType.ManyToMany,    labelKey: 'relationship.type.manyToMany' },
  { value: RelationshipType.SelfReference, labelKey: 'relationship.type.selfReference' }
];

/** Ters property'nin ZORUNLU olduğu tipler (backend ile aynı kural). */
export function requiresInverse(type: RelationshipType): boolean {
  return type === RelationshipType.OneToMany || type === RelationshipType.ManyToMany;
}

/** Backend'den dönen ilişki tanımı. */
export interface RelationshipDefinition {
  relationshipId: string;
  sourceModel: string;
  targetModel: string;
  relationshipType: RelationshipType;
  propertyName: string;
  inverseProperty?: string | null;
  /** Çözülmüş FK kolon adı (boş bırakılmışsa backend türetir). */
  foreignKeyName?: string | null;
  /** Çözülmüş join tablo adı — yalnızca ManyToMany. */
  joinTableName?: string | null;
  cascadeDelete: boolean;
  required: boolean;
  /** Graph'ta hesaplanan derinlik — istemci göndermez. */
  depth: number;
  order: number;
  displayName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** İlişki oluşturma/güncelleme gövdesi. */
export interface RelationshipUpsert {
  targetModel: string;
  relationshipType: RelationshipType;
  propertyName: string;
  inverseProperty?: string | null;
  foreignKeyName?: string | null;
  joinTableName?: string | null;
  cascadeDelete: boolean;
  required: boolean;
  order: number;
  displayName?: string | null;
}

/** Tek bir doğrulama bulgusu. */
export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'Error' | 'Warning';
  relationshipId: string;
  path?: string | null;
}

/** Graph doğrulama sonucu. */
export interface RelationshipValidationResult {
  isValid: boolean;
  maxDepth: number;
  maxAllowedDepth: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Görselleştirme için graph düğümü. */
export interface EntityGraphNode {
  modelName: string;
  depth: number;
  isRoot: boolean;
  isPublished: boolean;
  /** Derinlik sınırını aşıyor — UI kırmızı gösterir. */
  exceedsMaxDepth: boolean;
  columnCount: number;
}

/** Görselleştirme için graph kenarı. */
export interface EntityGraphEdge {
  relationshipId: string;
  sourceModel: string;
  targetModel: string;
  relationshipType: string;
  propertyName: string;
  inverseProperty?: string | null;
  foreignKeyName?: string | null;
  required: boolean;
  cascadeDelete: boolean;
  /** Mevcut mekanizmalardan (alt-model / lookup) geliyor. */
  isLegacy: boolean;
}

export interface EntityGraph {
  rootModel: string;
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
}

/** Önizlemede gösterilen, model başına üretilecek C# kodu. */
export interface GeneratedModelPreview {
  modelName: string;
  generatedCode: string;
}

/** Publish önizlemesi — assembly'e yazılmadan üretilecek her şey. */
export interface PublishPreview {
  rootModel: string;
  publishBatch: string[];
  graph: EntityGraph;
  validation: RelationshipValidationResult;
  generatedModels: GeneratedModelPreview[];
  migrationScripts: string[];
}
