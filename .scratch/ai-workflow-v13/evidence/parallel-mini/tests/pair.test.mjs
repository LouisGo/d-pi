import { test } from "node:test";
import assert from "node:assert/strict";
import { pairTag } from "../src/pair.mjs";

test("fan-in combines both leaf tags and preserves the letter suffix", () => {
  assert.equal(pairTag("02a"), "L(02a)|R(02a)");
});

test("fan-in preserves the input used by both leaves", () => {
  assert.equal(pairTag(" 02a "), "L( 02a )|R( 02a )");
});
