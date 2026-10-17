import {
  RecordField,
  WorkflowBranch,
  WorkflowForm,
  WorkflowFormField,
  WorkflowJoinMode,
  WorkflowStep
} from '../../../models/workflow.model';
import { StepFieldValue, buildAssignment, buildSla } from '../workflow-step.form';

/** Pop-up formunun ham değeri (newStepGroup şekli, getRawValue). */
export type StepFormValue = Record<string, unknown>;

export interface MappedStep {
  step: WorkflowStep;
  /** Adımın `entityStatusMap` girdisi; boş = girdi yok. */
  statusLabel: string;
}

/** Yalnız paralel adıma ait alanlar — onay adımına dönüşünce silinir. */
const PARALLEL_ONLY = ['branches', 'mode', 'onComplete', 'onAnyReject'] as const;
/** Yalnız onay adımına ait alanlar — paralel adıma dönüşünce silinir. */
const APPROVAL_ONLY = ['onApprove', 'onReject'] as const;

/**
 * Pop-up form değerini adım nesnesine çevirir.
 *
 * Kurallar eski `buildGraph()` ile AYNI (spec'te dondurulmuş kopyasıyla
 * karşılaştırılıyor); iki bilinçli fark var:
 *  1) Sonuç asıl adımın (`original`) ÜZERİNE kurulur: formda karşılığı olmayan
 *     alanlar (bilinmeyen özellikler, paralel dalın formu, form alanının
 *     maxLength'i) korunur. Eskiden her kayıtta siliniyorlardı.
 *  2) Konum (x/y) pop-up'ın değil canvas'ındır; asıl adımdan alınır.
 *
 * Tip değişince eski tipe ait alanlar silinir: paralelden onaya dönen adımda
 * `branches` kalsaydı doğrulayıcı "tekil adım dal tanımlayamaz" derdi.
 */
export function stepFromFormValue(raw: StepFormValue, original?: WorkflowStep | null): MappedStep {
  const key = String(raw['key'] ?? '');
  const name = String(raw['name'] ?? '');
  const statusLabel = String(raw['statusLabel'] ?? '').trim();
  const isParallel = raw['type'] === 'parallel';

  const approveTarget = String(raw['onApprove'] ?? '') || null;
  const rejectTarget = String(raw['onReject'] ?? '') || null;

  const base = omit(original ?? {}, isParallel ? APPROVAL_ONLY : PARALLEL_ONLY);
  const position = { x: original?.x ?? null, y: original?.y ?? null };

  if (isParallel) {
    const branches = (raw['branches'] ?? []) as Array<Record<string, unknown>>;

    return {
      statusLabel,
      step: {
        ...base,
        key,
        type: 'parallel',
        name,
        mode: (raw['mode'] as WorkflowJoinMode) ?? 'all',
        branches: branches.map(branchFromFormValue),
        // Paralel adımın KENDİ ataması/formu gönderilmez — doğrulayıcı bunu
        // reddediyor; görevler dallardan doğar.
        assignment: null,
        sla: null,
        form: null,
        onComplete: approveTarget,
        onAnyReject: rejectTarget,
        ...position
      }
    };
  }

  const fields = (raw['fields'] ?? []) as StepFieldValue[];
  const recordFields = (raw['recordFields'] ?? []) as RecordField[];
  const approveLabel = String(raw['approveLabel'] ?? '').trim();
  const allowReject = raw['allowReject'] !== false;
  const rejectLabel = allowReject ? String(raw['rejectLabel'] ?? '').trim() : '';

  // Form, serbest alan YA DA kayıt alanı/buton ayarı varsa üretilir; aksi halde
  // null kalır ve görev şeması kopyası da boş olur (eski davranış).
  const hasForm = fields.length > 0 || recordFields.length > 0
    || !!approveLabel || !!rejectLabel || !allowReject;

  const form: WorkflowForm | null = hasForm
    ? {
        ...(original?.form ?? {}),
        fields: fields.map(fieldFromFormValue),
        recordFields: recordFields.map(field => ({
          column: String(field.column ?? ''),
          isRequired: !!field.isRequired
        })),
        approveLabel: approveLabel || null,
        rejectLabel: rejectLabel || null,
        allowReject
      }
    : null;

  return {
    statusLabel,
    step: {
      ...base,
      key,
      type: 'approval',
      name,
      assignment: buildAssignment(raw),
      sla: buildSla(raw),
      form,
      onApprove: approveTarget,
      // Red kapalıyken hedef gönderilmez — doğrulayıcı ölü kenarı reddediyor.
      onReject: allowReject ? rejectTarget : null,
      ...position
    }
  };
}

function branchFromFormValue(raw: Record<string, unknown>): WorkflowBranch {
  const form = (raw['form'] ?? null) as WorkflowForm | null;
  return {
    key: String(raw['key'] ?? ''),
    name: String(raw['name'] ?? ''),
    assignment: buildAssignment(raw),
    sla: buildSla(raw),
    // Dal formu pop-up'ta düzenlenmiyor; gizli kontrolde taşınıp aynen geri yazılır.
    ...(form ? { form } : {})
  };
}

function fieldFromFormValue(field: StepFieldValue): WorkflowFormField {
  const maxLength = Number(field.maxLength) || null;
  return {
    name: String(field.name ?? ''),
    dataType: String(field.dataType ?? 'string'),
    label: String(field.label ?? '') || null,
    isRequired: !!field.isRequired,
    ...(maxLength ? { maxLength } : {}),
    enumValues: String(field.enumValues ?? '') || null
  };
}

function omit(source: Partial<WorkflowStep>, keys: readonly string[]): Partial<WorkflowStep> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as Partial<WorkflowStep>;
}
