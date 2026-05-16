const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

export function info(message: string): void {
  process.stderr.write(`[triage] ${message}\n`);
}

export function debug(message: string): void {
  if (DEBUG) {
    process.stderr.write(`[triage:debug] ${message}\n`);
  }
}

export function warn(message: string): void {
  process.stderr.write(`[triage:warn] ${message}\n`);
}
