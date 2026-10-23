"use strict";
/* Orthogonal visibility grid: every segment is checked against all card bounds.
   Coordinates are local to the unscaled tree, so zoom/scroll cannot offset edges. */
(function (g) {
  function route(nodes, byId, pos, w, h) {
    const boxes = nodes.map((n) => ({ ...pos(n), id: n.id })),
      result = [],
      seen = new Set();
    const clear = (a, b) =>
      !boxes.some((r) =>
        a.x === b.x
          ? a.x > r.x - 5 &&
            a.x < r.x + w + 5 &&
            Math.max(a.y, b.y) > r.y - 5 &&
            Math.min(a.y, b.y) < r.y + h + 5
          : a.y > r.y - 5 &&
            a.y < r.y + h + 5 &&
            Math.max(a.x, b.x) > r.x - 5 &&
            Math.min(a.x, b.x) < r.x + w + 5,
      );
    const xs = [
      ...new Set([
        12,
        ...boxes.flatMap((r) => [r.x - 10, r.x + w / 2, r.x + w + 10]),
      ]),
    ].sort((a, b) => a - b);
    const ys = [
      ...new Set([12, ...boxes.flatMap((r) => [r.y - 10, r.y + h + 10])]),
    ].sort((a, b) => a - b);
    const nx = xs.length,
      ny = ys.length;
    // Reuse visibility across edges; ports are inserted into this shared grid.
    const adj = new Map();
    const neighbors = (id) => {
      if (adj.has(id)) return adj.get(id);
      const x = id % nx,
        y = Math.floor(id / nx),
        a = { x: xs[x], y: ys[y] },
        out = [];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || xx >= nx || yy < 0 || yy >= ny) continue;
        const b = { x: xs[xx], y: ys[yy] };
        if (clear(a, b))
          out.push([yy * nx + xx, Math.abs(b.x - a.x) + Math.abs(b.y - a.y)]);
      }
      adj.set(id, out);
      return out;
    };
    function search(a, b) {
      const start = ys.indexOf(a.y) * nx + xs.indexOf(a.x),
        end = ys.indexOf(b.y) * nx + xs.indexOf(b.x);
      const dist = new Map([[start, 0]]),
        prev = new Map(),
        heap = [];
      const heuristic = (id) =>
        Math.abs(xs[id % nx] - b.x) + Math.abs(ys[Math.floor(id / nx)] - b.y);
      const push = (v) => {
        let i = heap.length;
        heap.push(v);
        while (i) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= v[0]) break;
          heap[i] = heap[p];
          i = p;
        }
        heap[i] = v;
      };
      const pop = () => {
        const first = heap[0],
          last = heap.pop();
        if (heap.length) {
          let i = 0;
          while (i * 2 + 1 < heap.length) {
            let c = i * 2 + 1;
            if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
            if (heap[c][0] >= last[0]) break;
            heap[i] = heap[c];
            i = c;
          }
          heap[i] = last;
        }
        return first;
      };
      push([heuristic(start), start, 0]);
      while (heap.length) {
        const [, id, cost] = pop();
        if (cost !== dist.get(id)) continue;
        if (id === end) {
          const points = [];
          let v = id;
          while (v !== undefined) {
            points.push({ x: xs[v % nx], y: ys[Math.floor(v / nx)] });
            v = prev.get(v);
          }
          return points.reverse();
        }
        for (const [next, d] of neighbors(id)) {
          const total = cost + d;
          if (total < (dist.get(next) ?? Infinity)) {
            dist.set(next, total);
            prev.set(next, id);
            push([total + heuristic(next), next, total]);
          }
        }
      }
      return null;
    }
    for (const child of nodes)
      for (const id of child.prerequisites || []) {
        const parent = byId[id];
        if (!parent || seen.has(id + ">" + child.id)) continue;
        seen.add(id + ">" + child.id);
        const a = pos(parent),
          b = pos(child),
          start = { x: a.x + w / 2, y: a.y + h },
          end = { x: b.x + w / 2, y: b.y };
        const path = search(
          { x: start.x, y: start.y + 10 },
          { x: end.x, y: end.y - 10 },
        );
        // Invalid overlapping source data is reported, never drawn through cards.
        if (!path) {
          console.warn("国家方針の接続経路なし", id, child.id);
          continue;
        }
        const points = [start, ...path, end].filter(
          (p, i, all) =>
            !i ||
            i === all.length - 1 ||
            !(
              (all[i - 1].x === p.x && p.x === all[i + 1].x) ||
              (all[i - 1].y === p.y && p.y === all[i + 1].y)
            ),
        );
        result.push({
          parentId: id,
          childId: child.id,
          path: points
            .map((p, i) => (i ? "L" : "M") + p.x + "," + p.y)
            .join(" "),
        });
      }
    return result;
  }
  g.FocusRouting = { route };
})(window);
