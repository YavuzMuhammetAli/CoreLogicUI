import { WorkflowCondition, WorkflowStep } from '../../../models/workflow.model';
import { ExitPort, exitsOf, mapRefs, sameKey, setExit } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc, WorkflowDesignMeta } from './workflow-design.doc';

/**
 * Tasarım belgesi komutları — SAF. Her komut yeni bir belge döner; girdiyi
 * değiştirmez. Bileşen yalnız hangi komutun ne zaman çağrılacağına karar verir,
 * kuralların hepsi burada ve spec'li.
 *
 * Anahtar karşılaştırmaları büyük/küçük harf duyarsız (backend FindStep ile aynı):
 * "Mudur" ile "mudur" aynı adımdır.
 */

/** Değer aynıysa AYNI belge döner — boş değişiklik geri al geçmişine adım olarak düşmesin. */
export function setMeta(doc: WorkflowDesignDoc, patch: Partial<WorkflowDesignMeta>): WorkflowDesignDoc {
  const changed = (Object.keys(patch) as Array<keyof WorkflowDesignMeta>)
    .some(key => patch[key] !== doc.meta[key]);
  return changed ? { ...doc, meta: { ...doc.meta, ...patch } } : doc;
}

export function setConditions(doc: WorkflowDesignDoc, conditions: WorkflowCondition[]): WorkflowDesignDoc {
  return JSON.stringify(conditions) === JSON.stringify(doc.conditions)
    ? doc
    : { ...doc, conditions };
}

export function setStart(doc: WorkflowDesignDoc, key: string): WorkflowDesignDoc {
  return doc.graph.startStep === key
    ? doc
    : { ...doc, graph: { ...doc.graph, startStep: key } };
}

export function findStep(doc: WorkflowDesignDoc, key: string): WorkflowStep | undefined {
  return doc.graph.steps.find(step => sameKey(step.key, key));
}

/**
 * Adım ekler ya da günceller.
 *
 * - `originalKey` boşsa adım sona eklenir; başlangıç adımı yoksa o olur
 *   (kullanıcının ayrıca seçmesi gerekmesin).
 * - Anahtar değiştiyse diğer adımların çıkışları, başlangıç adımı ve durum
 *   etiketi yeni anahtara taşınır — aksi halde bağlantılar sessizce kopardı.
 * - `statusLabel` adımın `entityStatusMap` girdisidir; boşsa girdi silinir.
 *   Haritadaki diğer girdiler (bitiş etiketleri dahil) KORUNUR.
 */
export function upsertStep(
  doc: WorkflowDesignDoc, originalKey: string | null, step: WorkflowStep, statusLabel: string
): WorkflowDesignDoc {
  const index = originalKey ? doc.graph.steps.findIndex(s => sameKey(s.key, originalKey)) : -1;

  let next: WorkflowDesignDoc;
  if (index < 0) {
    next = {
      ...doc,
      graph: {
        ...doc.graph,
        steps: [...doc.graph.steps, step],
        startStep: doc.graph.startStep || step.key
      }
    };
  } else {
    const steps = doc.graph.steps.slice();
    steps[index] = step;
    next = { ...doc, graph: { ...doc.graph, steps } };

    if (originalKey && originalKey !== step.key) {
      next = renameReferences(next, originalKey, step.key);
    }
  }

  return setStatusLabel(next, step.key, statusLabel);
}

/**
 * Adımı siler. Ona bağlanan çıkışlar temizlenir (terminale düşer), başlangıç
 * adımıysa kalan ilk adım başlangıç olur, durum etiketi silinir.
 */
export function removeStep(doc: WorkflowDesignDoc, key: string): WorkflowDesignDoc {
  const removed = findStep(doc, key);
  if (!removed) return doc;

  const steps = doc.graph.steps
    .filter(step => step !== removed)
    .map(step => mapRefs(step, target => sameKey(target, removed.key) ? null : target));

  const startStep = sameKey(doc.graph.startStep, removed.key)
    ? steps[0]?.key ?? ''
    : doc.graph.startStep;

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  deleteKey(entityStatusMap, removed.key);

  return { ...doc, graph: { ...doc.graph, steps, startStep, entityStatusMap } };
}

/**
 * Çıkışı bir hedefe bağlar. Kendine bağlantı ve kapalı çıkış (red kapalıyken
 * red) yok sayılır — doğrulayıcı ikisini de reddediyor; canvas'ta çizilen
 * bağlantı kayıtta sessizce kaybolmasın diye hiç yazılmaz.
 */
export function connect(doc: WorkflowDesignDoc, from: string, port: ExitPort, to: string | null): WorkflowDesignDoc {
  if (to && sameKey(from, to)) return doc;

  const source = findStep(doc, from);
  if (!source) return doc;

  const exit = exitsOf(source).find(e => e.port === port);
  if (!exit || !exit.enabled) return doc;

  return replaceStep(doc, source, setExit(source, port, to));
}

