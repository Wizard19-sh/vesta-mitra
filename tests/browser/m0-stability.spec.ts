import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDirectory = path.resolve("artifacts", "m0");

test.beforeAll(async () => {
  await mkdir(artifactDirectory, { recursive: true });
});

test("fresh identity continues, Back preserves values, and reload resumes", async ({
  page,
}) => {
  const testNumber = Date.now();
  const name = `M0 Browser Test ${testNumber}`;
  const email = `m0-${testNumber}@example.invalid`;
  const householdName = `M0 Test Household ${testNumber}`;

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /The everyday things you care about/i,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Meet Aevia" }).first().click();

  await expect(
    page.getByRole("heading", {
      name: "A few details, then one useful action.",
    }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", {
      name: "What would you like Aevia to take care of?",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactDirectory, "identity-to-choice.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue(name);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Household name")).toHaveValue(householdName);

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", {
      name: "What would you like Aevia to take care of?",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "What would you like Aevia to take care of?",
    }),
  ).toBeVisible();
});

test("storage read failure leaves the main session routes usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked for M0 verification", "SecurityError");
    };
  });

  for (const route of ["/onboarding", "/dashboard", "/admin/runs"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", {
        name: "Your setup isn’t available in this browser.",
      }),
    ).toBeVisible();
  }

  await page.screenshot({
    path: path.join(artifactDirectory, "storage-unavailable.png"),
    fullPage: true,
  });
});

test("storage write and analytics persistence failures do not crash navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked for M0 verification", "SecurityError");
    };
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /The everyday things you care about/i,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Meet Aevia" }).first().click();
  await expect(
    page.getByRole("heading", {
      name: "Your setup isn’t available in this browser.",
    }),
  ).toBeVisible();
});
