Scope summary
- v1: Single-page Next.js (App Router) site with hero, gallery (modal), testimonials, quote/contact form (MongoDB-backed), dark theme with blue accents. Hosted on Vercel. Placeholder images/testimonials allowed.
- Out of scope v1 (plan only): iPhone calendar sync, customer dashboard, production email notifications unless approved.

Recommended architecture
- Frontend: Next.js (14+, App Router), TypeScript, Tailwind CSS. Components: Hero, Gallery+Modal, Testimonials, QuoteForm, Layout, UI primitives (Button, Input, Modal).
- API: Next.js Route Handler at /api/contact (Node runtime). Validation with Zod. Sanitization server-side. Honeypot spam trap.
- Data: MongoDB Atlas (native mongodb driver). Collections: leads (quote/contact submissions). Minimal schema for v1.
- Config: env via .env (MONGODB_URI, optional EMAIL_* placeholders). No secrets in repo; include .env.example only.
- Hosting: Vercel (Node 18+). vercel.json for runtime config; image domains for placeholder images if remote.
- Theming: Tailwind dark theme with blue accents via extended color palette.
- Calendar sync (planned): ICS subscription feed endpoint (/api/ics) with webcal/https subscription for Apple Calendar. Requires operator decision before implementation.
- Dashboard (planned): Next.js route group (/client) gated by simple passwordless/email link in future; not in v1.

Key risks and assumptions
- Risks: Missing calendar method; dashboard scope creep; spam/abuse on form; email provider choice; Mongo URI and Vercel project not provided; legal/privacy copy absent; serverless cold starts; rate-limiting on Vercel without durable storage.
- Assumptions used: Placeholder images/testimonials permitted. Placeholder env values allowed in .env.example only. Calendar sync and dashboard planned, not implemented in v1. MongoDB Atlas and Vercel will be provided later.

Open questions for operator review
1) Calendar: Approve approach (ICS subscription feed via webcal/https) or request CalDAV/third-party.
2) Dashboard: Exclude from v1? If yes, confirm plan-only.
3) Quote/contact fields: Required fields list (suggested: name, email, phone, vehicle make/model/year, service type, preferred date/time window, address or service area, message, consent checkbox).
4) Branding: Logo, brand name, tagline, color codes, preferred font. If none, proceed with placeholders and Tailwind defaults.
5) Gallery/testimonials: Any real assets or names to include now? If none, proceed with placeholders.
6) Email notifications: Provider (Resend, SendGrid, SMTP) and from address. If unavailable, skip in v1.
7) Domain and Vercel: Project slug, team, desired domain. Are placeholders acceptable for first deploy?
8) MongoDB: Provide Atlas URI and database/collection names, or approve placeholder/local-only wiring for v1 demo.
9) Privacy/legal: Provide or approve placeholder minimal notice. We will not invent legal copy.

Proposed v1 milestone
- Deliverable: Deployable single-page site on Vercel (preview) with working hero, gallery modal, testimonials, and quote/contact form persisting to MongoDB. Dark theme with blue accents. Basic validation/sanitization and honeypot spam trap. Documentation includes calendar sync and dashboard plans. No real emails sent unless provider approved.
- Acceptance: Manual tests confirm successful submission stored in MongoDB, gallery modal opens/closes, responsive layout, lighthouse passable on mobile, Notion-reviewed and mirrored before deployment.

Implementation backlog (bounded, codex-mini-sized). All file paths rooted at E:\Mobiledets. Each task independently reviewable.
1) Repo scaffold
- Action: Initialize Next.js (App Router, TS) project structure.
- Files: E:\Mobiledets\package.json, next.config.js, tsconfig.json, app\layout.tsx, app\page.tsx, app\globals.css, .gitignore, README.md
- Verify: npm run build succeeds locally; default page renders.

2) Tailwind setup and theme
- Action: Add Tailwind, PostCSS config, dark theme with blue accents.
- Files: E:\Mobiledets\tailwind.config.ts, postcss.config.js, app\globals.css
- Verify: Classes apply; dark bg and blue accents visible on sample components.

3) Global layout and metadata
- Action: Define site metadata, font, header/footer shells.
- Files: app\layout.tsx, app\(components)\Header.tsx, app\(components)\Footer.tsx
- Verify: Title/description present; header/footer render on all pages.

4) UI primitives
- Action: Create Button, Input, Textarea, Modal, Section, Container.
- Files: app\(components)\ui\Button.tsx, Input.tsx, Textarea.tsx, Modal.tsx, Section.tsx, Container.tsx
- Verify: Components render, accept className/props, Modal toggles via state.

5) Hero section
- Action: Implement hero with CTA scroll-to-form.
- Files: app\(components)\Hero.tsx, app\page.tsx (compose)
- Verify: CTA scrolls to form id; responsive layout.

