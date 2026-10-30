import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { IssueRow, countIssues } from './workflow-issues';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Akışın doğrulama sorunları — tasarım ekranının altında, her sekmede görünür.
 *
 * Sorunlar kaydı engellemez (taslak eksikleriyle kaydedilir); hatalar yayını
 * engeller, uyarılar yalnız dikkat çeker. Satıra tıklamak ilgili adımı seçer
 * (tetik sorunu tetikleyici sekmesini açar).
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
  /** Sunucu doğrulaması sürüyor. */
  readonly validating = input(false);
  /** Liste açık mı — başlıktaki sorun düğmesi de açar. */
  readonly expanded = model(true);

  readonly pick = output<IssueRow>();

  readonly counts = computed(() => countIssues(this.rows()));

  toggle(): void {
    this.expanded.update(open => !open);
  }
}
