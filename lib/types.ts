export type FileNode = { name: string; path: string; type: "file" | "dir"; children?: FileNode[] };