6) Gallery with modal
- Action: Static gallery grid using placeholder images; click => modal with keyboard nav.
- Files: app\(components)\Gallery.tsx, public\images\placeholders\... (names only; can use remote URLs if preferred)
- Verify: Modal opens, arrow keys navigate, escape closes; mobile pinch-zoom OK.

7) Testimonials section
- Action: Static testimonials with placeholders; optional stars.
- Files: app\(components)\Testimonials.tsx, app\data\testimonials.ts
- Verify: Content displays responsively; accessible markup.

8) Quote/contact form UI
- Action: Form fields and client-side validation UX (non-blocking).
- Files: app\(components)\QuoteForm.tsx
- Verify: Required indicators; submit disabled during pending; success/error toasts.

9) Validation schema (Zod)
- Action: Define server-side schema for submission.
- Files: app\lib\validation.ts
- Verify: Invalid payload rejected in unit test stub.

10) MongoDB connection utility
- Action: Create reusable Mongo client singleton.
- Files: app\lib\db.ts
- Verify: Build succeeds; no runtime connection until API uses it.

11) Lead model and repository
- Action: Define TypeScript type and insert/find helpers using native driver.
- Files: app\lib\leads.ts
- Verify: Unit test stub compiles; type safety enforced.

12) API route: POST /api/contact
- Action: Validate, sanitize, honeypot check, insert into Mongo, return 200/400.
- Files: app\api\contact\route.ts
- Verify: curl POST with valid payload => 200; invalid => 400; honeypot => 204 or 200 fake-ok.

13) Env example and config docs
- Action: Provide .env.example and notes; do not add secrets.
- Files: .env.example, docs\config.md
- Verify: Contains MONGODB_URI, optional EMAIL_* placeholders; no values.

14) Basic spam mitigation
- Action: Add hidden honeypot field and server check; basic debounce on client.
- Files: app\(components)\QuoteForm.tsx, app\api\contact\route.ts
- Verify: Honeypot filled => ignored; normal submits unaffected.

15) Content constants
- Action: Centralize brand name, tagline, services, service areas as placeholders.
- Files: app\data\site.ts
- Verify: Components read from constants; easy to swap later.

16) SEO and social basics
- Action: metadata, OpenGraph, twitter meta, favicon placeholders, robots.
- Files: app\layout.tsx (metadata export), public\favicon.ico, app\robots.txt
- Verify: Meta present in head; /robots.txt accessible.

17) Styling polish (dark + blue)
- Action: Ensure consistent dark backgrounds, blue accents, focus states.
- Files: tailwind.config.ts, app\globals.css, minor component tweaks
- Verify: Accessible contrast (WCAG AA) via quick audit.

18) Optional email notification stub (behind env flag)
- Action: Add sendNotification() that no-ops without EMAIL_PROVIDER; wire after insert.
- Files: app\lib\notify.ts, app\api\contact\route.ts, .env.example (EMAIL_*)
- Verify: With no envs, function skips; route still returns 200.

19) Vercel config and build docs
- Action: vercel.json for Node runtime, image domains; deployment instructions.
- Files: vercel.json, docs\deploy.md
- Verify: vercel.json validates; docs outline steps and Notion -> mirror -> review gate.

20) QA checklist and manual test plan
- Action: Create checklist for UI, form, Mongo persistence, responsive, accessibility.
- Files: docs\qa-checklist.md
- Verify: Checklist covers core paths; ready for review.

21) Calendar sync plan (doc only)
- Action: Document ICS feed approach and data model; defer implementation.
- Files: docs\calendar-sync-plan.md
- Verify: Includes endpoint shape, auth (if any), subscription steps on iPhone.

22) Dashboard plan (doc only)
- Action: Document future dashboard MVP (auth, views, data).
- Files: docs\dashboard-plan.md
- Verify: Scopes v0.1 features; notes risks/deps.

23) Accessibility pass
- Action: Add aria labels, focus traps in modal, keyboard nav checks.
- Files: components touched: Modal, Gallery, QuoteForm
- Verify: Keyboard-only flow works; lighthouse accessibility >= 90.

24) Local run script and instructions
- Action: Add npm scripts and docs for local dev.
- Files: package.json (scripts), docs\local-dev.md
- Verify: npm run dev starts server; docs accurate.

Verification and review flow
- All changes go through Notion -> local mirror -> review before any deploy. No direct repo or cloud writes. All file paths under E:\Mobiledets.

Escalation points
- Blocked without: calendar method decision, v1 dashboard inclusion decision, final form fields, branding assets, MongoDB URI, Vercel project/domain, email provider (if including notifications), legal/privacy copy.
- On any blocker, pause and report exactly which decision/file is missing and how it impacts architecture or production readiness.
