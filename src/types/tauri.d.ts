declare module "@tauri-apps/api/fs" {
  export function readTextFile(path: string): Promise<string>;
}


