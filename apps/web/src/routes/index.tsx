import { SignedIn, SignedOut } from '@clerk/tanstack-react-start'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

const features = [
  {
    title: 'Desktop-compatible files',
    description: 'Move the exact desktop archive files you already keep locally.',
  },
  {
    title: 'Remote sync',
    description: 'Keep remote snapshots current across repeat visits without extra steps.',
  },
  {
    title: 'Snapshot history',
    description: 'Restore an earlier bundle whenever your arithmetic goes sideways.',
  },
]

function Home() {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-4 pb-20 pt-10 desktop:px-10 desktop:pt-14">
      <div className="grid gap-12 animate-fade-in">
        <section className="ui-panel p-8 desktop:p-12">
          <div className="grid gap-8">
            <div className="grid gap-4">
              <div className="ui-eyebrow">Hard Math Archive</div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[0.92] tracking-tight text-fg-bright sm:text-6xl">
                Pr0ve n0thing. Preserve everything.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-fg-muted sm:text-lg">
                A browser worksheet for local archive files with remote sync, snapshot recovery,
                and quick export back to desktop storage.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <SignedIn>
                <Link to="/proof" className="ui-btn-primary">
                  Open Worksheet
                </Link>
                <Link to="/account/archive" className="ui-btn-secondary">
                  Archive Files
                </Link>
              </SignedIn>
              <SignedOut>
                <Link to="/proof" className="ui-btn-primary">
                  Sign In to Enter
                </Link>
              </SignedOut>
            </div>
          </div>
        </section>

        <section className="grid gap-3 desktop:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="ui-card p-5">
              <div className="text-sm font-semibold text-fg">{feature.title}</div>
              <p className="mt-2 text-sm leading-7 text-fg-muted">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 border-t border-border pt-6 desktop:grid-cols-[10rem_minmax(0,1fr)] desktop:items-start">
          <div className="ui-eyebrow">Workflow</div>
          <p className="max-w-3xl text-sm leading-7 text-fg-muted">
            Import local files, open the worksheet, and export a fresh bundle whenever desktop
            storage needs a cleaner theorem.
          </p>
        </section>
      </div>
    </div>
  )
}
