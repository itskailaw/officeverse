import { test } from "node:test";
import assert from "node:assert/strict";
import { isRaining } from "../lib/office/weather-rules.ts";

test("rain only when it's really raining", () => {
  assert.equal(isRaining(61, 0.5), true); // rain
  assert.equal(isRaining(80, 0.2), true); // showers
  assert.equal(isRaining(95, 0), true); // thunderstorm
  assert.equal(isRaining(61, 0), false); // rain code but nothing falling
  assert.equal(isRaining(51, 0.1), false); // light drizzle estimate: not enough
  assert.equal(isRaining(53, 0.5), true); // heavier drizzle
  assert.equal(isRaining(3, 0.3), false); // overcast
});
