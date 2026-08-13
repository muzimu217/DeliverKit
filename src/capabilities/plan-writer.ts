import * as fs from 'node:fs';

export interface PlanWriteResult {
  ok: boolean;
  reason?: string;
}

export function writePlan(planPath: string, content: string): PlanWriteResult {
  try {
    if (fs.existsSync(planPath)) {
      const existing = fs.readFileSync(planPath, 'utf8');
      if (existing.includes('<!-- user-managed -->')) {
        fs.appendFileSync(
          planPath,
          `\n\n<!-- regenerated at ${new Date().toISOString()} -->\n${content}`
        );
        return { ok: true };
      }
    }
    fs.writeFileSync(planPath, content, 'utf8');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
