# COMM-205 Code Review — Cycle 1

## Verdict: APPROVED

### TypeScript
- Zero any
- NotificationService constructor injects DB — testable
- NotificationPayload interface explicit
- RecipientType, NotificationType enums exported
- SPAM_CAP constant named clearly

### Quiet hours
- Intl.DateTimeFormat used for timezone-aware hour detection
- Fallback to "now" if timezone parsing fails — safe
- scheduledFor computed from local 08:00 string + date adjustment for passed time

### Anti-spam
- Counts messages from both `messages` table (sent) and `notification_queue` (pending)
- >= SPAM_CAP (3) → inserts with skippedReason="spam_cap"
- Uses 7-day rolling window via gte(createdAt, 7daysAgo)

### Integration
- CONNECTED: notification_queue → tenants (cascade)
- NotificationService.queueNotification called from lesson PATCH hook (fire-and-forget)
- POST /api/notifications/flush → flushQueue → MessagingService.sendMessage
- POST /api/notifications/payment-reminders → queues per overdue payment
- Lesson reschedule: studentLessons join to get students per lesson

### Adversarial
- Fire-and-forget in lesson hook: failure silently swallowed — doesn't break lesson update
- Consent check in flushQueue: leads with consent_revoked_at → skipped
- Tenant isolation: all queries eq(tenantId)

### Migration
- 0010_comm205_notification_queue.sql committed + applied
- tenants.timezone column added with default "Europe/Bucharest"
