import { WorkflowStep, WorkflowStepType } from '../../models/workflow.model';
import type { IconName } from '../../components/shared/icon/icons.generated';

/**
 * Workflow node type catalog — PURE, no Angular.
 *
 * The palette, node card and properties panel read "what a node is" from here.
 * A catalog kind is not one-to-one with the engine type: **Task** is an approval
 * step with reject disabled (the engine runs it as `approval`); it is presented as a
 * separate kind because it is a separate concept for the user.
 */
export type NodeKind = 'approval' | 'task' | 'parallel' | 'condition' | 'action' | 'notify' | 'timer' | 'end';

/** The card's colour stripe — the design system's status colours. */
export type NodeTone = 'accent' | 'success' | 'warn' | 'danger' | 'neutral';

/** Palette group: human steps, automatic actions and flow-routing steps. */
export type NodeCategory = 'human' | 'automation' | 'flow';

export interface NodeKindInfo {
  kind: NodeKind;
  /** The step type the engine sees. */
  type: WorkflowStepType;
  labelKey: string;
  /** Description in the palette (tooltip + screen reader). */
  descriptionKey: string;
  /** Default name for a new node. */
  defaultNameKey: string;
  tone: NodeTone;
  category: NodeCategory;
  /** A step the engine advances without opening a task (condition, update field, notification). */
  automatic: boolean;
  /** Material Symbols icon name (`<app-icon>`). */
  icon: IconName;
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
    icon: 'approval'
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
    icon: 'task_alt'
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
    icon: 'call_split'
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
    icon: 'alt_route'
  },
  {
    kind: 'action',
    type: 'action',
    labelKey: 'workflow.node.action',
    descriptionKey: 'workflow.node.actionHelp',
    defaultNameKey: 'workflow.node.actionName',
    tone: 'accent',
    category: 'automation',
    automatic: true,
    icon: 'edit_note'
  },
  {
    kind: 'notify',
    type: 'notify',
    labelKey: 'workflow.node.notify',
    descriptionKey: 'workflow.node.notifyHelp',
    defaultNameKey: 'workflow.node.notifyName',
    tone: 'warn',
    category: 'automation',
    automatic: true,
    icon: 'notifications'
  },
  {
    kind: 'timer',
    type: 'timer',
    labelKey: 'workflow.node.timer',
    descriptionKey: 'workflow.node.timerHelp',
    defaultNameKey: 'workflow.node.timerName',
    tone: 'neutral',
    category: 'automation',
    automatic: true,
    icon: 'hourglass_empty'
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
    icon: 'flag'
  }
];

export function nodeKindInfo(kind: NodeKind): NodeKindInfo {
  return NODE_KINDS.find(info => info.kind === kind) ?? NODE_KINDS[0];
}

export function isNodeKind(value: unknown): value is NodeKind {
  return NODE_KINDS.some(info => info.kind === value);
}

/** Kind of an existing step: parallel/condition/end from the type; approval with reject disabled → task; others approval. */
export function nodeKindOf(step: WorkflowStep): NodeKind {
  if (step.type === 'parallel' || step.type === 'condition' || step.type === 'end'
      || step.type === 'action' || step.type === 'notify' || step.type === 'timer') return step.type;
  return step.form?.allowReject === false ? 'task' : 'approval';
}

/** Card colour: End by outcome (rejected is red), others the kind's colour. */
export function nodeTone(step: WorkflowStep): NodeTone {
  if (step.type === 'end') return step.outcome === 'rejected' ? 'danger' : 'success';
  return nodeKindInfo(nodeKindOf(step)).tone;
}

export interface NewStepOptions {
  key: string;
  name: string;
  /** Text of the task's advance button ("Tamamla" / Complete). */
  completeLabel?: string;
  /** Names of the parallel step's two default branches. */
  branchNames?: [string, string];
  /** Label of the condition's first case ("Evet" / Yes). */
  caseLabel?: string;
  /** Default subject of the notification. */
  subject?: string;
}

/**
 * A new step added from the palette. The assignment is deliberately left INCOMPLETE (role mode, no role
 * selected): validation shows it as an issue on the node and the user picks one in the properties
 * panel — silently assigning to the "record creator" could drop a task on the wrong
 * person.
 */
export function createStep(kind: NodeKind, options: NewStepOptions): WorkflowStep {
  const { key, name } = options;

  switch (kind) {
    case 'condition':
      // One case + default path; rows and targets come from the user (missing ones show as issues).
      return {
        key, type: 'condition', name,
        cases: [{ key: 'case1', label: options.caseLabel || null, match: 'all', when: [], to: null }],
        defaultTo: null
      };
    case 'end':
      return { key, type: 'end', name, outcome: 'completed' };
    case 'action':
      // A single empty row: field and value come from the user (missing ones show as issues).
      return { key, type: 'action', name, sets: [{ column: '', mode: 'value', value: '' }], next: null };
    case 'timer':
      // A one-day wait; waiting until a date field is chosen in the editor.
      return { key, type: 'timer', name, timer: { mode: 'duration', amount: 1, unit: 'days' }, next: null };
    case 'notify':
      // Default recipient is the record creator; the subject comes from the user.
      return {
        key, type: 'notify', name,
        notify: { recipients: [{ kind: 'creator' }], channels: [], subject: options.subject ?? '', body: '' },
        next: null
      };
    case 'parallel': {
      const [first, second] = options.branchNames ?? ['1', '2'];
      return {
        key, type: 'parallel', name, mode: 'all',
        branches: [
          { key: 'branch1', name: first, assignment: { mode: 'role', roleId: null } },
          { key: 'branch2', name: second, assignment: { mode: 'role', roleId: null } }
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
