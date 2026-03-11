import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getProfileByClerkUserId, requireIdentity } from './lib/auth'

const profileReturnValidator = v.object({
  _id: v.id('profiles'),
  _creationTime: v.number(),
  clerkUserId: v.string(),
  email: v.optional(v.string()),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  lastSeenAt: v.number(),
})

export const ensureCurrent = mutation({
  args: {},
  returns: profileReturnValidator,
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const existing = await getProfileByClerkUserId(ctx, identity.subject)
    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email,
        displayName: identity.name ?? identity.nickname ?? identity.email,
        imageUrl: identity.pictureUrl,
        lastSeenAt: now,
      })

      return (await ctx.db.get(existing._id))!
    }

    const profileId = await ctx.db.insert('profiles', {
      clerkUserId: identity.subject,
      email: identity.email,
      displayName: identity.name ?? identity.nickname ?? identity.email,
      imageUrl: identity.pictureUrl,
      lastSeenAt: now,
    })

    return (await ctx.db.get(profileId))!
  },
})

export const getCurrent = query({
  args: {},
  returns: v.union(profileReturnValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return getProfileByClerkUserId(ctx, identity.subject)
  },
})
