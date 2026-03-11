import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { getProfileByClerkUserId, requireIdentity } from './lib/auth'

const runtimeSlugValidator = v.string()

const saveFileInputValidator = v.object({
  path: v.string(),
  size: v.number(),
  sha256: v.string(),
  storageId: v.id('_storage'),
})

const saveFileOutputValidator = v.object({
  path: v.string(),
  size: v.number(),
  sha256: v.string(),
  url: v.union(v.string(), v.null()),
})

const revisionValidator = v.object({
  _id: v.id('saveBundleRevisions'),
  source: v.union(v.literal('import'), v.literal('runtime_sync'), v.literal('manual')),
  fileCount: v.number(),
  byteSize: v.number(),
  bundleHash: v.string(),
  createdAt: v.number(),
  isActive: v.boolean(),
})

async function requireProfile(ctx: MutationCtx) {
  const identity = await requireIdentity(ctx)
  const profile = await getProfileByClerkUserId(ctx, identity.subject)
  if (!profile) {
    throw new ConvexError('Profile is not initialized yet.')
  }
  return profile
}

async function getOptionalProfile(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return getProfileByClerkUserId(ctx, identity.subject)
}

function assertValidSavePath(path: string) {
  if (!/^shared\.dat$/.test(path) && !/^user[1-4]\.dat(?:\.bak[1-3])?$/.test(path)) {
    throw new ConvexError(`Unsupported save path "${path}".`)
  }
}

async function ensureRuntime(
  ctx: MutationCtx,
  slug: string,
  runtimeVersion = 'runtime-artifact-required',
) {
  const existing = await ctx.db
    .query('gameRuntimes')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique()

  if (existing) {
    if (existing.runtimeVersion !== runtimeVersion) {
      await ctx.db.patch(existing._id, {
        runtimeVersion,
        updatedAt: Date.now(),
      })
      return (await ctx.db.get(existing._id))!
    }

    return existing
  }

  const runtimeId = await ctx.db.insert('gameRuntimes', {
    slug,
    name: 'Hollow Knight',
    runtimeVersion,
    canonicalRuntimePath: '/runtime/hollow-knight/',
    updatedAt: Date.now(),
  })

  return (await ctx.db.get(runtimeId))!
}

async function getBundleForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerProfileId: Id<'profiles'>,
  runtimeSlug: string,
) {
  return ctx.db
    .query('saveBundles')
    .withIndex('by_owner_and_runtime', (q) =>
      q.eq('ownerProfileId', ownerProfileId).eq('runtimeSlug', runtimeSlug),
    )
    .unique()
}

async function materializeRevision(
  ctx: QueryCtx | MutationCtx,
  revisionId: Id<'saveBundleRevisions'>,
) {
  const revision = await ctx.db.get(revisionId)
  if (!revision) {
    return null
  }

  const files = await ctx.db
    .query('saveBundleFiles')
    .withIndex('by_revision', (q) => q.eq('revisionId', revision._id))
    .collect()

  const filePayload = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      size: file.size,
      sha256: file.sha256,
      url: await ctx.storage.getUrl(file.storageId),
    })),
  )

  return {
    _id: revision._id,
    source: revision.source,
    fileCount: revision.fileCount,
    byteSize: revision.byteSize,
    bundleHash: revision.bundleHash,
    createdAt: revision.createdAt,
    files: filePayload,
  }
}

async function createRevision(args: {
  ctx: MutationCtx
  ownerProfileId: Id<'profiles'>
  runtimeSlug: string
  runtimeVersion: string
  bundleId: Id<'saveBundles'>
  bundleHash: string
  baseBundleHash?: string
  source: 'import' | 'runtime_sync' | 'manual'
  files: Array<{
    path: string
    size: number
    sha256: string
    storageId: Id<'_storage'>
  }>
}) {
  const { ctx, ownerProfileId, runtimeSlug, runtimeVersion, bundleId, bundleHash, baseBundleHash, source, files } = args
  const byteSize = files.reduce((sum, file) => sum + file.size, 0)
  const createdAt = Date.now()

  const revisionId = await ctx.db.insert('saveBundleRevisions', {
    bundleId,
    ownerProfileId,
    runtimeSlug,
    runtimeVersion,
    source,
    fileCount: files.length,
    byteSize,
    bundleHash,
    baseBundleHash,
    createdAt,
  })

  await Promise.all(
    files.map((file) =>
      ctx.db.insert('saveBundleFiles', {
        revisionId,
        ownerProfileId,
        runtimeSlug,
        path: file.path,
        mimeType: 'application/octet-stream',
        size: file.size,
        storageId: file.storageId,
        sha256: file.sha256,
      }),
    ),
  )

  return { revisionId, byteSize, createdAt }
}

