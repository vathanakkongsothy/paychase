export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}

async function readError(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string; success?: boolean };
    if (typeof json.error === "string" && json.error) return json.error;
    if (json.success === false) return "Check the form and try again.";
  } catch {
    // Use the raw body when the API did not return JSON.
  }
  return text || `Request failed: ${res.status}`;
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    redirectToLogin();
    throw new ApiError("Sign in required", 401);
  }
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  return handleResponse<T>(res, path);
}

export async function apiSend<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  return handleResponse<T>(res, path);
}
