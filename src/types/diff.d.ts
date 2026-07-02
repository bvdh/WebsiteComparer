// Minimal ambient declarations for the subset of the `diff` package used by the
// client. The published `diff@7` package does not ship type declarations and
// `@types/diff` is not installed, so we declare only what App.tsx imports.
declare module "diff" {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export function diffWords(oldStr: string, newStr: string, options?: unknown): Change[];
}
