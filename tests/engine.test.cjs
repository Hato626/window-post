const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/engine.js");
const { levels, mail, row, win } = require("../src/levels.js");
function fixture(windows, letters = [mail("A", row(2))]) {
  return {
    version: 1,
    id: "test",
    title: "Test",
    width: 8,
    height: 6,
    windows,
    letters,
  };
}
test("24 curated levels are valid, have working reference layouts, and start unsolved", () => {
  assert.equal(levels.length, 24);
  assert.equal(new Set(levels.map((l) => l.title)).size, 24);
  for (const l of levels) {
    assert.ok(E.validateLevel(l));
    assert.ok(E.simulate(l, l.solution).solved, l.id);
    assert.equal(E.simulate(l).solved, false, l.id);
  }
  assert.deepEqual(
    [...new Set(levels.flatMap((l) => l.windows.map((w) => w.type)))].sort(),
    [...E.TYPES].sort(),
  );
});
test("all curated orders match independently written design expectations", () => {
  const s = (
    front = "white",
    back = "white",
    frontMarks = [],
    backMarks = [],
    side = "front",
    folds = 0,
    angle = 0,
  ) => ({
    front: {
      color: front,
      stamps: frontMarks.map(([mark, angle]) => ({ mark, angle })),
    },
    back: {
      color: back,
      stamps: backMarks.map(([mark, angle]) => ({ mark, angle })),
    },
    side,
    folds,
    angle,
  });
  const star = [["star", 0]],
    moon = [["moon", 0]],
    heart = [["heart", 0]];
  const expected = [
    [s("coral")],
    [s("gold"), s("gold")],
    [s("blue"), s()],
    [s("coral"), s("blue")],
    [s("white", "white", star), s("white", "white", star)],
    [s("white", "white", [...moon, ...star])],
    [s("white", "white", [], [], "front", 1), s()],
    [
      s("white", "white", [], [], "front", 1),
      s("white", "white", [], [], "front", 2),
    ],
    [s("white", "blue", [], [], "back")],
    [s("white", "white", [], heart)],
    [s("gold"), s("blue")],
    [
      s(
        "white",
        "white",
        [
          ["star", 0],
          ["star", 1],
        ],
        [],
        "front",
        0,
        1,
      ),
    ],
    [s("blue"), s("gold"), s("blue")],
    [s("mint", "white", heart), s("mint")],
    [
      s("white", "white", [...star, ...moon]),
      s("white", "white", [...moon, ...star]),
    ],
    [s("white", "white", [], [], "front", 2)],
    [s("blue"), s("coral")],
    [s("gold", "blue", [], [], "back"), s("gold")],
    [s("white", "gold", star, heart), s("coral")],
    [
      s("white", "white", [["star", 1]], [], "front", 0, 1),
      s("white", "white", star, [], "front", 0, 1),
    ],
    [s("mint", "white", [...moon, ...moon]), s("mint", "white", moon)],
    [
      s("gold", "blue", [], star, "back", 1),
      s("gold", "blue", [], star, "back"),
    ],
    [
      s("white", "blue", [], heart, "back"),
      s("blue"),
      s("white", "white", heart),
    ],
    [
      s("gold", "white", [["moon", 1]], [], "back", 1, 1),
      s("blue", "gold", [], [], "back", 1, 1),
      s("mint", "white", [["moon", 1]], [], "back", 1, 1),
    ],
  ];
  levels.forEach((l, i) =>
    assert.deepEqual(
      l.letters.map((mail) => mail.target),
      expected[i],
      "design mismatch: " + l.id,
    ),
  );
});
test("mail physically moves along each route and retains the final position", () => {
  const l = levels[13],
    run = E.simulate(l, l.solution);
  for (const f of run.frames)
    for (const letter of l.letters)
      assert.deepEqual(
        f.positions[letter.id],
        letter.path[Math.max(0, Math.min(f.tick, letter.path.length - 1))],
      );
  assert.deepEqual(run.frames.at(-1).positions.A, { x: 7, y: 2 });
});
test("continuous coverage only processes once; exiting and reentering processes again", () => {
  const large = win("w", "stamp", "star", 0, 2, 8, 1);
  assert.equal(E.simulate(fixture([large])).states.A.front.stamps.length, 1);
  const loopLetter = mail("A", [
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 },
  ]);
  const narrow = win("w", "stamp", "star", 1, 2);
  assert.equal(
    E.simulate(fixture([narrow], [loopLetter])).states.A.front.stamps.length,
    2,
  );
});
test("simultaneous overlaps honor layer order and different entries honor path order", () => {
  const flip = win("f", "flip", "", 2, 2),
    ink = win("i", "ink", "blue", 2, 2);
  const l = fixture([flip, ink]);
  assert.equal(E.simulate(l).states.A.back.color, "blue");
  assert.equal(E.simulate(l, [ink, flip]).states.A.front.color, "blue");
  const shifted = [
    { ...flip, x: 5 },
    { ...ink, x: 2 },
  ];
  assert.equal(E.simulate(l, shifted).states.A.front.color, "blue");
});
test("opposite directions reverse stamp order without changing layer order", () => {
  const l = levels[14],
    s = E.simulate(l, l.solution).states;
  assert.deepEqual(
    s.A.front.stamps.map((x) => x.mark),
    ["star", "moon"],
  );
  assert.deepEqual(
    s.B.front.stamps.map((x) => x.mark),
    ["moon", "star"],
  );
});
test("flip changes exposed face, erase clears only that face, rotate records stamp orientation", () => {
  let s = E.blank();
  s = E.apply(s, { type: "ink", value: "coral" });
  s = E.apply(s, { type: "stamp", value: "heart" });
  s = E.apply(s, { type: "flip" });
  s = E.apply(s, { type: "ink", value: "blue" });
  s = E.apply(s, { type: "erase" });
  assert.equal(s.front.color, "coral");
  assert.equal(s.front.stamps.length, 1);
  assert.equal(s.back.color, "white");
  s = E.apply(s, { type: "rotate" });
  s = E.apply(s, { type: "stamp", value: "star" });
  assert.deepEqual(s.back.stamps, [{ mark: "star", angle: 1 }]);
  for (let i = 0; i < 4; i++) s = E.apply(s, { type: "fold" });
  assert.equal(s.folds, 2);
});
test("replay is deterministic and does not mutate level, layout or prior frames", () => {
  for (const l of levels) {
    const before = E.clone(l),
      a = E.simulate(l, l.solution),
      b = E.simulate(l, l.solution);
    assert.deepEqual(a, b);
    assert.deepEqual(l, before);
    a.states.A.front.color =
      a.states.A.front.color === "coral" ? "blue" : "coral";
    assert.notDeepEqual(a.states, b.states);
    assert.deepEqual(E.simulate(l, l.solution), b);
  }
});
test("history undo/redo isolates values and discards future after a new edit", () => {
  const h = new E.History([{ x: 0 }]);
  const next = [{ x: 1 }];
  h.commit(next);
  next[0].x = 99;
  assert.equal(h.present[0].x, 1);
  assert.ok(h.undo());
  assert.equal(h.present[0].x, 0);
  assert.ok(h.redo());
  assert.equal(h.present[0].x, 1);
  h.undo();
  h.commit([{ x: 2 }]);
  assert.equal(h.redo(), false);
});
test("saved progress and layout round trip and reject incompatible layouts", () => {
  const l = levels[0],
    encoded = E.makeSave(l.id, l.solution, [l.id, l.id, "unknown"]);
  const save = E.readSave(encoded, levels);
  assert.deepEqual(save.windows, l.solution);
  assert.deepEqual(save.completed, [l.id]);
  const corrupt = JSON.parse(encoded);
  corrupt.windows[0].type = "erase";
  assert.throws(() => E.readSave(JSON.stringify(corrupt), levels));
  assert.throws(() => E.readSave("{}", levels));
  assert.throws(() => E.readSave("null", levels));
});
test("editor target derivation produces a solvable shareable level", () => {
  const l = E.clone(levels[0]);
  delete l.solution;
  const solution = E.clone(l.windows);
  solution[0].enabled = true;
  solution[0].y = 2;
  const derived = E.deriveTargets(l, solution),
    copy = E.decodeLevel(E.encodeLevel(derived));
  assert.ok(E.simulate(copy, copy.solution).solved);
  assert.equal(copy.letters[0].target.front.color, "coral");
});
test("invalid imports fail before they can be used", () => {
  const mutations = [
    (l) => (l.width = 999),
    (l) => (l.windows[0].x = -1),
    (l) => (l.windows[0].w = 100),
    (l) => (l.windows[0].type = "eval"),
    (l) => l.windows.push(l.windows[0]),
    (l) => (l.letters[0].path[1].x = 7),
    (l) => (l.letters[0].target.front.color = "javascript:bad"),
    (l) => (l.letters[0].target.front.stamps = [{ mark: "star", angle: 99 }]),
    (l) => (l.letters[0].path = []),
    (l) => l.letters.push(l.letters[0]),
  ];
  for (const mutation of mutations) {
    const l = E.clone(levels[0]);
    mutation(l);
    assert.throws(() => E.decodeLevel(JSON.stringify(l)));
  }
  const controlId = E.clone(levels[0]);
  controlId.windows[0].id = "bad\u0000id";
  assert.throws(() => E.decodeLevel(JSON.stringify(controlId)));
  const badValue = E.clone(levels[6]);
  badValue.windows[0].value = {};
  assert.throws(() => E.decodeLevel(JSON.stringify(badValue)));
  assert.throws(() => E.decodeLevel("x".repeat(200001)));
  assert.throws(() => E.decodeLevel("null"));
  assert.throws(() => E.decodeLevel("{}"));
});
test("boundary coverage excludes right and bottom edges", () => {
  const w = win("w", "fold", "", 1, 1, 2, 2);
  assert.ok(E.covers(w, { x: 1, y: 1 }));
  assert.ok(E.covers(w, { x: 2, y: 2 }));
  assert.equal(E.covers(w, { x: 3, y: 2 }), false);
  assert.equal(E.covers(w, { x: 2, y: 3 }), false);
});
