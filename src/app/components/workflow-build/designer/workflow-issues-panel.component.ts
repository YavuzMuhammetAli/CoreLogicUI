import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { IssueRow, countIssues } from './workflow-issues';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Validation issues of the flow — below the design screen, visible on every tab.
 *
 * Issues do not block saving (a draft is saved with its gaps); errors block
 * publishing, warnings only draw attention. Clicking a row selects the related step
 * (a trigger issue opens the trigger tab).
 */
@Component({
    selector: 'app-workflow-issues-panel',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './workflow-issues-panel.component.html',
    styleUrl: './workflow-issues-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowIssuesPanelComponent {
  readonly rows = input<IssueRow[]>([]);
  /** Server validation is in progress. */
  readonly validating = input(false);
  /** Is the list open — the issues button in the header opens it too. */
  readonly expanded = model(true);

  readonly pick = output<IssueRow>();

  readonly counts = computed(() => countIssues(this.rows()));

  toggle(): void {
    this.expanded.update(open => !open);
  }
}
