import { WorkflowGraph } from '../../models/workflow.model';

/**
 * Ready-made workflow templates — to start a new workflow from a familiar skeleton instead of
 * an empty canvas. PURE: texts are translated by the caller.
 *
 * A template is model-independent: role/user assignments and column names are deliberately
 * left EMPTY; validation shows them as issues on the node and
 * the user completes them for their own model. Silently picking a wrong column or role
 * would mean a broken workflow going live unnoticed.
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
      startStep: 'manager',
      steps: [
        { key: 'manager', type: 'approval', name: t('workflow.template.purchase.manager'), assignment: role(), onApprove: 'amountCheck', onReject: 'rejected' },
        {
          key: 'amountCheck', type: 'condition', name: t('workflow.template.purchase.amountCheck'),
          cases: [{ key: 'highAmount', label: t('workflow.template.purchase.highAmount'), match: 'all', when: [], to: 'finance' }],
          defaultTo: 'notifyRequester'
        },
        { key: 'finance', type: 'approval', name: t('workflow.template.purchase.finance'), assignment: role(), onApprove: 'notifyRequester', onReject: 'rejected' },
        {
          key: 'notifyRequester', type: 'notify', name: t('workflow.template.notifyRequester'),
          notify: { recipients: [{ kind: 'creator' }], channels: [], subject: t('workflow.template.approvedSubject'), body: '' },
          next: 'approved'
        },
        { key: 'approved', type: 'end', name: t('workflow.template.approved'), outcome: 'completed' },
        { key: 'rejected', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  },
  {
    id: 'leave',
    nameKey: 'workflow.template.leave.name',
    descriptionKey: 'workflow.template.leave.description',
    build: t => ({
      startStep: 'manager',
      steps: [
        { key: 'manager', type: 'approval', name: t('workflow.template.leave.manager'), assignment: role(), onApprove: 'hr', onReject: 'rejected' },
        {
          key: 'hr', type: 'approval', name: t('workflow.template.leave.hr'), assignment: role(),
          form: { fields: [], allowReject: false, approveLabel: t('workflow.node.taskComplete') }, onApprove: 'notifyRequester'
        },
        {
          key: 'notifyRequester', type: 'notify', name: t('workflow.template.notifyRequester'),
          notify: { recipients: [{ kind: 'creator' }], channels: [], subject: t('workflow.template.approvedSubject'), body: '' },
          next: 'approved'
        },
        { key: 'approved', type: 'end', name: t('workflow.template.approved'), outcome: 'completed' },
        { key: 'rejected', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  },
  {
    id: 'expense',
    nameKey: 'workflow.template.expense.name',
    descriptionKey: 'workflow.template.expense.description',
    build: t => ({
      startStep: 'manager',
      steps: [
        { key: 'manager', type: 'approval', name: t('workflow.template.expense.manager'), assignment: role(), onApprove: 'accounting', onReject: 'rejected' },
        {
          key: 'accounting', type: 'approval', name: t('workflow.template.expense.accounting'), assignment: role(),
          form: { fields: [], allowReject: false, approveLabel: t('workflow.node.taskComplete') }, onApprove: 'approved'
        },
        { key: 'approved', type: 'end', name: t('workflow.template.paid'), outcome: 'completed' },
        { key: 'rejected', type: 'end', name: t('workflow.template.rejected'), outcome: 'rejected' }
      ],
      entityStatusMap: {}
    })
  }
];
