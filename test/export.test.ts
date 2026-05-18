import test from "node:test";
import assert from "node:assert/strict";
import { renderStatsPdf } from "../src/services/pdfExport.js";

test("renders a valid PDF buffer for Ultra export", () => {
  const pdf = renderStatsPdf({
    userId: 1,
    from: "2026-05-01",
    to: "2026-05-18",
    meals: [
      {
        id: "meal-1",
        userId: 1,
        dishName: "Chicken bowl",
        calories: 550,
        macros: { proteinG: 35, fatG: 18, carbsG: 60 },
        createdAt: "2026-05-18T12:00:00.000Z",
      },
    ],
  });

  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.ok(pdf.length > 100);
});
