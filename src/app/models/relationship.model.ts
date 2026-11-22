/**
 * Model relationships (G1) — counterparts of the backend Entities.DTOs.Relationship*.
 *
 * This is a THIRD, independent FK mechanism; the existing sub-model tree
 * (parentTableName) and the `lookup` column type keep working as they are.
 */

/** Matches the backend Core.Entities.Concrete.RelationshipType enum one to one. */
export enum RelationshipType {
  OneToOne = 1,
  OneToMany = 2,
  ManyToOne = 3,
  ManyToMany = 4,
  SelfReference = 5
}

/** Relationship type options shown in the UI dropdown (labels are i18n keys). */
export const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; labelKey: string }[] = [
  { value: RelationshipType.OneToOne,      labelKey: 'relationship.type.oneToOne' },
  { value: RelationshipType.OneToMany,     labelKey: 'relationship.type.oneToMany' },
  { value: RelationshipType.ManyToOne,     labelKey: 'relationship.type.manyToOne' },
  { value: RelationshipType.ManyToMany,    labelKey: 'relationship.type.manyToMany' },
  { value: RelationshipType.SelfReference, labelKey: 'relationship.type.selfReference' }
];

/** Types for which the inverse property is MANDATORY (same rule as the backend). */
export function requiresInverse(type: RelationshipType): boolean {
  return type === RelationshipType.OneToMany || type === RelationshipType.ManyToMany;
}

/** Relationship definition returned by the backend. */
export interface RelationshipDefinition {
  relationshipId: string;
  sourceModel: string;
  targetModel: string;
  relationshipType: RelationshipType;
  propertyName: string;
  inverseProperty?: string | null;
  /** Resolved FK column name (derived by the backend if left empty). */
  foreignKeyName?: string | null;
  /** Resolved join table name — ManyToMany only. */
  joinTableName?: string | null;
  cascadeDelete: boolean;
  required: boolean;
  /** Depth computed in the graph — not sent by the client. */
  depth: number;
  order: number;
  displayName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Relationship create/update body. */
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

/** A single validation finding. */
export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'Error' | 'Warning';
  relationshipId: string;
  path?: string | null;
}

/** Graph validation result. */
export interface RelationshipValidationResult {
  isValid: boolean;
  maxDepth: number;
  maxAllowedDepth: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Graph node for visualization. */
export interface EntityGraphNode {
  modelName: string;
  depth: number;
  isRoot: boolean;
  isPublished: boolean;
  /** Exceeds the depth limit — the UI shows it in red. */
  exceedsMaxDepth: boolean;
  columnCount: number;
}

/** Graph edge for visualization. */
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

/** C# code to be generated per model, shown in the preview. */
export interface GeneratedModelPreview {
  modelName: string;
  generatedCode: string;
}

/** Publish preview — everything that will be generated, without writing to the assembly. */
export interface PublishPreview {
  rootModel: string;
  publishBatch: string[];
  graph: EntityGraph;
  validation: RelationshipValidationResult;
  generatedModels: GeneratedModelPreview[];
  migrationScripts: string[];
}
