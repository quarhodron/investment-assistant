/**
 * Risk #6 (test-plan.md) — Streamed analysis errors collapse into a single
 * opaque message, leaving the user unable to distinguish missing key, invalid
 * key, rate-limit, provider 5xx, etc.
 *
 * Approach: intercept POST /api/ai/run via page.route() and return synthetic
 * SSE error frames. The real boundary under test is the UI's friendlyError()
 * function in NewAnalysisForm.tsx — we verify it maps each error class to a
 * distinct, user-readable string that does NOT expose the raw error code.
 *
 * Prerequisites (seeded once in auth.setup.ts):
 *   - At least one prompt in DB ("E2E test prompt")
 *   - A fake OpenAI API key saved in user_settings so the Run button is enabled
 *
 * Seed: tests/e2e/seed.spec.ts
 * Rules: tests/e2e/rules.md
 */
import { test, expect, type Page } from "@playwright/test";
import { resetUserSettingsForE2e } from "./helpers/seed-user";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e@investment-assistant.local";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseErrorBody(frame: Record<string, unknown>): string {
  return `event: error\ndata: ${JSON.stringify(frame)}\n\n`;
}

async function routeWithSseError(page: Page, frame: Record<string, unknown>) {
  await page.route(
    "**/api/ai/run",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: sseErrorBody(frame),
      });
    },
    { times: 1 },
  );
}

async function fillAndSubmitForm(page: Page) {
  await page.goto("/analyses/new");

  // Hydration guard: Astro islands drop the `ssr` attribute after hydration.
  await expect(page.locator("astro-island[component-url*='NewAnalysisForm']:not([ssr])")).toHaveCount(1, {
    timeout: 10_000,
  });

  await page.getByLabel("Topic").fill("e2e test topic");
  await page.getByLabel("Title").fill("e2e test title");

  const runButton = page.getByRole("button", { name: "Run analysis" });
  await expect(runButton).toBeEnabled({ timeout: 10_000 });

  const requestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/api/ai/run"),
    { timeout: 10_000 },
  );

  await runButton.click();
  await requestPromise;
}

async function getErrorText(page: Page): Promise<string> {
  // The error panel renders: <span class="…">Error</span> <span>{friendlyError(...)}</span>
  // Find the error status indicator text, then grab the full container's text.
  const errorBanner = page
    .locator('[class*="destructive"]')
    .filter({ hasText: /^Error/ })
    .last();
  await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  return (await errorBanner.textContent())?.trim() ?? "";
}

// Reset user_settings before every test so the form always renders with an
// OpenAI model selected and the Run button enabled — no shared state from
// prior runs (UI mode) or prior tests.
test.beforeEach(async () => {
  await resetUserSettingsForE2e(E2E_EMAIL);
});

// Unroute after each test so interceptors don't bleed across tests.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// ---------------------------------------------------------------------------
// Error-class disambiguation tests (Risk #6)
// ---------------------------------------------------------------------------

test.describe("Risk #6 — each error class renders a distinct, user-readable message", () => {
  test("api_key_not_configured → tells user to add key in Settings", async ({ page }) => {
    await routeWithSseError(page, { message: "api_key_not_configured", provider: "openai" });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("Settings");
    expect(text).not.toBe("api_key_not_configured");
    expect(text).not.toMatch(/unexpected error/i);
  });

  test("api_key_corrupted → tells user to remove and re-add key", async ({ page }) => {
    await routeWithSseError(page, { message: "api_key_corrupted" });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text.toLowerCase()).toMatch(/corrupt|remov|settings/i);
    expect(text).not.toBe("api_key_corrupted");
  });

  test("invalid_model → tells user to try a different model", async ({ page }) => {
    await routeWithSseError(page, { message: "invalid_model" });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text.toLowerCase()).toMatch(/model/i);
    expect(text).not.toBe("invalid_model");
  });

  test("persist_failed → tells user analysis completed but could not be saved", async ({ page }) => {
    await routeWithSseError(page, { message: "persist_failed" });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text.toLowerCase()).toMatch(/sav/i);
    expect(text).not.toBe("persist_failed");
  });

  test("openai_api_error 401 → tells user the OpenAI key was rejected", async ({ page }) => {
    await routeWithSseError(page, { message: "openai_api_error", status: 401, code: null });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("OpenAI");
    expect(text.toLowerCase()).toMatch(/key|reject|settings/i);
    expect(text).not.toBe("openai_api_error");
  });

  test("openai_api_error 429 rate-limit → tells user to wait and try again", async ({ page }) => {
    await routeWithSseError(page, { message: "openai_api_error", status: 429, code: null });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("OpenAI");
    expect(text.toLowerCase()).toMatch(/rate|wait|limit/i);
    expect(text).not.toBe("openai_api_error");
  });

  test("openai_api_error 429 quota → tells user to check account credits", async ({ page }) => {
    await routeWithSseError(page, { message: "openai_api_error", status: 429, code: "insufficient_quota" });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("OpenAI");
    expect(text.toLowerCase()).toMatch(/quota|credit/i);
    expect(text).not.toBe("openai_api_error");
  });

  test("openai_api_error 503 → tells user provider is having issues", async ({ page }) => {
    await routeWithSseError(page, { message: "openai_api_error", status: 503, code: null });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("OpenAI");
    expect(text.toLowerCase()).toMatch(/issue|error|503/i);
    expect(text).not.toBe("openai_api_error");
  });

  test("anthropic_api_error 401 → tells user the Anthropic key was rejected", async ({ page }) => {
    await routeWithSseError(page, { message: "anthropic_api_error", status: 401, code: null });
    await fillAndSubmitForm(page);

    const text = await getErrorText(page);
    expect(text).toContain("Anthropic");
    expect(text.toLowerCase()).toMatch(/key|reject|settings/i);
    expect(text).not.toBe("anthropic_api_error");
  });

  test("error classes render different messages — not one generic fallback", async ({ page }) => {
    // Verify the two most common classes produce distinct copy, confirming the
    // UI is not collapsing all errors into one generic message.
    const messages: string[] = [];

    for (const frame of [{ message: "api_key_not_configured", provider: "openai" }, { message: "api_key_corrupted" }]) {
      await routeWithSseError(page, frame);
      await fillAndSubmitForm(page);
      messages.push(await getErrorText(page));
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }

    expect(messages[0]).not.toBe(messages[1]);
  });
});
