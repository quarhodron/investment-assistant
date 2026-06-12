/**
 * Seed test — the quality-lever exemplar every generated E2E test is modeled on.
 * Demonstrates: role-based locators, test independence, wait-for-state (not time),
 * and a name tied to a real risk from context/foundation/test-plan.md.
 *
 * Risk: navigation to /analyses/new loads without error for an authenticated user.
 */
import { test, expect } from "@playwright/test";

test("new-analysis page loads for authenticated user", async ({ page }) => {
  await page.goto("/analyses/new");

  // The page heading is always present regardless of whether the user has prompts.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
