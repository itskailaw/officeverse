import { test } from "node:test";
import assert from "node:assert/strict";
import { translate } from "../lib/i18n-core.ts";

test("translations: Malay and Chinese, English fallback", () => {
  assert.equal(translate("ms", "Dashboard"), "Papan Pemuka");
  assert.equal(translate("zh", "Dashboard"), "仪表板");
  assert.equal(translate("en", "Dashboard"), "Dashboard");
  assert.equal(translate("zh", "Some new text"), "Some new text");
  assert.equal(translate(undefined, "Packing"), "Packing");
});
