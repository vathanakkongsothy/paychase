import { createCoreClient } from "@/server/core/client";
import { getCoreConfig, requireCoreConfig } from "@/server/core/config";
import {
  CoreClientError,
  CoreSyncError,
  CoreUnavailableError,
} from "@/server/core/errors";

type LocalUser = {
  id: string;
  name: string;
  email: string;
};

type LocalWorkspace = {
  id: string;
  name: string;
};

export function workspaceSlug(workspaceId: string): string {
  const normalized = workspaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = `pc-${normalized}`.slice(0, 63);
  if (slug.length < 2) {
    throw new CoreSyncError("Could not derive a valid workspace slug for Phumi Core.");
  }
  return slug;
}

async function upsertCoreUser(
  user: LocalUser,
  workspace?: LocalWorkspace,
): Promise<string> {
  const client = createCoreClient(requireCoreConfig());
  const coreUser = await client.upsertUser({
    externalId: user.id,
    displayName: user.name,
    email: user.email,
    locale: "en",
    ...(workspace
      ? {
          metadata: {
            paychaseWorkspaceId: workspace.id,
            paychaseWorkspaceName: workspace.name,
          },
        }
      : {}),
  });
  return coreUser.id;
}

async function ensureCoreTenant(
  workspace: LocalWorkspace,
  ownerCoreUserId: string,
  allowExisting: boolean,
): Promise<void> {
  const client = createCoreClient(requireCoreConfig());
  try {
    await client.createTenant({
      externalId: workspace.id,
      slug: workspaceSlug(workspace.id),
      name: workspace.name,
      ownerUserId: ownerCoreUserId,
      metadata: { source: "paychase" },
    });
  } catch (error) {
    if (allowExisting && error instanceof CoreClientError && error.status === 409) {
      return;
    }
    throw error;
  }
}

export async function syncIdentityToCore(input: {
  user: LocalUser;
  workspace: LocalWorkspace;
  allowExistingTenant?: boolean;
}): Promise<void> {
  if (!getCoreConfig()) {
    throw new CoreSyncError(
      "Phumi Core is not configured. Set CORE_API_URL, CORE_APP_ID, and CORE_REQUEST_SECRET.",
    );
  }

  try {
    const ownerCoreUserId = await upsertCoreUser(input.user, input.workspace);
    await ensureCoreTenant(
      input.workspace,
      ownerCoreUserId,
      input.allowExistingTenant ?? false,
    );
  } catch (error) {
    if (error instanceof CoreUnavailableError) {
      throw error;
    }
    if (error instanceof CoreClientError) {
      throw new CoreSyncError(error.message);
    }
    throw error;
  }
}

export async function syncUserProfileToCore(input: {
  user: LocalUser;
  workspace?: LocalWorkspace | null;
}): Promise<void> {
  if (!getCoreConfig()) {
    return;
  }

  try {
    await upsertCoreUser(input.user, input.workspace ?? undefined);
  } catch (error) {
    if (error instanceof CoreUnavailableError) {
      console.warn("Phumi Core unavailable during profile sync; continuing locally.", error);
      return;
    }
    if (error instanceof CoreClientError) {
      console.warn("Phumi Core profile sync failed; continuing locally.", error);
      return;
    }
    throw error;
  }
}

export async function retryIdentitySyncOnLogin(input: {
  user: LocalUser;
  workspace: LocalWorkspace;
}): Promise<void> {
  if (!getCoreConfig()) {
    console.warn("Phumi Core is not configured; skipping identity sync on login.");
    return;
  }

  try {
    await syncIdentityToCore({
      user: input.user,
      workspace: input.workspace,
      allowExistingTenant: true,
    });
  } catch (error) {
    console.warn("Phumi Core identity sync failed on login; allowing local session.", error);
  }
}
