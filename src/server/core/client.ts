import type { CoreConfig } from "@/server/core/config";
import { CoreClientError, CoreUnavailableError } from "@/server/core/errors";
import { requestSignature, signingTimestamp } from "@/server/core/signing";
import type {
  CoreErrorBody,
  CoreTenant,
  CoreUser,
  CreateTenantInput,
  UpsertUserInput,
} from "@/server/core/types";

function signingPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function parseErrorBody(response: Response): Promise<CoreErrorBody | null> {
  try {
    return (await response.json()) as CoreErrorBody;
  } catch {
    return null;
  }
}

export class CoreClient {
  constructor(private readonly config: CoreConfig) {}

  private async request<T>(
    method: string,
    pathname: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<{ data: T; status: number }> {
    const signedPath = signingPath(pathname);
    const queryString =
      query && Object.keys(query).length
        ? `?${new URLSearchParams(query).toString()}`
        : "";
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const timestamp = signingTimestamp();
    const signature = requestSignature({
      method,
      path: signedPath,
      timestamp,
      rawBody,
      secret: this.config.requestSecret,
    });

    let response: Response;
    try {
      response = await fetch(`${this.config.apiUrl}${signedPath}${queryString}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-app-id": this.config.appId,
          "x-timestamp": timestamp,
          "x-signature": signature,
        },
        ...(rawBody ? { body: rawBody } : {}),
      });
    } catch (cause) {
      console.error("Phumi Core request failed", { method, path: signedPath, cause });
      throw new CoreUnavailableError();
    }

    if (response.ok) {
      if (response.status === 204) {
        return { data: undefined as T, status: response.status };
      }
      return { data: (await response.json()) as T, status: response.status };
    }

    const errorBody = await parseErrorBody(response);
    throw new CoreClientError(
      errorBody?.error.message ?? `Phumi Core request failed (${response.status})`,
      response.status,
      errorBody?.error.code,
    );
  }

  async upsertUser(input: UpsertUserInput): Promise<CoreUser> {
    const { data } = await this.request<{ user: CoreUser }>("PUT", "/v1/users", input);
    return data.user;
  }

  async resolveUser(externalId: string): Promise<CoreUser> {
    const { data } = await this.request<{ user: CoreUser }>(
      "GET",
      "/v1/users/resolve",
      undefined,
      { externalId },
    );
    return data.user;
  }

  async createTenant(input: CreateTenantInput): Promise<CoreTenant> {
    const { data } = await this.request<{ tenant: CoreTenant }>(
      "POST",
      "/v1/tenants",
      input,
    );
    return data.tenant;
  }
}

export function createCoreClient(config: CoreConfig): CoreClient {
  return new CoreClient(config);
}
