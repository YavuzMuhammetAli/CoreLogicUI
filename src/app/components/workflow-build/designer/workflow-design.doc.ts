import {
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTriggerEvent,
  parseConditions
} from '../../../models/workflow.model';

/**
 * Tasarım belgesi — akış tasarım ekranının TEK doğruluk kaynağı.
 *
 * Önceden kaynak ekranın Reactive Forms ağacıydı ve kayıtta `buildGraph()` her
 * adımı formdan YENİDEN kuruyordu. Formda karşılığı olmayan her şey kaybolurdu:
 * form alanının `maxLength`'i, paralel dalın formu, `entityStatusMap`'teki bitiş
 * etiketleri, tanımın tanımadığımız üst düzey alanları. Belge ham adım nesnelerini
 * olduğu gibi taşır; yalnız düzenlenen adım değişir.
 *
 * Belge değişmezdir (immutable): her komut yeni bir belge döner. Geri al/yinele
 * bu sayede bir anlık görüntü yığınından ibarettir.
 */
export interface WorkflowDesignMeta {
  name: string;
  code: string;
  modelName: string;
  triggerEvent: WorkflowTriggerEvent;
  isEnabled: boolean;
}

export interface WorkflowDesignDoc {
  meta: WorkflowDesignMeta;
  /** Tetikleme koşulları (hepsi VE ile bağlı). */
  conditions: WorkflowCondition[];
  graph: WorkflowGraph;
  /**
   * `definitionJson`'ın bizim yönetmediğimiz üst düzey alanları. Kayıtta AYNEN
   * geri yazılır — başka bir istemcinin (ör. ileride tasarımcı yerleşimi, AI)
   * eklediği alan bu ekranda kaydedince silinmesin.
   */
  extras: Record<string, unknown>;
}

/** Yeni akışın başlangıç belgesi — tasarım ekranının eski varsayılanlarıyla aynı. */
export function emptyDoc(): WorkflowDesignDoc {
  return {
    meta: { name: '', code: '', modelName: '', triggerEvent: 'onCreate', isEnabled: true },
    conditions: [],
    graph: { startStep: '', steps: [], entityStatusMap: {} },
    extras: {}
  };
}

/** Grafiğin bizim yönettiğimiz üst düzey alanları; geri kalanı `extras`'a gider. */
const GRAPH_KEYS = new Set(['startStep', 'steps', 'entityStatusMap']);

/** Sunucudaki tanımdan belge kurar. Bozuk `definitionJson` boş grafik verir. */
export function docFromDefinition(definition: WorkflowDefinition): WorkflowDesignDoc {
  const raw = parseRawGraph(definition.definitionJson);

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!GRAPH_KEYS.has(key)) extras[key] = value;
  }

  return {
    meta: {
      name: definition.name ?? '',
      code: definition.code ?? '',
      modelName: definition.modelName ?? '',
      triggerEvent: definition.triggerEvent ?? 'onCreate',
      isEnabled: definition.isEnabled ?? true
    },
    conditions: parseConditions(definition.triggerConditionJson),
    graph: {
      startStep: typeof raw['startStep'] === 'string' ? raw['startStep'] : '',
      steps: Array.isArray(raw['steps']) ? raw['steps'] : [],
      entityStatusMap: isRecord(raw['entityStatusMap'])
        ? raw['entityStatusMap'] as Record<string, string>
        : {}
    },
    extras
  };
}

/**
 * Belgeden kayıt isteğini kurar. Grafik yeniden ÜRETİLMEZ, olduğu gibi
 * serileştirilir — düzenlenmeyen adımlar sunucuya geldikleri gibi gider.
 */
export function docToPayload(doc: WorkflowDesignDoc, id: number | null): Partial<WorkflowDefinition> {
  return {
    id: id ?? 0,
    name: doc.meta.name,
    code: doc.meta.code,
    modelName: doc.meta.modelName,
    triggerEvent: doc.meta.triggerEvent,
    isEnabled: doc.meta.isEnabled,
    definitionJson: JSON.stringify({
      ...doc.extras,
      startStep: doc.graph.startStep,
      steps: doc.graph.steps,
      entityStatusMap: doc.graph.entityStatusMap
    }),
    triggerConditionJson: doc.conditions.length > 0 ? JSON.stringify(doc.conditions) : null
  };
}

/** Kaydedilmemiş değişiklik denetimi için kararlı metin. */
export function serializeDoc(doc: WorkflowDesignDoc): string {
  return JSON.stringify(doc);
}

/**
 * Konumdan bağımsız anahtar: düğüm sürüklemek doğrulama sonucunu değiştirmez,
 * bu yüzden canlı doğrulama yalnız bu anahtar değişince yeniden istenir.
 */
export function semanticKey(doc: WorkflowDesignDoc): string {
  return JSON.stringify(doc, (key, value) => (key === 'x' || key === 'y') ? undefined : value);
}

function parseRawGraph(json: string | null | undefined): Record<string, unknown> {
  if (!json?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
