import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifacts = path.resolve("artifacts", "m1");

test.beforeAll(async () => {
  await mkdir(artifacts, { recursive: true });
});

test("fresh Both setup reuses people, reviews details, and supports returning edits", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const primaryName = `Asha Test ${stamp}`;

  await page.goto("/");
  await page.getByRole("link", { name: /Get started/ }).first().click();
  await page.getByLabel("Your name").fill(primaryName);
  await page.getByLabel("Mobile number", { exact: true }).fill("9876500001");
  await page.getByLabel("Email").fill(`m1-${stamp}@example.invalid`);
  await page.getByLabel("Household name").fill(`Test Household ${stamp}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();

  await expect(page.getByRole("heading", { name: "Who is part of your household?" })).toBeVisible();
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "+ Add household member" }).click();
  }
  const names = ["Anaya", "Arun", "Leela", "Kabir", "Mira"];
  const relationships = ["Partner / spouse", "Father", "Mother", "Child", "Child"];
  const stages = ["adult", "senior", "senior", "child", "child"];
  const salutations = ["Anaya", "Baba", "Maa", "Kabir", "Mira"];
  for (let index = 0; index < names.length; index += 1) {
    await page.getByLabel("Name", { exact: true }).nth(index + 1).fill(names[index]);
    await page.getByLabel("Relationship", { exact: true }).nth(index + 1).fill(relationships[index]);
    await page.getByLabel("Life stage").nth(index + 1).selectOption(stages[index]);
    await page.getByLabel("What do you call them?").nth(index + 1).fill(salutations[index]);
  }
  await page.getByLabel("Preferred language").nth(2).selectOption("Hinglish");
  await page.getByLabel("WhatsApp number", { exact: true }).nth(1).fill("9876500011");
  await page.screenshot({ path: path.join(artifacts, "flexible-household.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /Both One household setup/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Arun Father/ }).click();
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Natural label").fill("Evening walk");
  await page.getByText("Add notes or context").click();
  await page.getByPlaceholder(/Usually walks downstairs/).fill("Usually walks downstairs in the society.");
  await page.getByRole("button", { name: "+ Add another routine" }).click();
  const routineCards = page.locator("article").filter({ hasText: /Routine [12]/ });
  await routineCards.nth(1).getByRole("button", { name: "Medication" }).click();
  await routineCards.nth(1).getByLabel("Family-friendly medicine reference").fill("Morning medicine");
  await routineCards.nth(1).getByLabel("Exact medicine name").fill("Verified medicine label");
  await page.getByRole("button", { name: "Continue" }).click();

  for (const name of [primaryName, "Anaya", "Arun", "Leela", "Kabir"]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "North Indian" }).click();
  await page.getByRole("button", { name: "South Indian" }).click();
  await page.getByLabel("Tell Tarla what your household loves eating").fill("dal chawal, dosa");
  await page.getByLabel("Any allergies or foods we should never include?").fill("peanut");
  await page.getByRole("button", { name: "Less oil" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "+ Add rule" }).click();
  const rule = page.locator("article").filter({ hasText: "New food rule" });
  await rule.getByRole("button", { name: "Tue" }).click();
  await rule.getByRole("button", { name: "Thu" }).click();
  await rule.getByLabel("Rule").fill("Vegetarian");
  await page.getByRole("button", { name: /Plan around nutrition goals/ }).click();
  const nutrition = page.locator("details").filter({ hasText: primaryName });
  await nutrition.getByRole("checkbox").check();
  await nutrition.getByRole("spinbutton", { name: /^Age/ }).fill("34");
  await nutrition.getByLabel("Sex used by the calculation").selectOption("female");
  await nutrition.getByLabel("Activity level").selectOption("lightly_active");
  await nutrition.getByLabel("Height feet").fill("5");
  await nutrition.getByLabel("Height inches").fill("5");
  await nutrition.getByRole("spinbutton", { name: /^Weight/ }).fill("62");
  await nutrition.getByLabel("Goal", { exact: true }).selectOption("maintain");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Hired cook" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Kitchen Test Contact");
  await page.getByLabel("How should Tarla address them?").fill("Didi");
  await page.getByLabel("WhatsApp number", { exact: true }).fill("9876500022");
  await page.getByRole("button", { name: "Family member" }).click();
  await page.getByLabel("Choose household member").selectOption({ label: "Anaya" });
  await page.getByLabel("WhatsApp number", { exact: true }).nth(1).fill("9876500033");
  await page.getByRole("checkbox", { name: /They have agreed/ }).nth(1).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Household notes and preferences").fill("We usually eat lighter dinners. This is generic browser-test context.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Here's what Aevia understood." })).toBeVisible();
  await expect(page.getByText("Mitra will help Baba")).toBeVisible();
  await expect(page.getByText(/Tarla will plan for/)).toContainText("Arun");
  await page.screenshot({ path: path.join(artifacts, "shared-member-review.png"), fullPage: true });

  await page.getByRole("button", { name: "Confirm and create" }).click();
  await expect(page.getByRole("heading", { name: "Your first Tarla plan" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("For the kitchen")).toBeVisible();
  await expect(page.getByText("serving equivalent", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: path.join(artifacts, "per-person-and-kitchen-portions.png"), fullPage: true });
  await page.getByRole("checkbox", { name: /I've introduced Tarla/ }).check();
  await page.getByRole("button", { name: "Approve plan" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.reload();
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(page.getByRole("heading", { name: "Who is part of your household?" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).nth(3).fill("Leela Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Exact medicine name")).toHaveValue("Verified medicine label");
  await page.getByLabel("Natural label").first().fill("Evening society walk");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add your own preference").fill("lighter weekday dinners");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Rule").fill("Vegetarian meals");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Leela Test", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Evening society walk/).first()).toBeVisible();
  await expect(page.getByText(/lighter weekday dinners/).first()).toBeVisible();
  await expect(page.getByText(/Morning medicine/).first()).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "returning-edit-review.png"), fullPage: true });
  await page.getByRole("button", { name: "Confirm and save changes" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
});

test("mobile onboarding has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stamp = Date.now();
  await page.goto("/onboarding");
  await page.getByLabel("Your name").fill(`Mobile Test ${stamp}`);
  await page.getByLabel("Mobile number", { exact: true }).fill("9876500099");
  await page.getByLabel("Email").fill(`mobile-${stamp}@example.invalid`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.getByRole("button", { name: "+ Add household member" }).click();
  await page.getByLabel("Name", { exact: true }).nth(1).fill("Family Member");
  await page.getByLabel("Relationship", { exact: true }).nth(1).fill("Partner / spouse");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(artifacts, "mobile-onboarding-390.png"), fullPage: true });
});
