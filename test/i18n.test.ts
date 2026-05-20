import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocale, tSync } from "../src/i18n/index.js";

test("resolveLocale uses saved locale", () => {
  assert.equal(resolveLocale({ locale: "it", languageCode: "en" }), "it");
});

test("resolveLocale falls back from Telegram language", () => {
  assert.equal(resolveLocale({ languageCode: "ru-RU" }), "ru");
  assert.equal(resolveLocale({ languageCode: "it-IT" }), "it");
  assert.equal(resolveLocale({ languageCode: "de" }), "en");
});

test("tSync interpolates params", () => {
  const text = tSync("en", "goal_exceeded", { today: 2500, target: 2000, over: 500 });
  assert.match(text, /2500/);
  assert.match(text, /2000/);
  assert.match(text, /500/);
});
