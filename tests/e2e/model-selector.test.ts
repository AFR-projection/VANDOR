import { expect, test } from "@playwright/test";
import { CHAT_MODE_OPTIONS } from "@/lib/ai/chat-modes";
import { MODEL_TIER_IDS, tierCookieValue } from "@/lib/ai/model-tiers";

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays mode button", async ({ page }) => {
    await expect(page.getByTestId("model-selector")).toBeVisible();
  });

  test("opens picker with four tiers", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await expect(page.getByText("Gratis", { exact: true })).toBeVisible();
    await expect(page.getByText("Hemat", { exact: true })).toBeVisible();
    await expect(page.getByText("Seimbang", { exact: true })).toBeVisible();
    await expect(page.getByText("Premium", { exact: true })).toBeVisible();
  });

  test("can select Gratis tier", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await page.getByText("Gratis", { exact: true }).click();
    await expect(page.getByTestId("model-selector")).toContainText("Gratis");
  });

  test("can select Premium tier", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await page.getByText("Premium", { exact: true }).click();
    await expect(page.getByTestId("model-selector")).toContainText("Premium");
  });

  test("four chat tier modes exist", () => {
    expect(CHAT_MODE_OPTIONS).toHaveLength(4);
    expect(CHAT_MODE_OPTIONS.map((o) => o.tier)).toEqual([...MODEL_TIER_IDS]);
    expect(CHAT_MODE_OPTIONS.map((o) => o.id)).toEqual(
      MODEL_TIER_IDS.map((t) => tierCookieValue(t))
    );
  });
});
