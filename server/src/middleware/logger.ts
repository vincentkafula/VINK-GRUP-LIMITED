import { Request, Response, NextFunction } from "express";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function statusColor(code: number): string {
  if (code >= 500) return colors.red;
  if (code >= 400) return colors.yellow;
  if (code >= 300) return colors.cyan;
  return colors.green;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const sc = statusColor(res.statusCode);
    console.log(
      `${colors.dim}${new Date().toISOString()}${colors.reset} ` +
      `${sc}${res.statusCode}${colors.reset} ` +
      `${colors.cyan}${req.method.padEnd(7)}${colors.reset} ` +
      `${req.originalUrl} ` +
      `${colors.dim}${ms}ms${colors.reset}`
    );
  });
  next();
}
