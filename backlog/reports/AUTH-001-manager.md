# AUTH-001 — Manager Persona Review (Andreea Mitran)

**Verdict: BUY**

**What I like:**
- "Am uitat parola" link is right where I look — under the login button. Teachers and receptionists forget passwords weekly; this saves me admin time every Friday.
- Anti-enumeration is the right call: I don't want random people figuring out who's registered.
- Rate limit prevents abuse by students trying to lock out staff.
- Clear confirmation screen with "didn't receive the email → try again" fallback.

**Friction:**
- 1-hour expiry window is tight. I sometimes check email once in the morning and once in the evening — if I request the link during breakfast and check at dinner, it's expired. Suggest increasing to 24h or at least 4h.
- No mention of email provider in the UI; if email goes to spam the director has no recourse shown in the UI. A small note "Check spam too" on the success screen would help.

**Blocking issues:** None
