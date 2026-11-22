/**
 * In-app notification in the topbar bell — backend `UserNotificationDto`.
 *
 * For workflow-originated notifications `kind` is a backend `WorkflowNotifyKinds` value;
 * the text is translated on the client with the `notification.kind.<kind>` key.
 */
export interface UserNotification {
  id: number;
  kind: string;
  /** Task name — goes into the translation text as `{name}`. */
  title: string;
  /** Record label (e.g. "Siparis #12"). */
  body?: string | null;
  /** In-app path to navigate to on click (e.g. "/tasks/12"). */
  link?: string | null;
  taskId?: number | null;
  createdAt: string;
  readAt?: string | null;
}
