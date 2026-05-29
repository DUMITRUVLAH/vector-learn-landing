# COMM-205 Integration Report

## Verdict: CONNECTED

- notification_queue table → tenants (cascade)
- NotificationService queues items with quiet hours + spam check
- flushQueue processes due items via MessagingService (COMM-201)
- Lesson PATCH trigger → studentLessons → notificationQueue (fire-and-forget)
- Payment reminders → queued per overdue payment student
- POST /api/notifications/flush → 200 {processed, skipped, errors}
- POST /api/notifications/payment-reminders → 200 {queued, skipped_consent}
