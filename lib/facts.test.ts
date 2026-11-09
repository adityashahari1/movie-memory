import assert from "node:assert/strict";
import test from "node:test";

import { generateFact } from "./facts.ts";

type Dependencies = Parameters<typeof generateFact>[0];
type NewFact = Parameters<Dependencies["persistFact"]>[0];

function fixture(overrides: Partial<Dependencies> = {}) {
  const generatedFor: string[] = [];
  const inserts: NewFact[] = [];
  const dependencies: Dependencies = {
    getCurrentUser: async () => ({ id: "user-a", favoriteMovie: "The Matrix" }),
    generateText: async (movie) => { generatedFor.push(movie); return "  A movie fact.  "; },
    persistFact: async (data) => { inserts.push(data); return { ...data, id: "saved-fact" }; },
    ...overrides,
  };
  return { dependencies, generatedFor, inserts };
}

test("authenticates, generates for the stored movie, and returns the persisted fact", async () => {
  const { dependencies, generatedFor, inserts } = fixture();
  const result = await generateFact(dependencies);

  assert.deepEqual(generatedFor, ["The Matrix"]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].userId, "user-a");
  assert.equal(inserts[0].movie, "The Matrix");
  assert.equal(inserts[0].text, "A movie fact.");
  assert.ok(Number.isFinite(inserts[0].generatedAt.getTime()));
  assert.deepEqual(result, {
    fact: { id: "saved-fact", movie: "The Matrix", text: "A movie fact.", generatedAt: inserts[0].generatedAt.toISOString() },
    error: null,
  });
});

test("rejects unusable output without persisting", async () => {
  for (const output of ["", "  \n ", null, undefined, {}]) {
    const { dependencies, inserts } = fixture({ generateText: async () => output });
    const result = await generateFact(dependencies);
    assert.equal(result.fact, null);
    assert.ok(result.error);
    assert.equal(inserts.length, 0);
  }
});

test("a failed insert never returns generated text as success or exposes database details", async () => {
  const { dependencies } = fixture({ persistFact: async () => { throw new Error("private database details"); } });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.ok(!JSON.stringify(result).includes("private database details"));
  assert.ok(!JSON.stringify(result).includes("A movie fact."));
});

test("waits for persistence before reporting success", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { dependencies } = fixture({ persistFact: async (data) => { await gate; return { ...data, id: "persisted-after-wait" }; } });
  let finished = false;
  const pending = generateFact(dependencies).then((result) => { finished = true; return result; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  release();
  assert.equal((await pending).fact?.id, "persisted-after-wait");
});

test("unauthenticated callers cannot generate or persist", async () => {
  const { dependencies, generatedFor, inserts } = fixture({ getCurrentUser: async () => null });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
});

test("users without a saved movie cannot generate or persist", async () => {
  const { dependencies, generatedFor, inserts } = fixture({ getCurrentUser: async () => ({ id: "user-a", favoriteMovie: null }) });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
});

test("provider exceptions become safe application errors", async () => {
  const { dependencies, inserts } = fixture({ generateText: async () => { throw new Error("private provider details"); } });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(inserts.length, 0);
  assert.ok(!JSON.stringify(result).includes("private provider details"));
});

test("each invocation generates and persists a new fact", async () => {
  const { dependencies, generatedFor, inserts } = fixture();
  await generateFact(dependencies);
  await generateFact(dependencies);
  assert.deepEqual(generatedFor, ["The Matrix", "The Matrix"]);
  assert.equal(inserts.length, 2);
});
