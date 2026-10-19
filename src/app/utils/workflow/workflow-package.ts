import { WorkflowDefinition, WorkflowTriggerEvent } from '../../models/workflow.model';

/**
 * Akış paketi — bir akışı dosyaya aktarıp başka bir şirkete/ortama taşımak için.
 * SAF: Angular yok.
 *
 * Paket tanımın TASARIMINI taşır (ad, kod, model, tetik, şema); kimlik, sürüm,
 * durum ve tarih taşınmaz — içe aktarılan akış hep yeni bir TASLAK olur ve
 * yayından önce hedef şirketin modeline karşı yeniden doğrulanır. Rol/kişi
 * atamaları kimlik taşıdığı için hedefte genelde boşa düşer; doğrulama bunları
 * eksik atama olarak gösterir.
 */
export const WORKFLOW_PACKAGE_FORMAT = 'corelogic.workflow';
export const WORKFLOW_PACKAGE_VERSION = 1;

export interface WorkflowPackage {
  format: typeof WORKFLOW_PACKAGE_FORMAT;
  version: number;
  exportedAt: string;
  workflow: {
    name: string;
    code: string;
    modelName: string;
    triggerEvent: WorkflowTriggerEvent;
    triggerConditionJson?: string | null;
    isEnabled: boolean;
    definitionJson: string;
  };
}

/** İçe aktarma sonucu: paket ya da hata kodu (`workflow.package.error.{code}`). */
export type PackageParseResult =
  | { ok: true; workflow: WorkflowPackage['workflow'] }
  | { ok: false; error: 'json' | 'format' | 'version' | 'fields' | 'definition' };

export function toPackage(definition: Pick<WorkflowDefinition,
  'name' | 'code' | 'modelName' | 'triggerEvent' | 'triggerConditionJson' | 'isEnabled' | 'definitionJson'>,
  now: Date = new Date()): WorkflowPackage {
  return {
    format: WORKFLOW_PACKAGE_FORMAT,
    version: WORKFLOW_PACKAGE_VERSION,
    exportedAt: now.toISOString(),
    workflow: {
      name: definition.name,
      code: definition.code,
      modelName: definition.modelName,
      triggerEvent: definition.triggerEvent,
      triggerConditionJson: definition.triggerConditionJson ?? null,
      isEnabled: definition.isEnabled,
      definitionJson: definition.definitionJson
    }
  };
}

/** Okunur JSON — dosyayı elle incelemek/karşılaştırmak kolay olsun. */
export function serializePackage(pack: WorkflowPackage): string {
  return JSON.stringify(pack, null, 2);
}

export function packageFileName(code: string): string {
  return `akis-${code.replace(/[^A-Za-z0-9_-]/g, '_') || 'paket'}.json`;
}

export function parsePackage(text: string): PackageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }

  const pack = parsed as Partial<WorkflowPackage> | null;
  if (!pack || typeof pack !== 'object' || pack.format !== WORKFLOW_PACKAGE_FORMAT) return { ok: false, error: 'format' };
  if (typeof pack.version !== 'number' || pack.version > WORKFLOW_PACKAGE_VERSION) return { ok: false, error: 'version' };

  const workflow = pack.workflow;
  if (!workflow || typeof workflow !== 'object'
      || !isText(workflow.name) || !isText(workflow.code) || !isText(workflow.modelName)
      || !isText(workflow.triggerEvent) || typeof workflow.definitionJson !== 'string') {
    return { ok: false, error: 'fields' };
  }

  try {
    const graph = JSON.parse(workflow.definitionJson) as { steps?: unknown };
    if (!graph || !Array.isArray(graph.steps)) return { ok: false, error: 'definition' };
  } catch {
    return { ok: false, error: 'definition' };
  }

  return {
    ok: true,
    workflow: {
      name: workflow.name.trim(),
      code: workflow.code.trim(),
      modelName: workflow.modelName.trim(),
      triggerEvent: workflow.triggerEvent,
      triggerConditionJson: workflow.triggerConditionJson ?? null,
      isEnabled: workflow.isEnabled !== false,
      definitionJson: workflow.definitionJson
    }
  };
}

/**
 * Hedefte kullanılmayan kod: aynı kod varsa `_2`, `_3`… eklenir. Kod akışın
 * sürümler arası kimliğidir; mevcut bir akışın üstüne yazılmamalı.
 */
export function freeCode(code: string, taken: ReadonlyArray<string>): string {
  const used = new Set(taken.map(c => c.toLowerCase()));
  if (!used.has(code.toLowerCase())) return code;

  // Yalnız kısa sayaç soneki (_2 … _999) atılır: "satinalma_2" → "satinalma_3";
  // kodun kendi uzun sayısal kuyruğu (ör. tarih damgası) korunur.
  const base = code.replace(/_\d{1,3}$/, '');
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
