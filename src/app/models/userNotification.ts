/**
 * Topbar zilindeki uygulama içi bildirim — backend `UserNotificationDto`.
 *
 * `kind` akış kaynaklı bildirimlerde backend `WorkflowNotifyKinds` değeridir;
 * metin istemcide `notification.kind.<kind>` anahtarıyla çevrilir.
 */
export interface UserNotification {
  id: number;
  kind: string;
  /** Görev adı — çeviri metnine `{name}` olarak girer. */
  title: string;
  /** Kayıt etiketi (ör. "Siparis #12"). */
  body?: string | null;
  /** Tıklanınca gidilecek uygulama içi yol (ör. "/tasks/12"). */
  link?: string | null;
  taskId?: number | null;
  createdAt: string;
  readAt?: string | null;
}
