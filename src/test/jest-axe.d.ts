declare module "jest-axe" {
  export interface AxeViolation {
    impact: "minor" | "moderate" | "serious" | "critical" | null;
  }

  export interface AxeResults {
    violations: AxeViolation[];
  }

  export function axe(
    html: Element | string,
    options?: Record<string, unknown>,
  ): Promise<AxeResults>;
}
