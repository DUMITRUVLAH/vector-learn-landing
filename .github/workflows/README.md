# Autopilot pe GitHub Actions

`autopilot.yml` rulează pipeline-ul de build pe serverele GitHub — **independent de laptopul tău**
(merge și când e stins). Pornește pe cron (la 6 ore) și manual din tab-ul **Actions → Autopilot →
Run workflow**.

## Ce trebuie să faci o singură dată: adaugă cheia de autentificare

Workflow-ul NU rulează până nu adaugi un secret. Alege **una** din variante:

### Varianta A — API key (pay-as-you-go, facturare per token)
```bash
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."   # din console.anthropic.com
```

### Varianta B — abonamentul tău Claude (fără cost suplimentar per token)
```bash
claude setup-token                                     # generează un OAuth token
gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "<token>" # lipește tokenul generat
```

> Nu e nevoie de alt token pentru git/PR-uri: `GITHUB_TOKEN` e injectat automat de Actions și are
> deja drepturi de `contents: write` + `pull-requests: write`.

## Cum funcționează „continuu" fără laptop

- Fiecare rulare construiește un **batch bounded** (default 2 item-uri), apoi se oprește curat.
- Starea trăiește în `backlog/STATE.json` (commis pe `main`). Rularea următoare o citește proaspăt
  și continuă de unde a rămas — deci cron-ul la 6 ore avansează backlogul în timp.
- Un item = un branch `feat/CRM-xxx` + un PR. Tu revizuiești și merge-uiești PR-urile când vrei.

## Reglaje
- Frecvența: editează `cron` în `autopilot.yml`.
- Câte item-uri per rulare / ce model: parametri la **Run workflow** (manual) sau valorile default.
- Oprire: dezactivează workflow-ul din tab-ul Actions, sau șterge fișierul.

## Costuri & atenționări
- Build-ul de feature-uri consumă tokeni — varianta A se facturează; varianta B folosește
  abonamentul (atenție la limite de fair-use pentru rulări headless).
- PR-urile sunt deschise automat de bot; nimic nu se merge-uiește singur în `main` (doar
  `STATE.json`/`BACKLOG.md` sunt actualizate pe `main` de orchestrator, ca și local).