export const generateImportUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireProfile(ctx)
    return ctx.storage.generateUploadUrl()
  },
})

export const commitImportedFiles = mutation({
  args: {
    runtimeSlug: runtimeSlugValidator,
    runtimeVersion: v.string(),
    bundleHash: v.string(),
    files: v.array(saveFileInputValidator),
  },
  returns: v.id('saveBundleRevisions'),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    await ensureRuntime(ctx, args.runtimeSlug, args.runtimeVersion)
    const now = Date.now()
    const existingBundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)

    args.files.forEach((file) => assertValidSavePath(file.path))

    const bundleId: Id<'saveBundles'> =
      existingBundle?._id ??
      (await ctx.db.insert('saveBundles', {
        ownerProfileId: profile._id,
        runtimeSlug: args.runtimeSlug,
        runtimeVersion: args.runtimeVersion,
        status: 'importing',
        manifestVersion: 1,
        lastImportedAt: now,
        lastSyncedAt: now,
      }))

    const { revisionId } = await createRevision({
      ctx,
      ownerProfileId: profile._id,
      runtimeSlug: args.runtimeSlug,
      runtimeVersion: args.runtimeVersion,
      bundleId,
      bundleHash: args.bundleHash,
      source: 'import',
      files: args.files,
    })

    await ctx.db.patch(bundleId, {
      runtimeVersion: args.runtimeVersion,
      status: 'ready',
      manifestVersion: 1,
      activeRevisionId: revisionId,
      lastImportedAt: now,
      lastSyncedAt: now,
    })

    return revisionId
  },
})

