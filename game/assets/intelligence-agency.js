"use strict";
/* La Résistance-style systems for game/index.html. All durable state lives in
   gameState.intel so the existing save/load mechanism includes it. */
(function (g) {
  const branches = {
    intelligence: ["📡", "情報部門", "諜報網の構築速度 +50%"],
    defense: ["🛡", "防諜部門", "防諜力 +1"],
    operations: ["🎯", "作戦部門", "作戦成功率 +15%"],
    cryptology: ["🔐", "暗号部門", "解読力 +5 / 日"],
    training: ["🎓", "訓練部門", "初期レベル2・局地国籍偽装"],
  };
  const traits = [
    ["💋", "誘惑者", "潜入時の危険度 −10%"],
    ["🔓", "金庫破り", "技術窃取の成功率 +10%"],
    ["💪", "タフ", "捕獲時の負傷期間 −50%"],
  ];
  const ops = {
    sabotage: { name: "産業のサボタージュ", agents: 1, network: 40 },
    steal: { name: "技術の窃取", agents: 2, network: 50 },
    collaboration: { name: "協力政府の準備", agents: 2, network: 50 },
  };
  const esc = (x) => GameTools.escape(String(x ?? ""));
  const meter = (v, max = 100) =>
    '<progress max="' +
    max +
    '" value="' +
    Math.max(0, Math.min(max, v)) +
    '" aria-label="進捗 ' +
    Math.round((v / max) * 100) +
    '%"></progress>';
  const button = (label, action, disabled = false) =>
    '<button type="button" onclick="AgencyUI.' +
    action +
    '"' +
    (disabled ? " disabled" : "") +
    ">" +
    label +
    "</button>";
  function ensure() {
    IntelOperations.ensure();
    const i = CoreEngine.gameState.intel;
    i.branches ||= {};
    i.agentDetails ||= {};
    i.tab ||= "hq";
    return i;
  }
  function person(slot) {
    const i = ensure();
    return (i.agentDetails[slot] ||= {
      trait: slot % 3,
      level: i.branches.training ? 2 : 1,
      status: "ready",
    });
  }
  const available = (slot) => {
    const i = ensure();
    return (
      slot >= 0 &&
      slot < i.spies &&
      person(slot).status === "ready" &&
      !i.agencyOperation?.slots.includes(slot)
    );
  };
  const idle = () => {
    const i = ensure();
    return Array.from({ length: i.spies }, (_, s) => s).filter(
      (s) =>
        available(s) && (!i.assignments[s] || i.assignments[s].kind === "idle"),
    );
  };
  const UI = {
    ensure,
    branches,
    ops,
    person,
    tab(tab) {
      if (["hq", "missions", "operations", "crypto"].includes(tab)) {
        ensure().tab = tab;
        IntelOperations.render();
      }
    },
    select(slot) {
      if (available(slot)) {
        ensure().selectedAgent = slot;
        IntelOperations.render();
      }
    },
    upgrade(id) {
      const i = ensure();
      if (
        !i.agency ||
        !branches[id] ||
        i.branches[id] ||
        i.branchProject ||
        ProductionManager.freeCivilian() < 5
      )
        return false;
      i.branchProject = { id, days: 30, total: 30, factories: 5 };
      IntelOperations.render();
      return true;
    },
    target(tag) {
      if (!/^[A-Z]{3}$/.test(tag)) return;
      ensure().selected = tag;
      IntelOperations.render();
    },
    assign(kind) {
      const i = ensure(),
        slot = i.selectedAgent,
        tag = i.selected;
      if (
        !available(slot) ||
        !["idle", "network", "counter", "propaganda", "ideology"].includes(kind)
      )
        return false;
      if (
        kind === "counter" &&
        tag !== CoreEngine.gameState.country &&
        !(CoreEngine.gameState.factionMembers || []).includes(tag) &&
        !DiplomacyManager.factions.some(
          (f) =>
            f.members.includes(tag) &&
            f.members.includes(CoreEngine.gameState.country),
        )
      ) {
        GameUI.notify("防諜は自国または同陣営国に配置してください。", "alert");
        return false;
      }
      if (kind !== "idle" && !tag) return false;
      i.assignments[slot] = { kind, target: tag, preparation: 30 };
      IntelOperations.render();
      return true;
    },
    decrypt() {
      const i = ensure(),
        tag = i.selected;
      if (!i.agency || !tag || tag === CoreEngine.gameState.country)
        return false;
      const t = IntelOperations.target(tag);
      if (t.decoded || t.cipherActive) return false;
      t.cipherActive = true;
      t.cipherPoints ||= 0;
      t.cipherStrength ||= 600;
      IntelOperations.render();
      return true;
    },
    reveal() {
      const i = ensure(),
        t = IntelOperations.target(i.selected);
      if (!t.decoded || t.revealUntil > GameTools.day()) return false;
      t.revealUntil = GameTools.day() + 30;
      t.decoded = false;
      t.cipherActive = false;
      t.cipherPoints = 0;
      GameUI.notify(
        "暗号を暴露：30日間、対象国に対する戦闘効率 +15%",
        "success",
      );
      IntelOperations.render();
      return true;
    },
    combatBonus(tag) {
      return (CoreEngine.gameState.intel?.targets?.[tag]?.revealUntil || 0) >
        GameTools.day()
        ? 0.15
        : 0;
    },
    prepare(id) {
      const i = ensure(),
        def = ops[id];
      if (!def || !i.selected) return;
      GameUI.openModal(
        def.name,
        '<div class="agency"><h3>' +
          esc(i.selected) +
          " / " +
          def.name +
          "</h3><p>必要諜報網 " +
          def.network +
          "% / 諜報員 " +
          def.agents +
          "名</p><p>📦 歩兵装備500・支援装備100（開始時消費）</p><p>準備30日 → 潜入15日 → 実行15日 → 脱出15日</p>" +
          Array.from(
            { length: def.agents },
            (_, n) =>
              "<label>諜報員スロット " +
              (n + 1) +
              ' <select id="agency-op-agent-' +
              n +
              '">' +
              idle()
                .map(
                  (s, index) =>
                    '<option value="' +
                    s +
                    '"' +
                    (index === n ? " selected" : "") +
                    ">" +
                    esc(
                      GameVisuals.operative(i.roster[s])?.name || "諜報員 " + s,
                    ) +
                    "</option>",
                )
                .join("") +
              "</select></label>",
          ).join("") +
          button(
            "開始",
            "start('" + id + "')",
            !!i.agencyOperation ||
              IntelOperations.target(i.selected).network < def.network ||
              idle().length < def.agents,
          ) +
          "</div>",
      );
    },
    start(id, chosen) {
      const i = ensure(),
        def = ops[id];
      if (
        !i.agency ||
        !def ||
        i.agencyOperation ||
        !i.selected ||
        i.selected === CoreEngine.gameState.country ||
        IntelOperations.target(i.selected).network < def.network
      )
        return false;
      const slots =
        chosen ||
        Array.from({ length: def.agents }, (_, n) =>
          Number(document.getElementById("agency-op-agent-" + n)?.value ?? -1),
        );
      if (
        slots.length !== def.agents ||
        new Set(slots).size !== slots.length ||
        !slots.every((s) => idle().includes(s))
      )
        return false;
      const needs = { infantry: 500, support_equipment: 100 };
      if (!ProductionManager.canConsume(needs)) {
        GameUI.notify("作戦用の装備が不足しています。", "alert");
        return false;
      }
      ProductionManager.consume(needs);
      i.agencyOperation = {
        id,
        target: i.selected,
        slots,
        phase: 0,
        days: 0,
        outcome: null,
      };
      GameUI.closeModal();
      IntelOperations.render();
      return true;
    },
    cancel() {
      const i = ensure();
      i.agencyOperation = null;
      IntelOperations.render();
    },
    daily(random = Math.random) {
      const i = ensure(),
        s = CoreEngine.gameState;
      if (i.branchProject && --i.branchProject.days <= 0) {
        i.branches[i.branchProject.id] = true;
        i.branchProject = null;
      }
      for (let slot = 0; slot < i.spies; slot++) {
        const p = person(slot);
        if (p.status === "wounded" && --p.days <= 0) p.status = "ready";
        const a = i.assignments[slot];
        if (!a || !available(slot) || a.preparation > 0) continue;
        const t = IntelOperations.target(a.target);
        if (a.kind === "network" && i.branches.intelligence)
          t.network = Math.min(100, t.network + 0.3);
        if (["propaganda", "ideology"].includes(a.kind)) {
          const foreign = ((s.countryEffects ||= {})[a.target] ||= {
            country: a.target,
            stability: 50,
            warSupport: 50,
            popularity: {},
          });
          if (a.kind === "propaganda") {
            foreign.stability = Math.max(0, foreign.stability - 0.05);
            foreign.warSupport = Math.max(0, foreign.warSupport - 0.05);
          } else {
            foreign.popularity ||= {};
            const party = s.ideology || "neutrality";
            foreign.popularity[party] = Math.min(
              100,
              (foreign.popularity[party] || 0) + 0.1,
            );
          }
        }
      }
      for (const t of Object.values(i.targets))
        if (t.cipherActive && !t.decoded) {
          const power = 5 + (i.branches.cryptology ? 5 : 0);
          t.cipherPoints = Math.min(
            t.cipherStrength || 600,
            (t.cipherPoints || 0) + power,
          );
          if (t.cipherPoints >= (t.cipherStrength || 600)) {
            t.decoded = true;
            t.cipherActive = false;
          }
        }
      const op = i.agencyOperation;
      if (op) {
        op.days++;
        const duration = op.phase === 0 ? 30 : 15;
        if (op.days >= duration) {
          op.days = 0;
          op.phase++;
          if (op.phase === 3) {
            const safe = op.slots.some((s) => person(s).trait === 0),
              cracker =
                op.id === "steal" &&
                op.slots.some((s) => person(s).trait === 1);
            const chance =
              0.65 +
              (i.branches.operations ? 0.15 : 0) +
              (safe ? 0.1 : 0) +
              (cracker ? 0.1 : 0);
            const roll = random();
            op.outcome =
              roll < chance ? "success" : roll < 0.95 ? "failure" : "captured";
            if (op.outcome === "captured") {
              const p = person(op.slots[0]);
              p.status = "captured";
            }
            GameUI.notify(
              op.outcome === "success"
                ? "作戦成功・脱出中"
                : op.outcome === "captured"
                  ? "諜報員が捕獲・尋問されています"
                  : "作戦失敗・撤退中",
              op.outcome === "success" ? "success" : "alert",
            );
          }
          if (op.phase >= 4) {
            if (op.outcome === "success") {
              const foreign = ((s.countryEffects ||= {})[op.target] ||= {
                country: op.target,
              });
              if (op.id === "sabotage")
                foreign.sabotageUntil = GameTools.day() + 30;
              if (op.id === "collaboration")
                foreign.collaboration = Math.min(
                  100,
                  (foreign.collaboration || 0) + 30,
                );
              if (op.id === "steal")
                (s.techBonuses ||= []).push({
                  category: "全般",
                  bonus: 0.5,
                  uses: 1,
                });
            } else if (op.outcome === "failure") {
              const p = person(op.slots[0]);
              p.status = "wounded";
              p.days = p.trait === 2 ? 15 : 30;
            }
            i.agencyOperation = null;
          }
        }
      }
    },
    render() {
      const el = document.getElementById("intel-content");
      if (
        !el ||
        !CoreEngine.gameState.strategy ||
        GameTools.editing("intel-content")
      )
        return;
      const i = ensure(),
        s = CoreEngine.gameState;
      let html =
        '<section class="agency"><header><span class="agency-seal">◈</span><div><small>INTELLIGENCE DIRECTORATE</small><h2>' +
        esc(i.agency || s.country + " 諜報総局") +
        "</h2></div></header>";
      if (!i.agency) {
        el.innerHTML =
          html +
          (i.building
            ? "<p>機関設立 残り" +
              i.building.days +
              "日</p>" +
              meter(30 - i.building.days, 30)
            : button("機関設立（政治力50・民需工場2・30日）", "create()")) +
          "</section>";
        return;
      }
      html +=
        '<nav aria-label="諜報機関タブ">' +
        [
          ["hq", "機関本部"],
          ["missions", "諜報員・任務"],
          ["operations", "作戦"],
          ["crypto", "暗号解読"],
        ]
          .map(([id, n]) => button(n, "tab('" + id + "')", i.tab === id))
          .join("") +
        "</nav>";
      if (i.tab === "hq") {
        html +=
          "<p>空き民需工場 " +
          ProductionManager.freeCivilian() +
          ' / 部門開発：民需工場5を30日間使用</p><div class="agency-grid">' +
          Object.entries(branches)
            .map(
              ([id, [icon, n, desc]]) =>
                "<article><h3>" +
                icon +
                " " +
                n +
                "</h3><p>" +
                desc +
                "</p><p>" +
                (i.branches[id]
                  ? "取得済み"
                  : i.branchProject?.id === id
                    ? "取得中・残り" + i.branchProject.days + "日"
                    : "未取得") +
                "</p>" +
                (i.branchProject?.id === id
                  ? meter(30 - i.branchProject.days, 30)
                  : button(
                      "民需5・30日",
                      "upgrade('" + id + "')",
                      !!i.branches[id] ||
                        !!i.branchProject ||
                        ProductionManager.freeCivilian() < 5,
                    )) +
                "</article>",
            )
            .join("") +
          "</div>";
      }
      const tags = [
        ...new Set([s.country, ...DiplomacyManager.countries.map((c) => c.id)]),
      ].filter((t) => /^[A-Z]{3}$/.test(t));
      if (!tags.includes(i.selected))
        i.selected = tags.find((t) => t !== s.country) || s.country;
      if (i.tab !== "hq")
        html +=
          '<label>対象国 <select onchange="AgencyUI.target(this.value)">' +
          tags
            .map(
              (t) =>
                '<option value="' +
                t +
                '"' +
                (t === i.selected ? " selected" : "") +
                ">" +
                esc(DiplomacyManager.nameOf(t)) +
                " (" +
                t +
                ")</option>",
            )
            .join("") +
          "</select></label><p>📡 " +
          esc(i.selected) +
          " 情報網 " +
          IntelOperations.target(i.selected).network.toFixed(1) +
          "%</p>" +
          meter(IntelOperations.target(i.selected).network);
      if (i.tab === "missions") {
        html +=
          '<h3>諜報員を選択 → 対象国を選択 → 任務を指定</h3><div class="agency-grid">';
        for (let slot = 0; slot < i.spies; slot++) {
          const p = person(slot),
            a = i.assignments[slot] || { kind: "idle", preparation: 0 },
            agent = GameVisuals.operative(i.roster[slot]),
            trait = traits[p.trait];
          const status =
            p.status === "captured"
              ? "捕獲・尋問中"
              : p.status === "wounded"
                ? "負傷・回復まで" + p.days + "日"
                : i.agencyOperation?.slots.includes(slot)
                  ? "作戦準備・実行中"
                  : {
                      idle: "待機中",
                      network: "諜報網構築中",
                      counter: "防諜",
                      propaganda: "プロパガンダ",
                      ideology: "イデオロギー工作",
                    }[a.kind] || a.kind;
          html +=
            '<article class="agency-agent ' +
            (i.selectedAgent === slot ? "selected" : "") +
            '">' +
            GameVisuals.person(agent) +
            GameVisuals.flag(agent?.country || s.country) +
            "<strong>" +
            esc(agent?.name || "諜報員 " + (slot + 1)) +
            "</strong><p>Lv " +
            p.level +
            " " +
            esc(agent?.country || s.country) +
            '</p><span tabindex="0" title="' +
            trait[2] +
            '">' +
            trait[0] +
            " " +
            trait[1] +
            "</span><p>" +
            status +
            "</p>" +
            meter(
              a.preparation > 0
                ? 30 - a.preparation
                : p.status === "ready"
                  ? 100
                  : 0,
              a.preparation > 0 ? 30 : 100,
            ) +
            button("選択", "select(" + slot + ")", !available(slot)) +
            (i.branches.training
              ? '<label>局地偽装 <select onchange="AgencyUI.disguise(' +
                slot +
                ',this.value)">' +
                tags
                  .map(
                    (t) =>
                      "<option" +
                      (p.nationality === t ? " selected" : "") +
                      ">" +
                      t +
                      "</option>",
                  )
                  .join("") +
                "</select></label>"
              : "") +
            "</article>";
        }
        html +=
          '</div><div class="agency-actions">' +
          [
            ["idle", "待機"],
            ["network", "諜報網構築"],
            ["counter", "防諜"],
            ["propaganda", "プロパガンダ"],
            ["ideology", "イデオロギー工作"],
          ]
            .map(([id, n]) =>
              button(n, "assign('" + id + "')", !available(i.selectedAgent)),
            )
            .join("") +
          "</div>";
        const candidates = GameVisuals.operativeChoices(s.country, [
          ...i.roster,
          ...i.recruiting.map((r) => r.operativeId),
        ]).filter((p) => p.country === s.country);
        html +=
          '<h3>諜報員の養成（政治力75・30日）</h3><div class="agency-grid">' +
          candidates
            .slice(0, 6)
            .map(
              (p) =>
                "<article>" +
                GameVisuals.person(p) +
                esc(p.name) +
                button(
                  "養成",
                  "hire('" + esc(p.id) + "')",
                  s.politicalPower < 75 ||
                    i.spies + i.recruiting.length >= i.level * 2,
                ) +
                "</article>",
            )
            .join("") +
          "</div>" +
          i.recruiting
            .map(
              (r) =>
                "<p>" +
                esc(GameVisuals.operative(r.operativeId)?.name) +
                " 養成残り " +
                r.days +
                "日</p>" +
                meter(30 - r.days, 30),
            )
            .join("") +
          button(
            "諜報員枠を拡張（既存の機関拡張）",
            "expand()",
            !!i.building || i.level >= 5,
          );
      }
      if (i.tab === "operations") {
        html +=
          '<div class="agency-grid">' +
          Object.entries(ops)
            .map(
              ([id, o]) =>
                "<article><h3>" +
                o.name +
                "</h3><p>情報網 " +
                o.network +
                "% / 諜報員 " +
                o.agents +
                "名</p>" +
                button(
                  "準備画面",
                  "prepare('" + id + "')",
                  IntelOperations.target(i.selected).network < o.network ||
                    !!i.agencyOperation,
                ) +
                "</article>",
            )
            .join("") +
          "</div>";
        const op = i.agencyOperation;
        if (op)
          html +=
            "<h3>" +
            ops[op.id].name +
            " / " +
            ["準備", "潜入", "実行", "脱出"][op.phase] +
            "</h3>" +
            meter(op.days, op.phase === 0 ? 30 : 15) +
            button("中止（装備返却なし）", "cancel()");
      }
      if (i.tab === "crypto") {
        const t = IntelOperations.target(i.selected);
        html +=
          "<h3>🔐 暗号解読</h3><p>解読力 " +
          (i.branches.cryptology ? 10 : 5) +
          " / 日　敵暗号強度 " +
          (t.cipherStrength || 600) +
          "</p>" +
          meter(t.cipherPoints || 0, t.cipherStrength || 600) +
          button(
            "暗号解読を開始",
            "decrypt()",
            !!t.cipherActive || t.decoded || i.selected === s.country,
          ) +
          button(
            "暗号の暴露（30日間・戦闘効率+15%）",
            "reveal()",
            !t.decoded || t.revealUntil > GameTools.day(),
          ) +
          "<p>情報アドバンテージ 残り " +
          Math.max(0, (t.revealUntil || 0) - GameTools.day()) +
          "日</p>";
      }
      el.innerHTML = html + "</section>";
    },
    disguise(slot, tag) {
      const i = ensure();
      if (i.branches.training && available(slot) && /^[A-Z]{3}$/.test(tag))
        person(slot).nationality = tag;
    },
    create() {
      return IntelOperations.createAgency();
    },
    hire(id) {
      return IntelOperations.hireSpy(id);
    },
    expand() {
      return IntelOperations.upgrade();
    },
  };
  const oldTick = IntelOperations.tick,
    oldDraw = IntelOperations.draw,
    oldCounter = IntelOperations.counterPower;
  IntelOperations.tick = function () {
    const i = ensure(),
      day = GameTools.day();
    if (i.agencyLastDay === day) return;
    i.agencyLastDay = day;
    oldTick.call(this);
    UI.daily();
  };
  IntelOperations.render = () => UI.render();
  IntelOperations.counterPower = () =>
    oldCounter.call(IntelOperations) + (ensure().branches.defense ? 1 : 0);
  IntelOperations.draw = function (ctx, project) {
    oldDraw.call(this, ctx, project);
    for (const [tag, t] of Object.entries(
      CoreEngine.gameState.intel?.targets || {},
    )) {
      if (t.network <= 0) continue;
      const entry = Object.entries(MapRenderer.states || {}).find(
        ([, st]) => st.owner === tag,
      );
      const center = entry && MapRenderer.stateCenter.get(entry[0]);
      if (center) {
        const p = project(...center);
        ctx.save();
        ctx.fillStyle = "#80dbbd";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(
          "📡 " + tag + " " + t.network.toFixed(0) + "%",
          p[0],
          p[1],
        );
        ctx.restore();
      }
    }
  };
  g.AgencyUI = UI;
})(window);
