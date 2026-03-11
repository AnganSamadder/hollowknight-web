import { SignedIn, SignedOut } from '@clerk/tanstack-react-start'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

const features = [
  {
    title: 'Steam-compatible saves',
    description: 'Import and export the exact files you already use on desktop.',
  },
  {
    title: 'Cloud sync',
    description: 'Keep progress current across browser sessions without extra steps.',
  },
  {
    title: 'Revision history',
    description: 'Restore an earlier state whenever you need to recover a run.',
  },
]

function Home() {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-4 pb-20 pt-10 desktop:px-10 desktop:pt-14">
      <div className="grid gap-12 animate-fade-in">
        <section className="ui-panel p-8 desktop:p-12">
          <div className="grid gap-8">
            <div className="grid gap-4">
              <div className="ui-eyebrow">Hallownest Archive</div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[0.92] tracking-tight text-fg-bright sm:text-6xl">
                Play Hollow Knight. Keep your saves.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-fg-muted sm:text-lg">
                A browser shell for Hollow Knight with save import, cloud sync, and fast export
                back to desktop.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <SignedIn>
                <Link to="/play" className="ui-btn-primary">
                  Launch archive
                </Link>
                <Link to="/account/saves" className="ui-btn-secondary">
                  Manage saves
                </Link>
              </SignedIn>
              <SignedOut>
                <Link to="/play" className="ui-btn-primary">
                  Sign In to Play
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
            Import a save, launch the runtime, and export whenever you want to move back to your
            desktop install.
          </p>
        </section>
      </div>
    </div>
  )
}
