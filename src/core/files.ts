/** A file to upload in a multipart form. */
export class FileUpload {
  private constructor(
    private readonly content: Blob,
    /** The file name sent to the API. */
    readonly fileName: string,
  ) {}

  /** A file from bytes (or text). */
  static fromBytes(content: Uint8Array | ArrayBuffer | string, fileName: string, contentType = 'application/octet-stream'): FileUpload {
    const part: BlobPart = typeof content === 'string' ? content : content instanceof Uint8Array ? new Uint8Array(content) : content;
    return new FileUpload(new Blob([part], { type: contentType }), fileName);
  }

  /** A file from a `Blob` (or a `File`). */
  static fromBlob(content: Blob, fileName: string): FileUpload {
    return new FileUpload(content, fileName);
  }

  /** @internal */
  toBlob(): Blob {
    return this.content;
  }
}
