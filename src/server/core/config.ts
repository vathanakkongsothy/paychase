export type CoreConfig = {
  apiUrl: string;
  appId: string;
  requestSecret: string;
};

export function getCoreConfig(): CoreConfig | null {
  const apiUrl = process.env.CORE_API_URL?.trim();
  const appId = process.env.CORE_APP_ID?.trim();
  const requestSecret = process.env.CORE_REQUEST_SECRET?.trim();

  if (!apiUrl || !appId || !requestSecret) {
    return null;
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    appId,
    requestSecret,
  };
}

export function requireCoreConfig(): CoreConfig {
  const config = getCoreConfig();
  if (!config) {
    throw new Error(
      "Phumi Core is not configured. Set CORE_API_URL, CORE_APP_ID, and CORE_REQUEST_SECRET.",
    );
  }
  return config;
}
