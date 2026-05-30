/**
 * CRM-131 — LeadCardSkeleton
 * Animated skeleton for the LeadCardPage while data is loading.
 * Replaces the Loader2 spinner with a content-shaped placeholder.
 */

export function LeadCardSkeleton() {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 animate-pulse"
      aria-label="Se încarcă cartonașul lead..."
      aria-busy="true"
    >
      {/* ── Left column ── */}
      <aside className="space-y-4">
        {/* Stage + score card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="h-2.5 w-16 rounded bg-muted" />
          <div className="h-6 w-32 rounded-full bg-muted" />
          <div className="h-2.5 w-20 rounded bg-muted" />
          <div className="h-6 w-24 rounded-full bg-muted" />
          <div className="h-2.5 w-24 rounded bg-muted" />
          <div className="h-5 w-28 rounded bg-muted" />
        </div>

        {/* Contact info card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Name */}
          <div className="space-y-1.5">
            <div className="h-2 w-20 rounded bg-muted" />
            <div className="h-5 w-40 rounded bg-muted" />
          </div>
          {/* Phone */}
          <div className="space-y-1.5">
            <div className="h-2 w-16 rounded bg-muted" />
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-32 rounded bg-muted" />
              <div className="flex gap-1">
                <div className="h-7 w-14 rounded-md bg-muted" />
                <div className="h-7 w-10 rounded-md bg-muted" />
              </div>
            </div>
          </div>
          {/* Email */}
          <div className="space-y-1.5">
            <div className="h-2 w-12 rounded bg-muted" />
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-44 rounded bg-muted" />
              <div className="h-7 w-14 rounded-md bg-muted" />
            </div>
          </div>
          {/* Course */}
          <div className="space-y-1.5">
            <div className="h-2 w-28 rounded bg-muted" />
            <div className="h-5 w-36 rounded bg-muted" />
          </div>
          {/* Meta */}
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-full bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-full bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
          {/* Notes */}
          <div className="space-y-1.5">
            <div className="h-2 w-12 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
          </div>
          {/* Tags */}
          <div className="space-y-1.5">
            <div className="h-2 w-16 rounded bg-muted" />
            <div className="flex gap-1">
              <div className="h-5 w-14 rounded-full bg-muted" />
              <div className="h-5 w-18 rounded-full bg-muted" />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <div className="h-10 w-full rounded-xl bg-muted" />
          <div className="h-9 w-full rounded-xl bg-muted" />
        </div>
      </aside>

      {/* ── Right column ── */}
      <main>
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border mb-4 pb-0">
          {[80, 100, 72, 96, 80, 56].map((w, i) => (
            <div
              key={i}
              className="rounded-t-md h-9 bg-muted"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>

        {/* Note compose skeleton */}
        <div className="mb-4 flex gap-2">
          <div className="flex-1 h-10 rounded-md bg-muted" />
          <div className="h-10 w-20 rounded-md bg-muted" />
        </div>

        {/* Timeline skeleton rows */}
        <ul className="space-y-3" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <li key={i} className="flex gap-3">
              <div className="mt-1 h-6 w-6 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-16 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-2/3 rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
