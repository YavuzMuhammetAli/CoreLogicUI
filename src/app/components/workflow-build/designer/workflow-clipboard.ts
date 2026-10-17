import { WorkflowStep } from '../../../models/workflow.model';
import { mapRefs, sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/**
 * Tasarımcı panosu — kopyala / yapıştır / çoğalt. SAF.
 *
 * Pano sayfa içindedir (sistem panosu değil): adım nesnesi, metin olarak
 * başka uygulamaya yapıştırılacak bir şey değil.
 */
export interface DesignClipboard {
  steps: WorkflowStep[];
  /** Kopyalanan adımların durum etiketleri (entityStatusMap girdileri). */
  labels: Record<string, string>;
}

/** Yapıştırılan kopyaların konum kayması (px) — kopya aslının üstüne binmesin. */
export const PASTE_OFFSET = 40;

/** Seçili adımları panoya alır (derin kopya — belge sonradan değişse de pano etkilenmez). */
export function copySteps(doc: WorkflowDesignDoc, keys: string[]): DesignClipboard | null {
  const steps = doc.graph.steps.filter(step => keys.some(key => sameKey(key, step.key)));
  if (steps.length === 0) return null;

  const labels: Record<string, string> = {};
  for (const step of steps) {
    const labelKey = Object.keys(doc.graph.entityStatusMap).find(k => sameKey(k, step.key));
    if (labelKey) labels[step.key] = doc.graph.entityStatusMap[labelKey];
  }

  return { steps: structuredClone(steps), labels };
}

/**
 * Panodaki adımları yeni anahtarlarla belgeye ekler.
 *
 * - Anahtar çakışmazsa aynen, çakışırsa `{anahtar}_2`, `_3`… alır.
 * - Kopyalanan adımlar ARASINDAKİ bağlantılar yeni anahtarlara taşınır; dışarıya
 *   giden bağlantılar kopyalanmaz (terminale düşer) — aksi halde kopya, aslının
 *   bağlı olduğu adımlara gizlice bağlanırdı.
 * - Konumu olan kopya sağ-alta kayar; konumsuz olan otomatik yerleşimde kalır.
 * - Başlangıç adımı değişmez (boşsa ilk kopya olur).
 */
export function pasteSteps(
  doc: WorkflowDesignDoc, clipboard: DesignClipboard, offset = PASTE_OFFSET
): { doc: WorkflowDesignDoc; keys: string[] } {
  const taken = new Set(doc.graph.steps.map(step => step.key.toLowerCase()));
  const renames = new Map<string, string>();

  for (const step of clipboard.steps) {
    const key = freeKey(step.key, taken);
    taken.add(key.toLowerCase());
    renames.set(step.key.toLowerCase(), key);
  }

  const copies = clipboard.steps.map(step => {
    const remapped = mapRefs(structuredClone(step), target => renames.get(target.toLowerCase()) ?? null);
    return {
      ...remapped,
      key: renames.get(step.key.toLowerCase())!,
      x: step.x != null ? step.x + offset : step.x ?? null,
      y: step.y != null ? step.y + offset : step.y ?? null
    };
  });

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  for (const [original, label] of Object.entries(clipboard.labels)) {
    const renamed = renames.get(original.toLowerCase());
    if (renamed) entityStatusMap[renamed] = label;
  }

  return {
    doc: {
      ...doc,
      graph: {
        ...doc.graph,
        steps: [...doc.graph.steps, ...copies],
        startStep: doc.graph.startStep || copies[0]?.key || '',
        entityStatusMap
      }
    },
    keys: copies.map(copy => copy.key)
  };
}

/**
 * Çakışmayan anahtar: kendisi, değilse `_2`, `_3`… Zaten numaralı bir kopya
 * yeniden çoğaltılırsa numara kökten devam eder (`onay_2` → `onay_3`, `onay_2_2` değil).
 */
function freeKey(key: string, taken: Set<string>): string {
  if (!taken.has(key.toLowerCase())) return key;

  const base = key.replace(/_[0-9]+$/, '') || key;
  let index = 2;
  while (taken.has(`${base}_${index}`.toLowerCase())) index++;
  return `${base}_${index}`;
}
