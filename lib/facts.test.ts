import assert from "node:assert/strict";
import test from "node:test";

import { generateFact } from "./facts.ts";

type Dependencies = Parameters<typeof generateFact>[0];
type NewFact = Parameters<Dependencies["persistFact"]>[0];
type StoredFact = Awaited<ReturnType<Dependencies["persistFact"]>>;
type Lookup = Parameters<Dependencies["findLatestFact"]>[0];

const NOW = new Date("2026-01-01T12:00:00.000Z");

function storedFact(ageMs: number, overrides: Partial<StoredFact> = {}): StoredFact {
  return {
    id: "cached-fact",
    userId: "user-a",
    movie: "The Matrix",
    text: "An existing movie fact.",
    generatedAt: new Date(NOW.getTime() - ageMs),
    ...overrides,
  };
}

function fixture(overrides: Partial<Dependencies> = {}, initialFacts: StoredFact[] = []) {
  const facts = [...initialFacts];
  const lookups: Lookup[] = [];
  const generatedFor: string[] = [];
  const inserts: NewFact[] = [];
  const dependencies: Dependencies = {
    getCurrentUser: async () => ({ id: "user-a", favoriteMovie: "The Matrix" }),
    findLatestFact: async (query) => {
      lookups.push(query);
      return facts
        .filter((fact) => fact.userId === query.where.userId && fact.movie === query.where.movie)
        .sort((a, b) => query.orderBy.generatedAt === "desc"
          ? b.generatedAt.getTime() - a.generatedAt.getTime()
          : a.generatedAt.getTime() - b.generatedAt.getTime())[0] ?? null;
    },
    generateText: async (movie) => { generatedFor.push(movie); return "  A movie fact.  "; },
    persistFact: async (data) => {
      inserts.push(data);
      const saved = { ...data, id: `saved-fact-${inserts.length}` };
      facts.push(saved);
      return saved;
    },
    now: () => new Date(NOW),
    ...overrides,
  };
  return { dependencies, facts, lookups, generatedFor, inserts };
}

// Drain queued continuations while explicit dependency gates remain unresolved.
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("with no previous fact, authenticates, generates for the stored movie, and returns the persisted fact", async () => {
  const { dependencies, lookups, generatedFor, inserts } = fixture();
  const result = await generateFact(dependencies);

  assert.deepEqual(lookups, [{ where: { userId: "user-a", movie: "The Matrix" }, orderBy: { generatedAt: "desc" } }]);
  assert.deepEqual(generatedFor, ["The Matrix"]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].userId, "user-a");
  assert.equal(inserts[0].movie, "The Matrix");
  assert.equal(inserts[0].text, "A movie fact.");
  assert.deepEqual(inserts[0].generatedAt, NOW);
  assert.deepEqual(result, {
    fact: { id: "saved-fact-1", movie: "The Matrix", text: "A movie fact.", generatedAt: NOW.toISOString() },
    error: null,
  });
});

for (const age of [10_000, 59_999]) {
  test(`a ${age} ms old fact is fresh: preserves all DTO fields and timestamp without generating or writing`, async () => {
    const cached = storedFact(age);
    const original = structuredClone(cached);
    const { dependencies, facts, generatedFor, inserts } = fixture({}, [cached]);
    const result = await generateFact(dependencies);

    assert.deepEqual(result, {
      fact: { id: cached.id, movie: cached.movie, text: cached.text, generatedAt: original.generatedAt.toISOString() },
      error: null,
    });
    assert.equal(generatedFor.length, 0);
    assert.equal(inserts.length, 0);
    assert.deepEqual(facts, [original]);
  });
}

