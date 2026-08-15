export type CoreUser = {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  locale: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CoreTenant = {
  id: string;
  appId: string;
  externalId: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CoreErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type UpsertUserInput = {
  externalId: string;
  displayName?: string;
  email?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
};

export type CreateTenantInput = {
  externalId: string;
  slug: string;
  name: string;
  ownerUserId: string;
  metadata?: Record<string, unknown>;
};
