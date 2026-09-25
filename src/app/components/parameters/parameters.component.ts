import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { BackupSettingsTabComponent } from './backup/backup-settings-tab.component';
import { MailSettingsTabComponent } from './mail/mail-settings-tab.component';
import { NotificationTemplatesTabComponent } from './templates/notification-templates-tab.component';
import { SubscriptionTabComponent } from './subscription/subscription-tab.component';

type TabId = 'backup' | 'mail' | 'templates' | 'subscription';

/**
 * Parametreler ekranı (admin) — dört bağımsız sekmenin kabuğu.
 *
 * Sekmeler `@if` ile değiştirilir, yani seçilmeyen sekme hiç oluşturulmaz ve
 * veri çekmez. table-detail'deki ilişkiler sekmesinden farklı olarak burada
 * gizli sekmenin canlı kalmasını gerektiren bir rozet/sayaç yok.
 */
@Component({
  selector: 'app-parameters',
  standalone: true,
  imports: [
    TranslatePipe,
    BackupSettingsTabComponent,
    MailSettingsTabComponent,
    NotificationTemplatesTabComponent,
    SubscriptionTabComponent
  ],
  templateUrl: './parameters.component.html',
  styleUrl: './parameters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParametersComponent {
  readonly activeTab = signal<TabId>('backup');

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }
}