for (const age of [60_000, 60_001]) {
  test(`a ${age} ms old fact is expired: generates, appends, and returns the newly persisted fact`, async () => {
    const expired = storedFact(age);
    const original = structuredClone(expired);
    const { dependencies, facts, generatedFor, inserts } = fixture({}, [expired]);
    const result = await generateFact(dependencies);

    assert.deepEqual(generatedFor, ["The Matrix"]);
    assert.equal(inserts.length, 1);
    assert.equal(facts.length, 2);
    assert.deepEqual(facts[0], original);
    assert.deepEqual(result, {
      fact: { id: "saved-fact-1", movie: "The Matrix", text: "A movie fact.", generatedAt: NOW.toISOString() },
      error: null,
    });
  });
}

test("looks up the latest fact by each authenticated user and exact persisted movie", async () => {
  let currentUser = { id: "user-a", favoriteMovie: "The Matrix" };
  let authCalls = 0;
  const { dependencies, lookups, generatedFor, inserts } = fixture({
    getCurrentUser: async () => { authCalls++; return currentUser; },
  }, [
    storedFact(120_000, { id: "older-user-a" }),
    storedFact(10_000, { id: "latest-user-a" }),
    storedFact(1_000, { id: "user-b-fact", userId: "user-b" }),
    storedFact(500, { id: "other-movie", movie: "Inception" }),
    storedFact(200, { id: "lowercase-movie", movie: "the matrix" }),
    storedFact(100, { id: "different-spacing", movie: "The  Matrix" }),
  ]);

  assert.equal((await generateFact(dependencies)).fact?.id, "latest-user-a");
  currentUser = { id: "user-b", favoriteMovie: "The Matrix" };
  assert.equal((await generateFact(dependencies)).fact?.id, "user-b-fact");
  currentUser = { id: "user-a", favoriteMovie: "the matrix" };
  assert.equal((await generateFact(dependencies)).fact?.id, "lowercase-movie");
  currentUser = { id: "user-a", favoriteMovie: "The  Matrix" };
  assert.equal((await generateFact(dependencies)).fact?.id, "different-spacing");

  assert.deepEqual(lookups, [
    { where: { userId: "user-a", movie: "The Matrix" }, orderBy: { generatedAt: "desc" } },
    { where: { userId: "user-b", movie: "The Matrix" }, orderBy: { generatedAt: "desc" } },
    { where: { userId: "user-a", movie: "the matrix" }, orderBy: { generatedAt: "desc" } },
    { where: { userId: "user-a", movie: "The  Matrix" }, orderBy: { generatedAt: "desc" } },
  ]);
  assert.equal(authCalls, 4);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
});

test("facts belonging to another user or another movie do not fill an empty cache", async () => {
  const { dependencies, facts, generatedFor, inserts } = fixture({}, [
    storedFact(1_000, { id: "other-user", userId: "user-b" }),
    storedFact(1_000, { id: "other-movie", movie: "Inception" }),
    storedFact(1_000, { id: "lowercase-movie", movie: "the matrix" }),
  ]);

  assert.equal((await generateFact(dependencies)).fact?.id, "saved-fact-1");
  assert.deepEqual(generatedFor, ["The Matrix"]);
  assert.equal(inserts.length, 1);
  assert.equal(facts.length, 4);
});

