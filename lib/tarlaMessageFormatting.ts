export function naturalizeCookMessage(value: string) {
  return value
    .replace(/\(\d+(?:\.\d+)? serving equivalents\)/g, "— household quantity")
    .replace(/(\d+)\.(\d+) g/g, (match) => {
      const quantity = Number(match.slice(0, -2));
      return Number.isFinite(quantity) ? Math.round(quantity) + " g" : match;
    });
}
