/* Province-graph offensive plans for game/index.html. No vector steering.
 * Persist only JSON in army.areaPlan; graph fields live in a disposable WeakMap.
 */
"use strict";
(function (global) {
  const cache = new WeakMap();
  const own = (pid) =>
    MapRenderer.ownerOf(Number(pid)) === CoreEngine.gameState.country;
  const enemy = (pid) =>
    CoreEngine.gameState.atWar.includes(MapRenderer.ownerOf(Number(pid)));
  const land = (pid) => OffensivePlanner.isLand(Number(pid));
  const adjacent = (pid) =>
    [...(MapRenderer.provNeighbors.get(Number(pid)) || [])].filter(land);
  const unique = (ids) => [
    ...new Set(ids.map(Number).filter((id) => id && land(id))),
  ];
  const canPass = (pid) =>
    land(pid) &&
    (own(pid) ||
      enemy(pid) ||
      CoreEngine.gameState.militaryAccess?.[MapRenderer.ownerOf(pid)] === true);
  const center = (pid) => MapRenderer.provCentroid.get(Number(pid));
  function field(seeds, allowed = canPass) {
    const d = new Map(),
      queue = unique(seeds).filter(allowed);
    queue.forEach((id) => d.set(id, 0));
    for (let i = 0; i < queue.length; i++)
      for (const next of adjacent(queue[i])) {
        if (!d.has(next) && allowed(next)) {
          d.set(next, d.get(queue[i]) + 1);
          queue.push(next);
        }
      }
    return d;
  }
  function walk(start, goal, allowed) {
    const distances = field([goal], allowed),
      path = [Number(start)];
    if (!distances.has(Number(start))) return [];
    while (path.at(-1) !== Number(goal)) {
      const pid = path.at(-1),
        next = adjacent(pid).find(
          (n) => distances.get(n) === distances.get(pid) - 1,
        );
      if (next == null) return [];
      path.push(next);
    }
    return path;
  }
  function sourceIds(army) {
    const border = (pid) => own(pid) && adjacent(pid).some((n) => enemy(n));
    return unique(
      (army.frontline || [])
        .map((pt) => {
          const pid = OffensivePlanner.nearest(pt, border),
            c = center(pid);
          return c && Math.hypot(c[0] - pt[0], c[1] - pt[1]) <= 24 ? pid : null;
        })
        .filter(Boolean),
    );
  }
  function position(division, pid) {
    const c = center(pid);
    if (!c) return;
    division.pid = Number(pid);
    division.x = c[0];
    division.y = c[1];
  }
  function pending(army) {
    return BattleManager.battles.filter(
      (b) => b.attackerArmyId === army.id && b.areaPlan,
    );
  }
  function engaged(army) {
    return new Set(pending(army).flatMap((b) => b.divisionIds || []));
  }
  function data(plan) {
    const stamp =
      AreaBattlePlan.revision +
      ":" +
      CoreEngine.gameState.atWar.slice().sort().join(",");
    let memo = cache.get(plan);
    if (!memo || memo.stamp !== stamp) {
      memo = { stamp, corridor: new Set(plan.corridor), goals: new Map() };
      cache.set(plan, memo);
    }
    return memo;
  }
  function goalField(plan, goal) {
    const memo = data(plan);
    if (!memo.goals.has(goal))
      memo.goals.set(
        goal,
        field([goal], (p) => memo.corridor.has(p) && canPass(p)),
      );
    return memo.goals.get(goal);
  }
  const AreaBattlePlan = {
    revision: 0,
    field,
    walk,
    /** The target stroke is a set of touching land provinces, NOT a direction. */
    setLine(army, points) {
      if (!army || army.executing || points.length < 1) return false;
      const samples = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)],
          b = points[i],
          steps = Math.max(
            1,
            Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2),
          );
        for (let n = 0; n <= steps; n++) {
          const pid = MapRenderer.provinceAt(
            a[0] + ((b[0] - a[0]) * n) / steps,
            a[1] + ((b[1] - a[1]) * n) / steps,
          );
          if (pid && land(pid) && !own(pid) && samples.at(-1) !== Number(pid))
            samples.push(Number(pid));
        }
      }
      const goals = unique(samples);
      if (!goals.length) {
        GameUI.notify(
          "敵領内で、到達したい目標ラインを横方向に描いてください。",
          "alert",
        );
        return false;
      }
      // Do not interpolate across a sea, neutral country, or disconnected island.
      for (let i = 1; i < goals.length; i++)
        if (!adjacent(goals[i - 1]).includes(goals[i])) {
          GameUI.notify(
            "攻撃線は陸続きの隣接区画に沿って描いてください。",
            "alert",
          );
          return false;
        }
      army.offensiveLine = {
        points: points.map((p) => p.slice()),
        pids: goals,
      };
      army.areaPlan = null;
      army.route = null;
      army.chain = null;
      const from =
        army.frontline?.[Math.floor(army.frontline.length / 2)] || army.base;
      army.arrow = {
        from: from.slice(),
        to: center(goals[Math.floor(goals.length / 2)]).slice(),
      }; // legacy UI/save compatibility only
      army.targetState = MapRenderer.stateOf(goals[0]);
      PlanningBonus.reset(army);
      GameUI.notify(
        "攻撃線を設定：目標 " +
          goals.length +
          "区画。各師団が分散して隣接区画へ進撃します。",
        "success",
      );
      return true;
    },
    /** Geodesic hull of the initial front and ALL goals. Union of graph-distance
     * bands gives widening/narrowing fronts without an arrow or centroid vector. */
    build(army) {
      const sources = sourceIds(army);
      const goals = unique(
        army.offensiveLine?.pids || [
          MapRenderer.provinceAt(...(army.arrow?.to || [])),
        ],
      );
      if (
        !sources.length ||
        !goals.length ||
        goals.some((p) => !enemy(p) && !own(p))
      )
        return null;
      const ds = field(sources),
        dg = field(goals),
        corridor = new Set(sources);
      if (goals.some((p) => !ds.has(p)) || sources.some((p) => !dg.has(p)))
        return null;
      // One graph step of slack fills small gaps without sweeping unrelated fronts.
      for (const goal of goals) {
        const distances = field([goal]),
          depth = ds.get(goal);
        for (const [pid, fromStart] of ds)
          if (
            fromStart <= depth &&
            fromStart + (distances.get(pid) ?? Infinity) <= depth + 1
          )
            corridor.add(pid);
      }
      for (const source of sources) {
        const distances = field([source]),
          depth = dg.get(source);
        for (const [pid, toGoal] of dg)
          if (
            toGoal <= depth &&
            toGoal + (distances.get(pid) ?? Infinity) <= depth + 1
          )
            corridor.add(pid);
      }
      goals.forEach((p) => corridor.add(p));
      // A Manhattan graph has many equally short paths (their union can be a
      // rectangle). Shape that hull around a GRAPH spine, with a width that
      // interpolates between the original front and target line. This controls
      // the allowed battle area, never a division's movement vector.
      const spine = walk(
        sources[Math.floor(sources.length / 2)],
        goals[Math.floor(goals.length / 2)],
        canPass,
      );
      const spineDistance = field(spine);
      const sourceRadius = Math.max(
        ...sources.map((p) => spineDistance.get(p) || 0),
      );
      const goalRadius = Math.max(
        ...goals.map((p) => spineDistance.get(p) || 0),
      );
      const shaped = new Set(
        [...corridor].filter((p) => {
          const from = ds.get(p),
            to = dg.get(p),
            t = from / Math.max(1, from + to);
          return (
            (spineDistance.get(p) ?? Infinity) <=
            sourceRadius * (1 - t) + goalRadius * t + 0.25
          );
        }),
      );
      // Join every endpoint to the spine through the existing hull. This also
      // handles irregular coastlines and obstacles without Euclidean shortcuts.
      const joins = field(spine, (p) => corridor.has(p) && canPass(p));
      for (const end of [...sources, ...goals]) {
        let p = end;
        shaped.add(p);
        while ((joins.get(p) ?? 0) > 0) {
          p = adjacent(p).find((n) => joins.get(n) === joins.get(p) - 1);
          if (p == null) break;
          shaped.add(p);
        }
      }
      const linked = field(sources, (p) => shaped.has(p) && canPass(p));
      if (goals.some((p) => !linked.has(p))) return null;
      return {
        version: 1,
        sources,
        goals,
        corridor: [...shaped],
        activated: sources.slice(),
        frontier: [],
        edgePairs: [],
        captured: 0,
      };
    },
    execute(id) {
      const army = BattlePlanManager.armies.find((a) => a.id === id);
      if (!army || army.executing) return false;
      if (
        !army.divisions.length ||
        !army.frontline?.length ||
        (!army.offensiveLine?.pids?.length && !army.arrow)
      ) {
        GameUI.notify(
          "師団・前線・目標となる攻撃線を設定してください。",
          "alert",
        );
        return false;
      }
      const plan = this.build(army);
      if (!plan) {
        GameUI.notify(
          "前線から全目標へ到達できません。交戦状態・中立国・海・飛び地を確認してください。",
          "alert",
        );
        return false;
      }
      army.areaPlan = plan;
      army.route = null;
      army.chain = null;
      army.goalPid = null;
      army.executing = true;
      army.status = "面的攻勢";
      const loads = new Map();
      for (const d of army.divisions) {
        if (!d.pid) {
          const pid = OffensivePlanner.nearest(
            [d.x ?? army.base[0], d.y ?? army.base[1]],
            own,
          );
          if (pid) position(d, pid);
        }
        delete d.planStagingPid;
        delete d.planGoal;
        const rear = data(plan).corridor.has(Number(d.pid))
          ? null
          : field([d.pid]);
        const choices = plan.goals.map((goal) => ({
          goal,
          distance:
            (rear
              ? rear.get(goal)
              : goalField(plan, goal).get(Number(d.pid))) ?? Infinity,
        }));
        choices.sort(
          (a, b) =>
            a.distance +
              (loads.get(a.goal) || 0) * 3 -
              (b.distance + (loads.get(b.goal) || 0) * 3) || a.goal - b.goal,
        );
        const best = choices[0];
        if (best) {
          d.planGoal = best.goal;
          loads.set(best.goal, (loads.get(best.goal) || 0) + 1);
        }
      }
      this.refresh(army);
      this.schedule(army);
      BattlePlanManager.renderPanel();
      return true;
    },
    /** Only provinces in THIS plan's hull contribute frontier edges. No global
     * nearest-neighbour polyline that joins disconnected fronts through space. */
    refresh(army) {
      const plan = army.areaPlan;
      if (!plan) return;
      const corridor = new Set(plan.corridor),
        activated = new Set(plan.activated || plan.sources),
        edges = [],
        front = [];
      for (const pid of plan.corridor)
        if (own(pid) && activated.has(pid)) {
          for (const n of adjacent(pid))
            if ((corridor.has(n) || plan.sources.includes(pid)) && enemy(n)) {
              edges.push([pid, n]);
              if (!front.includes(pid)) front.push(pid);
            }
        }
      plan.frontier = front;
      plan.edgePairs = edges;
      army.frontline = front
        .map(center)
        .filter(Boolean)
        .map((c) => c.slice());
      army.deployedPids = unique(army.divisions.map((d) => d.pid));
      army.positionPid =
        army.divisions.find((d) => own(d.pid))?.pid ?? army.positionPid;
      if (center(army.positionPid))
        army.base = center(army.positionPid).slice();
      if (plan.goals.some((p) => !own(p) && !enemy(p))) {
        army.executing = false;
        army.status = "交戦終了・計画停止";
        BattleManager.battles = BattleManager.battles.filter(
          (b) => b.attackerArmyId !== army.id || !b.areaPlan,
        );
      }
      const remaining = plan.corridor.filter(enemy).length;
      army.progress = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 *
              (1 -
                remaining /
                  Math.max(1, plan.corridor.length - plan.sources.length)),
          ),
        ),
      );
      if (!remaining && plan.goals.every(own) && !pending(army).length) {
        army.executing = false;
        army.progress = 100;
        army.status = "目標地域確保・駐留";
      }
    },
    schedule(army, move = false) {
      const plan = army.areaPlan;
      if (!army.executing || !plan) return;
      const memo = data(plan),
        busy = engaged(army),
        groups = new Map(),
        loads = new Map();
      for (const d of army.divisions)
        loads.set(Number(d.pid), (loads.get(Number(d.pid)) || 0) + 1);
      const remaining = plan.corridor.filter(enemy);
      if (!remaining.length) {
        this.refresh(army);
        return;
      }
      let acted = false,
        ready = 0;
      for (const d of army.divisions) {
        const pid = Number(d.pid);
        if (
          own(pid) &&
          memo.corridor.has(pid) &&
          !(plan.activated ||= plan.sources.slice()).includes(pid)
        )
          plan.activated.push(pid);
        if (busy.has(d.id) || d.planCooldown > 0 || d.org < 30) continue;
        if (
          !own(pid) &&
          CoreEngine.gameState.militaryAccess?.[MapRenderer.ownerOf(pid)] !==
            true
        )
          continue;
        ready++;
        if (!d.planGoal || own(d.planGoal) || !memo.corridor.has(d.planGoal)) {
          const reachable = field([pid]);
          const goal = remaining
            .filter((p) => reachable.has(p))
            .sort(
              (a, b) =>
                reachable.get(a) +
                  (loads.get(a) || 0) * 3 -
                  (reachable.get(b) + (loads.get(b) || 0) * 3) || a - b,
            )[0];
          d.planGoal = goal;
        }
        if (!d.planGoal) continue;
        let distances = goalField(plan, d.planGoal);
        // A rear division approaches the scoped front using owned land only.
        if (!memo.corridor.has(pid)) {
          const approach = field(
            plan.frontier.length ? plan.frontier : plan.sources,
            own,
          );
          const next = adjacent(pid)
            .filter((p) => own(p) && approach.get(p) < approach.get(pid))
            .sort(
              (a, b) =>
                approach.get(a) - approach.get(b) ||
                (loads.get(a) || 0) - (loads.get(b) || 0) ||
                a - b,
            )[0];
          if (next != null && move && !(d.planMoveHours > 0)) {
            position(d, next);
            d.planMoveHours = 24;
            acted = true;
          }
          continue;
        }
        const current = distances.get(pid) ?? Infinity;
        const candidates = adjacent(pid).filter(
          (p) =>
            memo.corridor.has(p) && canPass(p) && distances.get(p) < current,
        );
        candidates.sort(
          (a, b) =>
            distances.get(a) +
              (loads.get(a) || 0) * 0.7 -
              (distances.get(b) + (loads.get(b) || 0) * 0.7) || a - b,
        );
        const next = candidates.find(
          (p) =>
            !enemy(p) ||
            !BattleManager.battles.some(
              (b) => b.provId === p && b.attackerArmyId !== army.id,
            ),
        );
        if (next == null) continue;
        if (enemy(next)) {
          if (!(d.planMoveHours > 0)) {
            if (!groups.has(next)) groups.set(next, []);
            groups.get(next).push(d.id);
            loads.set(next, (loads.get(next) || 0) + 1);
          }
        } else if (move && !(d.planMoveHours > 0)) {
          position(d, next);
          d.planMoveHours = 24;
          loads.set(next, (loads.get(next) || 0) + 1);
          acted = true;
        }
      }
      for (const [target, ids] of groups) {
        const battle = BattleManager.startOffensive(
          army,
          target,
          MapRenderer.stateOf(target),
          { divisionIds: ids },
        );
        if (battle) acted = true;
      }
      army.status = pending(army).length
        ? "面的攻勢・" + pending(army).length + "区画で戦闘"
        : acted
          ? "前線へ行軍"
          : ready
            ? "進路待機（経路・交戦状態を確認）"
            : "組織力回復";
      this.refresh(army);
    },
    tick(army, hours = 1) {
      const busy = engaged(army);
      for (const d of army.divisions) {
        d.planMoveHours = Math.max(0, (d.planMoveHours || 0) - hours);
        d.planCooldown = Math.max(0, (d.planCooldown || 0) - hours);
        if (!busy.has(d.id))
          d.org = Math.min(
            d.maxOrg || 60,
            (d.org || 0) + ((army.executing ? 2 : 3) * hours) / 24,
          );
        if (!army.executing && d.planStagingPid && !(d.planMoveHours > 0)) {
          const path = walk(d.pid, d.planStagingPid, own);
          if (path.length > 1) {
            position(d, path[1]);
            d.planMoveHours = 24;
          }
          if (d.pid === d.planStagingPid) delete d.planStagingPid;
        }
      }
      if (army.areaPlan) {
        this.refresh(army);
        this.schedule(army, true);
      }
    },
    result(battle) {
      const army = BattlePlanManager.armies.find(
        (a) => a.id === battle.attackerArmyId,
      );
      if (!army) return;
      const participants = army.divisions.filter((d) =>
        (battle.divisionIds || []).includes(d.id),
      );
      if (!army.executing || !army.areaPlan) return;
      const win =
        battle.advantage >= 0.1 &&
        participants.some(
          (d) => own(d.pid) && adjacent(d.pid).includes(Number(battle.provId)),
        ) &&
        (enemy(battle.provId) || own(battle.provId));
      if (win) {
        if (!own(battle.provId))
          OffensivePlanner.capture(battle.provId, CoreEngine.gameState.country);
        for (const d of participants)
          if (adjacent(d.pid).includes(Number(battle.provId)) && own(d.pid)) {
            position(d, battle.provId);
            d.planMoveHours = 24;
          }
        if (army.areaPlan) army.areaPlan.captured++;
      }
      for (const d of participants) {
        d.org = Math.max(0, d.org - 10);
        if (!win) d.planCooldown = 24;
      }
      this.refresh(army);
      army.status =
        !army.executing && army.progress === 100
          ? "目標地域確保・駐留"
          : win
            ? "区画を確保・他の師団は攻勢継続"
            : "局地攻撃失敗・再編中（他区画は継続）";
    },
    stage(army) {
      if (!army || army.executing || !army.frontline?.length) return false;
      const pids = unique(
        army.frontline.map((pt) =>
          OffensivePlanner.nearest(
            pt,
            (p) => own(p) && adjacent(p).some((n) => !own(n)),
          ),
        ),
      );
      if (!pids.length) return false;
      army.areaPlan = null;
      army.deployedPids = pids;
      army.divisions.forEach((d, i) => {
        if (!d.pid) {
          const p = OffensivePlanner.nearest(
            [d.x ?? army.base[0], d.y ?? army.base[1]],
            own,
          );
          if (p) position(d, p);
        }
        d.planStagingPid = pids[i % pids.length];
      });
      return true;
    },
    /** Draw actual shared pixel edges. Each pair is independent; no false
     * connections between islands/disconnected fronts. */
    drawPairs(ctx, project, pairs, color, width, dash = []) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const [a, b] of pairs) {
        const segments = MapRenderer.provinceBoundarySegments?.get(
          Math.min(a, b) + ":" + Math.max(a, b),
        );
        if (segments?.length) {
          for (let i = 0; i < segments.length; i += 4) {
            const p = project(segments[i], segments[i + 1]),
              q = project(segments[i + 2], segments[i + 3]);
            ctx.moveTo(...p);
            ctx.lineTo(...q);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    draw(ctx, project, army) {
      if (!army.offensiveLine && !army.areaPlan && !army.frontline?.length)
        return false;
      const plan = army.areaPlan;
      const frontier =
        plan?.edgePairs ||
        unique(
          (army.frontline || []).map((p) => OffensivePlanner.nearest(p, own)),
        ).flatMap((p) =>
          adjacent(p)
            .filter(enemy)
            .map((n) => [p, n]),
        );
      this.drawPairs(ctx, project, frontier, "#83ea8a", 3);
      const goals = new Set(plan?.goals || army.offensiveLine?.pids || []),
        pairs = [];
      for (const p of goals)
        for (const n of MapRenderer.provNeighbors.get(p) || [])
          if (!goals.has(n)) pairs.push([p, n]);
      this.drawPairs(ctx, project, pairs, "#ff7770", 4, [7, 4]);
      // Target stroke is a line/area, never a vector arrow.
      const points = army.offensiveLine?.points;
      if (points?.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#ffaaa0";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        points.forEach((p, i) => {
          const c = project(...p);
          if (i) ctx.lineTo(...c);
          else ctx.moveTo(...c);
        });
        ctx.stroke();
        ctx.restore();
      }
      const label = center([...goals][Math.floor(goals.size / 2)]);
      if (label) {
        const p = project(...label);
        ctx.save();
        ctx.fillStyle = "#ffd4c6";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(
          "目標線 " + goals.size + "区画 / " + army.progress + "%",
          p[0] + 8,
          p[1] - 8,
        );
        ctx.restore();
      }
      return true;
    },
  };
  const legacy = {
    tick: OffensivePlanner.tickArmy,
    result: OffensivePlanner.result,
    endDrag: BattlePlanManager.endDrag,
    clear: BattlePlanManager.clearFront,
    autoFront: BattlePlanManager.autoFrontline,
    capture: OffensivePlanner.capture,
  };
  OffensivePlanner.execute = (id) => AreaBattlePlan.execute(id);
  OffensivePlanner.next = (army) => AreaBattlePlan.schedule(army);
  OffensivePlanner.tickArmy = (army) => {
    if (
      army.executing &&
      !army.areaPlan &&
      army.arrow &&
      !BattleManager.battles.some((b) => b.attackerArmyId === army.id)
    ) {
      army.executing = false;
      AreaBattlePlan.execute(army.id);
    }
    if (
      army.areaPlan ||
      army.offensiveLine ||
      army.divisions.some((d) => d.planStagingPid)
    )
      AreaBattlePlan.tick(army);
    else legacy.tick(army);
  };
  OffensivePlanner.result = (b) =>
    b.areaPlan ? AreaBattlePlan.result(b) : legacy.result(b);
  OffensivePlanner.updateFrontline = (army) => AreaBattlePlan.refresh(army);
  OffensivePlanner.redistribute = (army) => {
    if (army.areaPlan) AreaBattlePlan.refresh(army);
  }; // never teleport to a gap
  OffensivePlanner.deployAlongFront = (army) => AreaBattlePlan.stage(army);
  OffensivePlanner.capture = function (...args) {
    const result = legacy.capture(...args);
    if (result) {
      AreaBattlePlan.revision++;
      for (const army of BattlePlanManager.armies)
        if (army.areaPlan) {
          const plan = army.areaPlan,
            pid = Number(args[0]);
          if (
            own(pid) &&
            plan.corridor.includes(pid) &&
            !(plan.activated ||= plan.sources.slice()).includes(pid)
          )
            plan.activated.push(pid);
          AreaBattlePlan.refresh(army);
        }
    }
    return result;
  };
  BattlePlanManager.endDrag = function () {
    if (this.activeForce === "army" && this.dragMode === "arrow") {
      const army = this.selectedArmy();
      if (AreaBattlePlan.setLine(army, this.dragPoints))
        MultiplayerManager.broadcast({
          type: "battle_arrow",
          army: army.id,
          from: army.arrow.from,
          to: army.arrow.to,
          state: army.targetState,
          offensiveLine: army.offensiveLine,
        });
      this.dragMode = null;
      this.dragPoints = [];
      this.renderPanel();
      return;
    }
    const army = this.activeForce === "army" ? this.selectedArmy() : null;
    if (army?.executing && this.dragMode === "front") {
      GameUI.notify("前線を変更する前に計画を中止してください。", "alert");
      this.dragMode = null;
      this.dragPoints = [];
      return;
    }
    const front = this.dragMode === "front";
    legacy.endDrag.call(this);
    if (front && army) {
      army.areaPlan = null;
      army.offensiveLine = null;
      army.arrow = null;
    }
  };
  BattlePlanManager.clearFront = function (id) {
    const a = this.armies.find((a) => a.id === id);
    if (a) {
      this.abort(id);
      a.areaPlan = null;
      a.offensiveLine = null;
      a.divisions.forEach((d) => {
        delete d.planStagingPid;
      });
    }
    return legacy.clear.call(this, id);
  };
  BattlePlanManager.autoFrontline = function (...args) {
    const a = this.selectedArmy();
    if (a?.executing) {
      GameUI.notify("先に計画を中止してください。", "alert");
      return;
    }
    if (a) {
      a.areaPlan = null;
      a.offensiveLine = null;
    }
    return legacy.autoFront.call(this, ...args);
  };
  global.AreaBattlePlan = AreaBattlePlan;
})(window);