test("timestamps new facts after generation completes", async () => {
  let clock = NOW.getTime();
  const { dependencies, inserts } = fixture({
    now: () => new Date(clock),
    generateText: async () => { clock += 5_000; return "A completed movie fact."; },
  });

  const result = await generateFact(dependencies);
  assert.equal(inserts[0].generatedAt.getTime(), NOW.getTime() + 5_000);
  assert.equal(result.fact?.generatedAt, inserts[0].generatedAt.toISOString());
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

test("unauthenticated callers cannot look up, generate, or persist facts", async () => {
  const { dependencies, lookups, generatedFor, inserts } = fixture({ getCurrentUser: async () => null });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(lookups.length, 0);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
});

test("users without a saved movie cannot look up, generate, or persist facts", async () => {
  const { dependencies, lookups, generatedFor, inserts } = fixture({ getCurrentUser: async () => ({ id: "user-a", favoriteMovie: null }) });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(lookups.length, 0);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
});

test("provider exceptions return a safe error, even with an expired fact (no stale fallback yet)", async () => {
  const { dependencies, inserts } = fixture({ generateText: async () => { throw new Error("private provider details"); } }, [storedFact(60_000)]);
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(inserts.length, 0);
  assert.ok(!JSON.stringify(result).includes("private provider details"));
});

test("cache lookup failures return a safe error without generating or writing", async () => {
  const { dependencies, generatedFor, inserts } = fixture({ findLatestFact: async () => { throw new Error("private database details"); } });
  const result = await generateFact(dependencies);
  assert.equal(result.fact, null);
  assert.ok(result.error);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
  assert.ok(!JSON.stringify(result).includes("private database details"));
});

test("immediate sequential requests authenticate again and reuse the newly saved fact", async () => {
  let authCalls = 0;
  const { dependencies, facts, lookups, generatedFor, inserts } = fixture({
    getCurrentUser: async () => { authCalls++; return { id: "user-a", favoriteMovie: "The Matrix" }; },
  });
  const first = await generateFact(dependencies);
  const second = await generateFact(dependencies);

  assert.deepEqual(second, first);
  assert.equal(authCalls, 2);
  assert.equal(lookups.length, 2);
  assert.deepEqual(generatedFor, ["The Matrix"]);
  assert.equal(inserts.length, 1);
  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0].generatedAt, NOW);
});

for (const cache of ["missing", "expired"]) {
  test(`overlapping ${cache} cache requests share generation and wait for one persisted result`, async (t) => {
    const generation = Promise.withResolvers<string>();
    const generationStarted = Promise.withResolvers<void>();
    const persistence = Promise.withResolvers<void>();
    const persistenceStarted = Promise.withResolvers<void>();
    const requests: ReturnType<typeof generateFact>[] = [];
    let authCalls = 0;
    let providerCalls = 0;
    let persistenceCalls = 0;
    let finished = 0;
    const { dependencies, lookups, inserts, facts } = fixture({
      getCurrentUser: async () => { authCalls++; return { id: t.name, favoriteMovie: "The Matrix" }; },
      generateText: async () => { providerCalls++; generationStarted.resolve(); return generation.promise; },
    }, cache === "expired" ? [storedFact(60_000, { userId: t.name })] : []);
    const persist = dependencies.persistFact;
    dependencies.persistFact = async (data) => {
      persistenceCalls++;
      persistenceStarted.resolve();
      await persistence.promise;
      return persist(data);
    };
    t.after(async () => {
      generation.resolve("A shared movie fact.");
      persistence.resolve();
      await Promise.allSettled(requests);
    });

    requests.push(generateFact(dependencies).then((result) => { finished++; return result; }));
    await generationStarted.promise;
    requests.push(generateFact(dependencies).then((result) => { finished++; return result; }));
    await nextTurn();
    assert.equal(authCalls, 2);
    assert.equal(providerCalls, 1);
    assert.equal(lookups.length, 1);
    assert.equal(persistenceCalls, 0);
    assert.equal(finished, 0);

    // Even during existing work, each caller must pass its own authentication/onboarding checks.
    assert.equal((await generateFact({ ...dependencies, getCurrentUser: async () => null })).fact, null);
    assert.equal((await generateFact({ ...dependencies, getCurrentUser: async () => ({ id: t.name, favoriteMovie: null }) })).fact, null);

    generation.resolve("A shared movie fact.");
    await persistenceStarted.promise;
    assert.equal(persistenceCalls, 1);
    assert.equal(finished, 0);
    persistence.resolve();
    const [first, second] = await Promise.all(requests);

    assert.strictEqual(first, second);
    assert.deepEqual(first, {
      fact: { id: "saved-fact-1", movie: "The Matrix", text: "A shared movie fact.", generatedAt: NOW.toISOString() },
      error: null,
    });
    assert.equal(providerCalls, 1);
    assert.equal(persistenceCalls, 1);
    assert.equal(inserts.length, 1);
    assert.equal(facts.length, cache === "expired" ? 2 : 1);
    assert.deepEqual(lookups[0], { where: { userId: t.name, movie: "The Matrix" }, orderBy: { generatedAt: "desc" } });
  });
}

