import type { WatchedCompany } from "@/types";

/** Human-readable label for a watched company: "Name (TICKER)" when a ticker exists, else "Name". */
export function companyLabel(company: Pick<WatchedCompany, "name" | "ticker">): string {
  return company.ticker ? `${company.name} (${company.ticker})` : company.name;
}
