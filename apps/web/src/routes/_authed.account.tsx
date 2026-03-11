import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/account')({
  component: AccountLayout,
})

function AccountLayout() {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-4 pb-16 pt-8 desktop:px-10 desktop:pt-10">
      <Outlet />
    </div>
  )
}
