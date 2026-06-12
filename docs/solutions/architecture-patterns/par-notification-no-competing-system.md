---
title: "PAR notifications: reuse inAppNotifications directly, not NotificationService"
problem_type: architecture-pattern
module: PAR
tags: [par, notifications, in-app, competing-system, messaging-service, internal-users]
symptoms: "Need to notify internal users (approvers, finance, requestors) about PAR workflow events without building a new notification system"
severity: design
date: 2026-06-12
---

## Pattern

When a module needs to notify **internal users** (not leads/students) about events:

## Root cause of the trap

`NotificationService` (in `server/services/notifications/`) only accepts `lead` and `student` as `RecipientType`. Using it for internal user notifications → type error + runtime failure.

## Fix: write directly to inAppNotifications

```ts
// server/services/par/notify.ts
await db.insert(inAppNotifications).values({
  tenantId,
  recipientUserId: userId,  // internal user UUID
  kind: "par",              // module-specific kind for filtering
  payload: {
    body: "PAR-2026-0001 awaits your approval...",
    par_id: parId,          // extend InAppNotificationPayload with module-specific fields
  },
});
```

## Email: use MessagingService directly

```ts
await messagingService.sendMessage(tenantId, {
  channel: "email",
  toAddress: user.email,    // internal user email, not lead
  subject: "[PAR] awaits approval",
  body: "...",
  // no leadId or studentId → skips consent check
});
```

## Extending InAppNotificationPayload

The `payload` column is jsonb — extending the TypeScript interface is backward-compatible (no migration needed):

```ts
export interface InAppNotificationPayload {
  body: string;
  lead_id?: string;        // existing CRM fields
  par_id?: string;         // new module adds its own optional field
}
```

## How to avoid next time

- For internal user notifications: `db.insert(inAppNotifications)` directly, `kind = "<module>"`
- For lead/student external notifications: `NotificationService.queue()`
- For email to internal users: `MessagingService.sendMessage()` with `toAddress = user.email`
- All notification calls should be fire-and-forget (try/catch, never crash the caller)
- Never build a new notification table for a new module — extend the existing one
