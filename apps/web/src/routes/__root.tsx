/// <reference types="vite/client" />
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/tanstack-react-start'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as React from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { AppProviders } from '~/components/AppProviders'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary.js'
import { NotFound } from '~/components/NotFound.js'
import { ProfileBootstrap } from '~/components/ProfileBootstrap'
import { APP_NAME } from '~/lib/constants'
import {
  getPlayViewportHeight,
  isLikelyBrowserFullscreen,
  shouldHidePlayChrome,
} from '~/lib/play-display'
import { useRuntimePreload } from '~/lib/runtime-cache'
import appCss from '~/styles/app.css?url'

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { userId } = await auth()

  return {
    userId,
  }
})

export const Route = createRootRoute({
  beforeLoad: async () => {
    const { userId } = await fetchClerkAuth()

    return {
      userId,
    }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: `${APP_NAME} | Play Hollow Knight In The Browser`,
      },
      {
        name: 'description',
        content:
          'A Hollow Knight web wrapper built for account-scoped save import, sync, fullscreen play, and export.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'preconnect',
        href: 'https://api.fontshare.com',
      },
      {
        rel: 'stylesheet',
        href: 'https://api.fontshare.com/v2/css?f[]=general-sans@400;500;600&display=swap',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RuntimePreloadIndicator() {
  const { cacheReady, cacheProgress } = useRuntimePreload()
  if (cacheReady) return null
  return (
    <span className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-fg-dim">
      {cacheProgress > 0
        ? `Game ${Math.round(cacheProgress * 100)}%`
        : 'Preparing game…'}
    </span>
  )
}

function RootComponent() {
  return (
    <AppProviders>
      <RootDocument>
        <ProfileBootstrap />
        <Outlet />
      </RootDocument>
    </AppProviders>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const navLinkClass =
    'rounded-md px-2.5 py-1.5 text-sm font-medium tracking-[0.01em] text-fg-muted transition-colors hover:text-fg'
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [browserFullscreen, setBrowserFullscreen] = React.useState(false)

  React.useEffect(() => {
    const updateBrowserFullscreen = () => {
      setBrowserFullscreen(
        document.fullscreenElement !== null ||
          isLikelyBrowserFullscreen({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            screenAvailWidth: window.screen.availWidth,
            screenAvailHeight: window.screen.availHeight,
          }),
      )
    }

    updateBrowserFullscreen()
    window.addEventListener('resize', updateBrowserFullscreen)
    document.addEventListener('fullscreenchange', updateBrowserFullscreen)

    return () => {
      window.removeEventListener('resize', updateBrowserFullscreen)
      document.removeEventListener('fullscreenchange', updateBrowserFullscreen)
    }
  }, [])

  const hidePlayChrome = shouldHidePlayChrome(pathname, browserFullscreen)
  const shellStyle = {
    '--header-height': hidePlayChrome ? '0px' : undefined,
    '--play-viewport-height': getPlayViewportHeight(hidePlayChrome),
  } as React.CSSProperties

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <div className="relative min-h-screen" style={shellStyle}>
          {hidePlayChrome ? null : (
            <header className="sticky top-0 z-40 border-b border-border bg-bg/95 px-4 desktop:px-10">
              <div className="mx-auto flex w-full max-w-[72rem] items-center justify-between gap-4 py-3.5">
                <Link
                  to="/"
                  className="flex items-center"
                  activeOptions={{ exact: true }}
                >
                  <span className="block text-[1rem] font-semibold tracking-[-0.03em] text-fg-bright">
                    {APP_NAME}
                  </span>
                </Link>
                <nav className="hidden items-center gap-1 desktop:flex">
                  <Link
                    to="/"
                    className={navLinkClass}
                    activeProps={{ className: '!text-fg' }}
                    activeOptions={{ exact: true }}
                  >
                    Home
                  </Link>
                  <SignedIn>
                    <Link
                      to="/play"
                      className={navLinkClass}
                      activeProps={{ className: '!text-fg' }}
                    >
                      Play
                    </Link>
                    <Link
                      to="/account"
                      className={navLinkClass}
                      activeProps={{ className: '!text-fg' }}
                    >
                      Account
                    </Link>
                    <Link
                      to="/account/saves"
                      className={navLinkClass}
                      activeProps={{ className: '!text-fg' }}
                    >
                      Saves
                    </Link>
                  </SignedIn>
                </nav>
                <div className="flex items-center gap-2.5 desktop:gap-3">
                  <SignedIn>
                    <div className="hidden desktop:block">
                      <RuntimePreloadIndicator />
                    </div>
                    <Link to="/play" className="ui-btn-primary">
                      Launch
                    </Link>
                    <UserButton />
                  </SignedIn>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="ui-btn-primary">Sign In</button>
                    </SignInButton>
                  </SignedOut>
                </div>
              </div>
            </header>
          )}
          <main className="w-full">
            {children}
          </main>
        </div>
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
        <Scripts />
      </body>
    </html>
  )
}
