import { WorkflowGraph } from '../../models/workflow.model';

/**
 * Hazır akış şablonları — yeni akışa boş tuval yerine tanıdık bir iskeletle
 * başlamak için. SAF: metinler dışarıdan çevrilir.
 *
 * Şablon modelden bağımsızdır: rol/kişi atamaları ve kolon adları bilinçli
 * olarak BOŞ bırakılır; doğrulama bunları düğümde sorun olarak gösterir ve
 * kullanıcı kendi modeline göre tamamlar. Sessizce yanlış bir kolon ya da rol
 * seçmek, fark edilmeden yayına giden hatalı bir akış demek olurdu.
 */
export type WorkflowTemplateId = 'purchase' | 'leave' | 'expense';

export interface WorkflowTemplate {
  id: WorkflowTemplateId;
  nameKey: string;
  descriptionKey: string;
  build(t: (key: string) => string): WorkflowGraph;
}

const role = () => ({ mode: 'role' as const, roleId: null });

export const WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  {
    id: 'purchase',
    nameKey: 'workflow.template.purchase.name',
    descriptionKey: 'workflow.template.purchase.description',
    build: t => ({
      startStep: 'mudur',
      steps: [
        { key: 'mudur', type: 'approval', name: t('workflow.template.purchase.manager'), assignment: role(), onApprove: 'tutar', onReject: 'red' },
        {
          key: 'tutar', type: 'condition', name: t('workflow.template.purchase.amountCheck'),
          cases: [{ key: 'yuksek', label: t('workflow.template.purchase.highAmount'), match: 'all', when: [], to: 'finans' }],
          defaultTo: 'haber'
        },
        { key: 'finans', type: 'approval', name: t('workflow.template.purchase.finance'), assignment: role(), onApprove: 'haber', onReject: 'red' },
        {
          key: 'haber', type: 'notify', name: t('workflow.template.notifyRequester'),
          notify: { recipients: [{ kind: 'creator' }], channels: [], subject: t('workflow.template.approvedSubject'), body: '' },
          next: 'son'
        },
        { key: 'son', type: 'end', name: t('workflow.template.approved'), outcome: 'completed' },
        { key: 'red', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  },
  {
    id: 'leave',
    nameKey: 'workflow.template.leave.name',
    descriptionKey: 'workflow.template.leave.description',
    build: t => ({
      startStep: 'yonetici',
      steps: [
        { key: 'yonetici', type: 'approval', name: t('workflow.template.leave.manager'), assignment: role(), onApprove: 'ik', onReject: 'red' },
        {
          key: 'ik', type: 'approval', name: t('workflow.template.leave.hr'), assignment: role(),
          form: { fields: [], allowReject: false, approveLabel: t('workflow.node.taskComplete') }, onApprove: 'haber'
        },
        {
          key: 'haber', type: 'notify', name: t('workflow.template.notifyRequester'),
          notify: { recipients: [{ kind: 'creator' }], channels: [], subject: t('workflow.template.approvedSubject'), body: '' },
          next: 'son'
        },
        { key: 'son', type: 'end', name: t('workflow.template.approved'), outcome: 'completed' },
        { key: 'red', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  },
  {
    id: 'expense',
    nameKey: 'workflow.template.expense.name',
    descriptionKey: 'workflow.template.expense.description',
    build: t => ({
      startStep: 'yonetici',
      steps: [
        { key: 'yonetici', type: 'approval', name: t('workflow.template.expense.manager'), assignment: role(), onApprove: 'muhasebe', onReject: 'red' },
        {
          key: 'muhasebe', type: 'approval', name: t('workflow.template.expense.accounting'), assignment: role(),
          form: { fields: [], allowReject: false, approveLabel: t('workflow.node.taskComplete') }, onApprove: 'son'
        },
        { key: 'son', type: 'end', name: t('workflow.template.paid'), outcome: 'completed' },
        { key: 'red', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  }
];
