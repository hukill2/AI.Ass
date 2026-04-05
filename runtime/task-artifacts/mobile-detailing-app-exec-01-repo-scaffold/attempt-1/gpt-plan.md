Objective: Scaffold a minimal Next.js App Router + TypeScript repo locally in E:\Mobiledets so `npm run build` succeeds and the default page renders. No deploy. Respect Notion review/local mirror. Do not write outside E:\Mobiledets.

Pre-checks:
- Verify Node >= 18.18.0 (or 20.x LTS): `node -v`. If not met, install/update Node.
- Ensure E:\Mobiledets is writable and either empty or safe to initialize. If conflicting files exist, pause and escalate for guidance.

Steps (local-only execution):
1) Create project folder (if not present):
   - E:\Mobiledets
2) Initialize package.json with pinned stable Next 14 + React 18 to avoid future breaking changes:
   - Write E:\Mobiledets\package.json with:
     BEGIN_FILE
     {
       "name": "mobile-detailing-app",
       "private": true,
       "version": "0.1.0",
       "type": "module",
       "engines": { "node": ">=18.18.0" },
       "scripts": {
         "dev": "next dev",
         "build": "next build",
         "start": "next start"
       },
       "dependencies": {
         "next": "^14.2.0",
         "react": "18.2.0",
         "react-dom": "18.2.0"
       },
       "devDependencies": {
         "typescript": "^5.4.0",
         "@types/react": "^18.2.0",
         "@types/node": "^20.0.0"
       }
     }
     END_FILE
3) Install dependencies (inside E:\Mobiledets):
   - npm install
4) Add Next.js config:
   - Write E:\Mobiledets\next.config.js with:
     BEGIN_FILE
     /** @type {import('next').NextConfig} */
     const nextConfig = { reactStrictMode: true };
     module.exports = nextConfig;
     END_FILE
5) Add TypeScript config:
   - Write E:\Mobiledets\tsconfig.json with:
     BEGIN_FILE
     {
       "compilerOptions": {
         "target": "ES2020",
         "lib": ["dom", "dom.iterable", "esnext"],
         "allowJs": false,
         "skipLibCheck": true,
         "strict": true,
         "noEmit": true,
         "esModuleInterop": true,
         "module": "ESNext",
         "moduleResolution": "Bundler",
         "resolveJsonModule": true,
         "isolatedModules": true,
         "jsx": "preserve",
         "incremental": true
       },
       "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
       "exclude": ["node_modules"]
     }
     END_FILE
6) Create App Router structure and styles:
   - Create folder: E:\Mobiledets\app
   - Write E:\Mobiledets\app\layout.tsx with:
     BEGIN_FILE
     import './globals.css';
     import type { Metadata } from 'next';

     export const metadata: Metadata = {
       title: 'Mobile Detailing',
       description: 'Local mobile car detailing quotes, scheduling, and gallery.'
     };

     export default function RootLayout({ children }: { children: React.ReactNode }) {
       return (
         <html lang="en">
           <body>{children}</body>
         </html>
       );
     }
     END_FILE
   - Write E:\Mobiledets\app\page.tsx with:
     BEGIN_FILE
     export default function HomePage() {
       return (
         <main style={{ padding: '2rem' }}>
           <h1>Mobile Detailing</h1>
           <p>Repo scaffold is up. App Router + TypeScript baseline.</p>
         </main>
       );
     }
     END_FILE
   - Write E:\Mobiledets\app\globals.css with:
     BEGIN_FILE
     :root { --bg: #0b0c10; --fg: #f5f7fa; --accent: #2bb673; --muted: #8892a6; }
     * { box-sizing: border-box; }
     html, body { height: 100%; }
     body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; background: var(--bg); color: var(--fg); }
     a { color: var(--accent); }
     END_FILE
7) Git and ignores (local only, do not push):
   - Write E:\Mobiledets\.gitignore with:
     BEGIN_FILE
     node_modules
     .next
     out
     npm-debug.log*
     yarn-debug.log*
     yarn-error.log*
     pnpm-debug.log*
     .env
     .env.*
     !.env.example
     .DS_Store
     Thumbs.db
     END_FILE
   - git init
   - git add .
   - git commit -m "chore: scaffold Next.js App Router + TS baseline"
   - Do not push. Prepare for Notion review; use local mirror only if explicitly configured. Escalate if a mirror endpoint is required now.
8) README:
   - Write E:\Mobiledets\README.md with:
     BEGIN_FILE
     # Mobile Detailing App (Scaffold)

     Minimal Next.js (App Router) + TypeScript scaffold.

     ## Prerequisites
     - Node >= 18.18.0 (or 20.x LTS)
     - npm

     ## Setup
     npm install

     ## Scripts
     - npm run dev  # start dev server on http://localhost:3000
     - npm run build
     - npm start    # serve production build

     ## Verify
     1) npm run build (should succeed without errors)
     2) npm start and open http://localhost:3000 (see "Mobile Detailing" headline)

     ## Notes
     - Local-only; do not deploy. Submit for Notion review before any mirror/remote actions.
     END_FILE
9) Verification:
   - From E:\Mobiledets run: `npm run build` -> expect success.
   - Optionally: `npm start` and open http://localhost:3000 to confirm the default page renders.

Reporting (for handoff):
- Provide: files changed (list 8 files above), the current contract (Next.js App Router + TS; build passes; root route renders), and whether the scaffold is complete and committed locally.

Escalation criteria:
- E:\Mobiledets is not writable or contains conflicting project assets that cannot be safely overwritten.
- Node/npm unavailable or corporate proxy blocks `npm install`.
- Organization requires a local mirror push/PR at this stage but mirror endpoint/credentials are not provided.
- Any discrepancy with the Notion source plan that changes required files/content.
