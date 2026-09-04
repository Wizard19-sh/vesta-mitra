import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifacts = path.resolve("artifacts");
test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test("final landing matches its frozen structure", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await page.goto("/"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: /The everyday things you care about/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Two distinct intelligences. One seamless home." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Real conversations on WhatsApp." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Helpful enough to act/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Aevia" }).first()).toBeVisible();
  await expectNoBrokenImages(page);
  await expectNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "landing-desktop-1440.png"), fullPage: true });
  await page.getByRole("link", { name: /Get started/ }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("final landing fits 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.goto("/"))?.status()).toBe(200);
  await expect(page.getByRole("link", { name: /Get started/ }).first()).toBeVisible();
  await expectNoBrokenImages(page);
  await expectNoOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "landing-mobile-390.png"), fullPage: true });
});

async function expectNoOverflow(page: import("@playwright/test").Page) { await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); }
async function expectNoBrokenImages(page: import("@playwright/test").Page) { await page.evaluate(async () => { for (let top = 0; top < document.documentElement.scrollHeight; top += window.innerHeight) { window.scrollTo(0, top); await new Promise((resolve) => setTimeout(resolve, 30)); } window.scrollTo(0, 0); }); await page.waitForLoadState("networkidle"); expect(await page.locator("img").evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length)).toBe(0); }
