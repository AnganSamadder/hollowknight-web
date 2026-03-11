import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    if (error.message === 'Not authenticated') {
      return (
        <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
          <div className="ui-panel w-full max-w-4xl p-8 desktop:p-10">
            <div className="ui-eyebrow mb-4">Authentication Required</div>
            <div className="grid gap-6 desktop:grid-cols-[minmax(0,1fr)_20rem] desktop:gap-8">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-fg-bright">
                  Sign in to continue your save.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                  This route is tied to your account-scoped Hollow Knight save bundle.
                </p>
              </div>
              <div className="ui-card hidden p-5 text-sm leading-7 text-fg-muted desktop:block">
                Your profile, runtime state, and cloud revisions stay scoped to the active Clerk account.
              </div>
            </div>
            <div className="ui-card mt-8 overflow-hidden p-4">
              <SignIn routing="hash" forceRedirectUrl={window.location.href} />
            </div>
          </div>
        </div>
      )
    }

    throw error
  },
})
