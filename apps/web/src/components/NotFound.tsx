import { Link } from '@tanstack/react-router'

export function NotFound({ children }: { children?: any }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="ui-panel w-full max-w-2xl p-8 desktop:p-10">
        <div className="ui-eyebrow mb-3">Not Found</div>
        <div className="max-w-xl text-base leading-8 text-fg">
          {children || <p>The page you are looking for does not exist.</p>}
        </div>
        <p className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => window.history.back()} className="ui-btn-secondary">
            Go back
          </button>
          <Link to="/" className="ui-btn-primary">
            Start Over
          </Link>
        </p>
      </div>
    </div>
  )
}
