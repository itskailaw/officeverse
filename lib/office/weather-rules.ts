/** Pure weather rules (unit-tested). */
/**
 * Rain only when it's really raining: rain/shower/storm codes with measurable rain now.
 * Model "drizzle" codes on their own (51-57) are common false alarms, so they need a heavier reading.
 */
export function isRaining(code: number, precip: number) {
  if (code >= 95) return true;
  const drizzle = code >= 51 && code <= 57;
  const rain = (code >= 61 && code <= 67) || (code >= 80 && code <= 82);
  return (rain && precip >= 0.1) || (drizzle && precip >= 0.4);
}
