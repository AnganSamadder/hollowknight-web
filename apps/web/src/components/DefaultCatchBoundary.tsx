import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error(error)

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-16">
      <div className="ui-panel w-full max-w-2xl p-8 desktop:p-10">
        <div className="ui-eyebrow mb-6">Runtime Error</div>
        <ErrorComponent error={error} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              router.invalidate()
            }}
            className="ui-btn-primary"
          >
            Try Again
          </button>
          {isRoot ? (
            <Link to="/" className="ui-btn-secondary">
              Home
            </Link>
          ) : (
            <Link
              to="/"
              className="ui-btn-secondary"
              onClick={(e) => {
                e.preventDefault()
                window.history.back()
              }}
            >
              Go Back
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