export const getActiveBundle = query({
  args: {
    runtimeSlug: runtimeSlugValidator,
  },
  returns: v.union(
    v.object({
      _id: v.id('saveBundles'),
      runtimeSlug: v.string(),
      runtimeVersion: v.string(),
      status: v.string(),
      lastImportedAt: v.optional(v.number()),
      lastSyncedAt: v.optional(v.number()),
      lastPlayedAt: v.optional(v.number()),
      activeRevision: v.union(
        v.object({
          _id: v.id('saveBundleRevisions'),
          source: v.union(v.literal('import'), v.literal('runtime_sync'), v.literal('manual')),
          fileCount: v.number(),
          byteSize: v.number(),
          bundleHash: v.string(),
          createdAt: v.number(),
          files: v.array(saveFileOutputValidator),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profile = await getOptionalProfile(ctx)
    if (!profile) {
      return null
    }
    const bundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)
    if (!bundle) {
      return null
    }

    return {
      _id: bundle._id,
      runtimeSlug: bundle.runtimeSlug,
      runtimeVersion: bundle.runtimeVersion,
      status: bundle.status,
      lastImportedAt: bundle.lastImportedAt,
      lastSyncedAt: bundle.lastSyncedAt,
      lastPlayedAt: bundle.lastPlayedAt,
      activeRevision: bundle.activeRevisionId
        ? await materializeRevision(ctx, bundle.activeRevisionId)
        : null,
    }
  },
})

export const getLaunchBundle = query({
  args: {
    runtimeSlug: runtimeSlugValidator,
  },
  returns: v.union(
    v.object({
      runtimeSlug: v.string(),
      runtimeVersion: v.string(),
      status: v.string(),
      lastSyncedAt: v.optional(v.number()),
      activeRevision: v.union(
        v.object({
          _id: v.id('saveBundleRevisions'),
          source: v.union(v.literal('import'), v.literal('runtime_sync'), v.literal('manual')),
          fileCount: v.number(),
          byteSize: v.number(),
          bundleHash: v.string(),
          createdAt: v.number(),
          files: v.array(saveFileOutputValidator),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profile = await getOptionalProfile(ctx)
    if (!profile) {
      return null
    }

    const bundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)
    if (!bundle) {
      return null
    }

    const activeRevision = bundle.activeRevisionId
      ? await materializeRevision(ctx, bundle.activeRevisionId)
      : null

    return {
      runtimeSlug: bundle.runtimeSlug,
      runtimeVersion: bundle.runtimeVersion,
      status: bundle.status,
      lastSyncedAt: bundle.lastSyncedAt,
      activeRevision,
    }
  },
})

export const listRevisions = query({
  args: {
    runtimeSlug: runtimeSlugValidator,
  },
  returns: v.array(revisionValidator),
  handler: async (ctx, args) => {
    const profile = await getOptionalProfile(ctx)
    if (!profile) {
      return []
    }
    const bundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)
    if (!bundle) {
      return []
    }

    const revisions = await ctx.db
      .query('saveBundleRevisions')
      .withIndex('by_bundle', (q) => q.eq('bundleId', bundle._id))
      .collect()

    return revisions
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((revision) => ({
        _id: revision._id,
        source: revision.source,
        fileCount: revision.fileCount,
        byteSize: revision.byteSize,
        bundleHash: revision.bundleHash,
        createdAt: revision.createdAt,
        isActive: bundle.activeRevisionId === revision._id,
      }))
  },
})

export const promoteRevision = mutation({
  args: {
    revisionId: v.id('saveBundleRevisions'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const revision = await ctx.db.get(args.revisionId)
    if (!revision || revision.ownerProfileId !== profile._id) {
      throw new ConvexError('Revision not found.')
    }

    const bundle = await ctx.db.get(revision.bundleId)
    if (!bundle || bundle.ownerProfileId !== profile._id) {
      throw new ConvexError('Save bundle not found.')
    }

    await ctx.db.patch(bundle._id, {
      activeRevisionId: revision._id,
      status: 'ready',
      lastSyncedAt: Date.now(),
    })

    return null
  },
})

export const markRuntimeSessionStarted = mutation({
  args: {
    runtimeSlug: runtimeSlugValidator,
    runtimeVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    await ensureRuntime(ctx, args.runtimeSlug, args.runtimeVersion)
    const bundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)
    if (!bundle) {
      return null
    }

    await ctx.db.patch(bundle._id, {
      lastPlayedAt: Date.now(),
      runtimeVersion: args.runtimeVersion,
    })

    return null
  },
})

export const commitRuntimeSync = mutation({
  args: {
    runtimeSlug: runtimeSlugValidator,
    runtimeVersion: v.string(),
    baseBundleHash: v.optional(v.string()),
    bundleHash: v.string(),
    files: v.array(saveFileInputValidator),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    revisionId: v.id('saveBundleRevisions'),
    lastSyncedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    await ensureRuntime(ctx, args.runtimeSlug, args.runtimeVersion)
    const now = Date.now()
    let bundle = await getBundleForOwner(ctx, profile._id, args.runtimeSlug)

    // First-time sync — no bundle exists yet (user played without importing).
    // Auto-create the bundle so the save isn't silently dropped.
    if (!bundle) {
      const bundleId = await ctx.db.insert('saveBundles', {
        ownerProfileId: profile._id,
        runtimeSlug: args.runtimeSlug,
        runtimeVersion: args.runtimeVersion,
        status: 'importing',
        manifestVersion: 1,
        lastSyncedAt: now,
      })
      bundle = (await ctx.db.get(bundleId))!
    }

    const currentRevision = bundle.activeRevisionId
      ? await ctx.db.get(bundle.activeRevisionId)
      : null
    if (
      !args.force &&
      currentRevision?.bundleHash &&
      args.baseBundleHash &&
      currentRevision.bundleHash !== args.baseBundleHash
    ) {
      throw new ConvexError('Cloud bundle changed before runtime sync completed.')
    }

    args.files.forEach((file) => assertValidSavePath(file.path))

    const { revisionId } = await createRevision({
      ctx,
      ownerProfileId: profile._id,
      runtimeSlug: args.runtimeSlug,
      runtimeVersion: args.runtimeVersion,
      bundleId: bundle._id,
      bundleHash: args.bundleHash,
      baseBundleHash: args.baseBundleHash,
      source: 'runtime_sync',
      files: args.files,
    })

    const lastSyncedAt = now
    await ctx.db.patch(bundle._id, {
      activeRevisionId: revisionId,
      lastSyncedAt,
      status: 'ready',
      runtimeVersion: args.runtimeVersion,
    })

    return {
      revisionId,
      lastSyncedAt,
    }
  },
})
