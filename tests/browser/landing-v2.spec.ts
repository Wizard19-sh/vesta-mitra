import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDirectory = path.resolve("artifacts");

test.beforeAll(async () => {
  await mkdir(artifactDirectory, { recursive: true });
});

test("landing matches the approved desktop structure and navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "The everyday things you care about. Taken care of.",
    }),
  ).toBeVisible();
  await expect(page.getByText("English · Hindi · Hinglish").first()).toBeVisible();
  await expect(page.getByText("Handled by Aevia")).toBeVisible();
  await expect(page.getByText("One Aevia. The right help when you need it.")).toBeVisible();
  await expect(page.getByText("Works where life happens.")).toBeVisible();

  const carousel = page.getByRole("region", {
    name: "Household WhatsApp examples",
  });
  await carousel.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator('[aria-label="Example 2 of 3"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show Medicine reminder" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await expectNoPageOverflow(page);
  await page.screenshot({
    path: path.join(artifactDirectory, "landing-desktop-1440.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Hello Aevia" }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);

  for (const [label, route] of [
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["Beta status", "/beta"],
  ] as const) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
  }
});

for (const width of [1024, 768]) {
  test(`landing has no page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expectNoPageOverflow(page);
  });
}

test("mobile layout is composed for touch and remains readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Hello Aevia" }).first()).toBeVisible();
  await expect(page.getByText("English · Hindi · Hinglish").first()).toBeVisible();
  await expectNoPageOverflow(page);

  const carousel = page.getByRole("region", {
    name: "Household WhatsApp examples",
  });
  const overflow = await carousel.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.overflowX).toBe("auto");
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);

  await carousel.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator('[aria-label="Example 2 of 3"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show Medicine reminder" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.screenshot({
    path: path.join(artifactDirectory, "landing-mobile-390.png"),
    fullPage: true,
  });
});

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}
