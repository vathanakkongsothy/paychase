export type StoredObject = {
  url: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type StoredFileContents = {
  bytes: Buffer;
  contentType: string;
};