test("overlapping fresh-cache requests join before the asynchronous cache read and preserve the timestamp", async (t) => {
  const lookupStarted = Promise.withResolvers<void>();
  const lookupGate = Promise.withResolvers<void>();
  const cached = storedFact(59_999, { userId: t.name });
  const original = structuredClone(cached);
  const { dependencies, facts, lookups, generatedFor, inserts } = fixture({
    getCurrentUser: async () => ({ id: t.name, favoriteMovie: "The Matrix" }),
  }, [cached]);
  const lookup = dependencies.findLatestFact;
  let lookupCalls = 0;
  dependencies.findLatestFact = async (query) => {
    lookupCalls++;
    lookupStarted.resolve();
    await lookupGate.promise;
    return lookup(query);
  };
  const requests: ReturnType<typeof generateFact>[] = [];
  t.after(async () => { lookupGate.resolve(); await Promise.allSettled(requests); });

  requests.push(generateFact(dependencies));
  await lookupStarted.promise;
  requests.push(generateFact(dependencies));
  await nextTurn();
  assert.equal(lookupCalls, 1);
  lookupGate.resolve();
  const [first, second] = await Promise.all(requests);

  assert.strictEqual(first, second);
  assert.deepEqual(first, {
    fact: { id: cached.id, movie: cached.movie, text: cached.text, generatedAt: original.generatedAt.toISOString() },
    error: null,
  });
  assert.equal(lookups.length, 1);
  assert.equal(generatedFor.length, 0);
  assert.equal(inserts.length, 0);
  assert.deepEqual(facts, [original]);
});

for (const scope of ["different users", "different movies", "ambiguous delimiter tuples"]) {
  test(`overlapping ${scope} do not share work or ownership`, async (t) => {
    const firstUser = { id: t.name, favoriteMovie: "The Matrix" };
    const secondUser = scope === "different users"
      ? { id: `${t.name}-other`, favoriteMovie: "The Matrix" }
      : scope === "different movies"
        ? { id: t.name, favoriteMovie: "Inception" }
        : { id: `${t.name}|part`, favoriteMovie: "movie" };
    if (scope === "ambiguous delimiter tuples") firstUser.favoriteMovie = "part|movie";
    const generationStarted = Promise.withResolvers<void>();
    const generationGate = Promise.withResolvers<void>();
    const generatedMovies: string[] = [];
    const { dependencies, facts, lookups, inserts } = fixture({
      getCurrentUser: async () => firstUser,
      generateText: async (movie) => {
        generatedMovies.push(movie);
        generationStarted.resolve();
        await generationGate.promise;
        return `A fact about ${movie}.`;
      },
    }, [
      storedFact(60_000, { id: "older-first", userId: firstUser.id, movie: firstUser.favoriteMovie }),
      storedFact(60_000, { id: "older-second", userId: secondUser.id, movie: secondUser.favoriteMovie }),
    ]);
    const requests: ReturnType<typeof generateFact>[] = [];
    t.after(async () => { generationGate.resolve(); await Promise.allSettled(requests); });

    requests.push(generateFact(dependencies));
    await generationStarted.promise;
    requests.push(generateFact({ ...dependencies, getCurrentUser: async () => secondUser }));
    await nextTurn();
    assert.deepEqual(generatedMovies, [firstUser.favoriteMovie, secondUser.favoriteMovie]);
    assert.deepEqual(lookups, [firstUser, secondUser].map((user) => ({
      where: { userId: user.id, movie: user.favoriteMovie }, orderBy: { generatedAt: "desc" },
    })));
    generationGate.resolve();
    const results = await Promise.all(requests);

    assert.equal(inserts.length, 2);
    assert.notEqual(results[0].fact?.id, results[1].fact?.id);
    for (const [index, user] of [firstUser, secondUser].entries()) {
      assert.equal(results[index].error, null);
      assert.equal(results[index].fact?.movie, user.favoriteMovie);
      const saved = facts.find((fact) => fact.id === results[index].fact?.id);
      assert.equal(saved?.userId, user.id);
      assert.equal(saved?.movie, user.favoriteMovie);
    }
  });
}

