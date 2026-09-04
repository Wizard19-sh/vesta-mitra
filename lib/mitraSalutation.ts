export function resolveMemberSalutation(input: {
  preferredSalutation?: string | null;
  displayName: string;
}) {
  const preferred = input.preferredSalutation?.trim();
  if (preferred) return uppercaseFirst(preferred);
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("A display name is required when no preferred salutation is saved");
  return `${displayName} Ji`;
}

function uppercaseFirst(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
