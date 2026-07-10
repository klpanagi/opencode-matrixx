import type { BuiltinSkill } from "../types"

export const FRONTEND_REACT_NEXTJS_SKILL_NAME = "react-nextjs-patterns"

const FRONTEND_REACT_NEXTJS_SKILL_DESCRIPTION = "Use when building React or Next.js features, implementing Server Components or Server Actions, or designing App Router patterns — React 19 (Server Components, useOptimistic, useActionState) and Next.js 15 App Router (streaming, routing, middleware). Related: frontend-ui-ux, frontend-state-data."

export const reactNextjsPatternsSkill: BuiltinSkill = {
  name: FRONTEND_REACT_NEXTJS_SKILL_NAME,
  description: FRONTEND_REACT_NEXTJS_SKILL_DESCRIPTION,
  template: `# React 19 + Next.js 15 App Router

## React 19 Patterns

### Hooks
- **useActionState** — Manage form state (pending, error, data) declaratively:
  \`\`\`tsx
  const [state, formAction, isPending] = useActionState(async (prev: State, formData: FormData) => { ... }, init)
  \`\`\`
- **useOptimistic** — Instant UI feedback while async op completes:
  \`\`\`tsx
  const [data, addOptimistic] = useOptimistic(data, (s, item) => [...s, item])
  \`\`\`
- **use() hook** — Read Promises/Context in render (suspends until resolution):
  \`\`\`tsx
  const data = use(promise)       // suspends
  const theme = use(ThemeContext)  // alt to useContext
  \`\`\`
- **ref as prop** — \`ref\` is a regular prop now; forwardRef deprecated:
  \`\`\`tsx
  function Input({ ref, ...props }: { ref: Ref<HTMLInputElement> }) { return <input ref={ref} {...props} /> }
  \`\`\`
- **useTransition** — Mark state updates as non-blocking transitions for responsive UI

### Server Components vs Client Components
| Aspect | Server Component | Client Component |
|--------|-----------------|-----------------|
| Default | **Default** in App Router | Opt-in via \`"use client"\` |
| Rendering | Server-side only | Browser + server |
| Hooks | ❌ No hooks | ✅ All hooks |
| State/Effects | ❌ None | ✅ useState, useEffect |
| DB/FS/Secrets | ✅ Direct access | ❌ Must use API route |
| Bundle | Zero JS sent to client | Full JS bundled |

**Rule**: Default to Server Components. Add \`"use client"\` at leaf level where interactivity is needed.

## Next.js 15 App Router

### Directory Conventions
\`\`\`
app/
  layout.tsx         — Root layout (required, wraps all pages)
  page.tsx           — Route UI (required for public routes)
  loading.tsx        — Suspense fallback for route segment
  error.tsx          — Error boundary (catches errors, shows fallback UI)
  not-found.tsx      — 404 fallback for the segment
  global-error.tsx   — Root error boundary (replaces layout on crash)
  template.tsx       — Re-renders on navigation (unlike layout which persists)
\`\`\`

### Nested Layouts
Layouts nest hierarchically and **persist across navigations** (do NOT re-render):
\`\`\`tsx
// app/layout.tsx — wraps everything
// app/dashboard/layout.tsx — wraps dashboard/* pages only
// app/dashboard/settings/page.tsx — inherits both layouts
\`\`\`

### Advanced Routing
| Pattern | Syntax | Example Path |
|---------|--------|-------------|
| Dynamic segment | \`[slug]\` | \`app/blog/[slug]/page.tsx\` → \`/blog/hello-world\` |
| Catch-all | \`[...slug]\` | \`app/docs/[...slug]/page.tsx\` → \`/docs/a/b/c\` |
| Optional catch-all | \`[[...slug]]\` | \`app/docs/[[...slug]]/page.tsx\` → \`/docs\` or \`/docs/a/b\` |
| Route group | \`(group)\` | \`app/(marketing)/about/page.tsx\` — URL unaffected |
| Parallel route | \`@slot\` | \`app/@feed/page.tsx\` — multiple pages in same layout |
| Intercepting route | \`(..)\` | \`app/feed/(..)photo/[id]/page.tsx\` — modal from feed |

Parallel routes with \`@slot\` render independently (own loading/error). Use \`default.tsx\` when no matching route. Intercepting: \`(.)\` same level, \`(..)\` up one, \`(...)\` from root.

### Middleware
\`\`\`ts
// middleware.ts at root
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value
  if (!token) return NextResponse.redirect(new URL("/login", request.url))
  return NextResponse.next()
}
export const config = { matcher: ["/dashboard/:path*"] }
\`\`\`

### Route Handlers (API Routes)
\`\`\`ts
// app/api/items/route.ts
export async function GET() { return Response.json(items) }
export async function POST(req: NextRequest) {
  return Response.json({ id: createItem(await req.json()) }, { status: 201 })
}
\`\`\`

## Server Actions
\`\`\`ts
// app/actions.ts — "use server" at top
"use server"
export async function createItem(formData: FormData) {
  const item = await db.insert({ title: formData.get("title") })
  revalidatePath("/items")
  return { success: true }
}
// Inline action inside Server Component
async function deleteItem(id: string) {
  "use server"
  await db.delete(id)
  revalidateTag("items")
}
\`\`\`

**Key APIs**: \`revalidatePath(path)\` — purge cache for URL path · \`revalidateTag(tag)\` — purge by tag · Actions are async functions with DB/cookie/header access · Wrap with \`useActionState\` on the client

## Data Fetching

\`\`\`ts
// Server Component — fetch directly (no useEffect needed)
async function Page() {
  // Default: cache: "force-cache" (static), revalidate: 60 = ISR
  const data = await fetch("https://api.example.com/items", {
    next: { revalidate: 60, tags: ["items"] }
  }).then(r => r.json())

  // Dynamic: cache: "no-store" (every request)
  const live = await fetch("https://api.example.com/live", { cache: "no-store" }).then(r => r.json())

  // unstable_cache — cache expensive computations
  const cached = await unstable_cache(
    async () => { /* heavy computation */ },
    ["cache-key"],
    { revalidate: 300, tags: ["computed"] }
  )()

  return <div>{/* render data */}</div>
}
\`\`\`

**Caching strategy**:
- Static data: default \`force-cache\` (fetch once at build, never re-fetch)
- ISR: \`next: { revalidate: 60 }\` (re-fetch at most every 60s)
- Dynamic: \`cache: "no-store"\` or \`next: { revalidate: 0 }\` (fresh every request)
- Per-request: use \`unstable_noStore()\` or \`cookies()\`/headers() which opt out of caching

## Streaming

\`\`\`tsx
// loading.tsx = Suspense boundary for the route segment
// app/dashboard/loading.tsx
export default function Loading() { return <DashboardSkeleton /> }

// Manual Suspense boundaries for granular streaming
import { Suspense } from "react"

function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<SlowWidgetSkeleton />}>
        <SlowWidget />
      </Suspense>
      <Suspense fallback={<FastWidgetSkeleton />}>
        <FastWidget />
      </Suspense>
    </div>
  )
}

// Async Server Component inside Suspense streams independently
async function SlowWidget() {
  const data = await fetch("http://slow-api.com/data", { cache: "no-store" })
  return <WidgetUI data={data} />
}
\`\`\`

**Streaming rules**:
- Each \`<Suspense>\` boundary = independent stream chunk (rendered as data arrives)
- \`loading.tsx\` = automatic Suspense boundary for the entire segment
- Partial pre-rendering (PPR) combines static shell + dynamic streams at the page level
- Avoid wrapping tiny components individually — group by meaningful loading states

## Anti-Patterns (NEVER)

| Anti-Pattern | Why It's Wrong |
|-------------|----------------|
| \`"use client"\` at the page level for small interactivity | Forces entire page to be client-rendered |
| Server Actions in \`"use client"\` files | Syntax error — actions must be in \`"use server"\` module |
| Fetching inside client components without a dedicated data layer | No caching, waterfalls, no revalidation |
| Nested \`<Suspense>\` without meaningful fallbacks | Layout shift, poor UX |
| Missing \`layout.tsx\` for shared navigation | Full re-renders on every page change |
| \`revalidatePath("/api/...")\` instead of \`revalidateTag\` | Over-invalidates cache, worse performance |
| Wrapping the entire page in \`<Suspense>\` | Loses granular streaming benefits |`,
}