/** Düğümün konumunu yazar (tam piksele yuvarlanır). */
export function moveStep(doc: WorkflowDesignDoc, key: string, x: number, y: number): WorkflowDesignDoc {
  return moveSteps(doc, [{ key, x, y }]);
}

/**
 * Birden çok düğümün konumunu TEK değişiklikte yazar — çoklu sürükleme ve
 * "ilk elle taşımada tüm konumları sabitle" tek geri al adımı olsun.
 */
export function moveSteps(
  doc: WorkflowDesignDoc, moves: ReadonlyArray<{ key: string; x: number; y: number }>
): WorkflowDesignDoc {
  let changed = false;

  const steps = doc.graph.steps.map(step => {
    const move = moves.find(m => sameKey(m.key, step.key));
    if (!move) return step;

    const x = Math.round(move.x);
    const y = Math.round(move.y);
    if (step.x === x && step.y === y) return step;

    changed = true;
    return { ...step, x, y };
  });

  return changed ? { ...doc, graph: { ...doc.graph, steps } } : doc;
}

/** Birden çok adımı siler (her biri removeStep kurallarıyla). */
export function removeSteps(doc: WorkflowDesignDoc, keys: ReadonlyArray<string>): WorkflowDesignDoc {
  return keys.reduce((current, key) => removeStep(current, key), doc);
}

/** Çıkışın bağlantısını kaldırır — akış o çıkışta biter (terminale düşer). */
export function disconnect(doc: WorkflowDesignDoc, from: string, port: ExitPort): WorkflowDesignDoc {
  const source = findStep(doc, from);
  if (!source) return doc;

  const exit = exitsOf(source).find(e => e.port === port);
  if (!exit?.target) return doc;

  return replaceStep(doc, source, setExit(source, port, null));
}

/**
 * "Otomatik düzenle": elle verilmiş konumlar silinir, canvas otomatik
 * yerleşime düşer. null yazılır (hesaplanmış koordinat değil) — sonradan
 * eklenen adımlar da aynı düzene katılsın.
 */
export function clearPositions(doc: WorkflowDesignDoc): WorkflowDesignDoc {
  if (doc.graph.steps.every(step => step.x == null && step.y == null)) return doc;

  const steps = doc.graph.steps.map(step =>
    step.x == null && step.y == null ? step : { ...step, x: null, y: null });
  return { ...doc, graph: { ...doc.graph, steps } };
}

/** Yeni adıma çakışmayan bir anahtar önerir (adim1, adim2, …). */
export function suggestKey(doc: WorkflowDesignDoc, prefix = 'adim'): string {
  const existing = new Set(doc.graph.steps.map(step => step.key.toLowerCase()));
  let index = doc.graph.steps.length + 1;
  while (existing.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

// ── İç yardımcılar ──────────────────────────────────────────────────────────

function replaceStep(doc: WorkflowDesignDoc, oldStep: WorkflowStep, newStep: WorkflowStep): WorkflowDesignDoc {
  if (oldStep === newStep) return doc;
  const steps = doc.graph.steps.map(step => step === oldStep ? newStep : step);
  return { ...doc, graph: { ...doc.graph, steps } };
}

/** Eski anahtara yapılan tüm referansları (çıkışlar, başlangıç, durum etiketi) taşır. */
function renameReferences(doc: WorkflowDesignDoc, oldKey: string, newKey: string): WorkflowDesignDoc {
  const steps = doc.graph.steps.map(step =>
    mapRefs(step, target => sameKey(target, oldKey) ? newKey : target));

  const startStep = sameKey(doc.graph.startStep, oldKey) ? newKey : doc.graph.startStep;

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  const label = takeKey(entityStatusMap, oldKey);
  if (label !== undefined) entityStatusMap[newKey] = label;

  return { ...doc, graph: { ...doc.graph, steps, startStep, entityStatusMap } };
}

function setStatusLabel(doc: WorkflowDesignDoc, key: string, label: string): WorkflowDesignDoc {
  const trimmed = label.trim();
  const map = doc.graph.entityStatusMap;
  const current = Object.keys(map).find(k => sameKey(k, key));

  if (!trimmed && current === undefined) return doc;
  if (trimmed && current === key && map[current] === trimmed) return doc;

  const entityStatusMap = { ...map };
  if (current !== undefined) delete entityStatusMap[current];
  if (trimmed) entityStatusMap[key] = trimmed;

  return { ...doc, graph: { ...doc.graph, entityStatusMap } };
}

function deleteKey(map: Record<string, string>, key: string): void {
  for (const existing of Object.keys(map)) {
    if (sameKey(existing, key)) delete map[existing];
  }
}

function takeKey(map: Record<string, string>, key: string): string | undefined {
  const existing = Object.keys(map).find(k => sameKey(k, key));
  if (existing === undefined) return undefined;
  const value = map[existing];
  delete map[existing];
  return value;
}
