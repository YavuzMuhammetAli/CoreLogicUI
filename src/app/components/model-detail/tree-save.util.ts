import { TreeSaveResult } from '../../services/published-model.service';
import { StagedNode, flattenNodes } from './staged-tree.util';

/**
 * "Kaydet" akışındaki tek bir sunucu adımı.
 *
 * Bir kaydetme iki farklı istek türünden oluşabilir: yeni satırların TEK
 * transaction'da yazıldığı `addTree` ve kaydedilmiş ama değiştirilmiş her satır
 * için ayrı bir `update`. İkisi `forkJoin` ile birlikte yürütülür, sonuçlar bu
 * ortak biçimde toplanır.
 */
export interface TreeStep {
  kind: 'tree' | 'update';
  ok: boolean;
  message: string;
  /** `kind: 'tree'` için sunucunun ID/hata sözlüğü. */
  data?: TreeSaveResult;
  /** `kind: 'update'` için hedef düğüm. */
  node?: StagedNode;
}

/** Kaydetme turunun ağaç dışı (update) adımlarından çıkan özet. */
export interface UpdateOutcome {
  /** Kullanıcıya gösterilecek "tip: mesaj" satırları. */
  errors: string[];
}

/**
 * Sunucu yanıtındaki gerçek ID'leri ve satır bazlı hataları ağaca yazar.
 * Eşleme istemcinin geçici `localId`'si (clientId) üzerinden yapılır.
 *
 * Düğümleri YERİNDE değiştirir (savedId/error) ve kullanıcıya gösterilecek
 * hata satırlarını döner. Ayrı bir fonksiyon olması, id/hata eşlemesinin
 * HTTP kurulumundan bağımsız test edilebilmesini sağlar.
 */
export function applyTreeResult(rootNode: StagedNode, data: TreeSaveResult): string[] {
  const errors: string[] = [];

  for (const node of flattenNodes(rootNode)) {
    const key = String(node.localId);
    const savedId = data.savedIds?.[key];
    const error = data.errors?.[key];

    if (savedId != null) {
      node.savedId = savedId;
      node.error = null;
    }

    if (error) {
      node.error = error;
      errors.push(`${node.typeName}: ${error}`);
    } else if (savedId != null) {
      node.error = null;
    }
  }

  return errors;
}

/**
 * `update` adımlarının sonuçlarını düğümlere yazar ve hata özetini döner.
 * Başarılı adımda düğümün `dirty` bayrağı düşer — aksi halde kullanıcı hiç
 * değişiklik yapmadan tekrar kaydettiğinde aynı istek yeniden gönderilirdi.
 */
export function applyUpdateResults(steps: TreeStep[]): UpdateOutcome {
  const errors: string[] = [];

  for (const step of steps) {
    if (step.kind !== 'update' || !step.node) continue;

    if (step.ok) {
      step.node.error = null;
      step.node.dirty = false;
    } else {
      step.node.error = step.message;
      errors.push(`${step.node.typeName}: ${step.message}`);
    }
  }

  return { errors };
}
