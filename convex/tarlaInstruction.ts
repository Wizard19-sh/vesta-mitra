import { composeDayCookInstruction } from "../lib/tarlaMessages";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { loadDayMeals } from "./tarlaDaySupport";
import { loadPlanningContext } from "./tarlaSupport";

export async function composeDayExecutionInstruction(
  ctx: MutationCtx,
  execution: Doc<"tarlaExecutions">,
  dayPlan: Doc<"tarlaDayPlans">,
) {
  if (!execution.cookVisitId) throw new Error("Cook visit is missing");
  const [visit, endpoint, cook, dayMeals] = await Promise.all([
    ctx.db.get(execution.cookVisitId),
    ctx.db.get(execution.communicationEndpointId),
    ctx.db.get(execution.cookMemberId),
    loadDayMeals(ctx, dayPlan._id),
  ]);
  if (!visit || !endpoint || !cook) throw new Error("Cook instruction context was not found");
  const cookState = await ctx.db.get(visit.cookStateId);
  if (!cookState) throw new Error("Cooking person context was not found");
  const assignedMealSlots = execution.assignedMealSlots ?? visit.mealSlots;
  const visitMeals = dayMeals
    .filter((meal) => assignedMealSlots.includes(meal.join.mealSlot))
    .map((meal) => meal.calculated);
  if (!visitMeals.length) throw new Error("Day plan has no meals assigned to this visit");
  const planning = await loadPlanningContext(
    ctx,
    dayPlan.householdId,
    dayPlan.memberDailyNutrition.map((member) => member.memberId),
  );
  const instruction = composeDayCookInstruction({
    visitLabel: visit.label,
    targetDate: dayPlan.targetDate,
    meals: visitMeals,
    memberNotes: planning.members
      .filter((member) => member.cookNotes)
      .map((member) => ({ memberName: member.name, note: member.cookNotes! })),
    importantRestrictions: planning.members.flatMap((member) =>
      member.allergies.map((allergy) => `${member.name}: no ${allergy.replaceAll("_", " ")}`),
    ),
    cookName: cook.preferredSalutation ?? cook.name,
    preferredLanguage: endpoint.preferredLanguage ?? cook.languagePreference,
    relationshipType: cookState.relationshipType,
  });
  return { instruction, visit, endpoint, cook, cookState, visitMeals, assignedMealSlots };
}
