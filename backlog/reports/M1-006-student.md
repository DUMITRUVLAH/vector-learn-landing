# M1-006 — Rapoarte și analize · Persona review (Maria + Cristina)

**Context**: Director's B2B dashboard page. Not aimed at student/parent — but evaluated for whether the data shown *about people like us* feels respectful.

**Verdict**: Cristina = MIXED LEAN-DISLIKE · Maria = NEUTRAL (doesn't see herself, but flagged one thing)

---

## Cristina (mom, 41) — primary concern

### Top 5 elevi după LTV — uncomfortable

Reading the table, my eye stopped immediately:

> #1 · **Maria Popescu** · Engleză B2 · 24 luni · €4.280

That's literally my daughter's first name. And even if it's a different Maria, the point lands: **this is a leaderboard of children ranked by how much money their parents have paid.** Full name, course, months loyal, lifetime euros.

I get it — directors need to know who their top customers are. But:
1. Calling it "Top 5 elevi după LTV" frames *the child* as the unit of revenue. It should be "Top 5 familii" or "Top 5 conturi" — the parent pays, not the kid.
2. Showing full names on a marketing/demo page (even fake) signals "this is what the real product looks like." If I'm a director showing this dashboard on a screen during a meeting, any visitor walks past and sees five named children with their euro values. That's not okay.
3. No mention of consent, anonymization toggle, or role-based access. The spec/page doesn't say "directors only, audit-logged."

**Ask**: either anonymize ("M.P. · Engleză B2") in the demo, or add a visible note like "în produsul live: nume mascate by default, dezvăluire pe click cu audit log." That single sentence would calm me down a lot.

### "Predicție churn cu motive identificate" — actually worse on second read

Section 3 bullet list:
> "Motive: prezență scăzută, plăți întârziate, lipsă engagement" + "Risk score per elev (0-100)"

So somewhere in this system, my Maria has a **number from 0 to 100 predicting if she'll quit**, with reasons attached that include *my late payments*. The page shows this only as a capability description (no individual rendered), which is the right choice — but the framing "Risk score per elev" makes it feel like the kid is being scored, not the subscription.

It would land better as "Risk score per abonament" with motive "plăți întârziate" attributed to the account, not flagged against the child.

### Trust delta

I came in TRUSTING after M1-005 (Maria's moment was genuinely warm). This page nudges me back toward cautious. Not broken — this is a director tool, fine — but the LTV table with named kids in the demo data is the one concrete thing I'd want fixed.

---

## Maria (14)

Skimmed. KPI cards, charts, money numbers. Not for me. **Closed in 4 seconds.**

One thing though: I saw a "Maria Popescu" at the top of a leaderboard. For half a second I thought the app was showing *me* to someone. Then I realized it's the director's view of fake data. Still — putting "Maria" first in the demo is a weird coincidence given M1-005 was literally about me. Maybe use a different first name in the seed data so it doesn't feel like Maria-the-product-mascot is being monetized.

Tone: director-y, fine. Doesn't talk down. Doesn't try to be cool. Good — don't.

---

## Summary for backlog

- **Maria**: NEUTRAL · flag: change demo top-student name away from "Maria"
- **Cristina**: LEAN-DISLIKE on Top 5 LTV table (named children + euro values, no anonymization/access note); LEAN-DISLIKE on "risk score per elev" framing
- **Feed into M2**: (a) anonymize demo data on director surfaces, (b) reframe "elev" → "abonament/familie" where the metric is financial, (c) add a one-liner about role-based access + audit log on this page so parents touring the site feel safer
