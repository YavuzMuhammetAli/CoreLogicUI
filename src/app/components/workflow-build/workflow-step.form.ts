import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  RecordField,
  WorkflowAssignment,
  WorkflowBranch,
  WorkflowSla,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * Akış adımı form kurucuları — adım pop-up'ı kullanır.
 *
 * Saf fonksiyonlar: FormBuilder parametre olarak alınır, bileşen durumu
 * tutulmaz. Pop-up açılırken adım nesnesinden (WorkflowStep) bir grup kurulur;
 * kaydedince grup değeri `stepFromFormValue` ile yeniden adıma çevrilir
 * (bkz. designer/workflow-step.mapper.ts). Tasarım belgesindeki adıma pop-up
 * kaydedilene kadar dokunulmaz — "İptal" hiçbir şeyi geri almak zorunda değil.
 */

/** Adım/dal/form alanı anahtar kalıbı — backend SqlIdentifier ile aynı. */
export const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Form alanı değerlerinin şekli (step.form.fields öğesi). */
export interface StepFieldValue {
  name: string;
  dataType: string;
  label?: string | null;
  isRequired: boolean;
  maxLength?: number | null;
  enumValues?: string | null;
}

/**
 * Atama nesnesini form değerlerinden kurar. Adım ve dal aynı alan adlarını
 * kullandığı için ikisi de aynı fonksiyondan geçer.
 */
export function buildAssignment(source: Record<string, unknown>): WorkflowAssignment {
  const mode = source['assignMode'] as 'role' | 'user' | 'creator';
  return {
    mode,
    roleId: mode === 'role' ? Number(source['roleId']) || null : null,
    userId: mode === 'user' ? Number(source['userId']) || null : null
  };
}

/**
 * SLA yalnızca gerçekten girildiyse üretilir; boş bir nesne doğrulayıcıda
 * "sıfırdan büyük olmalı" hatasına düşerdi.
 */
export function buildSla(source: Record<string, unknown>): WorkflowSla | null {
  const dueHours = source['dueHours'] as number | null;
  const escalateAfterHours = source['escalateAfterHours'] as number | null;

  if (!dueHours && !escalateAfterHours) return null;

  return {
    dueHours: dueHours || null,
    escalateAfterHours: escalateAfterHours || null,
    onTimeout: (source['onTimeout'] as 'escalate' | 'autoApprove' | 'autoReject') ?? 'escalate'
  };
}

export function newFieldGroup(fb: FormBuilder, field?: StepFieldValue): FormGroup {
  return fb.group({
    name: [field?.name ?? '', Validators.required],
    dataType: [field?.dataType ?? 'string'],
    label: [field?.label ?? ''],
    isRequired: [field?.isRequired ?? false],
    // Metin alanının en fazla uzunluğu. Eskiden formda kontrolü yoktu ve her
    // kayıtta sessizce siliniyordu.
    maxLength: [field?.maxLength ?? null],
    enumValues: [field?.enumValues ?? '']
  });
}

/**
 * Adımın kayıt alanı: görevlinin bu adımda dolduracağı model kolonu. Akış
 * sürerken kayıt kilitlenir; yalnız bu kolonlar görevliye açılır.
 */
export function newRecordFieldGroup(fb: FormBuilder, field?: RecordField): FormGroup {
  return fb.group({
    column: [field?.column ?? '', Validators.required],
    isRequired: [field?.isRequired ?? false]
  });
}

export function newBranchGroup(fb: FormBuilder, branch?: Partial<WorkflowBranch>): FormGroup {
  return fb.group({
    key: [branch?.key ?? '', [Validators.required, Validators.pattern(KEY_PATTERN)]],
    name: [branch?.name ?? '', Validators.required],
    assignMode: [branch?.assignment?.mode ?? 'role'],
    roleId: [branch?.assignment?.roleId ?? null],
    userId: [branch?.assignment?.userId ?? null],
    // SLA dal başına: "finans 24 saat, hukuk 72 saat" gerçek bir ihtiyaç.
    dueHours: [branch?.sla?.dueHours ?? null],
    escalateAfterHours: [branch?.sla?.escalateAfterHours ?? null],
    onTimeout: [branch?.sla?.onTimeout ?? 'escalate'],
    // Dalın görev formu pop-up'ta düzenlenmiyor (API/AI ile tanımlanabiliyor).
    // Gizli kontrolde olduğu gibi taşınır; eskiden her kayıtta siliniyordu.
    form: fb.control(branch?.form ?? null)
  });
}

/**
 * Tanım grafiğindeki bir adımdan (WorkflowStep) form grubu kurar.
 * `statusLabel` grafikte ayrı haritada durduğu için ayrıca verilir.
 */
export function newStepGroup(
  fb: FormBuilder, key: string, step?: WorkflowStep, statusLabel = ''
): FormGroup {
  const group = fb.group({
    key: [step?.key ?? key, [Validators.required, Validators.pattern(KEY_PATTERN)]],
    name: [step?.name ?? '', Validators.required],
    type: [step?.type ?? 'approval'],
    // Paralel adımda ilerleme kuralı; tekil adımda göz ardı edilir.
    mode: [step?.mode ?? 'all'],
    assignMode: [step?.assignment?.mode ?? 'role'],
    roleId: [step?.assignment?.roleId ?? null],
    userId: [step?.assignment?.userId ?? null],
    dueHours: [step?.sla?.dueHours ?? null],
    escalateAfterHours: [step?.sla?.escalateAfterHours ?? null],
    onTimeout: [step?.sla?.onTimeout ?? 'escalate'],
    // Tekil adımda onApprove/onReject, paralel adımda onComplete/onAnyReject
    // olarak yazılır; formda tek çift kontrol tutulup eşleyicide ayrılıyor.
    onApprove: [step?.onApprove ?? step?.onComplete ?? ''],
    onReject: [step?.onReject ?? step?.onAnyReject ?? ''],
    statusLabel: [statusLabel],
    // Kayıt ekranındaki butonlar. Boş etiket = adım adı / "Reddet".
    approveLabel: [step?.form?.approveLabel ?? ''],
    rejectLabel: [step?.form?.rejectLabel ?? ''],
    allowReject: [step?.form?.allowReject ?? true],
    fields: fb.array([]),
    recordFields: fb.array([]),
    branches: fb.array([])
  });

  const fields = group.get('fields') as FormArray;
  for (const field of step?.form?.fields ?? []) {
    fields.push(newFieldGroup(fb, field));
  }

  const recordFields = group.get('recordFields') as FormArray;
  for (const field of step?.form?.recordFields ?? []) {
    recordFields.push(newRecordFieldGroup(fb, field));
  }

  const branches = group.get('branches') as FormArray;
  for (const branch of step?.branches ?? []) {
    branches.push(newBranchGroup(fb, branch));
  }

  return group;
}
