Task: Mobiledets - Project Intake
Execution Owner: Qwen
Execution Mode: Local bounded execution
Action Plan:
1. Re-read the task page, constraints, and the validated GPT plan.
2. Execute only the bounded work required by the approved task.
3. Stop and escalate immediately if execution would widen scope or violate guardrails.
4. Record exact outputs, blockers, and verification notes back into the task artifacts.
Verification:
- Confirm the intended artifact or outcome exists.
- Run the narrowest relevant verification step available.
- Report exact failure details if verification does not pass.
GPT Plan Reference:
Scope summary
- Build a single-page Next.js site for a mobile detailing business (Mobiledets) with: hero, gallery with image modal, testimonials, quote/contact form, dark theme with light blue accents, MongoDB-backed submissions, deployable on Vercel.
- v1 excludes calendar sync and customer dashboard; deliver a documented, concrete plan for both.
Recommended architecture
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS; Next/Image for optimized images; simple lightbox/modal for gallery.
- Theming: Tailwind dark theme with blue accent tokens; system-preferred dark with forced dark at launch.
- Forms: Client form with Zod schema, server-side validation and sanitization (sanitize-html); honeypot + rate limit.
- Backend: Next.js Route Handlers (app/api/*) for form submission; MongoDB Atlas via official Node driver; minimal model layer.
- Email notifications: Use transactional email provider via SMTP/API (e.g., Resend/SendGrid/SMTP relay). NOTE: Vercel cannot host a built-in email server. Escalation required to pick a provider. Until then, store to DB and make email step optional/no-op behind a feature flag.
- Security: Input validation, output encodi
ng, CSRF avoided via same-site POST and server actions/route handlers, rate limiting by IP, logging with Pino-lite.
- Calendar sync plan (not in v1 build): Provide authenticated or unlisted ICS feed URL for bookings; iPhone Calendar can subscribe; one-way read sync. Optional .ics download per booking.
- Customer dashboard plan (not in v1 build): NextAuth (email magic link or OAuth) + role-based access; customer can view past quotes/appointments and request new ones; protected routes; same MongoDB.
- Deployment: Vercel project; environment variables via Vercel + .env.local (example only). All local file paths under E:\Mobiledets.
Key risks and assumptions
- Risk: “Email server built in” is incompatible with Vercel. Assumption: use third-party email provider; otherwise, skip email in v1. Escalate for provider choice and credentials.
- Risk: iPhone two-way calendar sync with iCloud is not feasible. Assumption: one-way ICS subscription is acceptable.
- Risk: Anti-spam needs captcha keys. Assumption: start with honeypot + rate limit; add hCaptcha/Turnstile later if needed.
- Assumption: Placeholder images/testimonials allowed; brand content and copy to be supplied later.
- Assumption: MongoDB Atlas connection string to be provided post-approval; use placeholder in .env.local.example.
- Assumption: Single page for v1; future expansion to multi-page allowed post-approval.
- Process: Do not bypass Notion review or local mirror; all tasks gated for review before implementation.
Open questions for operator review
- Email: Which provider (Resend, SendGrid, Mailgun, SMTP relay)? Sender domain and from-address?
- MongoDB: Provide Atlas cluster URI, database name, and collection naming preferences.
- Form: Required fields, service menu options, service areas, consent/terms text, dest
ination email for notifications.
- Anti-spam: Approve honeypot + IP rate limit for v1; do we need hCaptcha/Turnstile now?
- Branding: Logo, hex palette for blue accent, typography preference, favicon/social preview assets.
- Gallery: Provide 6–12 images or approve placeholders; any before/after labeling?
- Testimonials: Provide 3–5 real quotes or approve placeholders.
- Domain + Vercel: Target domain/subdomain, Vercel project/org to use, analytics (if any).
- Calendar sync: Is one-way ICS subscription sufficient? Any private feed authentication needed?
- Dashboard: Authentication method preference (magic link vs OAuth), scope for MVP.
Proposed v1 milestone
- Deliver a deployable, single-page Next.js app on Vercel with: hero, gallery + modal, testimonials, quote/contact form, dark theme with blue accents, MongoDB-backed submissions. Email notification step is integrated but feature-flagged until provider credentials are approved. Include a written, actionable plan for iPhone calendar sync and customer dashboard (v1.1/v2), with API shapes and endpoints.
Implementation backlog
Note: Planning only. No code execution. All file writes must be under E:\Mobiledets. Each task is reviewable, sized for codex-mini.
1) Project scaffold
- Goal: Initialize Next.js 14 App Router + TS + Tailwind.
- Files: E:\Mobiledets\package.json, next.config.js, tsconfig.json, postcss.config.js, tailwind.config.js, app\layout.tsx, app\page.tsx, styles\globals.css.
- Verify: Dev server runs locally; base route renders.
2) Tailwind theme and tokens
- Goal: Configure dark theme with blue accents.
- Files: tailwind.config.js, styles\globals.css, app\globals.css or equivalent.
- Verify: Background/text colors correct; contrast AA for text/buttons.
3) Global UI shell
- Goal: Header with logo/CTA, footer wi
th contact basics; responsive.
- Files: app\components\Header.tsx, Footer.tsx; app\layout.tsx updates.
- Verify: Mobile menu works; links anchor-scroll correctly.
4) Hero section
- Goal: Headline, subcopy, primary CTA to quote form; background image optional.
- Files: app\components\Hero.tsx; placeholder image in public\images.
- Verify: Lighthouse performance acceptable; content scales on mobile.
5) Gallery with modal
- Goal: Grid of images; clicking opens modal/lightbox with swipe on mobile.
- Files: app\components\Gallery.tsx, app\components\ImageModal.tsx; public\images\gallery\* (placeholders).
- Verify: Keyboard navigation (Esc, arrows); no layout shift.
6) Testimonials section
- Goal: 3–5 testimonials, slider or static cards.
- Files: app\components\Testimonials.tsx; data\testimonials.json (placeholders allowed).
- Verify: Content readable, accessible markup.
7) Quote/contact form UI
- Goal: Fields: name, email, phone, service type, vehicle, preferred date/time, message; consent checkbox; honeypot.
- Files: app\components\QuoteForm.tsx; lib\validation\quote.ts (Zod schema).
- Verify: Client-side validation errors; honeypot hidden.
8) API route and DB model
- Goal: POST /api/quote to validate, sanitize, store to MongoDB.
- Files: app\api\quote\route.ts, lib\db\client.ts, lib\db\schemas\quote.ts, lib\security\sanitize.ts.
- Verify: Submissions saved; rejects invalid or spammy inputs.
9) MongoDB connection util
- Goal: Singleton client for Vercel lambdas; env-driven URI.
- Files: lib\db\client.ts, .env.local.example (placeholders only), README.md updates.
- Verify: Handles cold/warm starts; errors logged with no secrets.
10) Email notification integration (feature-flagged)
- Goal: Abstraction to send email via provider; no-op if keys absent.
- Files: lib\email\send.
ts, app\api\quote\route.ts integration, .env.local.example.
- Verify: When keys present, sends owner notification; when absent, logs no-op.
11) Rate limiting and anti-spam
- Goal: Simple IP-based sliding window; honeypot check.
- Files: lib\security\rateLimit.ts, app\api\quote\route.ts integration.
- Verify: Excess requests return 429; honeypot triggers drop.
12) SEO and metadata
- Goal: Title, description, Open Graph image, favicon.
- Files: app\layout.tsx metadata, public\favicon.ico, public\og.png.
- Verify: View page source; social share preview correct.
13) Accessibility pass
- Goal: Landmarks, labels, focus order, color contrast.
- Files: Minor updates across components.
- Verify: Axe/lighthouse a11y > 95; keyboard-only usable.
14) Deployment config
- Goal: Vercel config and build settings; environment variable docs.
- Files: vercel.json (if needed), README.md deployment steps.
- Verify: Preview deploy succeeds; env vars read correctly.
15) Logging and error handling
- Goal: Basic request logging and structured errors without leaking PII.
- Files: lib\logging\logger.ts, wrap API handler.
- Verify: Logs visible; errors obfuscate sensitive fields.
16) ICS calendar plan doc + stub endpoint (documentation-first)
- Goal: Document ICS feed approach; add stub route returning sample .ics (disabled by default).
- Files: docs\calendar-plan.md, app\api\calendar\route.ts returning 501 or sample when enabled.
- Verify: Doc includes URL pattern, auth options; stub returns text/calendar when toggled.
17) Dashboard plan doc
- Goal: Document NextAuth choice, data model, protected routes, MVP screens.
- Files: docs\dashboard-plan.md with sequence diagrams and API shapes.
- Verify: Reviewable doc with scopes, risks, and prerequisites.
18) Content placeholders and copy slots
- Goal: 
Centralize text constants; mark TODOs for brand content.
- Files: content\site.ts, content\services.ts.
- Verify: Easy to replace during content review.
19) QA checklist and test cases
- Goal: Manual test matrix for form, rate limits, modal, responsive breakpoints.
- Files: docs\qa-checklist.md.
- Verify: Operator can run through and sign off.
20) Notion/local mirror review gates
- Goal: Create review checklist and gating steps before merge/deploy.
- Files: docs\review-gates.md.
- Verify: Steps align with guardrails; no direct repo writes without approval.
Allowed assumptions used
- Placeholder images and testimonials are acceptable for v1.
- Email provider not chosen; feature-flag email sending until credentials are provided.
- One-way ICS feed is acceptable unless operator requests two-way (not supported with iCloud APIs).
- No legal copy included; consent checkbox uses placeholder text until provided.
Escalation points
- Selecting and configuring email provider and from-domain.
- Providing MongoDB Atlas URI and database details.
- Deciding captcha usage and keys.
- Approving ICS read-only approach and whether the feed must be private/authenticated.
- Finalizing brand assets, copy, gallery photos, testimonials.
- Domain and Vercel project ownership for deployment.
