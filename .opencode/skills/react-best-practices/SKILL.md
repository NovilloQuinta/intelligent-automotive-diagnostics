---
name: react-best-practices
description: React 19 + Vite + TanStack Start best practices — components, hooks, re-renders, bundle size, data fetching, and performance (adapted from Vercel's agent-skills)
license: MIT
---

Load this skill when writing, reviewing, or refactoring React components. Adapted for Vite SPA + TanStack Start (no RSC/SSR), React 19, TypeScript, Tailwind CSS v4, and shadcn/ui.

## Re-render Optimization (CRITICAL)

- **Derive state during render** — don't sync state with `useEffect` when it can be computed:
  ```tsx
  // ❌ Double render: setState in useEffect triggers re-render
  const [fullName, setFullName] = useState('')
  useEffect(() => { setFullName(`${firstName} ${lastName}`) }, [firstName, lastName])

  // ✅ Single render: derive during render
  const fullName = `${firstName} ${lastName}`
  ```
- **Primitive effect dependencies** — only pass primitives to `useEffect`/`useMemo`/`useCallback` deps. Objects/arrays create new references every render
- **`useMemo` for expensive computations** — memoize CPU-heavy work (filtering large lists, data transformations). Don't memoize trivial operations
- **`useCallback` only when needed** — skip for callbacks passed to native elements (`<div onClick>`). Required for: props of `React.memo` children, deps of other hooks
- **Split context** — separate frequently-changing state from rarely-changing state into different contexts to avoid broad re-renders
- **Functional `setState`** — `setCount(c => c + 1)` instead of `setCount(count + 1)` when updating based on previous state
- **Lazy state initialization** — `useState(() => expensiveComputation())` for expensive initial values, not `useState(expensiveComputation())`
- **No inline component definitions** — defining `function Foo()` inside another component creates a new component type each render, destroying the React tree:
  ```tsx
  // ❌ New component identity every render
  function Parent() { function Child() { return <div /> }; return <Child /> }

  // ✅ Stable reference
  function Child() { return <div /> }
  function Parent() { return <Child /> }
  ```

## Component Architecture

- **One component per file** — extract to separate file when: function >40 lines, logic is reusable, or it has its own state/hooks. Follow the project's code-smell rules
- **Props interfaces** — define with `interface`, mark as `readonly`, co-locate in the same file or a sibling `types.ts`:
  ```tsx
  interface GaugeProps {
    readonly value: number | null
    readonly loading: boolean
    readonly max?: number
  }
  ```
- **States coverage** — every data-display component MUST handle: **loading** (skeleton/spinner), **empty** (illustration + message), **error** (message + retry), **success** (the data). Never assume data will arrive
- **Suspense boundaries** — wrap lazy-loaded or data-dependent sections in `<Suspense fallback={<Skeleton />}>`
- **Error boundaries** — wrap feature sections in error boundaries; don't crash the whole app for one failing widget

## Hooks Patterns

- **Event handlers over effects** — move logic from `useEffect` to event handlers when reacting to user actions:
  ```tsx
  // ❌ useEffect fires after render, then state changes cause another render
  useEffect(() => { if (submitted) fetchData() }, [submitted])

  // ✅ Single render: fetch directly in the handler
  const handleSubmit = async () => { setSubmitted(true); await fetchData() }
  ```
- **Refs for mutable values** — use `useRef` for timers, subscriptions, and values that shouldn't trigger re-renders
- **Custom hook extraction** — extract reusable stateful logic into custom hooks (`useAuth`, `useClock`, `useAnimatedNumber`). Name MUST start with `use`
- **No hook callbacks in deps** — `useEffectEvent`-style: extract the stable wrapper. In React 18/19, use refs to store callbacks

## Data Fetching

- **React Query for server state** — use `@tanstack/react-query` for all API calls. Never `useEffect + fetch`. It handles caching, dedup, refetch, and stale management
- **SWR-style `staleTime`** — set `staleTime: 30_000` (30s) for slowly-changing data (scenarios, vehicle info)
- **Error states** — `isError` + `error` → error boundary or inline error component with retry button
- **No waterfalls** — fetch independent data in parallel:
  ```tsx
  // ❌ Sequential: scenarios resolves before diagnosis starts
  const scenarios = await fetchScenarios()
  const diagnosis = await fetchDiagnosis()

  // ✅ Parallel
  const [scenarios, diagnosis] = await Promise.all([fetchScenarios(), fetchDiagnosis()])
  ```

## Bundle Size (HIGH)

- **Direct imports** — import directly from the specific module path, not barrel files:
  ```tsx
  // ✅ Tree-shakeable
  import { Gauge } from 'lucide-react'
  import { Button } from '@/components/ui/button'
  ```
- **`React.lazy` for route-level splitting** — lazy-load pages; TanStack Router does this automatically with file-based routing
- **Conditional feature loading** — load heavy libs (Recharts, date-fns functions) only when the feature mounts; code-split analytics/monitoring

## JavaScript Performance (MEDIUM)

- **Early returns** — bail out early instead of nesting:
  ```tsx
  // ❌ Nested
  if (user) { if (user.isAdmin) { return <Admin /> } else { return <User /> } }
  // ✅ Flat
  if (!user) return <Login />
  if (user.isAdmin) return <Admin />
  return <User />
  ```
- **Memoize callbacks in lists** — avoid arrow functions in JSX props inside `.map()`:
  ```tsx
  // ❌ New function per item, per render
  {items.map(item => <Button onClick={() => handleClick(item.id)} />)}

  // ✅ Use data attributes or extract item component with memo
  {items.map(item => <ItemButton key={item.id} item={item} onClick={handleClick} />)}
  ```
- **`useMemo` for filtered/sorted lists** — when the source list is large (>100 items), memoize the derived list

## JSX & Styling

- **Tailwind-first** — use Tailwind utility classes. Avoid inline styles except for dynamic values (animation, color from data)
- **`cn()` for conditionals** — use the project's `cn()` utility (clsx + tailwind-merge):
  ```tsx
  <button className={cn('base-class', isActive && 'active-class', className)} />
  ```
- **shadcn/ui patterns** — follow shadcn conventions: `variant`/`size` props, `forwardRef`, `displayName`, spread `...props` on the root element
- **Ternary over `&&`** — to avoid rendering `0` or `false`:
  ```tsx
  // ❌ Can render "0" to the DOM
  {count && <Badge>{count}</Badge>}
  // ✅ Explicit boolean
  {count > 0 ? <Badge>{count}</Badge> : null}
  ```

## Forms

- **react-hook-form + zod** — use `useForm<Schema>({ resolver: zodResolver(schema) })`. Define schema with `z.object()`. Access errors via `formState.errors`
- **Controlled components** — shadcn `Form` wrapper provides `<FormField>` with `render` prop; use it instead of manual `register()`

## Testing

- **Component tests** — use `@testing-library/react` + `jsdom`. Test behavior (what the user sees), not implementation (state, hooks internals)
- **Custom hooks** — test with `renderHook()` from testing-library
- **Mock at the network layer** — mock `fetch` (or `apiFetch`) with `vi.stubGlobal`, not individual hooks/stores
- **No snapshot tests** — prefer explicit assertions against the DOM
