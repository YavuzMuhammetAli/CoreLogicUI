import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  WorkflowAssignment,
  WorkflowBranch,
  WorkflowSla,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * Akış adımı form kurucuları — tasarım ekranı ve adım pop-up'ı ortak kullanır.
 *
 * Saf fonksiyonlar: FormBuilder parametre olarak alınır, bileşen durumu
 * tutulmaz. Pop-up adımın KOPYASI üzerinde çalıştığı için kopya da buradan,
 * aynı kurucuyla üretilir (bkz. cloneStepGroup).
 */

/** Adım/dal/form alanı anahtar kalıbı — backend SqlIdentifier ile aynı. */
export const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Form alanı değerlerinin şekli (step.form.fields öğesi). */
export interface StepFieldValue {
  name: string;
  dataType: string;
  label?: string | null;
  isRequired: boolean;
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
    enumValues: [field?.enumValues ?? '']
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
    onTimeout: [branch?.sla?.onTimeout ?? 'escalate']
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
    // olarak yazılır; formda tek çift kontrol tutulup buildGraph'ta ayrılıyor.
    onApprove: [step?.onApprove ?? step?.onComplete ?? ''],
    onReject: [step?.onReject ?? step?.onAnyReject ?? ''],
    statusLabel: [statusLabel],
    // Canvas konumu. Formda görünmez; yalnız canvas yazar ve buildGraph okur.
    x: [step?.x ?? null],
    y: [step?.y ?? null],
    fields: fb.array([]),
    branches: fb.array([])
  });

  const fields = group.get('fields') as FormArray;
  for (const field of step?.form?.fields ?? []) {
    fields.push(newFieldGroup(fb, field));
  }

  const branches = group.get('branches') as FormArray;
  for (const branch of step?.branches ?? []) {
    branches.push(newBranchGroup(fb, branch));
  }

  return group;
}

/**
 * Adım grubunun bağımsız bir kopyası — pop-up bunun üzerinde çalışır.
 *
 * Kopya sayesinde "İptal" hiçbir şey geri almak zorunda kalmaz: iç içe
 * FormArray'lerde (dallar, form alanları) yapılan ekleme/silmeler ana forma
 * hiç dokunmaz. Kaydet'te kopya yerine konur (setControl).
 */
export function cloneStepGroup(fb: FormBuilder, source: AbstractControl): FormGroup {
  const raw = source.getRawValue() as Record<string, unknown>;
  const clone = newStepGroup(fb, String(raw['key'] ?? ''));

  const fields = clone.get('fields') as FormArray;
  for (const field of (raw['fields'] ?? []) as StepFieldValue[]) {
    fields.push(newFieldGroup(fb, field));
  }

  const branches = clone.get('branches') as FormArray;
  for (const branch of (raw['branches'] ?? []) as Array<Record<string, unknown>>) {
    // Dal değerleri form şeklinde (düz atama/SLA alanları); grup şekline geri çevrilir.
    const group = newBranchGroup(fb);
    group.patchValue(branch);
    branches.push(group);
  }

  const { fields: _f, branches: _b, ...scalars } = raw;
  clone.patchValue(scalars);
  return clone;
}

/**
 * Adım anahtarı değiştiğinde diğer adımların hedeflerini yeni anahtara taşır.
 * Aksi halde bağlantılar sessizce kopar ve doğrulayıcı "hedef adım bulunamadı"
 * derdi. Başlangıç adımı ayrıca döner, çağıran yazar.
 */
export function renameStepReferences(
  steps: FormArray, oldKey: string, newKey: string, startStep: string
): string {
  if (!oldKey || oldKey === newKey) return startStep;

  for (const control of steps.controls) {
    if (control.value.onApprove === oldKey) control.patchValue({ onApprove: newKey });
    if (control.value.onReject === oldKey) control.patchValue({ onReject: newKey });
  }

  return startStep === oldKey ? newKey : startStep;
}

/** Yeni adıma çakışmayan bir anahtar önerir (adim1, adim2, …). */
export function suggestStepKey(steps: FormArray): string {
  const existing = new Set(steps.controls.map(c => String(c.value.key ?? '').toLowerCase()));
  let index = steps.length + 1;
  while (existing.has(`adim${index}`)) index++;
  return `adim${index}`;
}
