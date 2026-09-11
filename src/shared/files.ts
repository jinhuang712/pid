/** What PID knows about a path the user attached. Always an absolute path on this machine; bytes are never copied. */
export interface PathInfo {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  /** Bytes for files; direct children for directories. */
  size: number;
}
