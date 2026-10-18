import { WorkflowStep, WorkflowStepType } from '../../models/workflow.model';

/**
 * Akış düğümü tip kataloğu — SAF, Angular yok.
 *
 * Palet, düğüm kartı ve özellik paneli düğümün "ne olduğunu" buradan okur.
 * Katalogdaki tür motor tipiyle bire bir değildir: **Görev**, reddi kapalı bir
 * onay adımıdır (motor `approval` olarak koşar); kullanıcı için ayrı bir kavram
 * olduğu için ayrı tür olarak sunulur.
 */
export type NodeKind = 'approval' | 'task' | 'parallel' | 'condition' | 'end';

/** Kartın renk şeridi — tasarım sisteminin durum renkleri. */
export type NodeTone = 'accent' | 'success' | 'warn' | 'danger' | 'neutral';

/** Paletteki grup: insan adımları ve akışı yönlendiren adımlar. */
export type NodeCategory = 'human' | 'flow';

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
  category: NodeCategory;
  /** Görev açmadan motorun ilerlettiği adım (koşul). */
  automatic: boolean;
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
    category: 'human',
    automatic: false,
    icon: 'M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z'
  },
  {
    kind: 'task',
    type: 'approval',
    labelKey: 'workflow.node.task',
    descriptionKey: 'workflow.node.taskHelp',
    defaultNameKey: 'workflow.node.taskName',
    tone: 'success',
    category: 'human',
    automatic: false,
    icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'
  },
  {
    kind: 'parallel',
    type: 'parallel',
    labelKey: 'workflow.node.parallel',
    descriptionKey: 'workflow.node.parallelHelp',
    defaultNameKey: 'workflow.node.parallelName',
    tone: 'warn',
    category: 'human',
    automatic: false,
    icon: 'M6 3v18M18 3v18M6 8h12M6 16h12'
  },
  {
    kind: 'condition',
    type: 'condition',
    labelKey: 'workflow.node.condition',
    descriptionKey: 'workflow.node.conditionHelp',
    defaultNameKey: 'workflow.node.conditionName',
    tone: 'neutral',
    category: 'flow',
    automatic: true,
    icon: 'M12 2l10 10-10 10L2 12z'
  },
  {
    kind: 'end',
    type: 'end',
    labelKey: 'workflow.node.end',
    descriptionKey: 'workflow.node.endHelp',
    defaultNameKey: 'workflow.node.endName',
    tone: 'success',
    category: 'flow',
    automatic: false,
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
  }
];

export function nodeKindInfo(kind: NodeKind): NodeKindInfo {
  return NODE_KINDS.find(info => info.kind === kind) ?? NODE_KINDS[0];
}

export function isNodeKind(value: unknown): value is NodeKind {
  return NODE_KINDS.some(info => info.kind === value);
}

/** Var olan adımın türü: paralel/koşul/bitiş tipten; reddi kapalı onay → görev; diğerleri onay. */
export function nodeKindOf(step: WorkflowStep): NodeKind {
  if (step.type === 'parallel' || step.type === 'condition' || step.type === 'end') return step.type;
  return step.form?.allowReject === false ? 'task' : 'approval';
}

/** Kartın rengi: Bitiş sonucuna göre (reddedildi kırmızı), diğerleri türün rengi. */
export function nodeTone(step: WorkflowStep): NodeTone {
  if (step.type === 'end') return step.outcome === 'rejected' ? 'danger' : 'success';
  return nodeKindInfo(nodeKindOf(step)).tone;
}

export interface NewStepOptions {
  key: string;
  name: string;
  /** Görevin ilerletme düğmesi metni ("Tamamla"). */
  completeLabel?: string;
  /** Paralel adımın iki varsayılan dalının adları. */
  branchNames?: [string, string];
  /** Koşulun ilk durumunun etiketi ("Evet"). */
  caseLabel?: string;
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
    case 'condition':
      // Bir durum + varsayılan yol; satır ve hedefler kullanıcıdan (eksikler sorun olarak görünür).
      return {
        key, type: 'condition', name,
        cases: [{ key: 'durum1', label: options.caseLabel || null, match: 'all', when: [], to: null }],
        defaultTo: null
      };
    case 'end':
      return { key, type: 'end', name, outcome: 'completed' };
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
