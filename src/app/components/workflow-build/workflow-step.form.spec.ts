import { FormArray, FormBuilder } from '@angular/forms';
import { WorkflowStep } from '../../models/workflow.model';
import { newStepGroup } from './workflow-step.form';

describe('workflow-step.form', () => {
  const fb = new FormBuilder();

  const parallelStep: WorkflowStep = {
    key: 'onay',
    type: 'parallel',
    name: 'Paralel onay',
    mode: 'any',
    branches: [
      {
        key: 'finans', name: 'Finans',
        assignment: { mode: 'role', roleId: 3, userId: null },
        sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'autoApprove' },
        form: { fields: [], allowReject: false }
      },
      { key: 'hukuk', name: 'Hukuk', assignment: { mode: 'user', roleId: null, userId: 7 }, sla: null }
    ],
    assignment: null,
    sla: null,
    form: null,
    onComplete: 'final',
    onAnyReject: null
  };

  const approvalStep: WorkflowStep = {
    key: 'yonetici',
    type: 'approval',
    name: 'Yönetici',
    assignment: { mode: 'role', roleId: 1, userId: null },
    sla: null,
    form: { fields: [{ name: 'not', dataType: 'string', label: 'Not', isRequired: true, maxLength: 200 }] },
    onApprove: 'onay',
    onReject: null
  };

  it('eski tanımda red izni varsayılan olarak açık', () => {
    expect(newStepGroup(fb, 'yonetici', approvalStep).value.allowReject).toBeTrue();
  });

  it('paralel adımın çıkışları tek kontrol çiftine yazılır', () => {
    const value = newStepGroup(fb, 'onay', parallelStep).getRawValue();
    expect(value.onApprove).toBe('final');
    expect(value.onReject).toBe('');
  });

  it('dalın yükseltme süresi ve zaman aşımı forma gelir', () => {
    const branch = (newStepGroup(fb, 'onay', parallelStep).get('branches') as FormArray).at(0).getRawValue();
    expect(branch.escalateAfterHours).toBe(48);
    expect(branch.onTimeout).toBe('autoApprove');
  });

  it('dalın formu gizli kontrolde aynen taşınır', () => {
    // Pop-up dal formunu düzenlemiyor; eskiden her kayıtta siliniyordu.
    const branch = (newStepGroup(fb, 'onay', parallelStep).get('branches') as FormArray).at(0).getRawValue();
    expect(branch.form).toEqual({ fields: [], allowReject: false });
  });

  it('form alanının en fazla uzunluğu forma gelir', () => {
    const field = (newStepGroup(fb, 'yonetici', approvalStep).get('fields') as FormArray).at(0).getRawValue();
    expect(field.maxLength).toBe(200);
  });

  it('konum forma girmez — canvas\'ındır', () => {
    const value = newStepGroup(fb, 'yonetici', { ...approvalStep, x: 10, y: 20 }).getRawValue();
    expect('x' in value).toBeFalse();
    expect('y' in value).toBeFalse();
  });

  it('yeni adım verilen anahtarla ve boş değerlerle açılır', () => {
    const value = newStepGroup(fb, 'adim3').getRawValue();
    expect(value.key).toBe('adim3');
    expect(value.type).toBe('approval');
    expect(value.assignMode).toBe('role');
  });
});
