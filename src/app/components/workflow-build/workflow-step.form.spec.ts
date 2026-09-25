import { FormArray, FormBuilder } from '@angular/forms';
import { WorkflowStep } from '../../models/workflow.model';
import {
  cloneStepGroup,
  newStepGroup,
  renameStepReferences,
  suggestStepKey
} from './workflow-step.form';

describe('workflow-step.form', () => {
  const fb = new FormBuilder();

  const parallelStep: WorkflowStep = {
    key: 'onay',
    type: 'parallel',
    name: 'Paralel onay',
    mode: 'any',
    branches: [
      { key: 'finans', name: 'Finans', assignment: { mode: 'role', roleId: 3, userId: null }, sla: { dueHours: 24, escalateAfterHours: null, onTimeout: 'escalate' } },
      { key: 'hukuk', name: 'Hukuk', assignment: { mode: 'user', roleId: null, userId: 7 }, sla: null }
    ],
    assignment: null,
    sla: null,
    form: null,
    onComplete: 'final',
    onAnyReject: null,
    x: 10,
    y: 20
  } as WorkflowStep;

  const approvalStep: WorkflowStep = {
    key: 'yonetici',
    type: 'approval',
    name: 'Yönetici',
    assignment: { mode: 'role', roleId: 1, userId: null },
    sla: null,
    form: { fields: [{ name: 'not', dataType: 'enum', label: 'Not', isRequired: true, enumValues: 'a,b' }] },
    onApprove: 'onay',
    onReject: null
  } as WorkflowStep;

  it('kopya kaynakla aynı değerleri taşır (dallar ve form alanları dahil)', () => {
    const source = newStepGroup(fb, 'onay', parallelStep, 'Onayda');
    const clone = cloneStepGroup(fb, source);

    expect(clone.getRawValue()).toEqual(source.getRawValue());
  });

  it('kopyadaki değişiklik kaynağa sızmaz', () => {
    const source = newStepGroup(fb, 'yonetici', approvalStep);
    const clone = cloneStepGroup(fb, source);

    clone.patchValue({ name: 'Değişti' });
    (clone.get('fields') as FormArray).removeAt(0);
    (clone.get('branches') as FormArray).push(fb.group({ key: 'x' }));

    expect(source.value.name).toBe('Yönetici');
    expect((source.get('fields') as FormArray).length).toBe(1);
    expect((source.get('branches') as FormArray).length).toBe(0);
  });

  it('kayıt alanları ve buton ayarları kopyada korunur', () => {
    const step = {
      ...approvalStep,
      form: {
        fields: [],
        recordFields: [{ column: 'Tutar', isRequired: true }, { column: 'Aciklama', isRequired: false }],
        approveLabel: 'Onaya Gönder',
        rejectLabel: null,
        allowReject: false
      }
    } as WorkflowStep;

    const source = newStepGroup(fb, 'mudur', step);
    const clone = cloneStepGroup(fb, source);

    expect(clone.getRawValue()).toEqual(source.getRawValue());
    expect((clone.get('recordFields') as FormArray).length).toBe(2);
    expect(clone.value.recordFields[0]).toEqual({ column: 'Tutar', isRequired: true });
    expect(clone.value.approveLabel).toBe('Onaya Gönder');
    expect(clone.value.allowReject).toBeFalse();
  });

  it('eski tanımda red izni varsayılan olarak açık', () => {
    expect(newStepGroup(fb, 'yonetici', approvalStep).value.allowReject).toBeTrue();
  });

  it('kopya devre dışı kaynaktan da değerleri alır (salt-okunur görüntüleme)', () => {
    const source = newStepGroup(fb, 'yonetici', approvalStep);
    source.disable();

    expect(cloneStepGroup(fb, source).getRawValue().fields.length).toBe(1);
  });

  it('anahtar değişince diğer adımların hedefleri ve başlangıç adımı taşınır', () => {
    const steps = fb.array([
      newStepGroup(fb, 'yonetici', approvalStep),
      newStepGroup(fb, 'onay', { ...parallelStep, onComplete: null, onAnyReject: 'onay' } as WorkflowStep)
    ]);

    const start = renameStepReferences(steps, 'onay', 'ortakOnay', 'onay');

    expect(steps.at(0).value.onApprove).toBe('ortakOnay');
    expect(steps.at(1).value.onReject).toBe('ortakOnay');
    expect(start).toBe('ortakOnay');
  });

  it('anahtar değişmediyse hiçbir şeye dokunmaz', () => {
    const steps = fb.array([newStepGroup(fb, 'yonetici', approvalStep)]);
    expect(renameStepReferences(steps, 'onay', 'onay', 'yonetici')).toBe('yonetici');
    expect(steps.at(0).value.onApprove).toBe('onay');
  });

  it('önerilen anahtar mevcut anahtarlarla çakışmaz', () => {
    const steps = fb.array([
      newStepGroup(fb, 'adim2'),
      newStepGroup(fb, 'adim3')
    ]);
    expect(suggestStepKey(steps)).toBe('adim4');
  });
});
