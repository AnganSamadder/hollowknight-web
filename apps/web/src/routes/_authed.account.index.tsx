import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { RUNTIME_SLUG } from '~/lib/constants'
import { formatBytes, formatDateTime } from '~/lib/utils'

export const Route = createFileRoute('/_authed/account/')({
  component: AccountPage,
})

function AccountPage() {
  const profile = useQuery(api.profiles.getCurrent)
  const bundle = useQuery(api.saves.getActiveBundle, { runtimeSlug: RUNTIME_SLUG })

  const rev = bundle?.activeRevision
  const detailRowClass =
    'flex items-baseline justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0'

  return (
    <div className="grid gap-10 animate-fade-in">
      <section className="grid gap-4 desktop:grid-cols-[minmax(0,1fr)_auto] desktop:items-end">
        <div>
          <div className="ui-eyebrow">Account</div>
          <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.8rem)] font-semibold tracking-tight text-fg-bright">
            Your archive
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
            Review your profile, inspect the active remote bundle, and jump directly into
            worksheet or archive tools.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/proof" className="ui-btn-primary">
            Open Worksheet
          </Link>
          <Link to="/account/archive" className="ui-btn-secondary">
            Archive Files
          </Link>
        </div>
      </section>

      <section className="grid gap-5 desktop:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="ui-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-fg">Profile</h2>
          </div>
          <div className="p-5">
            {profile === undefined ? (
              <p className="text-sm text-fg-dim">Loading…</p>
            ) : profile === null ? (
              <p className="text-sm text-fg-dim">No profile found.</p>
            ) : (
              <dl className="grid gap-4">
                <div className={detailRowClass}>
                  <dt className="text-sm text-fg-dim">Name</dt>
                  <dd className="text-sm text-fg">{profile.displayName ?? '—'}</dd>
                </div>
                <div className={detailRowClass}>
                  <dt className="text-sm text-fg-dim">Email</dt>
                  <dd className="text-sm text-fg">{profile.email ?? '—'}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        <div className="ui-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-fg">Remote Bundle</h2>
            <Link to="/account/archive" className="ui-btn-secondary">
              Archive Files →
            </Link>
          </div>
          <div className="p-5">
            {bundle === undefined ? (
              <p className="text-sm text-fg-dim">Loading…</p>
            ) : bundle === null || !rev ? (
              <p className="text-sm leading-7 text-fg-dim">
                No archive data yet.{' '}
                <Link to="/proof" className="text-accent transition-colors hover:text-accent-hover">
                  Open the worksheet to generate files
                </Link>{' '}
                or{' '}
                <Link
                  to="/account/archive"
                  className="text-accent transition-colors hover:text-accent-hover"
                >
                  import local ones
                </Link>
                .
              </p>
            ) : (
              <dl className="grid gap-4">
                <div className={detailRowClass}>
                  <dt className="text-sm text-fg-dim">Snapshot hash</dt>
                  <dd className="font-mono text-sm text-fg">{rev.bundleHash.slice(0, 12)}…</dd>
                </div>
                <div className={detailRowClass}>
                  <dt className="text-sm text-fg-dim">Files</dt>
                  <dd className="text-sm text-fg">{rev.files.length}</dd>
                </div>
                <div className={detailRowClass}>
                  <dt className="text-sm text-fg-dim">Total size</dt>
                  <dd className="text-sm text-fg">
                    {formatBytes(rev.files.reduce((s, f) => s + f.size, 0))}
                  </dd>
                </div>
                {bundle.lastSyncedAt && (
                  <div className={detailRowClass}>
                    <dt className="text-sm text-fg-dim">Last synced</dt>
                    <dd className="text-sm text-fg">{formatDateTime(bundle.lastSyncedAt)}</dd>
                  </div>
                )}
                {bundle.lastPlayedAt && (
                  <div className={detailRowClass}>
                    <dt className="text-sm text-fg-dim">Last opened</dt>
                    <dd className="text-sm text-fg">{formatDateTime(bundle.lastPlayedAt)}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
