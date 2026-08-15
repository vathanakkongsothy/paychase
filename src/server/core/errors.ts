export class CoreClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CoreClientError";
  }
}

export class CoreUnavailableError extends Error {
  constructor(message = "Phumi Core is unreachable. Try again in a moment.") {
    super(message);
    this.name = "CoreUnavailableError";
  }
}

export class CoreSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreSyncError";
  }
}
