import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  profiles: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    lastSeenAt: v.number(),
  }).index('by_clerk_user_id', ['clerkUserId']),

  gameRuntimes: defineTable({
    slug: v.string(),
    name: v.string(),
    runtimeVersion: v.string(),
    canonicalRuntimePath: v.string(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  saveBundles: defineTable({
    ownerProfileId: v.id('profiles'),
    runtimeSlug: v.string(),
    runtimeVersion: v.string(),
    status: v.union(
      v.literal('ready'),
      v.literal('importing'),
      v.literal('syncing'),
      v.literal('export_ready'),
      v.literal('error'),
    ),
    manifestVersion: v.number(),
    activeRevisionId: v.optional(v.id('saveBundleRevisions')),
    lastImportedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    lastPlayedAt: v.optional(v.number()),
  }).index('by_owner_and_runtime', ['ownerProfileId', 'runtimeSlug']),

  saveBundleRevisions: defineTable({
    bundleId: v.id('saveBundles'),
    ownerProfileId: v.id('profiles'),
    runtimeSlug: v.string(),
    runtimeVersion: v.string(),
    source: v.union(v.literal('import'), v.literal('runtime_sync'), v.literal('manual')),
    fileCount: v.number(),
    byteSize: v.number(),
    bundleHash: v.string(),
    baseBundleHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_bundle', ['bundleId'])
    .index('by_owner_and_runtime', ['ownerProfileId', 'runtimeSlug']),

  saveBundleFiles: defineTable({
    revisionId: v.id('saveBundleRevisions'),
    ownerProfileId: v.id('profiles'),
    runtimeSlug: v.string(),
    path: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.id('_storage'),
    sha256: v.string(),
  })
    .index('by_revision', ['revisionId'])
    .index('by_owner_runtime_path', ['ownerProfileId', 'runtimeSlug', 'path']),
})
