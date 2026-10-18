import { WorkflowStep, WorkflowStepType } from '../../models/workflow.model';

/**
 * Akış düğümü tip kataloğu — SAF, Angular yok.
 *
 * Palet, düğüm kartı ve özellik paneli düğümün "ne olduğunu" buradan okur.
 * Katalogdaki tür motor tipiyle bire bir değildir: **Görev**, reddi kapalı bir
 * onay adımıdır (motor `approval` olarak koşar); kullanıcı için ayrı bir kavram
 * olduğu için ayrı tür olarak sunulur.
 */
export type NodeKind = 'approval' | 'task' | 'parallel';

/** Kartın renk şeridi — tasarım sisteminin durum renkleri. */
export type NodeTone = 'accent' | 'success' | 'warn';

export interface NodeKindInfo {
  kind: NodeKind;
  /** Motorun gördüğü adım tipi. */
  type: WorkflowStepType;
  labelKey: string;
  /** Paletteki açıklama (ipucu + ekran okuyucu). */
  descriptionKey: string;
  /** Yeni düğümün varsayılan adı. */
  defaultNameKey: string;
  tone: NodeTone;
  /** 24×24 viewBox'ta stroke ikon yolu (`currentColor`). */
  icon: string;
}

export const NODE_KINDS: ReadonlyArray<NodeKindInfo> = [
  {
    kind: 'approval',
    type: 'approval',
    labelKey: 'workflow.node.approval',
    descriptionKey: 'workflow.node.approvalHelp',
    defaultNameKey: 'workflow.node.approvalName',
    tone: 'accent',
    icon: 'M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z'
  },
  {
    kind: 'task',
    type: 'approval',
    labelKey: 'workflow.node.task',
    descriptionKey: 'workflow.node.taskHelp',
    defaultNameKey: 'workflow.node.taskName',
    tone: 'success',
    icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'
  },
  {
    kind: 'parallel',
    type: 'parallel',
    labelKey: 'workflow.node.parallel',
    descriptionKey: 'workflow.node.parallelHelp',
    defaultNameKey: 'workflow.node.parallelName',
    tone: 'warn',
    icon: 'M6 3v18M18 3v18M6 8h12M6 16h12'
  }
];

export function nodeKindInfo(kind: NodeKind): NodeKindInfo {
  return NODE_KINDS.find(info => info.kind === kind) ?? NODE_KINDS[0];
}

export function isNodeKind(value: unknown): value is NodeKind {
  return NODE_KINDS.some(info => info.kind === value);
}

/** Var olan adımın türü: paralel → paralel; reddi kapalı onay → görev; diğerleri onay. */
export function nodeKindOf(step: WorkflowStep): NodeKind {
  if (step.type === 'parallel') return 'parallel';
  return step.form?.allowReject === false ? 'task' : 'approval';
}

export interface NewStepOptions {
  key: string;
  name: string;
  /** Görevin ilerletme düğmesi metni ("Tamamla"). */
  completeLabel?: string;
  /** Paralel adımın iki varsayılan dalının adları. */
  branchNames?: [string, string];
}

/**
 * Paletten eklenen yeni adım. Atama bilerek EKSİK bırakılır (rol modu, rol
 * seçilmemiş): doğrulama bunu düğümde sorun olarak gösterir ve kullanıcı özellik
 * panelinden seçer — sessizce "kaydı oluşturana" atamak yanlış kişiye görev
 * düşürebilirdi.
 */
export function createStep(kind: NodeKind, options: NewStepOptions): WorkflowStep {
  const { key, name } = options;

  switch (kind) {
    case 'parallel': {
      const [first, second] = options.branchNames ?? ['1', '2'];
      return {
        key, type: 'parallel', name, mode: 'all',
        branches: [
          { key: 'dal1', name: first, assignment: { mode: 'role', roleId: null } },
          { key: 'dal2', name: second, assignment: { mode: 'role', roleId: null } }
        ],
        onComplete: null,
        onAnyReject: null
      };
    }
    case 'task':
      return {
        key, type: 'approval', name,
        assignment: { mode: 'role', roleId: null },
        form: { fields: [], allowReject: false, approveLabel: options.completeLabel || null },
        onApprove: null
      };
    default:
      return {
        key, type: 'approval', name,
        assignment: { mode: 'role', roleId: null },
        onApprove: null,
        onReject: null
      };
  }
}