test("success cleanup permits a later request to regenerate at expiry", async (t) => {
  let clock = NOW.getTime();
  const { dependencies, generatedFor, inserts, lookups } = fixture({
    getCurrentUser: async () => ({ id: t.name, favoriteMovie: "The Matrix" }),
    now: () => new Date(clock),
  });
  const first = await generateFact(dependencies);
  clock += 60_000;
  const second = await generateFact(dependencies);

  assert.equal(first.error, null);
  assert.equal(second.error, null);
  assert.notEqual(first.fact?.id, second.fact?.id);
  assert.equal(generatedFor.length, 2);
  assert.equal(inserts.length, 2);
  assert.equal(lookups.length, 2);
});

for (const failure of ["provider", "persistence", "lookup", "unusable output"]) {
  test(`overlapping ${failure} failure returns safe errors, cleans up, and permits retry`, async (t) => {
    const failureStarted = Promise.withResolvers<void>();
    const failureGate = Promise.withResolvers<void>();
    let shouldFail = true;
    let providerCalls = 0;
    let persistenceCalls = 0;
    let lookupCalls = 0;
    const { dependencies, inserts } = fixture({
      getCurrentUser: async () => ({ id: t.name, favoriteMovie: "The Matrix" }),
      generateText: async () => {
        providerCalls++;
        if (shouldFail && (failure === "provider" || failure === "unusable output")) {
          failureStarted.resolve();
          await failureGate.promise;
          if (failure === "provider") throw new Error("private failure details");
          return "   ";
        }
        return "A successful movie fact.";
      },
    });
    const lookup = dependencies.findLatestFact;
    dependencies.findLatestFact = async (query) => {
      lookupCalls++;
      if (shouldFail && failure === "lookup") {
        failureStarted.resolve();
        await failureGate.promise;
        throw new Error("private failure details");
      }
      return lookup(query);
    };
    const persist = dependencies.persistFact;
    dependencies.persistFact = async (data) => {
      persistenceCalls++;
      if (shouldFail && failure === "persistence") {
        failureStarted.resolve();
        await failureGate.promise;
        throw new Error("private failure details");
      }
      return persist(data);
    };
    const requests: ReturnType<typeof generateFact>[] = [];
    t.after(async () => { failureGate.resolve(); await Promise.allSettled(requests); });

    requests.push(generateFact(dependencies));
    await failureStarted.promise;
    requests.push(generateFact(dependencies));
    await nextTurn();
    assert.equal(lookupCalls, 1);
    assert.equal(providerCalls, failure === "lookup" ? 0 : 1);
    assert.equal(persistenceCalls, failure === "persistence" ? 1 : 0);
    failureGate.resolve();
    const [first, second] = await Promise.all(requests);

    assert.deepEqual(first, second);
    assert.deepEqual(first, { fact: null, error: "We couldn't generate and save a movie fact. Please refresh to try again." });
    assert.ok(!JSON.stringify(first).includes("private failure details"));
    assert.equal(inserts.length, 0);

    shouldFail = false;
    const retried = await generateFact(dependencies);
    assert.equal(retried.error, null);
    assert.equal(retried.fact?.text, "A successful movie fact.");
    assert.equal(lookupCalls, 2);
    assert.equal(providerCalls, failure === "lookup" ? 1 : 2);
    assert.equal(persistenceCalls, failure === "persistence" ? 2 : 1);
    assert.equal(inserts.length, 1);
  });
}
