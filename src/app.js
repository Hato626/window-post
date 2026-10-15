(function () {
  "use strict";
  const E = window.PostEngine,
    catalog = window.PostLevels;
  const $ = (id) => document.getElementById(id);
  const esc = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const COLORS = {
    white: "#fffdf2",
    coral: "#df927b",
    blue: "#94bed6",
    gold: "#ead185",
    mint: "#aad0ac",
  };
  const COLOR_NAMES = {
    white: "白",
    coral: "珊瑚",
    blue: "蓝",
    gold: "金",
    mint: "薄荷",
  };
  const TYPE_NAMES = {
    ink: "染色",
    stamp: "盖章",
    fold: "折叠",
    erase: "擦除",
    flip: "翻面",
    rotate: "旋转",
  };
  const TOOL_COLORS = {
    ink: "#b86b51",
    stamp: "#657eaa",
    fold: "#a68948",
    erase: "#8e8b80",
    flip: "#6c9777",
    rotate: "#96789b",
  };
  const MARKS = { star: "★", moon: "☾", heart: "♥" },
    ANGLES = ["↑", "→", "↓", "←"];
  const STORAGE = "window-post-save-v1",
    CUSTOM = "window-post-custom-v1";
  let custom = [],
    completed = [],
    levels,
    level,
    history,
    selected = null,
    replay = null,
    frameIndex = 0,
    timer = null,
    editor = false,
    painting = false,
    resetRoute = false,
    editorLetter = null,
    drag = null,
    sound = false,
    importMode = "level",
    audioContext;
  try {
    const data = JSON.parse(localStorage.getItem(CUSTOM) || "[]");
    if (Array.isArray(data))
      custom = data.slice(0, 30).filter((l) => {
        try {
          E.validateLevel(l);
          return true;
        } catch {
          return false;
        }
      });
  } catch {
    /* Storage can be unavailable for local files. */
  }
  levels = [...catalog.levels, ...custom];
  function titleOf(w) {
    return (
      TYPE_NAMES[w.type] +
      (w.type === "ink"
        ? " · " + COLOR_NAMES[w.value]
        : w.type === "stamp"
          ? " · " + MARKS[w.value]
          : "")
    );
  }
  function setStatus(text, kind = "") {
    $("status").textContent = text;
    $("status").className = "status " + kind;
  }
  function beep(success = false) {
    if (!sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator(),
        gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = success ? 660 : 390;
      gain.gain.setValueAtTime(0.025, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.12,
      );
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.13);
    } catch {
      /* Optional audio has no effect on rules. */
    }
  }
  function persist() {
    if (editor) return;
    try {
      localStorage.setItem(
        STORAGE,
        E.makeSave(level.id, history.present, completed),
      );
      $("save-status").textContent = "已自动保存 · 本机离线存档";
    } catch {
      $("save-status").textContent = "浏览器禁止自动保存，请用“导出存档”备份。";
    }
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    $("run").textContent = replay ? "▶ 继续" : "▶ 发件";
  }
  function layoutMode() {
    stop();
    replay = null;
    frameIndex = 0;
    render();
  }
  function loadLevel(id, windows) {
    stop();
    const found = levels.find((l) => l.id === id) || levels[0];
    level = E.clone(found);
    history = new E.History(windows || level.windows);
    selected = history.present[0]?.id || null;
    replay = null;
    frameIndex = 0;
    editor = false;
    painting = false;
    $("hint-box").hidden = true;
    render();
    persist();
    setStatus("从左侧选择窗口，放到邮件路线上。");
  }
  function commit(windows) {
    try {
      E.validateLayout(level, windows);
      history.commit(windows);
      replay = null;
      frameIndex = 0;
      stop();
      render();
      persist();
    } catch (err) {
      setStatus(err.message, "error");
    }
  }
  function mutate(fn) {
    const windows = E.clone(history.present);
    fn(windows);
    commit(windows);
  }
  function current() {
    return replay
      ? replay.frames[frameIndex]
      : {
          states: Object.fromEntries(
            level.letters.map((l) => [l.id, l.initial]),
          ),
          positions: Object.fromEntries(
            level.letters.map((l) => [l.id, l.path[0]]),
          ),
          affected: [],
        };
  }
  function faceHTML(face) {
    return (
      '<span class="swatch" style="background:' +
      COLORS[face.color] +
      '"></span><span>' +
      COLOR_NAMES[face.color] +
      '</span><span class="stamps">' +
      (face.stamps.map((s) => MARKS[s.mark] + ANGLES[s.angle]).join(" › ") ||
        "无章") +
      "</span>"
    );
  }
  function stateHTML(s) {
    return (
      '<div class="face-row"><span class="face-label">正面</span>' +
      faceHTML(s.front) +
      '</div><div class="face-row"><span class="face-label">背面</span>' +
      faceHTML(s.back) +
      '</div><div class="face-meta">' +
      (s.side === "front" ? "正" : "背") +
      "面朝上 · " +
      s.folds +
      " 折 · 朝向 " +
      ANGLES[s.angle] +
      "</div>"
    );
  }
  function renderBoard() {
    const previous = Object.fromEntries(
      [...$("board").querySelectorAll("[data-letter]")].map((el) => [
        el.dataset.letter,
        { left: el.style.left, top: el.style.top },
      ]),
    );
    const frame = current(),
      windows = drag ? drag.preview : history.present;
    const paths = level.letters
      .map(
        (l, i) =>
          '<polyline class="route ' +
          (painting && editorLetter === l.id ? "active-route" : "") +
          '" stroke="' +
          ["#647a5d", "#bd7957", "#7889a9", "#a18a53"][i % 4] +
          '" points="' +
          l.path.map((p) => p.x + 0.5 + "," + (p.y + 0.5)).join(" ") +
          '"/><text x="' +
          (l.path[0].x + 0.18) +
          '" y="' +
          (l.path[0].y + 0.86) +
          '" font-size=".15" fill="#58704e">▸' +
          esc(l.id) +
          '</text><rect x="' +
          (l.path.at(-1).x + 0.19) +
          '" y="' +
          (l.path.at(-1).y + 0.18) +
          '" width=".63" height=".63" rx=".08" fill="none" stroke="#849579" stroke-width=".025"/>',
      )
      .join("");
    let html =
      '<svg class="routes" viewBox="0 0 ' +
      level.width +
      " " +
      level.height +
      '">' +
      paths +
      "</svg>";
    html += windows
      .map((w, i) =>
        w.enabled
          ? '<div class="work-window ' +
            (w.id === selected ? "selected " : "") +
            (frame.windowId === w.id ? "active" : "") +
            '" data-window="' +
            esc(w.id) +
            '" style="--color:' +
            TOOL_COLORS[w.type] +
            ";left:" +
            (w.x / level.width) * 100 +
            "%;top:" +
            (w.y / level.height) * 100 +
            "%;width:" +
            (w.w / level.width) * 100 +
            "%;height:" +
            (w.h / level.height) * 100 +
            "%;z-index:" +
            (i + 2) +
            '"><div class="window-bar" data-drag="' +
            esc(w.id) +
            '"><span>' +
            esc(titleOf(w)) +
            "</span><b>" +
            (i + 1) +
            '</b></div><div class="resize" data-resize="' +
            esc(w.id) +
            '" aria-label="缩放窗口"></div></div>'
          : "",
      )
      .join("");
    html += level.letters
      .map((l) => {
        const s = frame.states[l.id],
          pos = frame.positions[l.id],
          f = s[s.side];
        return (
          '<div class="letter ' +
          (frame.affected.includes(l.id) ? "affected" : "") +
          '" data-letter="' +
          esc(l.id) +
          '" style="left:' +
          ((pos.x + 0.5) / level.width) * 100 +
          "%;top:" +
          ((pos.y + 0.5) / level.height) * 100 +
          "%;background:" +
          COLORS[f.color] +
          '"><span class="letter-id">' +
          esc(l.id) +
          '</span><span class="letter-side">' +
          (s.side === "front" ? "正" : "背") +
          ANGLES[s.angle] +
          '</span><span class="letter-stamps">' +
          f.stamps.map((x) => MARKS[x.mark]).join("") +
          '</span><span class="letter-fold">' +
          (s.folds ? s.folds + "折" : "") +
          "</span></div>"
        );
      })
      .join("");
    $("board").innerHTML = html;
    $("board").style.aspectRatio = level.width + "/" + level.height;
    $("board").style.backgroundSize =
      100 / level.width + "% " + 100 / level.height + "%";
    $("board").classList.toggle("painting", painting);
    if (replay && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      $("board")
        .querySelectorAll("[data-letter]")
        .forEach((el) => {
          const from = previous[el.dataset.letter],
            to = { left: el.style.left, top: el.style.top };
          if (from && (from.left !== to.left || from.top !== to.top))
            el.animate([from, to], {
              duration: Math.min(180, Number($("speed").value) * 0.65),
              easing: "linear",
            });
        });
  }
  function renderTools() {
    $("tool-count").textContent =
      history.present.filter((w) => w.enabled).length +
      " / " +
      history.present.length;
    $("tools").innerHTML = history.present
      .map(
        (w, i) =>
          '<div class="tool ' +
          (w.id === selected ? "selected" : "") +
          '" data-select="' +
          esc(w.id) +
          '" tabindex="0" role="button" aria-label="选择' +
          esc(titleOf(w)) +
          '"><div class="tool-top"><span class="tool-type"><i class="type-dot" style="background:' +
          TOOL_COLORS[w.type] +
          '"></i>' +
          (i + 1) +
          ". " +
          esc(titleOf(w)) +
          '</span></div><div class="tool-bottom"><button data-toggle="' +
          esc(w.id) +
          '">' +
          (w.enabled ? "移回暂存" : "＋ 放上桌") +
          '</button><span class="tool-controls"><button data-order="' +
          esc(w.id) +
          '" data-dir="-1" aria-label="提前加工" ' +
          (i === 0 ? "disabled" : "") +
          '>↑</button><button data-order="' +
          esc(w.id) +
          '" data-dir="1" aria-label="延后加工" ' +
          (i === history.present.length - 1 ? "disabled" : "") +
          ">↓</button></span></div></div>",
      )
      .join("");
    const w = history.present.find((w) => w.id === selected);
    $("inspector").innerHTML = w
      ? "<strong>选中：" +
        esc(titleOf(w)) +
        '</strong><div class="coords">' +
        [
          ["x", "列", level.width],
          ["y", "行", level.height],
          ["w", "宽", level.width],
          ["h", "高", level.height],
        ]
          .map(
            ([key, label, max]) =>
              "<label>" +
              label +
              '<input type="number" data-coordinate="' +
              key +
              '" aria-label="窗口' +
              label +
              '" min="1" max="' +
              max +
              '" value="' +
              (w[key] + (key === "x" || key === "y" ? 1 : 0)) +
              '"></label>',
          )
          .join("") +
        '</div><span class="muted">列与行从 1 开始。点击桌面也可放置。</span>'
      : '<span class="muted">添加或选择一扇窗口。</span>';
    $("undo").disabled = !history.past.length;
    $("redo").disabled = !history.future.length;
    $("solution").disabled = !level.solution || editor;
  }
  function renderOrders() {
    const frame = current();
    const finished = replay && frameIndex === replay.frames.length - 1;
    let count = 0;
    $("orders").innerHTML = level.letters
      .map((l) => {
        const ok = E.same(frame.states[l.id], l.target);
        if (ok) count++;
        return (
          '<div class="order"><div class="order-head"><b>信件 ' +
          esc(l.id) +
          '</b><span class="' +
          (ok ? "match" : "") +
          '">' +
          (ok ? "✓ 一致" : finished ? "待调整" : "目标") +
          "</span></div>" +
          stateHTML(l.target) +
          '<details class="current-state"><summary>当前信件状态</summary>' +
          stateHTML(frame.states[l.id]) +
          "</details></div>"
        );
      })
      .join("");
    $("match-count").textContent = count + " / " + level.letters.length;
  }
  function renderTransport() {
    $("stage-state").textContent = editor
      ? painting
        ? "编辑 · 绘制路线"
        : "编辑模式"
      : replay
        ? timer
          ? "邮件运行中"
          : "回放已暂停"
        : "布置模式";
    $("timeline").textContent = replay
      ? "步骤 " +
        frameIndex +
        " / " +
        (replay.frames.length - 1) +
        " · 路线时刻 " +
        Math.max(0, current().tick + 1)
      : "等待发件";
    $("run").textContent = timer
      ? "Ⅱ 暂停"
      : replay && frameIndex < replay.frames.length - 1
        ? "▶ 继续"
        : replay
          ? "↻ 再发一次"
          : "▶ 发件";
  }
  function render() {
    $("title").textContent = (editor ? "自制 · " : "") + level.title;
    $("chapter").textContent = level.chapter || "自制路线";
    $("brief").textContent =
      level.brief || "布置窗口，完成右侧的全部交付订单。";
    $("progress").textContent =
      "已通关 " +
      completed.filter((id) => catalog.levels.some((l) => l.id === id)).length +
      " / 24";
    $("prev-level").disabled = levels.findIndex((l) => l.id === level.id) <= 0;
    $("next-level").disabled =
      levels.findIndex((l) => l.id === level.id) >= levels.length - 1;
    renderTools();
    renderBoard();
    renderOrders();
    renderTransport();
    renderEditor();
  }
  function beginReplay() {
    try {
      E.validateLevel({ ...level, solution: undefined });
      replay = E.simulate(level, history.present);
      frameIndex = 0;
      painting = false;
      return true;
    } catch (err) {
      setStatus(err.message, "error");
      return false;
    }
  }
  function advance() {
    if (!replay && !beginReplay()) return;
    if (frameIndex >= replay.frames.length - 1) return;
    frameIndex++;
    const frame = current();
    if (frame.windowId) {
      const w = history.present.find((w) => w.id === frame.windowId);
      setStatus(
        "时刻 " +
          (frame.tick + 1) +
          "：" +
          frame.affected.join("、") +
          " 进入「" +
          titleOf(w) +
          "」",
      );
      beep();
    } else setStatus("时刻 " + (frame.tick + 1) + "：邮件沿路线移动。");
    if (frameIndex === replay.frames.length - 1) {
      stop();
      if (replay.solved) {
        if (!editor && !completed.includes(level.id)) completed.push(level.id);
        setStatus(
          "✓ 全部订单完成！" +
            (editor
              ? "可以生成订单并保存自制关。"
              : "可以继续下一班邮车，或重新布置尝试别的解法。"),
          "success",
        );
        beep(true);
        persist();
      } else
        setStatus(
          "邮件已到站，但有订单尚未匹配。展开右侧“当前信件状态”比较，再回到布置调整。",
          "error",
        );
      $("progress").textContent =
        "已通关 " +
        completed.filter((id) => catalog.levels.some((l) => l.id === id))
          .length +
        " / 24";
    }
    renderBoard();
    renderOrders();
    renderTransport();
  }
  function toggleRun() {
    if (timer) {
      stop();
      renderTransport();
      return;
    }
    if ((!replay || frameIndex === replay.frames.length - 1) && !beginReplay())
      return;
    timer = setInterval(advance, Number($("speed").value));
    renderTransport();
  }
  $("run").onclick = toggleRun;
  $("step").onclick = () => {
    stop();
    if (replay && frameIndex === replay.frames.length - 1) beginReplay();
    advance();
  };
  $("rewind").onclick = () => {
    layoutMode();
    setStatus("已回到布置，窗口布局保留。");
  };
  $("speed").onchange = () => {
    if (timer) {
      stop();
      timer = setInterval(advance, Number($("speed").value));
      renderTransport();
    }
  };
  $("sound").onclick = () => {
    sound = !sound;
    $("sound").textContent = "声音：" + (sound ? "开" : "关");
    $("sound").setAttribute("aria-pressed", String(sound));
    if (sound) beep();
  };
  $("tools").onclick = (event) => {
    const toggle = event.target.closest("[data-toggle]"),
      order = event.target.closest("[data-order]"),
      item = event.target.closest("[data-select]");
    if (!item) return;
    selected = item.dataset.select;
    if (toggle)
      mutate((ws) => {
        const w = ws.find((x) => x.id === toggle.dataset.toggle);
        w.enabled = !w.enabled;
      });
    else if (order)
      mutate((ws) => {
        const i = ws.findIndex((w) => w.id === order.dataset.order),
          j = i + Number(order.dataset.dir);
        if (j >= 0 && j < ws.length) [ws[i], ws[j]] = [ws[j], ws[i]];
      });
    else {
      renderTools();
      renderBoard();
    }
  };
  $("tools").onkeydown = (event) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target.matches("[data-select]")
    ) {
      event.preventDefault();
      selected = event.target.dataset.select;
      renderTools();
      renderBoard();
    }
  };
  $("inspector").onchange = (event) => {
    const key = event.target.dataset.coordinate;
    if (!key) return;
    const n = Number(event.target.value) - (key === "x" || key === "y" ? 1 : 0);
    if (!Number.isInteger(n)) {
      renderTools();
      return;
    }
    mutate((ws) => {
      const w = ws.find((w) => w.id === selected);
      w[key] = n;
      if (key === "x") w.x = Math.max(0, Math.min(level.width - w.w, n));
      if (key === "y") w.y = Math.max(0, Math.min(level.height - w.h, n));
      if (key === "w") w.w = Math.max(1, Math.min(level.width - w.x, n));
      if (key === "h") w.h = Math.max(1, Math.min(level.height - w.y, n));
    });
  };
  function cellAt(event) {
    const rect = $("board").getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          level.width - 1,
          Math.floor(((event.clientX - rect.left) / rect.width) * level.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          level.height - 1,
          Math.floor(((event.clientY - rect.top) / rect.height) * level.height),
        ),
      ),
    };
  }
  $("board").onpointerdown = (event) => {
    if (event.button !== 0) return;
    if (replay) layoutMode();
    const p = cellAt(event);
    if (painting && editor) {
      drawRoute(p);
      event.preventDefault();
      return;
    }
    const bar = event.target.closest("[data-drag]"),
      resize = event.target.closest("[data-resize]"),
      win = event.target.closest("[data-window]");
    if (bar || resize) {
      selected = (bar || resize).dataset[bar ? "drag" : "resize"];
      drag = {
        id: selected,
        mode: bar ? "move" : "resize",
        start: p,
        original: E.clone(history.present),
        preview: E.clone(history.present),
      };
      event.preventDefault();
      renderTools();
      renderBoard();
      return;
    }
    if (win) {
      selected = win.dataset.window;
      renderTools();
      renderBoard();
      return;
    }
    if (selected)
      mutate((ws) => {
        const w = ws.find((w) => w.id === selected);
        w.x = Math.min(p.x, level.width - w.w);
        w.y = Math.min(p.y, level.height - w.h);
        w.enabled = true;
      });
  };
  window.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const p = cellAt(event),
      dx = p.x - drag.start.x,
      dy = p.y - drag.start.y;
    drag.preview = E.clone(drag.original);
    const w = drag.preview.find((w) => w.id === drag.id),
      original = drag.original.find((w) => w.id === drag.id);
    if (drag.mode === "move") {
      w.x = Math.max(0, Math.min(level.width - w.w, original.x + dx));
      w.y = Math.max(0, Math.min(level.height - w.h, original.y + dy));
    } else {
      w.w = Math.max(1, Math.min(level.width - w.x, original.w + dx));
      w.h = Math.max(1, Math.min(level.height - w.y, original.h + dy));
    }
    renderBoard();
  });
  window.addEventListener("pointerup", () => {
    if (drag) {
      const result = drag.preview;
      drag = null;
      commit(result);
    }
  });
  window.addEventListener("pointercancel", () => {
    drag = null;
    renderBoard();
  });
  $("undo").onclick = () => {
    stop();
    if (history.undo()) {
      replay = null;
      render();
      persist();
    }
  };
  $("redo").onclick = () => {
    stop();
    if (history.redo()) {
      replay = null;
      render();
      persist();
    }
  };
  $("reset").onclick = () => {
    commit(level.windows);
    setStatus("窗口已回到本关初始布置，可以撤销。");
  };
  $("hint").onclick = () => {
    $("hint-box").textContent =
      level.hint ||
      "先明确每封信需要哪些工艺，再考虑顺序。编辑器保存时会记录你的参考解法。";
    $("hint-box").hidden = !$("hint-box").hidden;
  };
  $("solution").onclick = () => {
    if (!level.solution) return;
    commit(level.solution);
    setStatus("已放好参考布置。用“单步”观察路线和工艺，也可以撤销继续自己解。");
  };
  $("prev-level").onclick = () => {
    const i = levels.findIndex((l) => l.id === level.id);
    if (i > 0) loadLevel(levels[i - 1].id);
  };
  $("next-level").onclick = () => {
    const i = levels.findIndex((l) => l.id === level.id);
    if (i < levels.length - 1) loadLevel(levels[i + 1].id);
  };
  function showMap() {
    stop();
    renderTransport();
    const tile = (l, i) =>
      '<button class="level-tile ' +
      (completed.includes(l.id) ? "done " : "") +
      (l.id === level.id ? "current" : "") +
      '" data-level="' +
      esc(l.id) +
      '"><b>' +
      (completed.includes(l.id) ? "✓ " : "") +
      String(i + 1).padStart(2, "0") +
      " · " +
      esc(l.chapter || "自制") +
      "</b><span>" +
      esc(l.title) +
      "</span></button>";
    $("level-grid").innerHTML = catalog.levels.map(tile).join("");
    $("custom-levels").innerHTML = custom.length
      ? '<h3>我的路线</h3><div class="editor-row">' +
        custom.map((l, i) => tile(l, i)).join("") +
        "</div>"
      : "";
    $("level-dialog").showModal();
  }
  $("open-levels").onclick = showMap;
  $("level-dialog").onclick = (event) => {
    const target = event.target.closest("[data-level]");
    if (target) {
      loadLevel(target.dataset.level);
      $("level-dialog").close();
    }
  };
  $("help").onclick = () => {
    stop();
    renderTransport();
    $("help-dialog").showModal();
  };
  document
    .querySelectorAll("[data-close]")
    .forEach(
      (button) => (button.onclick = () => $(button.dataset.close).close()),
    );
  function download(name, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" }),
      url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("export-level").onclick = () => {
    try {
      download("window-post-level.json", E.encodeLevel(level));
      setStatus("关卡 JSON 已导出。");
    } catch (err) {
      setStatus(err.message, "error");
    }
  };
  $("export-save").onclick = () => {
    if (editor) {
      setStatus("请先生成订单并保存自制关，再导出存档。", "error");
      return;
    }
    download(
      "window-post-save.json",
      JSON.stringify(
        {
          version: 1,
          game: JSON.parse(E.makeSave(level.id, history.present, completed)),
          custom,
        },
        null,
        2,
      ),
    );
    setStatus("存档已导出，包含所有自制关卡。");
  };
  $("import-level").onclick = () => {
    importMode = "level";
    $("file-input").value = "";
    $("file-input").click();
  };
  $("import-save").onclick = () => {
    importMode = "save";
    $("file-input").value = "";
    $("file-input").click();
  };
  function saveCustom(l) {
    const next = custom.filter((x) => x.id !== l.id);
    next.push(l);
    if (next.length > 30)
      throw new Error("最多保存 30 个自制关卡，请先导出备份。");
    localStorage.setItem(CUSTOM, JSON.stringify(next));
    custom = next;
    levels = [...catalog.levels, ...custom];
  }
  $("file-input").onchange = async () => {
    const file = $("file-input").files[0];
    if (!file) return;
    try {
      if (file.size > 8000000) throw new Error("文件过大（上限 8 MB）");
      const text = await file.text();
      if (importMode === "level") {
        const imported = E.decodeLevel(text);
        imported.id = "custom-" + Date.now();
        saveCustom(imported);
        loadLevel(imported.id);
        setStatus("已导入关卡，可在关卡地图里再次打开。");
      } else {
        const bundle = JSON.parse(text);
        if (
          bundle.version !== 1 ||
          !Array.isArray(bundle.custom) ||
          bundle.custom.length > 30
        )
          throw new Error("存档格式不合法");
        const incoming = bundle.custom.map((l) => {
          E.validateLevel(l);
          return l;
        });
        if (
          incoming.some((l) => catalog.levels.some((b) => b.id === l.id)) ||
          new Set(incoming.map((l) => l.id)).size !== incoming.length
        )
          throw new Error("自制关卡编号重复");
        const merged = [
          ...custom.filter((l) => !incoming.some((v) => v.id === l.id)),
          ...incoming,
        ];
        if (merged.length > 30) throw new Error("合并后自制关超过 30 个");
        const nextLevels = [...catalog.levels, ...merged];
        const game = E.readSave(JSON.stringify(bundle.game), nextLevels);
        localStorage.setItem(CUSTOM, JSON.stringify(merged));
        custom = merged;
        levels = nextLevels;
        completed = [...new Set([...completed, ...game.completed])];
        loadLevel(game.levelId, game.windows);
        setStatus("存档已导入，已保留此前的通关进度。");
      }
    } catch (err) {
      setStatus("导入失败：" + err.message, "error");
    }
  };
  function beginEditor() {
    stop();
    level = E.clone(level);
    level.id = "custom-" + Date.now();
    level.title = "我的邮局路线";
    level.chapter = "自制关卡";
    level.brief = "点击编辑工具和路线，摆出参考解法，再生成目标订单。";
    delete level.solution;
    history = new E.History(history.present);
    level.windows = E.clone(history.present);
    editor = true;
    painting = false;
    replay = null;
    editorLetter = level.letters[0].id;
    render();
    setStatus(
      "编辑的是当前关卡副本。布置一个你喜欢的解法，再“生成订单并保存”。",
    );
  }
  $("new-editor").onclick = beginEditor;
  function renderEditor() {
    $("editor-panel").hidden = !editor;
    if (!editor) return;
    const selectedTool = history.present.find((w) => w.id === selected);
    $("editor-panel").innerHTML =
      '<h3>路线编辑器</h3><div class="editor-row"><label>标题 <input id="edit-title" type="text" maxlength="100" value="' +
      esc(level.title) +
      '"></label></div><div class="editor-row"><label>工具 <select id="edit-type">' +
      E.TYPES.map(
        (t) =>
          '<option value="' +
          t +
          '" ' +
          (selectedTool?.type === t ? "selected" : "") +
          ">" +
          TYPE_NAMES[t] +
          "</option>",
      ).join("") +
      '</select></label><select id="edit-value" aria-label="工艺参数">' +
      E.COLORS.map(
        (c) =>
          '<option value="' +
          c +
          '" ' +
          (selectedTool?.value === c ? "selected" : "") +
          ">" +
          COLOR_NAMES[c] +
          "</option>",
      ).join("") +
      E.MARKS.map(
        (m) =>
          '<option value="' +
          m +
          '" ' +
          (selectedTool?.value === m ? "selected" : "") +
          ">" +
          MARKS[m] +
          "</option>",
      ).join("") +
      '</select><button id="edit-add-tool">添加窗</button><button id="edit-update-tool">修改选中窗</button><button id="edit-delete-tool">删除选中窗</button></div><div class="editor-row"><label>信件 <select id="edit-letter">' +
      level.letters
        .map(
          (l) =>
            '<option value="' +
            esc(l.id) +
            '" ' +
            (l.id === editorLetter ? "selected" : "") +
            ">" +
            esc(l.id) +
            "</option>",
        )
        .join("") +
      '</select></label><button id="edit-add-letter">加信件</button><button id="edit-delete-letter">删信件</button><button id="edit-route">' +
      (painting ? "结束画路线" : "接着画路线") +
      '</button><button id="edit-route-reset">重画路线</button></div><p class="editor-note">绘制时依次点击相邻格，可回头。每条路径 2–60 格；首格是入口。窗口和路线由你决定，目标由参考布局产生。原始信件保留所复制关卡的状态。</p><div class="editor-row"><button id="edit-save" class="primary">生成订单并保存</button><button id="edit-cancel">退出编辑</button></div>';
    $("edit-title").oninput = (event) => {
      level.title = event.target.value;
      $("title").textContent = "自制 · " + level.title;
    };
    $("edit-letter").onchange = (event) => {
      editorLetter = event.target.value;
      renderBoard();
    };
    $("edit-route").onclick = () => {
      painting = !painting;
      resetRoute = false;
      replay = null;
      stop();
      render();
    };
    $("edit-route-reset").onclick = () => {
      painting = true;
      resetRoute = true;
      replay = null;
      stop();
      render();
      setStatus("下一次点击会设定新的入口；再点击相邻格延长路线。");
    };
    function toolValue(type) {
      const value = $("edit-value").value;
      return type === "ink"
        ? E.COLORS.includes(value)
          ? value
          : "coral"
        : type === "stamp"
          ? E.MARKS.includes(value)
            ? value
            : "star"
          : "";
    }
    function replaceTools(windows) {
      level.windows = E.clone(windows);
      history = new E.History(windows);
      replay = null;
      stop();
      render();
    }
    $("edit-add-tool").onclick = () => {
      if (history.present.length >= 12) {
        setStatus("每关最多 12 扇窗。", "error");
        return;
      }
      const type = $("edit-type").value,
        id = "w-" + Date.now();
      selected = id;
      replaceTools([
        ...history.present,
        {
          id,
          type,
          value: toolValue(type),
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          enabled: false,
        },
      ]);
    };
    $("edit-update-tool").onclick = () => {
      const type = $("edit-type").value,
        value = toolValue(type);
      replaceTools(
        history.present.map((w) =>
          w.id === selected ? { ...w, type, value } : w,
        ),
      );
    };
    $("edit-delete-tool").onclick = () => {
      replaceTools(history.present.filter((w) => w.id !== selected));
      selected = history.present[0]?.id || null;
      render();
    };
    $("edit-add-letter").onclick = () => {
      if (level.letters.length >= 24) {
        setStatus("最多 24 封信。", "error");
        return;
      }
      let pos;
      for (let y = 0; y < level.height; y++)
        for (let x = 0; x < level.width - 1; x++)
          if (!pos && !level.letters.some((l) => l.x === x && l.y === y))
            pos = { x, y };
      if (!pos) return;
      const id =
        "M" + (level.letters.length + 1) + "-" + String(Date.now()).slice(-4);
      level.letters.push(catalog.mail(id, [pos, { x: pos.x + 1, y: pos.y }]));
      editorLetter = id;
      render();
    };
    $("edit-delete-letter").onclick = () => {
      if (level.letters.length <= 1) {
        setStatus("至少保留一封信。", "error");
        return;
      }
      level.letters = level.letters.filter((l) => l.id !== editorLetter);
      editorLetter = level.letters[0].id;
      render();
    };
    $("edit-save").onclick = () => {
      try {
        if (!level.title.trim()) throw new Error("请输入标题");
        E.validateLevel(level);
        const solution = E.clone(history.present);
        const saved = E.deriveTargets(level, solution);
        saved.windows = saved.windows.map((w) => ({ ...w, enabled: false }));
        saved.brief = "这是一条自制路线。布置窗口，完成全部交付订单。";
        saved.hint = "参考布局已保存在关卡里，可以点击“查看参考布置”。";
        E.validateLevel(saved);
        saveCustom(saved);
        loadLevel(saved.id);
        setStatus("已生成订单并保存到“我的路线”。可导出 JSON 分享。");
      } catch (err) {
        setStatus("保存失败：" + err.message, "error");
      }
    };
    $("edit-cancel").onclick = () => loadLevel(catalog.levels[0].id);
  }
  function drawRoute(p) {
    const l = level.letters.find((l) => l.id === editorLetter);
    if (!l) return;
    if (resetRoute) {
      if (
        level.letters.some(
          (other) => other.id !== l.id && other.x === p.x && other.y === p.y,
        )
      ) {
        setStatus("入口与另一封信重合，请选空格。", "error");
        return;
      }
      l.path = [p];
      l.x = p.x;
      l.y = p.y;
      resetRoute = false;
    } else {
      const last = l.path.at(-1);
      if (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) !== 1) {
        setStatus("请点击与路径终点相邻的一格。", "error");
        return;
      }
      if (l.path.length >= 60) {
        setStatus("每条路径最多 60 格。", "error");
        return;
      }
      l.path.push(p);
    }
    renderBoard();
    setStatus(
      "信件 " + l.id + " 路径共 " + l.path.length + " 格，点击相邻格继续。",
    );
  }
  document.addEventListener("keydown", (event) => {
    if (
      event.target.matches("input,select,textarea") ||
      document.querySelector("dialog[open]")
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $(event.shiftKey ? "redo" : "undo").click();
      return;
    }
    if (event.key === " " && !event.target.matches("button,[role=button]")) {
      event.preventDefault();
      toggleRun();
    }
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
      selected &&
      !painting
    ) {
      event.preventDefault();
      mutate((ws) => {
        const w = ws.find((w) => w.id === selected);
        w.x = Math.max(
          0,
          Math.min(
            level.width - w.w,
            w.x +
              (event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0),
          ),
        );
        w.y = Math.max(
          0,
          Math.min(
            level.height - w.h,
            w.y +
              (event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : 0),
          ),
        );
        w.enabled = true;
      });
    }
  });
  let saved;
  try {
    const text = localStorage.getItem(STORAGE);
    if (text) saved = E.readSave(text, levels);
  } catch {
    /* Corrupt saves never prevent play. */
  }
  if (saved) completed = saved.completed;
  loadLevel(saved?.levelId || levels[0].id, saved?.windows);
})();
