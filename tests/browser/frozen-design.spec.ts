import { expect, test } from "@playwright/test";

test("frozen design supports a fresh household from landing to dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: /The everyday things you care about/ })).toBeVisible();
  await expectNoOverflow(page);
  await expectNoBrokenImages(page);

  await page.getByRole("link", { name: /Get started/ }).first().click();
  await page.getByLabel("Your name").fill("Sid");
  await page.getByLabel("Email").fill(`frozen-${Date.now()}@example.invalid`);
  await page.getByLabel("Household name").fill(`Frozen Design ${Date.now()}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue to Care & Help" }).click();
  await page.getByRole("button", { name: /Kitchen & meals Tarla/ }).click();
  await page.getByRole("button", { name: "Continue to Details" }).click();
  await page.getByRole("button", { name: /Sid Self/ }).click();
  await page.getByRole("button", { name: "Continue to Food Preferences" }).click();
  await page.getByRole("button", { name: "North Indian" }).click();
  await page.getByLabel("Tell Tarla what your household loves eating").fill("dal, bhindi");
  await page.getByLabel("Any allergies or foods we should never include?").fill("peanut");
  await page.getByRole("button", { name: "Continue to Nutrition & Rules" }).click();
  await page.getByRole("button", { name: /Plan around nutrition goals/ }).click();
  await page.getByRole("checkbox", { name: /Use a nutrition goal for Sid/ }).check();
  await page.getByRole("spinbutton", { name: /^Age/ }).fill("34");
  await page.getByLabel("Sex / biological profile").selectOption("male");
  await page.getByLabel("Height feet").fill("5");
  await page.getByLabel("Height inches").fill("9");
  await page.getByRole("spinbutton", { name: /^Weight/ }).fill("72");
  await page.getByLabel("Activity level & expenditure").selectOption("lightly_active");
  await page.getByRole("button", { name: "Continue to Cooking Setup" }).click();
  await page.getByRole("button", { name: "I cook" }).click();
  await page.getByLabel("WhatsApp number").fill("9876500044");
  await page.getByRole("button", { name: "Continue to Household Context" }).click();
  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(page.getByRole("heading", { name: "Here's what Aevia understood." })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and create" }).click();
  await expect(page.getByRole("heading", { name: "Your first Tarla plan" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("For the kitchen")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/jx[0-9a-z]{20,}/i);
  await expectNoOverflow(page);

  await page.getByRole("button", { name: "Approve and activate" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  for (const route of ["/household", "/mitra", "/tarla"] as const) {
    await page.goto(route);
    await expectNoOverflow(page);
    await expect(page.locator("body")).not.toContainText(/jx[0-9a-z]{20,}/i);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/onboarding", "/dashboard", "/household", "/mitra", "/tarla"] as const) {
    await page.goto(route);
    await expectNoOverflow(page);
  }
});

test("admin beta keeps numbers masked and stops at exact preview", async ({ page }) => {
  const key = process.env.BETA_ADMIN_KEY;
  test.skip(!key, "BETA_ADMIN_KEY is not configured for this local smoke test");
  await page.goto("/admin/beta");
  await page.getByLabel("Internal beta key").fill(key!);
  await page.getByRole("button", { name: "Load recipients" }).click();
  const recipient = page.getByLabel("Recipient");
  await expect(recipient).toBeVisible();
  const enabledValue = await recipient.locator("option", { hasText: "Mohit" }).getAttribute("value");
  expect(enabledValue).toBeTruthy();
  await recipient.selectOption(enabledValue!);
  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toMatch(/\+\d{10,15}/);
  await page.getByRole("button", { name: "Prepare exact preview" }).click();
  await expect(page.getByText("Papa, evening walk ka time ho gaya.", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel("Type SEND to confirm")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send prepared message" })).toBeVisible();
  await expectNoOverflow(page);
});

async function expectNoOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function expectNoBrokenImages(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    for (let top = 0; top < document.documentElement.scrollHeight; top += window.innerHeight) {
      window.scrollTo(0, top);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  expect(await page.locator("img").evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length)).toBe(0);
}
