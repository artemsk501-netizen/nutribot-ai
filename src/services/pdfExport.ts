import type { MealEntry } from "../types/index.js";

interface PdfExportData {
  userId: number;
  from: string;
  to: string;
  meals: MealEntry[];
}

export function renderStatsPdf(data: PdfExportData): Buffer {
  const totalCalories = data.meals.reduce((sum, meal) => sum + meal.calories, 0);
  const protein = round1(data.meals.reduce((sum, meal) => sum + meal.macros.proteinG, 0));
  const fat = round1(data.meals.reduce((sum, meal) => sum + meal.macros.fatG, 0));
  const carbs = round1(data.meals.reduce((sum, meal) => sum + meal.macros.carbsG, 0));

  const lines = [
    "NutriBot Premium Ultra",
    `User: ${data.userId}`,
    `Period: ${data.from} - ${data.to}`,
    "",
    `Meals: ${data.meals.length}`,
    `Calories: ${totalCalories} kcal`,
    `Protein: ${protein} g`,
    `Fat: ${fat} g`,
    `Carbs: ${carbs} g`,
    "",
    "Meals:",
    ...data.meals.slice(0, 35).map((meal) => `${meal.createdAt.slice(0, 10)}  ${meal.dishName}  ${meal.calories} kcal`),
  ];

  return makeSimplePdf(lines);
}

function makeSimplePdf(lines: string[]): Buffer {
  const escaped = lines.map(escapePdfText);
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    "16 TL",
    ...escaped.map((line, index) => `${index === 0 ? "" : "T*"}(${line}) Tj`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "binary");
}

function escapePdfText(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, "\\$&");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
