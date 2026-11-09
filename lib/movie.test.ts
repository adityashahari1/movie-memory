import assert from "node:assert/strict";
import test from "node:test";

import { validateMovie } from "./movie.ts";

test("rejects non-string input, including missing input and uploaded files", () => {
  for (const input of [undefined, null, 42, false, {}, [], new File(["movie"], "movie.txt")]) {
    assert.equal(validateMovie(input).ok, false);
  }
});

test("rejects an empty string", () => {
  assert.equal(validateMovie("").ok, false);
});

test("rejects whitespace-only input", () => {
  assert.equal(validateMovie(" \t\n ").ok, false);
});

test("trims surrounding whitespace", () => {
  assert.deepEqual(validateMovie("   The Matrix   "), { ok: true, movie: "The Matrix" });
});

test("accepts a one-character title", () => {
  assert.deepEqual(validateMovie("A"), { ok: true, movie: "A" });
});

test("accepts a 200-character title", () => {
  const movie = "a".repeat(200);
  assert.deepEqual(validateMovie(movie), { ok: true, movie });
});

test("rejects a 201-character title", () => {
  assert.equal(validateMovie("a".repeat(201)).ok, false);
});

test("checks length after trimming", () => {
  const movie = "a".repeat(200);
  assert.deepEqual(validateMovie(`  ${movie}  `), { ok: true, movie });
});

test("preserves case and internal whitespace", () => {
  assert.deepEqual(validateMovie("  The   MaTRix  "), { ok: true, movie: "The   MaTRix" });
});
