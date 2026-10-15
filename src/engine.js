(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PostEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const COLORS = ["white", "coral", "blue", "gold", "mint"];
  const TYPES = ["ink", "stamp", "fold", "erase", "flip", "rotate"];
  const MARKS = ["star", "moon", "heart"];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => {
    throw new Error(message);
  };
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const identifier = (s, max = 40) =>
    typeof s === "string" &&
    s.length > 0 &&
    s.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(s);
  function blank() {
    return {
      front: { color: "white", stamps: [] },
      back: { color: "white", stamps: [] },
      side: "front",
      folds: 0,
      angle: 0,
    };
  }
  function validateState(s) {
    if (
      !s ||
      !["front", "back"].includes(s.side) ||
      !integer(s.folds, 0, 2) ||
      !integer(s.angle, 0, 3)
    )
      fail("信件状态不合法");
    for (const side of ["front", "back"]) {
      const f = s[side];
      if (
        !f ||
        !COLORS.includes(f.color) ||
        !Array.isArray(f.stamps) ||
        f.stamps.length > 20
      )
        fail("信件表面不合法");
      for (const stamp of f.stamps)
        if (!MARKS.includes(stamp.mark) || !integer(stamp.angle, 0, 3))
          fail("邮戳不合法");
    }
    return true;
  }
  function validateWindows(windows, width, height) {
    if (!Array.isArray(windows) || windows.length > 12)
      fail("窗口数量必须为 0–12");
    const ids = new Set();
    for (const w of windows) {
      if (!w || !identifier(w.id) || ids.has(w.id) || !TYPES.includes(w.type))
        fail("窗口标识或类型不合法");
      ids.add(w.id);
      if (
        !integer(w.x, 0, width - 1) ||
        !integer(w.y, 0, height - 1) ||
        !integer(w.w, 1, width - w.x) ||
        !integer(w.h, 1, height - w.y) ||
        typeof w.enabled !== "boolean"
      )
        fail("窗口必须位于网格内");
      if (w.type === "ink" && !COLORS.includes(w.value)) fail("染色参数不合法");
      if (w.type === "stamp" && !MARKS.includes(w.value))
        fail("邮戳参数不合法");
      if (!["ink", "stamp"].includes(w.type) && w.value !== "")
        fail("该工艺不接受额外参数");
    }
    return true;
  }
  function validateLevel(level) {
    if (!level || typeof level !== "object" || level.version !== 1)
      fail("仅支持版本 1 的关卡");
    if (
      !identifier(level.id, 80) ||
      typeof level.title !== "string" ||
      !level.title.trim() ||
      level.title.length > 100
    )
      fail("关卡名称不合法");
    if (!integer(level.width, 3, 10) || !integer(level.height, 3, 8))
      fail("网格尺寸不合法");
    if (
      !Array.isArray(level.letters) ||
      level.letters.length < 1 ||
      level.letters.length > 24
    )
      fail("信件数量必须为 1–24");
    const ids = new Set(),
      cells = new Set();
    for (const l of level.letters) {
      if (
        !l ||
        !identifier(l.id) ||
        ids.has(l.id) ||
        !integer(l.x, 0, level.width - 1) ||
        !integer(l.y, 0, level.height - 1)
      )
        fail("信件位置或编号不合法");
      if (cells.has(l.x + "," + l.y)) fail("同一格只能有一封信");
      ids.add(l.id);
      cells.add(l.x + "," + l.y);
      if (
        !Array.isArray(l.path) ||
        l.path.length < 2 ||
        l.path.length > 60 ||
        l.path[0]?.x !== l.x ||
        l.path[0]?.y !== l.y
      )
        fail("信件路径必须从入口开始，长度为 2–60");
      l.path.forEach((p, i) => {
        if (
          !p ||
          !integer(p.x, 0, level.width - 1) ||
          !integer(p.y, 0, level.height - 1)
        )
          fail("路径必须在网格内");
        if (
          i &&
          Math.abs(p.x - l.path[i - 1].x) + Math.abs(p.y - l.path[i - 1].y) !==
            1
        )
          fail("路径必须沿相邻格移动");
      });
      validateState(l.initial);
      validateState(l.target);
    }
    validateWindows(level.windows, level.width, level.height);
    if (level.solution) {
      validateWindows(level.solution, level.width, level.height);
      validateLayout(level, level.solution);
    }
    return true;
  }
  function validateLayout(level, windows) {
    validateWindows(windows, level.width, level.height);
    if (windows.length !== level.windows.length)
      fail("布局的窗口数量与关卡不符");
    for (const orig of level.windows) {
      const w = windows.find((x) => x.id === orig.id);
      if (!w || w.type !== orig.type || w.value !== orig.value)
        fail("布局不能改变窗口工艺");
    }
    return true;
  }
  function covers(w, letter) {
    return (
      w.enabled &&
      letter.x >= w.x &&
      letter.x < w.x + w.w &&
      letter.y >= w.y &&
      letter.y < w.y + w.h
    );
  }
  function apply(state, w) {
    const s = clone(state),
      f = s[s.side];
    if (w.type === "ink") f.color = w.value;
    if (w.type === "stamp") f.stamps.push({ mark: w.value, angle: s.angle });
    if (w.type === "fold") s.folds = Math.min(2, s.folds + 1);
    if (w.type === "erase") {
      f.color = "white";
      f.stamps = [];
    }
    if (w.type === "flip") s.side = s.side === "front" ? "back" : "front";
    if (w.type === "rotate") s.angle = (s.angle + 1) % 4;
    return s;
  }
  function same(a, b) {
    return (
      a.side === b.side &&
      a.folds === b.folds &&
      a.angle === b.angle &&
      ["front", "back"].every(
        (side) =>
          a[side].color === b[side].color &&
          a[side].stamps.length === b[side].stamps.length &&
          a[side].stamps.every(
            (s, i) =>
              s.mark === b[side].stamps[i].mark &&
              s.angle === b[side].stamps[i].angle,
          ),
      )
    );
  }
  function simulate(level, windows = level.windows) {
    validateLayout(level, windows);
    let states = Object.fromEntries(
      level.letters.map((l) => [l.id, clone(l.initial)]),
    );
    let positions = Object.fromEntries(
      level.letters.map((l) => [l.id, clone(l.path[0])]),
    );
    const frames = [
      {
        windowId: null,
        tick: -1,
        affected: [],
        states: clone(states),
        positions: clone(positions),
      },
    ];
    const duration = Math.max(...level.letters.map((l) => l.path.length));
    for (let tick = 0; tick < duration; tick++) {
      for (const l of level.letters)
        positions[l.id] = clone(l.path[Math.min(tick, l.path.length - 1)]);
      frames.push({
        windowId: null,
        tick,
        affected: [],
        states: clone(states),
        positions: clone(positions),
      });
      for (const w of windows) {
        if (!w.enabled) continue;
        const affected = [];
        for (const l of level.letters) {
          if (tick >= l.path.length) continue;
          const enters =
            covers(w, l.path[tick]) &&
            (tick === 0 || !covers(w, l.path[tick - 1]));
          if (enters) {
            states[l.id] = apply(states[l.id], w);
            affected.push(l.id);
          }
        }
        if (affected.length)
          frames.push({
            windowId: w.id,
            tick,
            affected,
            states: clone(states),
            positions: clone(positions),
          });
      }
    }
    const matches = Object.fromEntries(
      level.letters.map((l) => [l.id, same(states[l.id], l.target)]),
    );
    return {
      frames,
      states,
      matches,
      solved: Object.values(matches).every(Boolean),
    };
  }
  function deriveTargets(level, solution) {
    const out = clone(level);
    const run = simulate(out, solution);
    out.letters.forEach((l) => {
      l.target = run.states[l.id];
    });
    out.solution = clone(solution);
    validateLevel(out);
    return out;
  }
  class History {
    constructor(value) {
      this.present = clone(value);
      this.past = [];
      this.future = [];
    }
    commit(value) {
      if (JSON.stringify(value) === JSON.stringify(this.present)) return;
      this.past.push(clone(this.present));
      if (this.past.length > 100) this.past.shift();
      this.present = clone(value);
      this.future = [];
    }
    undo() {
      if (!this.past.length) return false;
      this.future.push(this.present);
      this.present = this.past.pop();
      return true;
    }
    redo() {
      if (!this.future.length) return false;
      this.past.push(this.present);
      this.present = this.future.pop();
      return true;
    }
  }
  function encodeLevel(level) {
    validateLevel(level);
    return JSON.stringify(level, null, 2);
  }
  function decodeLevel(text) {
    if (typeof text !== "string" || text.length > 200000)
      fail("关卡文件过大（上限 200 KB）");
    const value = JSON.parse(text);
    validateLevel(value);
    return clone(value);
  }
  function makeSave(id, windows, completed) {
    return JSON.stringify({
      version: 1,
      levelId: id,
      windows,
      completed: [...new Set(completed)],
    });
  }
  function readSave(text, levels) {
    if (typeof text !== "string" || text.length > 500000) fail("存档过大");
    const s = JSON.parse(text);
    if (
      !s ||
      s.version !== 1 ||
      !Array.isArray(s.completed) ||
      s.completed.some((x) => typeof x !== "string")
    )
      fail("存档格式不合法");
    const level = levels.find((l) => l.id === s.levelId);
    if (!level) fail("存档关卡不存在");
    validateLayout(level, s.windows);
    return {
      levelId: s.levelId,
      windows: clone(s.windows),
      completed: s.completed.filter((id) => levels.some((l) => l.id === id)),
    };
  }
  return {
    COLORS,
    TYPES,
    MARKS,
    clone,
    blank,
    validateState,
    validateWindows,
    validateLevel,
    validateLayout,
    covers,
    apply,
    same,
    simulate,
    deriveTargets,
    History,
    encodeLevel,
    decodeLevel,
    makeSave,
    readSave,
  };
});
