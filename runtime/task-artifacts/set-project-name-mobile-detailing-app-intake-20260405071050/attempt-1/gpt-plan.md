Scope summary
- Project name: Mobile Detailing App (single-page marketing + lead intake)
- In v1 (ship-ready):
  - Next.js single-page site (hero, services highlights, gallery with modal, testimonials, quote/contact form)
  - Dark theme with blue accents
  - Form submissions stored in MongoDB
  - Deployable on Vercel
  - Documentation for calendar sync approach and dashboard (not implemented unless approved)
- Out of v1 (document only):
  - iPhone calendar sync (implementation pending method selection)
  - Customer dashboard (pending scope decision)
  - Email notifications (nice-to-have; spec only unless explicitly added)

Recommended architecture
- Stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS; Node 18+ runtime on Vercel
- Page structure: Single route “/” with sections (Hero, Services, Gallery, Testimonials, Quote/Contact)
- State mgmt: Local React state only; no global store needed for v1
- Styles/theme: Tailwind with custom dark palette and blue accents; focus-visible styles; prefers-color-scheme respected
- Assets: Placeholder images under E:\Mobiledets\public\gallery; logos/brand assets TBD
- Testimonials: Static JSON file (placeholder content) consumed by a presentational component
- Data: MongoDB (Atlas or operator-provided). Collections: leads (v1). Future: appointments, users, clients
- Server code: Next.js Route Handlers under app/api for form submission (POST /api/quote)
- DB access: Official MongoDB Node.js driver with cached global connection for serverless (no Mongoose in v1)
- Validation/sanitization: Zod schema on client and server; sanitize HTML-sensitive fields; basic phone/email normalization
- Anti-spam: Honeypot field + minimal server-side delay; optional CAPTCHA is deferred pending approval
- Rate limiting: Simple soft limit (per-IP via header) with stateless token bucket stub; document limitations on serverless
- Observability: Console logs; minimal error reporting; optional Vercel Analytics (no PII)
- Configuration: .env.local (not committed); .env.example with placeholders only (no real secrets)
- Deployment: Vercel build (pnpm or npm). Environment vars: MONGODB_URI, MONGODB_DB (placeholders in example)
- Accessibility: Semantic landmarks, ARIA for modal, keyboard navigation for gallery, color-contrast compliance
- Calendar sync (plan only):
  - Preferred: Standards-based iCalendar
    - ICS subscription endpoint: GET /api/ics/feed (tokenized URL for client’s calendar app)
    - Per-event ICS generation: GET /api/ics/event?id=...
  - Admin scheduling UI and auth are prerequisites (defer to dashboard phase)
  - Alternative: Integrate Google/Outlook then rely on Apple Calendar import—requires operator decision
- Dashboard (plan only):
  - Auth: NextAuth (email magic link) or passwordless OTP; sessions stored in JWT; role: admin/client
  - Views: Appointments, Quotes/Leads, Client profile; CRUD APIs; RBAC middleware
  - Data model additions: users, clients, appointments, services

Key risks and assumptions
- Allowed assumptions used:
  - Placeholder images and testimonials acceptable for v1
  - Placeholder API keys appear only in .env.example; no real secrets committed
  - Email notifications deferred unless explicitly approved
- Risks:
  - Calendar method not yet chosen (ICS vs third-party); impacts API shape and auth
  - Dashboard in v1 is undecided; including it would add auth, data model, and scope
  - MongoDB connection string and DB name not yet provided
  - Brand assets/colors not final; design may require iteration
  - PII handling (names, phones, emails) requires retention/notification policies; legal copy not provided
  - Anti-spam without external services may allow some spam through

Open questions for operator review (escalations)
- Calendar integration method: ICS subscription vs third-party (Google/Outlook) vs per-event .ics only
- Is the customer dashboard included in v1? If no, confirm it is documented only
- Provide real MongoDB URI and DB name for staging/production (or confirm we use placeholders until provided)
- Confirm placeholders (images/testimonials/copy) acceptable for first implementation
- Branding: logo, exact blue accent (hex), typography preferences, favicon
- Contact form fields: required set (name, email, phone, vehicle, services, preferred date/time, message) and any additions
- Confirmation behavior: on-submit message only vs optional email receipt (requires email service/keys)
- Domain and deployment target on Vercel (project name, environment strategy)
- Privacy policy/ToS links and any compliance requirements (if any); where to link them in footer

Proposed v1 milestone (definition of done)
- A deployable single-page Next.js app on Vercel with:
  - Hero section, gallery with modal, testimonials, and quote/contact form
  - Dark theme with blue accents
  - MongoDB-backed submissions via /api/quote, validated and sanitized
  - Documentation describing calendar sync and dashboard approach (if not implemented)
- Review gates: Notion/local mirror approval prior to implementation and prior to deploy

Implementation backlog (bounded, codex-mini sized)
1) Repo scaffold
- Description: Initialize Next.js (TS) project and baseline config
- Files: E:\Mobiledets\package.json, tsconfig.json, next.config.js, .gitignore, app\layout.tsx, app\page.tsx, README.md
- Verification: dev server boots; homepage renders "Coming soon" text

