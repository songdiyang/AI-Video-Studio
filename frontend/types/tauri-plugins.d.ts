// Tauri 插件类型声明

declare module '@tauri-apps/plugin-dialog' {
  export interface OpenDialogOptions {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    multiple?: boolean;
    directory?: boolean;
  }

  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
}

declare module '@tauri-apps/plugin-shell' {
  export function open(path: string): Promise<void>;
}

declare module '@tauri-apps/plugin-fs' {
  export function readTextFile(path: string): Promise<string>;
  export function writeTextFile(path: string, contents: string): Promise<void>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, contents: Uint8Array): Promise<void>;
  export function exists(path: string): Promise<boolean>;
  export function createDir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function removeDir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function removeFile(path: string): Promise<void>;
  export function renameFile(oldPath: string, newPath: string): Promise<void>;
  export function copyFile(source: string, destination: string): Promise<void>;
}

declare module '@tauri-apps/plugin-sql' {
  export interface Database {
    execute(query: string, bindValues?: any[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
    select<T = any>(query: string, bindValues?: any[]): Promise<T[]>;
    close(): Promise<void>;
  }

  export default class Database {
    static load(path: string): Promise<Database>;
  }
}
