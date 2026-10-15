(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./engine.js"));
  else root.PostLevels = factory(root.PostEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  const row = (y, reverse = false) =>
    Array.from({ length: 8 }, (_, i) => ({ x: reverse ? 7 - i : i, y }));
  const route = (coords) => coords.map(([x, y]) => ({ x, y }));
  const mail = (id, path, initial = E.blank()) => ({
    id,
    x: path[0].x,
    y: path[0].y,
    path,
    initial,
    target: E.blank(),
  });
  const state = (front = "white", back = "white", extra = {}) =>
    Object.assign(
      E.blank(),
      {
        front: { color: front, stamps: [] },
        back: { color: back, stamps: [] },
      },
      extra,
    );
  const win = (id, type, value, x, y, w = 1, h = 1) => ({
    id,
    type,
    value: value || "",
    x,
    y,
    w,
    h,
    enabled: true,
  });
  const levels = [];
  function add(title, chapter, brief, hint, letters, solution) {
    const n = levels.length + 1;
    const windows = solution.map((w) => ({
      ...w,
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      enabled: false,
    }));
    levels.push(
      E.deriveTargets(
        {
          version: 1,
          id: "level-" + String(n).padStart(2, "0"),
          title,
          chapter,
          brief,
          hint,
          width: 8,
          height: 6,
          letters,
          windows,
        },
        solution,
      ),
    );
  }
  add(
    "第一封彩色信",
    "01 · 开张",
    "把珊瑚染色窗放到 A 的路径上，然后发件。进入窗口时加工一次。",
    "不必覆盖整条路径，只要让信进入一次即可。",
    [mail("A", row(2))],
    [win("ink1", "ink", "coral", 3, 2, 2, 1)],
  );
  add(
    "一窗两件",
    "01 · 开张",
    "A 和 B 都需要金色。拉高窗口，一次照顾两条线路。",
    "矩形窗口可以跨过空白行，同时覆盖两条路径。",
    [mail("A", row(1)), mail("B", row(4))],
    [win("ink1", "ink", "gold", 3, 1, 2, 4)],
  );
  add(
    "白信请绕行",
    "01 · 开张",
    "只把 A 染成蓝色，B 保持原样。窗口外的信不会受影响。",
    "缩小窗口的高度，让 B 从窗外通过。",
    [mail("A", row(1)), mail("B", row(3))],
    [win("ink1", "ink", "blue", 3, 1)],
  );
  add(
    "最后一层颜色",
    "01 · 开张",
    "A 要珊瑚色，B 要蓝色。两个窗口可以重叠，后加工的颜色会覆盖先前颜色。",
    "先用珊瑚色窗覆盖两路，再让蓝色窗只覆盖 B；如果同格进入，检查层级。",
    [mail("A", row(1)), mail("B", row(4))],
    [
      win("ink1", "ink", "coral", 3, 1, 2, 4),
      win("ink2", "ink", "blue", 3, 4, 2, 1),
    ],
  );
  add(
    "星星邮票",
    "02 · 邮戳与折痕",
    "给两封信盖上星星。重复进入会重复盖章，留在窗口里不会。",
    "一个竖向窗口就能处理两封信。",
    [mail("A", row(1)), mail("B", row(4))],
    [win("stamp1", "stamp", "star", 2, 1, 3, 4)],
  );
  add(
    "先月亮后星星",
    "02 · 邮戳与折痕",
    "邮戳顺序也是订单的一部分。把月亮盖在星星之前。",
    "可以沿路先后摆放，也可以重叠后调整列表顺序。列表从上到下加工。",
    [mail("A", row(2))],
    [
      win("stamp1", "stamp", "moon", 3, 2),
      win("stamp2", "stamp", "star", 3, 2),
    ],
  );
  add(
    "折一折",
    "02 · 邮戳与折痕",
    "A 需要一折，B 仍然平整。折叠不改变路径，也不遮住后续加工。",
    "折叠窗只需要覆盖 A 的路线。",
    [mail("A", row(1)), mail("B", row(4))],
    [win("fold1", "fold", "", 4, 1)],
  );
  add(
    "两道折痕",
    "02 · 邮戳与折痕",
    "A 一折、B 两折。每次进入折叠窗增加一折，最多两折。",
    "一道窗覆盖两封信，另一道只覆盖 B。",
    [mail("A", row(1)), mail("B", row(4))],
    [
      win("fold1", "fold", "", 2, 1, 2, 4),
      win("fold2", "fold", "", 2, 4, 2, 1),
    ],
  );
  add(
    "背面也是画布",
    "03 · 双面车间",
    "翻到背面，再把背面染蓝。交付时背面朝上。",
    "翻面必须先于染色；前面仍应保持白色。",
    [mail("A", row(2))],
    [win("flip1", "flip", "", 2, 2), win("ink1", "ink", "blue", 2, 2)],
  );
  add(
    "秘密背章",
    "03 · 双面车间",
    "给背面盖心形章，然后翻回正面。订单检查两面。",
    "工艺顺序：翻面 → 盖章 → 翻回。",
    [mail("A", row(2))],
    [
      win("flip1", "flip", "", 3, 2),
      win("stamp1", "stamp", "heart", 3, 2),
      win("flip2", "flip", "", 3, 2),
    ],
  );
  add(
    "擦掉旧信笺",
    "03 · 双面车间",
    "A 的旧颜色要擦掉再染金，B 的蓝色要保留。擦除会清空当前面的颜色和邮戳。",
    "两个窗只处理 A，而且擦除在染色之前。",
    [mail("A", row(1), state("coral")), mail("B", row(4), state("blue"))],
    [win("erase1", "erase", "", 2, 1), win("ink1", "ink", "gold", 2, 1)],
  );
  add(
    "转着盖章",
    "03 · 双面车间",
    "先盖一枚正向星星，顺时针旋转，再盖一枚向右的星星。邮戳保留盖下时的方向。",
    "旋转窗应在两次盖章之间。信件最后方向也要一致。",
    [mail("A", row(2))],
    [
      win("stamp1", "stamp", "star", 2, 2),
      win("rotate1", "rotate", "", 2, 2),
      win("stamp2", "stamp", "star", 2, 2),
    ],
  );
  add(
    "三路分拣",
    "04 · 路线的学问",
    "三条线路：A 蓝、B 金、C 蓝。用两个染色窗完成。",
    "一个大蓝窗覆盖三路，后来的金窗只处理中路。",
    [mail("A", row(0)), mail("B", row(2)), mail("C", row(5))],
    [
      win("ink1", "ink", "blue", 2, 0, 2, 6),
      win("ink2", "ink", "gold", 2, 2, 2, 1),
    ],
  );
  const elbow = route([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 2],
  ]);
  add(
    "转角遇到章",
    "04 · 路线的学问",
    "A 会拐弯，B 直行。两封信都染薄荷色，但只有转弯后的 A 盖心形章。",
    "先找一条两封信都经过的竖带，再把邮戳放在 A 独有的路段。",
    [mail("A", elbow), mail("B", row(4))],
    [
      win("ink1", "ink", "mint", 1, 0, 1, 5),
      win("stamp1", "stamp", "heart", 5, 2),
    ],
  );
  add(
    "相向而行",
    "04 · 路线的学问",
    "A 从左往右，B 从右往左。它们要相反的邮戳顺序，只能使用两个窗。",
    "将星星和月亮分放左右。反向行进会自然反转工艺顺序。",
    [mail("A", row(1)), mail("B", row(4, true))],
    [
      win("stamp1", "stamp", "star", 2, 1, 1, 4),
      win("stamp2", "stamp", "moon", 5, 1, 1, 4),
    ],
  );
  const loop = route([
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [4, 2],
    [4, 3],
    [3, 3],
    [2, 3],
    [1, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
    [7, 4],
  ]);
  add(
    "同一扇窗，第二次",
    "04 · 路线的学问",
    "只有一扇折叠窗，但 A 需要两折。路线会回头。",
    "选一个信件会离开、又再次进入的区域。持续在窗内不会重复折。",
    [mail("A", loop)],
    [win("fold1", "fold", "", 2, 1, 1, 3)],
  );
  add(
    "反向染色",
    "05 · 工艺交响",
    "A 最后蓝色，B 最后珊瑚色。两封信方向相反，两个窗都要覆盖两条路。",
    "在左边放珊瑚色，右边放蓝色。每封信最后经过的颜色不同。",
    [mail("A", row(1)), mail("B", row(4, true))],
    [
      win("ink1", "ink", "coral", 2, 1, 1, 4),
      win("ink2", "ink", "blue", 5, 1, 1, 4),
    ],
  );
  add(
    "双面双线路",
    "05 · 工艺交响",
    "A 正面金色、背面蓝色，B 只需正面金色。A 交付时背面朝上。",
    "先给两封信染金，再只翻 A，再给 A 染蓝。",
    [mail("A", row(1)), mail("B", row(4))],
    [
      win("ink1", "ink", "gold", 2, 1, 1, 4),
      win("flip1", "flip", "", 4, 1),
      win("ink2", "ink", "blue", 4, 1),
    ],
  );
  add(
    "保留背面的秘密",
    "05 · 工艺交响",
    "擦掉 A 正面的旧色，保留背面的心形章；B 保留旧色。A 最后需一枚正面星星。",
    "擦除只作用于朝上的一面，这里不需要翻面。",
    [
      mail(
        "A",
        row(1),
        state("coral", "gold", {
          back: { color: "gold", stamps: [{ mark: "heart", angle: 0 }] },
        }),
      ),
      mail("B", row(4), state("coral")),
    ],
    [win("erase1", "erase", "", 3, 1), win("stamp1", "stamp", "star", 3, 1)],
  );
  add(
    "邮戳也有方向",
    "05 · 工艺交响",
    "A 先转后盖，B 先盖后转。它们都向右，星星却方向不同。",
    "利用两封信的反向路径，把旋转放左、盖章放右。",
    [mail("A", row(1)), mail("B", row(4, true))],
    [
      win("rotate1", "rotate", "", 2, 1, 1, 4),
      win("stamp1", "stamp", "star", 5, 1, 1, 4),
    ],
  );
  add(
    "回环邮戳",
    "06 · 夜班挑战",
    "一扇盖章窗，A 需要两枚月亮；B 只要一枚。再把两封信都染薄荷色。",
    "A 回头时可以第二次进入同一窗口；B 只横穿一次。注意窗口要让前一段转弯保持在窗内。",
    [mail("A", loop), mail("B", row(5))],
    [
      win("stamp1", "stamp", "moon", 4, 1, 1, 5),
      win("ink1", "ink", "mint", 6, 0, 1, 6),
    ],
  );
  add(
    "重叠窗口的秩序",
    "06 · 夜班挑战",
    "两封信先擦旧色、染金、翻面、染蓝、盖星。A 还要一折。请留意双面订单。",
    "先整理全局工艺顺序，再把折叠窗缩到 A 路线上。",
    [mail("A", row(1), state("coral")), mail("B", row(4), state("mint"))],
    [
      win("erase1", "erase", "", 3, 1, 1, 4),
      win("ink1", "ink", "gold", 3, 1, 1, 4),
      win("flip1", "flip", "", 3, 1, 1, 4),
      win("ink2", "ink", "blue", 3, 1, 1, 4),
      win("stamp1", "stamp", "star", 3, 1, 1, 4),
      win("fold1", "fold", "", 3, 1),
    ],
  );
  add(
    "三封不同的信",
    "06 · 夜班挑战",
    "三封信共享部分工艺：A 蓝背面心形章、B 蓝正面无章、C 白正面心形章。",
    "蓝色覆盖上两路；翻面只处理 A。最后一个高窗可让 A 和 C 都盖章，但也会盖 B——需要擦除并重染 B。",
    [mail("A", row(0)), mail("B", row(2)), mail("C", row(5))],
    [
      win("flip1", "flip", "", 1, 0),
      win("ink1", "ink", "blue", 2, 0, 1, 3),
      win("stamp1", "stamp", "heart", 3, 0, 1, 6),
      win("erase1", "erase", "", 4, 2),
      win("ink2", "ink", "blue", 5, 2),
    ],
  );
  add(
    "最后一班邮车",
    "06 · 夜班挑战",
    "A 和 B 反向行驶，第三封信拐弯。六种工艺一起上场：颜色、双面、章序、朝向与折痕都要匹配。",
    "先看 A 和 B 的相反工艺。左侧擦除再染金，中间旋转及盖章，右侧翻面和折叠；C 在上路绕过部分窗。",
    [
      mail("A", row(1), state("coral")),
      mail("B", row(4, true), state("blue")),
      mail("C", elbow, state("mint")),
    ],
    [
      win("erase1", "erase", "", 1, 1, 1, 4),
      win("ink1", "ink", "gold", 1, 1, 1, 4),
      win("rotate1", "rotate", "", 3, 0, 1, 5),
      win("stamp1", "stamp", "moon", 3, 0, 1, 5),
      win("flip1", "flip", "", 5, 1, 1, 4),
      win("fold1", "fold", "", 6, 0, 1, 5),
    ],
  );
  levels.forEach(E.validateLevel);
  return { levels, row, mail, win };
});
