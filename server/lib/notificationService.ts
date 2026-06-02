/**
 * COMM-205: Notification service — queue channel-specific notifications.
 * Currently a no-op stub; real SMS/email dispatch is wired via external provider
 * when NOTIFICATION_PROVIDER env var is set.
 */

interface QueueNotificationPayload {
  tenantId: string;
  recipientType: "student" | "user";
  recipientId: string;
  channel: "sms" | "email" | "push" | "in_app";
  payload: {
    body?: string;
    subject?: string;
    [key: string]: unknown;
  };
}

/**
 * Queue a notification for delivery.
 * Fire-and-forget safe — never throws to caller.
 */
async function queueNotification(opts: QueueNotificationPayload): Promise<void> {
  // Stub: log in dev, no-op in prod until real provider is wired
  if (process.env.NODE_ENV !== "production") {
    process.stdout.write(
      `[notificationService] channel=${opts.channel} recipientId=${opts.recipientId} body=${opts.payload.body ?? ""}\n`
    );
  }
  // TODO: wire real SMS/email provider here
}

export const notificationService = {
  queueNotification,
};