2) Tailwind setup
- Description: Install/configure Tailwind and base theme tokens
- Files: E:\Mobiledets\tailwind.config.ts, postcss.config.js, app\globals.css
- Verification: Tailwind classes apply; dark bg and blue accent token available

3) Global layout + SEO shell
- Description: Layout with header/footer anchors, metadata, OG defaults
- Files: E:\Mobiledets\app\layout.tsx, app\favicon.ico, app\opengraph-image.png
- Verification: Has main landmark, correct page title/description

4) Hero section
- Description: Build hero with headline, subcopy, CTA linking to form
- Files: E:\Mobiledets\components\Hero.tsx, app\page.tsx (section include)
- Verification: CTA scrolls to form; responsive layout

5) Services highlight section
- Description: Cards or list of core services with icons
- Files: E:\Mobiledets\components\Services.tsx, public\icons\(placeholders)
- Verification: Icons render; mobile-first layout

6) Gallery assets
- Description: Add placeholder images
- Files: E:\Mobiledets\public\gallery\img-01.jpg ... img-08.jpg
- Verification: Files accessible under /gallery paths

7) Gallery component + modal
- Description: Grid + modal viewer with keyboard navigation and focus trap
- Files: E:\Mobiledets\components\Gallery.tsx, components\Modal.tsx
- Verification: Click opens modal; Esc closes; arrows navigate

8) Testimonials data + component
- Description: Static JSON + presentational list/carousel
- Files: E:\Mobiledets\data\testimonials.json, components\Testimonials.tsx
- Verification: Renders 3–6 testimonials; aria-live not needed (static)

9) Quote form UI
- Description: Controlled form with required fields and client-side Zod validation
- Files: E:\Mobiledets\components\QuoteForm.tsx, lib\validation.ts
- Verification: Inline errors; submit disabled until valid

10) API route stub
- Description: Create POST /api/quote with schema validation and JSON responses
- Files: E:\Mobiledets\app\api\quote\route.ts, lib\validation.ts (server schema)
- Verification: 200 on valid stub; 400 on invalid; no DB write yet

11) MongoDB connection utility
- Description: Implement cached Mongo client for serverless
- Files: E:\Mobiledets\lib\db.ts
- Verification: test function connects and pings without memory leak (local)

12) Lead persistence
- Description: Insert validated payload into leads collection
- Files: E:\Mobiledets\app\api\quote\route.ts (write), lib\types.ts
- Verification: Document appears in DB with timestamps; API returns id

13) Sanitization + basic anti-spam
- Description: Strip HTML, normalize phone/email, honeypot field, small artificial delay
- Files: E:\Mobiledets\lib\sanitizer.ts, components\QuoteForm.tsx (honeypot)
- Verification: HTML tags removed; honeypot blocks obvious bots

14) Soft rate limit stub
- Description: Simple per-IP token bucket using headers; document serverless limits
- Files: E:\Mobiledets\lib\rateLimit.ts, app\api\quote\route.ts (hook)
- Verification: Rapid repeats yield 429 within short window (best-effort)

15) Success/failure UX
- Description: Toasts or inline banners; form reset on success
- Files: E:\Mobiledets\components\QuoteForm.tsx, components\Alert.tsx
- Verification: Clear acknowledgement; errors visible to screen readers

16) Theming polish and accessibility
- Description: Color contrast, focus styles, reduced motion, aria labels
- Files: E:\Mobiledets\app\globals.css, components\(various)
- Verification: Passes basic a11y audit (axe) and 4.5:1 contrast

17) Content pass (placeholders)
- Description: Insert placeholder copy, services, pricing note; footer links for future policy pages
- Files: E:\Mobiledets\data\content.json, components\(various)
- Verification: No lorem ipsum; copy is neutral placeholder

18) Env example + config docs
- Description: Provide .env.example and deployment notes (no secrets)
- Files: E:\Mobiledets\.env.example, README.md (deployment section)
- Verification: Example includes MONGODB_URI, MONGODB_DB with placeholders

19) Calendar sync plan doc
- Description: Document ICS feed/per-event endpoints, data model, tokenization, iOS subscribe steps
- Files: E:\Mobiledets\docs\calendar-sync-plan.md
- Verification: Operator can approve a method without code changes

20) Dashboard plan doc
- Description: Auth choice, routes, RBAC, collections, minimal wireframes
- Files: E:\Mobiledets\docs\dashboard-plan.md
- Verification: Operator decision captured for v2 scope

21) Vercel deploy checklist
- Description: Build settings, env var mapping, preview/prod workflow, analytics opt-in
- Files: E:\Mobiledets\docs\vercel-deploy-checklist.md
- Verification: Can deploy to a Vercel preview without code edits

22) QA + smoke tests
- Description: Manual test scripts for form, gallery modal, responsive breakpoints
- Files: E:\Mobiledets\docs\qa-checklist.md
- Verification: Checklist completed; issues logged for fix

Notes
- No implementation until plan approval via Notion/local mirror
- All eventual file writes must be under E:\Mobiledets
- No secrets or legal copy will be authored without operator-provided content
