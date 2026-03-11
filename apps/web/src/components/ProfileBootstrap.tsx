import { useAuth } from '@clerk/tanstack-react-start'
import { useMutation } from 'convex/react'
import { useEffect } from 'react'
import { api } from '../../convex/_generated/api'

export function ProfileBootstrap() {
  const { userId } = useAuth()
  const ensureCurrent = useMutation(api.profiles.ensureCurrent)

  useEffect(() => {
    if (!userId) {
      return
    }
    void ensureCurrent()
  }, [ensureCurrent, userId])

  return null
}
