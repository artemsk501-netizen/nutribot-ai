import test from "node:test";
import assert from "node:assert/strict";
import {
  detectImageMimeFromBuffer,
  resolveOpenAiImageMime,
  toDataImageUrl,
} from "../src/services/imageMime.js";

test("detects JPEG, PNG and WebP from magic bytes", () => {
  assert.equal(detectImageMimeFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(
    detectImageMimeFromBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])),
    "image/png",
  );
  assert.equal(
    detectImageMimeFromBuffer(Buffer.from("RIFFxxxxWEBP", "ascii")),
    "image/webp",
  );
});

test("ignores invalid Telegram octet-stream MIME and resolves image MIME", () => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.equal(resolveOpenAiImageMime(buffer, "application/octet-stream", "photos/file_1"), "image/jpeg");
});

test("builds OpenAI data image URL", () => {
  assert.equal(toDataImageUrl("abc", "image/jpeg"), "data:image/jpeg;base64,abc");
});
