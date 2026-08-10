import { Translations } from './translations.model';

/**
 * Parametreler ekranı (admin) — yedekleme zamanlaması, sistem e-postası ve
 * abonelik sekmelerinin tüm metinleri.
 */
export const PARAMETER_I18N: Translations = {
  // ── parameters.component — kabuk + sekme çubuğu ──────────────────────────
  'parameter.title': { tr: 'Parametreler', en: 'Parameters' },
  'parameter.tablistAria': { tr: 'Parametre sekmeleri', en: 'Parameter tabs' },
  'parameter.backupTab': { tr: 'Yedekleme', en: 'Backup' },
  'parameter.mailTab': { tr: 'E-posta', en: 'Email' },
  'parameter.subscriptionTab': { tr: 'Abonelik', en: 'Subscription' },
  'parameter.backupPanelAria': { tr: 'Yedekleme ayarları', en: 'Backup settings' },
  'parameter.mailPanelAria': { tr: 'E-posta ayarları', en: 'Email settings' },
  'parameter.subscriptionPanelAria': { tr: 'Abonelik ayarları', en: 'Subscription settings' },

  // ── backup-settings-tab — zamanlama ──────────────────────────────────────
  'parameter.backup.scheduleTitle': { tr: 'Yedekleme Zamanlaması', en: 'Backup Schedule' },
  'parameter.backup.enabled': { tr: 'Otomatik yedeklemeyi etkinleştir', en: 'Enable automatic backups' },
  'parameter.backup.enabledHelp': {
    tr: 'Kapalıyken zamanlama saklanır ama çalışmaz; istediğiniz zaman yeniden açabilirsiniz.',
    en: 'While disabled the schedule is kept but never runs; you can re-enable it at any time.'
  },
  'parameter.backup.frequency': { tr: 'Sıklık', en: 'Frequency' },
  'parameter.backup.freq.hourly': { tr: 'Saatte bir', en: 'Hourly' },
  'parameter.backup.freq.everyNHours': { tr: 'Belirli saat aralığıyla', en: 'Every N hours' },
  'parameter.backup.freq.daily': { tr: 'Her gün', en: 'Daily' },
  'parameter.backup.freq.everyNDays': { tr: 'Belirli gün aralığıyla', en: 'Every N days' },
  'parameter.backup.freq.weekly': { tr: 'Haftada bir', en: 'Weekly' },
  'parameter.backup.freq.monthly': { tr: 'Ayda bir', en: 'Monthly' },
  'parameter.backup.freq.custom': { tr: 'Özel (cron)', en: 'Custom (cron)' },
  'parameter.backup.minute': { tr: 'Dakika', en: 'Minute' },
  'parameter.backup.time': { tr: 'Saat', en: 'Time' },
  'parameter.backup.hourInterval': { tr: 'Kaç saatte bir', en: 'Hour interval' },
  'parameter.backup.hourIntervalOption': { tr: '{n} saatte bir', en: 'Every {n} hours' },
  'parameter.backup.dayInterval': { tr: 'Kaç günde bir', en: 'Day interval' },
  'parameter.backup.dayOfWeek': { tr: 'Haftanın günü', en: 'Day of week' },
  'parameter.backup.dayOfMonth': { tr: 'Ayın günü', en: 'Day of month' },
  'parameter.backup.rawCron': { tr: 'Cron ifadesi', en: 'Cron expression' },
  'parameter.backup.rawCronHelp': {
    tr: '5 alan: dakika saat ayın-günü ay haftanın-günü. Örnek: 0 12 1 * * → her ayın 1\'inde 12:00.',
    en: 'Five fields: minute hour day-of-month month day-of-week. Example: 0 12 1 * * → the 1st of every month at 12:00.'
  },
  'parameter.backup.rawCronInvalid': { tr: 'Cron ifadesi geçersiz.', en: 'The cron expression is invalid.' },
  'parameter.backup.shortMonthWarning': {
    tr: 'Seçtiğiniz gün kısa aylarda bulunmaz — o aylarda yedek alınmaz.',
    en: 'The day you picked does not exist in shorter months — no backup runs in those months.'
  },
  'parameter.backup.retention': { tr: 'Saklama süresi (gün)', en: 'Retention (days)' },
  'parameter.backup.retentionHelp': {
    tr: 'Bu süreden eski yedekler otomatik silinir. 0 girerseniz hiçbir yedek silinmez.',
    en: 'Backups older than this are deleted automatically. Enter 0 to keep them forever.'
  },
  'parameter.backup.retentionInvalid': {
    tr: 'Saklama süresi 0 ile 3650 arasında olmalıdır.',
    en: 'Retention must be between 0 and 3650.'
  },
  'parameter.backup.timeZone': { tr: 'Saat dilimi', en: 'Time zone' },
  'parameter.backup.timeZoneHelp': {
    tr: 'Zamanlama bu saat diliminde yorumlanır; tarayıcınızdan otomatik alındı.',
    en: 'The schedule is interpreted in this time zone; detected from your browser.'
  },
  'parameter.backup.summary': { tr: 'Özet', en: 'Summary' },
  'parameter.backup.nextRuns': { tr: 'Sıradaki çalışmalar', en: 'Upcoming runs' },
  'parameter.backup.nextRunsEmpty': {
    tr: 'Bu ayarlarla yakın zamanda çalışma bulunmuyor.',
    en: 'No upcoming runs with these settings.'
  },
  'parameter.backup.saveSchedule': { tr: 'Zamanlamayı Kaydet', en: 'Save Schedule' },

  // ── backup-settings-tab — durum + geçmiş ─────────────────────────────────
  'parameter.backup.statusTitle': { tr: 'Durum', en: 'Status' },
  'parameter.backup.nextDueAt': { tr: 'Sonraki çalışma', en: 'Next run' },
  'parameter.backup.lastRunAt': { tr: 'Son çalışma', en: 'Last run' },
  'parameter.backup.lastOutcome': { tr: 'Son sonuç', en: 'Last outcome' },
  'parameter.backup.neverRun': { tr: 'Henüz çalışmadı', en: 'Has not run yet' },
  'parameter.backup.notScheduled': { tr: 'Zamanlanmadı', en: 'Not scheduled' },
  'parameter.backup.historyTitle': { tr: 'Yedek Geçmişi', en: 'Backup History' },
  'parameter.backup.runNow': { tr: 'Şimdi Yedek Al', en: 'Back Up Now' },
  'parameter.backup.runNowConfirmTitle': { tr: 'Şimdi yedek alınsın mı?', en: 'Back up now?' },
  'parameter.backup.runNowConfirmMessage': {
    tr: 'Veritabanınızın tam yedeği hemen alınacak. Büyük veritabanlarında bu işlem birkaç dakika sürebilir.',
    en: 'A full backup of your database will be taken immediately. This can take a few minutes on large databases.'
  },
  'parameter.backup.historyEmpty': { tr: 'Henüz yedek alınmamış', en: 'No backups yet' },
  'parameter.backup.historyEmptyHint': {
    tr: 'Bir zamanlama kurun veya "Şimdi Yedek Al" ile ilk yedeğinizi oluşturun.',
    en: 'Set up a schedule or use "Back Up Now" to create your first backup.'
  },
  'parameter.backup.historyAria': { tr: 'Yedek geçmişi tablosu', en: 'Backup history table' },
  'parameter.backup.colType': { tr: 'Tür', en: 'Type' },
  'parameter.backup.colStatus': { tr: 'Durum', en: 'Status' },
  'parameter.backup.colStarted': { tr: 'Başlangıç', en: 'Started' },
  'parameter.backup.colCompleted': { tr: 'Bitiş', en: 'Completed' },
  'parameter.backup.colSize': { tr: 'Boyut', en: 'Size' },
  'parameter.backup.colVerified': { tr: 'Doğrulandı', en: 'Verified' },
  'parameter.backup.type.Manual': { tr: 'Elle', en: 'Manual' },
  'parameter.backup.type.Scheduled': { tr: 'Zamanlanmış', en: 'Scheduled' },
  'parameter.backup.type.PreMigration': { tr: 'Migrasyon öncesi', en: 'Pre-migration' },
  'parameter.backup.type.PrePurge': { tr: 'Temizlik öncesi', en: 'Pre-purge' },
  'parameter.backup.status.Running': { tr: 'Çalışıyor', en: 'Running' },
  'parameter.backup.status.Completed': { tr: 'Tamamlandı', en: 'Completed' },
  'parameter.backup.status.Failed': { tr: 'Başarısız', en: 'Failed' },
  'parameter.backup.loadFailed': {
    tr: 'Yedekleme ayarları yüklenemedi.',
    en: 'The backup settings could not be loaded.'
  },
  'parameter.backup.saveFailed': {
    tr: 'Zamanlama kaydedilemedi.',
    en: 'The schedule could not be saved.'
  },
  'parameter.backup.runFailed': { tr: 'Yedek alınamadı.', en: 'The backup could not be taken.' },

  // ── mail-settings-tab ────────────────────────────────────────────────────
  'parameter.mail.title': { tr: 'Sistem E-postası', en: 'System Email' },
  'parameter.mail.intro': {
    tr: 'Sistem e-posta göndermek istediğinde buradaki adresi ve SMTP ayarlarını kullanır.',
    en: 'Whenever the system sends an email it uses the address and SMTP settings defined here.'
  },
  'parameter.mail.enabled': { tr: 'E-posta gönderimini etkinleştir', en: 'Enable email sending' },
  'parameter.mail.host': { tr: 'SMTP sunucusu', en: 'SMTP host' },
  'parameter.mail.hostRequired': { tr: 'SMTP sunucusu zorunludur.', en: 'The SMTP host is required.' },
  'parameter.mail.port': { tr: 'Port', en: 'Port' },
  'parameter.mail.portInvalid': { tr: 'Port 1 ile 65535 arasında olmalıdır.', en: 'The port must be between 1 and 65535.' },
  'parameter.mail.user': { tr: 'Kullanıcı adı', en: 'Username' },
  'parameter.mail.userHelp': {
    tr: 'Sunucunuz kimlik doğrulama istemiyorsa boş bırakın.',
    en: 'Leave empty if your server does not require authentication.'
  },
  'parameter.mail.password': { tr: 'Parola', en: 'Password' },
  'parameter.mail.passwordHelp': {
    tr: 'Kayıtlı parola güvenlik gereği gösterilmez. Değiştirmek istemiyorsanız bu alana dokunmayın.',
    en: 'The stored password is never shown. Leave this field untouched to keep it as is.'
  },
  'parameter.mail.from': { tr: 'Gönderen adresi', en: 'Sender address' },
  'parameter.mail.fromRequired': { tr: 'Gönderen adresi zorunludur.', en: 'The sender address is required.' },
  'parameter.mail.fromInvalid': { tr: 'Geçerli bir e-posta adresi girin.', en: 'Enter a valid email address.' },
  'parameter.mail.fromName': { tr: 'Gönderen adı', en: 'Sender name' },
  'parameter.mail.fromNameHelp': {
    tr: 'Alıcının gelen kutusunda görünecek isim (ör. şirketinizin adı).',
    en: 'The name shown in the recipient\'s inbox (e.g. your company name).'
  },
  'parameter.mail.useSsl': { tr: 'Doğrudan SSL kullan (SMTPS)', en: 'Use implicit SSL (SMTPS)' },
  'parameter.mail.useSslHelp': {
    tr: 'Genelde 465 portu için işaretlenir; 587 kullanıyorsanız kapalı bırakın (STARTTLS).',
    en: 'Usually checked for port 465; leave off for 587 (STARTTLS).'
  },
  'parameter.mail.save': { tr: 'Ayarları Kaydet', en: 'Save Settings' },
  'parameter.mail.testTitle': { tr: 'Test E-postası', en: 'Test Email' },
  'parameter.mail.testIntro': {
    tr: 'Kayıtlı ayarlarla bir deneme maili gönderin. Önce ayarları kaydetmeyi unutmayın.',
    en: 'Send a test message using the saved settings. Remember to save your settings first.'
  },
  'parameter.mail.testTo': { tr: 'Alıcı adresi', en: 'Recipient address' },
  'parameter.mail.testToRequired': { tr: 'Bir alıcı adresi girin.', en: 'Enter a recipient address.' },
  'parameter.mail.sendTest': { tr: 'Test Maili Gönder', en: 'Send Test Email' },
  'parameter.mail.loadFailed': {
    tr: 'E-posta ayarları yüklenemedi.',
    en: 'The email settings could not be loaded.'
  },
  'parameter.mail.saveFailed': {
    tr: 'E-posta ayarları kaydedilemedi.',
    en: 'The email settings could not be saved.'
  },
  'parameter.mail.testFailed': { tr: 'Test maili gönderilemedi.', en: 'The test email could not be sent.' },

  // ── subscription-tab ─────────────────────────────────────────────────────
  'parameter.subscription.currentTitle': { tr: 'Mevcut Abonelik', en: 'Current Subscription' },
  'parameter.subscription.none': { tr: 'Aktif abonelik yok', en: 'No active subscription' },
  'parameter.subscription.noneHint': {
    tr: 'Aşağıdaki planlardan birini seçerek başlayabilirsiniz.',
    en: 'Pick one of the plans below to get started.'
  },
  'parameter.subscription.plan': { tr: 'Plan', en: 'Plan' },
  'parameter.subscription.status': { tr: 'Durum', en: 'Status' },
  'parameter.subscription.seats': { tr: 'Kullanıcı sayısı', en: 'Seats' },
  'parameter.subscription.startsAt': { tr: 'Başlangıç', en: 'Start date' },
  'parameter.subscription.trialEndsAt': { tr: 'Deneme bitişi', en: 'Trial ends' },
  'parameter.subscription.status.Trial': { tr: 'Deneme', en: 'Trial' },
  'parameter.subscription.status.Active': { tr: 'Aktif', en: 'Active' },
  'parameter.subscription.status.PastDue': { tr: 'Ödeme gecikti', en: 'Past due' },
  'parameter.subscription.status.Suspended': { tr: 'Askıda', en: 'Suspended' },
  'parameter.subscription.status.Cancelled': { tr: 'İptal edildi', en: 'Cancelled' },
  'parameter.subscription.status.Expired': { tr: 'Süresi doldu', en: 'Expired' },
  'parameter.subscription.plansTitle': { tr: 'Planlar', en: 'Plans' },
  'parameter.subscription.plansEmpty': { tr: 'Satın alınabilir plan yok', en: 'No plans available' },
  'parameter.subscription.plansEmptyHint': {
    tr: 'Şu anda yayınlanmış bir plan bulunmuyor. Daha sonra tekrar deneyin.',
    en: 'There are no published plans right now. Please check back later.'
  },
  'parameter.subscription.currentBadge': { tr: 'Mevcut planınız', en: 'Your current plan' },
  'parameter.subscription.trialDays': { tr: '{n} gün deneme', en: '{n}-day trial' },
  'parameter.subscription.seatsLabel': { tr: 'Kullanıcı sayısı', en: 'Seats' },
  'parameter.subscription.select': { tr: 'Bu Planı Seç', en: 'Choose This Plan' },
  'parameter.subscription.confirmTitle': { tr: 'Plan değişikliğini onaylıyor musunuz?', en: 'Confirm plan change?' },
  'parameter.subscription.confirmMessage': {
    tr: '\'{plan}\' planına geçilecek. Mevcut aboneliğiniz iptal edilip yenisi hemen etkinleşir.',
    en: 'You will switch to the \'{plan}\' plan. Your current subscription is cancelled and the new one activates immediately.'
  },
  'parameter.subscription.paymentNotice': {
    tr: 'Ödeme altyapısı henüz bağlanmadı — bu aşamada satın alma işlemleri ücretsiz onaylanır.',
    en: 'Payment processing is not connected yet — purchases are approved free of charge for now.'
  },
  'parameter.subscription.loadFailed': {
    tr: 'Abonelik bilgileri yüklenemedi.',
    en: 'The subscription details could not be loaded.'
  },
  'parameter.subscription.purchaseFailed': {
    tr: 'Plan satın alınamadı.',
    en: 'The plan could not be purchased.'
  },

  // Plan özelliği anahtarları — backend FeatureKeys ile birebir.
  'parameter.feature.max_users': { tr: 'Kullanıcı', en: 'Users' },
  'parameter.feature.max_models': { tr: 'Model', en: 'Models' },
  'parameter.feature.max_storage_gb': { tr: 'Depolama', en: 'Storage' },
  'parameter.feature.api_requests_per_day': { tr: 'Günlük API isteği', en: 'API requests per day' },
  'parameter.feature.ai_tokens_per_month': { tr: 'Aylık AI token', en: 'AI tokens per month' },
  'parameter.feature.feature_reports': { tr: 'Raporlama', en: 'Reporting' },
  'parameter.feature.feature_api_access': { tr: 'API erişimi', en: 'API access' },
  'parameter.feature.included': { tr: 'Dahil', en: 'Included' }
};
