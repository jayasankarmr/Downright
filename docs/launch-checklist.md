# Downright — launch checklist

The sequencing matters: **Edge first** (free, no fee, and it's where ~50,000 users of
the dead incumbent are stranded), Chrome after Edge is live (₹440 one-time fee), Firefox
alongside. You can be live on Edge without spending a rupee.

## Your four jobs (nobody else can do these)

### 1. GitHub account + repo — do this now (~10 min)

1. Create the repository (suggested name `downright`, public).
2. Push this project:
   ```bash
   git remote add origin git@github.com:<your-username>/downright.git
   git push -u origin main
   ```
   CI runs automatically on push (syntax check → no-network audit → unit tests →
   conversion suite in headless Chrome → store zips as downloadable artifacts).
3. For unattended maintenance later, create a fine-grained personal access token scoped
   to just this repo (Contents + Issues + Pull requests, read/write) and share it with
   me in a session — that's what lets the weekly watch file issues and push fixes.
4. Replace the two `<your-username>` / `REPLACE-ME` placeholders:
   - `README.md` (store links section when live)
   - `src/options/options.html` (the source-code link)
   - the listing docs in `docs/`

### 2. Microsoft Partner Center account — before Edge submission (~15 min, free)

1. Sign in at https://partner.microsoft.com/dashboard/microsoftedge/public/login with
   any Microsoft account.
2. Register as a developer (individual). No fee for Edge.
3. Then submit: **New extension** → upload `dist/downright-1.0.0-chromium.zip` → fill
   the form by pasting from [store-listing-edge.md](store-listing-edge.md) → upload the
   logo + 4 screenshots from `store-assets/` → submit.
4. Typical certification: 1–7 business days. The listing goes live automatically.

### 3. Chrome developer account — after Edge is live (~10 min, ₹440 one-time)

1. https://chrome.google.com/webstore/devconsole → pay the one-time $5 registration.
2. **New item** → upload the same chromium zip → paste from
   [store-listing-chrome.md](store-listing-chrome.md), including the Privacy tab
   questionnaire (it gates review).
3. Because there are no host permissions and no remote code, expect the fast review
   path (typically 1–3 days).

### 4. Firefox (AMO) — free, anytime (~10 min)

1. https://addons.mozilla.org/developers/ → sign in with a Firefox account.
2. Submit `dist/downright-1.0.0-firefox.zip` → paste from
   [store-listing-firefox.md](store-listing-firefox.md).

### Later, only if/when Pro ships: Gumroad + PAN + bank (~20 min)

Not needed for launch. The free tier is the product; Pro (bulk clip of all tabs, output
profiles, clip history) is an experiment to run once there are users.

## Before each submission (mechanical, I do these)

- [ ] `bash scripts/run-tests.sh` → PASS 20/20
- [ ] `node --test tests/unit.test.mjs` → all pass
- [ ] `bash scripts/check-no-network.sh` → clean
- [ ] `bash scripts/build.sh` → fresh zips in `dist/`
- [ ] Version bumped in **both** manifests + `CHANGELOG.md` entry (for updates)

## Launch week (one honest hour, in your own words)

Store search brings installs on its own — that's why this is a store-distributed
product — but the first few hundred come faster if a human posts it once where it
belongs. Good venues: the Obsidian community forum/Discord (share & showcase), a
note-taking or AI-tools subreddit, Show HN. I'll draft any of these on request; posting
is yours, in your own voice. Don't post anywhere that prohibits promotional or
automated accounts.

## After Edge is live — ask me to set up the weekly watch

One scheduled task, weekly: re-run the conversion suite against live target pages and
file a GitHub issue on any regression; check new store reviews for real bugs; watch
whether MarkSnip has shipped an Edge listing (the single biggest competitive risk);
draft replies to support mail; log install counts. Needs the GitHub token (job 1), and
Gmail/Notion connections only if you want those parts.

## Known risks, so nothing surprises you

- **MarkSnip ships to Edge** → the vacuum closes. This is why Edge submission happens
  this week, not after polish.
- **A store rejects the listing** → the certification notes in each listing doc
  preempt the usual questions (single purpose, no remote code, permission rationale).
  If it still happens, send me the rejection text; turnaround on a fix is usually a day.
- **A browser ships "copy page as Markdown" natively** → no recourse; the maintenance
  cost here is deliberately near-zero so the downside is time, not money.
