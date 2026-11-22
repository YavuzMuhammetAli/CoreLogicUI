import '../../i18n/lazy/parameter'; // the parameter.* dictionary loads with this chunk
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { BackupSettingsTabComponent } from './backup/backup-settings-tab.component';
import { MailSettingsTabComponent } from './mail/mail-settings-tab.component';
import { NotificationTemplatesTabComponent } from './templates/notification-templates-tab.component';
import { SubscriptionTabComponent } from './subscription/subscription-tab.component';

type TabId = 'backup' | 'mail' | 'templates' | 'subscription';

/**
 * Parameters screen (admin) — the shell of four independent tabs.
 *
 * Tabs are switched with `@if`, so an unselected tab is never created and
 * fetches no data. Unlike the relationships tab in table-detail, there is no
 * badge/counter here that requires a hidden tab to stay alive.
 */
@Component({
    selector: 'app-parameters',
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
