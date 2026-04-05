Task: Mobile Detailing App - Tailwind setup and theme
Execution Owner: Qwen
Execution Mode: Local bounded execution
Action Plan:
Re-read the task page, constraints, and the validated GPT plan.
Execute only the bounded work required by the approved task.
Stop and escalate immediately if execution would widen scope or violate guardrails.
Record exact outputs, blockers, and verification notes back into the task artifacts.
Verification:
- Confirm the intended artifact or outcome exists.
- Run the narrowest relevant verification step available.
- Report exact failure details if verification does not pass.
GPT Plan Reference:
Objective: Configure TailwindCSS with PostCSS and a dark theme using blue accents for the Next.js Mobile Detailing app.
Pre-checks
- Verify project root exists: E:\Mobiledets
- Confirm Next.js (App Router) structure and that app/layout.tsx imports './globals.css'. If not, add: import './globals.css'
Install dependencies (local only)
- cd E:\Mobiledets
- npm i -D tailwindcss postcss autoprefixer
- npx tailwindcss init -p (generates default files; we will replace with the specific configs below)
Create/replace files
E:\Mobiledets\tailwind.config.ts
---
import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'
const config: Config = {
darkMode: 'class',
content: [
'./app/**/*.{js,ts,jsx,tsx,mdx}',
'./pages/**/*.{js,ts,jsx,tsx,mdx}',
'./components/**/*.{js,ts,jsx,tsx,mdx}',
'./src/**/*.{js,ts,jsx,tsx,mdx}'
],
theme: {
container: {
center: true,
padding: '1rem',
screens: { '2xl': '1280px' }
},
extend: {
colors: {
// Brand blue accents
brand: colors.blue
}
}
},
plugins: []
}
export default config
---
E:\Mobiledets\postcss.config.js
---
module.exports = {
plugins: {
tailwindcss: {},
autoprefixer: {},
},
};
---
E:\Mobiledets\app\globals.css
---
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
:root { color-scheme: light; }
.dark { color-scheme: dark; }
body { @apply bg-white text-slate-900 antialiased; }
.dark body { @apply bg-slate-950 text-slate-100; }
}
@layer components {
.btn-primary {
@apply inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400 dark:focus:ring-brand-300;
}
.link {
@apply text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300 underline-offset-2 hover:underline;
}
}
---
Notes
- If tailwind.config.js was auto-created, remove it after adding tailwind.config.ts to avoid conflicts.
- Keep dark mode toggle class-based (html element gets class="dark").
Verification (no broadening, temporary only)
- npm run dev
- Temporarily add className="dark" to the <html> in app/layout.tsx to verify dark mode background and blue accents, then remove it or wire to a toggle later.
- Temporarily add within app/page.tsx main content: <a className="link" href="#">Test link</a> and <button className="btn-primary">Primary</button>. Confirm blue accents render in both light and dark. Remove these test nodes before commit if not part of the page design.
Canonical contract/behavior now
- Tailwind enabled via PostCSS; content scanning across app/pages/components/src.
- Dark mode controlled via class on html.
- Brand blue accents available as brand color scale (e.g., text-brand-600, bg-brand-600, hover:bg-brand-500).
- Base global styles: light bg-white/text-slate-900; dark bg-slate-950/text-slate-100.
- Reusable components: .btn-primary, .link use brand blue with dark-mode variants.
Deliverables to stage for Notion/local mirror review
- E:\Mobiledets\tailwind.config.ts
- E:\Mobiledets\postcss.config.js
- E:\Mobiledets\app\globals.css
Completion criteria
- Dev server compiles Tailwind without errors.
- Visual check confirms dark background and brand-blue accents in test elements.
- Changes are limited to the three specified files and ready for Notion review/local mirror.
Verification note:
- Run a narrow verification step before completion.
