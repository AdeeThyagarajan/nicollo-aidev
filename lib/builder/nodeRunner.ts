import { spawn } from "child_process";

export type RunResult = { ok: true; stdout: string } | { ok: false; stdout: string; stderr: string; code: number };

export function runCmd(cwd: string, cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: process.env, shell: process.platform === "win32" });

    let stdout = "";
    let stderr = "";

    const t = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch {}
      resolve({ ok: false, stdout, stderr: stderr + "\nTimed out", code: 124 });
    }, timeoutMs);

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ ok: true, stdout });
      else resolve({ ok: false, stdout, stderr, code: code ?? 1 });
    });
  });
}
