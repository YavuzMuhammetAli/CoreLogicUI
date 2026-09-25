import { Translations } from './translations.model';

/**
 * Topbar bildirim zili çevirileri.
 *
 * Kapsanan bileşenler:
 *   components/shared/notification-bell → notification.*
 *
 * `notification.kind.*` anahtarları backend `WorkflowNotifyKinds` değerleriyle
 * birebir eşleşir; bilinmeyen tür `notification.kind.default`'a düşer.
 */
export const NOTIFICATION_I18N: Translations = {
  'notification.title': { tr: 'Bildirimler', en: 'Notifications' },
  'notification.bellAria': { tr: 'Bildirimleri aç', en: 'Open notifications' },
  'notification.bellUnreadAria': {
    tr: 'Bildirimleri aç — {count} okunmamış',
    en: 'Open notifications — {count} unread'
  },
  'notification.markAllRead': { tr: 'Tümünü okundu işaretle', en: 'Mark all as read' },
  'notification.empty': { tr: 'Henüz bildiriminiz yok.', en: 'You have no notifications yet.' },
  'notification.loadFailed': { tr: 'Bildirimler yüklenemedi.', en: 'Notifications could not be loaded.' },
  'notification.unread': { tr: 'Okunmamış', en: 'Unread' },
  'notification.viewTasks': { tr: 'Görevlerime git', en: 'Go to my tasks' },

  'notification.kind.TaskAssigned': {
    tr: 'Onayınızı bekleyen yeni görev: {name}',
    en: 'New task awaiting your approval: {name}'
  },
  'notification.kind.TaskEscalated': {
    tr: 'Süresi geçen görev hatırlatması: {name}',
    en: 'Reminder for an overdue task: {name}'
  },
  'notification.kind.TaskExpired': {
    tr: 'Görevin süresi doldu ve otomatik sonuçlandı: {name}',
    en: 'Task expired and was resolved automatically: {name}'
  },
  'notification.kind.WorkflowCompleted': {
    tr: 'Süreç onaylanarak tamamlandı: {name}',
    en: 'Process completed with approval: {name}'
  },
  'notification.kind.WorkflowRejected': {
    tr: 'Süreç reddedildi: {name}',
    en: 'Process was rejected: {name}'
  },
  'notification.kind.default': { tr: '{name}', en: '{name}' }
};
