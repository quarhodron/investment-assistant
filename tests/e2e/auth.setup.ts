import { test as setup, expect } from "@playwright/test";
import path from "path";
import { resetUserSettingsForE2e } from "./helpers/seed-user";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

// Credentials for the local Supabase test user.
// Override via env vars in CI: E2E_EMAIL / E2E_PASSWORD.
const EMAIL = process.env.E2E_EMAIL ?? "e2e@investment-assistant.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "e2e-password-dev";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

setup("authenticate", async ({ page }) => {
  // Attempt sign-in first; if it fails (user doesn't exist yet) sign up.
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  const url = await page
    .waitForURL((u) => u.pathname !== "/auth/signin", { timeout: 8_000 })
    .then(() => page.url())
    .catch(() => null);

  if (!url || page.url().includes("/auth/signin")) {
    // User doesn't exist yet — sign up (email confirmation disabled in local Supabase config).
    await page.goto("/auth/signup");
    await page.getByLabel("Email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#confirmPassword").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    // After sign-up the app redirects to /auth/confirm-email (even with confirmations off).
    await page.waitForURL(/\/auth\//, { timeout: 10_000 });

    // Sign in now — local Supabase with enable_confirmations=false auto-confirms on signup.
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.pathname !== "/auth/signin", { timeout: 8_000 });
  }

  // Verify we reached an authenticated page.
  await expect(page).not.toHaveURL(/\/auth\//);

  // Seed: ensure at least one prompt exists (required for NewAnalysisForm to render the run button).
  await page.goto("/prompts");
  const promptExists = await page
    .getByText("E2E test prompt")
    .isVisible()
    .catch(() => false);
  if (!promptExists) {
    await page.getByLabel("Name").fill("E2E test prompt");
    await page.getByLabel("Prompt body").fill("Summarize the following: {{input}}");
    await page.getByRole("button", { name: "Create prompt" }).click();
    await page.waitForURL(/\/prompts(\?|$)/);
    await expect(page.getByText("Prompt created successfully")).toBeVisible();
  }

  // Reset user_settings to a known state so the New Analysis form renders with
  // an OpenAI model selected and the Run button enabled. Per-spec beforeEach
  // calls this again to keep tests independent across runs and UI mode.
  await resetUserSettingsForE2e(EMAIL);

  await page.context().storageState({ path: authFile });
});
