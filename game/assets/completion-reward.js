/* Paradox reward AST. Ordered entries preserve repeated commands and state scopes. */
"use strict";
(function (g) {
  const names = {
    industrial_complex: "民需工場",
    arms_factory: "軍需工場",
    infrastructure: "インフラ",
    dockyard: "造船所",
    infantry_equipment: "歩兵装備",
    support_equipment: "支援装備",
    democratic: "民主主義",
    fascism: "ファシズム",
    communism: "共産主義",
    neutrality: "非同盟",
    conquer: "征服",
    puppet: "傀儡化",
    armor: "機甲",
    industry: "産業",
    land_doctrine: "陸軍ドクトリン",
  };
  const loc = (id) => {
    const translated = g.l10n?.t?.(String(id));
    return translated && translated !== String(id)
      ? translated
      : names[id] || String(id ?? "未指定");
  };
  const country = (id) =>
    typeof DiplomacyManager !== "undefined"
      ? DiplomacyManager.nameOf(id)
      : loc(id);
  const stateName = (id) =>
    id == null
      ? "対象州（スクリプトの州スコープ）"
      : ((typeof MapRenderer !== "undefined" &&
          MapRenderer.states?.[id]?.name) ||
          "州") +
        " (" +
        id +
        ")";
  function ast(source) {
    const tokens =
      String(source).match(/#[^\n\r]*|"(?:\\.|[^"\\])*"|[{}=]|[^\s{}=#]+/g) ||
      [];
    const t = tokens.filter((x) => !x.startsWith("#"));
    let i = 0;
    const scalar = (x) =>
      x?.startsWith('"')
        ? JSON.parse(x)
        : /^[-+]?\d*\.?\d+$/.test(x)
          ? Number(x)
          : x;
    function block(nested = false) {
      const entries = [];
      while (i < t.length && t[i] !== "}") {
        const key = scalar(t[i++]);
        if (t[i++] !== "=")
          throw new SyntaxError("「" + key + "」の後に = が必要です");
        if (i >= t.length) throw new SyntaxError("値がありません");
        let value;
        if (t[i] === "{") {
          i++;
          value = block(true);
        } else value = scalar(t[i++]);
        entries.push({ key, value });
      }
      if (nested && t[i++] !== "}")
        throw new SyntaxError("閉じ括弧 } がありません");
      return entries;
    }
    const result = block();
    if (i < t.length) throw new SyntaxError("余分な } があります");
    return result;
  }
  function parseCompletionReward(source) {
    const tree = ast(source),
      rewards = [];
    function walk(entries, scope = {}) {
      for (const { key, value } of entries) {
        if (key === "completion_reward") {
          walk(value, scope);
          continue;
        }
        if (/^\d+$/.test(String(key)) && Array.isArray(value)) {
          walk(value, { ...scope, state: String(key) });
          continue;
        }
        if (/^[A-Z]{3}$/.test(key) && Array.isArray(value)) {
          walk(value, { ...scope, scopeCountry: key });
          continue;
        }
        const r = { type: key, ...scope, script: true };
        if (Array.isArray(value)) {
          for (const p of value)
            if (!Array.isArray(p.value))
              r[p.key === "type" ? "kind" : p.key] = p.value;
          if (
            [
              "if",
              "else",
              "else_if",
              "random_list",
              "every_owned_state",
              "random_owned_controlled_state",
              "hidden_effect",
            ].includes(key)
          ) {
            r.unsupported = true;
            r.ast = value;
          }
        } else r.value = value;
        if (["add_stability", "add_war_support"].includes(key))
          r.value = Number(r.value) * 100;
        if (["add_ideas", "remove_ideas"].includes(key)) r.idea = r.value;
        if (
          ["add_building_construction", "add_offsite_building"].includes(key)
        ) {
          r.building = r.kind;
          r.level = Number(r.amount ?? r.level ?? 1);
          r.state = r.location ?? r.state;
        }
        if (key === "add_tech_bonus") r.category = r.target ?? r.category;
        if (key === "create_wargoal") r.goal = r.kind;
        rewards.push(r);
      }
    }
    walk(tree);
    return rewards;
  }
  const config = g.HOI4EffectsConfig,
    oldApply = config.applyEffect,
    oldFormat = config.formatEffect;
  const target = (r) => r.target ?? r.value;
  function format(r) {
    if (r.unsupported)
      return {
        text: "⚠ 条件・スコープ未対応: " + r.type + "（自動実行しません）",
        color: "#e3bd6a",
      };
    const n = Number(r.value ?? r.amount ?? r.level ?? 0),
      tag = target(r),
      st = stateName(r.location ?? r.state);
    let text;
    switch (r.type) {
      case "add_ideas":
      case "remove_ideas":
        text =
          "国民精神「" +
          loc(r.idea ?? r.value) +
          "」を" +
          (r.type === "add_ideas" ? "獲得する" : "喪失する");
        break;
      case "set_politics":
        text = "与党が " + loc(r.ruling_party) + " に変更される";
        break;
      case "puppet":
        text = country(tag) + " (" + tag + ") を傀儡国にする";
        break;
      case "annex_country":
        text =
          country(tag ?? r.country) + " を併合する（領土・軍隊・装備を吸収）";
        break;
      case "create_wargoal":
        text =
          country(tag) +
          " に対する戦争目標（" +
          loc(r.goal ?? r.kind ?? "conquer") +
          "）を獲得する";
        break;
      case "add_to_faction":
        text = country(tag) + " が陣営に加盟する";
        break;
      case "give_guarantee":
        text = country(tag) + " の独立を保証する";
        break;
      case "transfer_state":
        text = stateName(r.value) + " の支配権を獲得する";
        break;
      case "add_core_of":
        text = st + " が " + country(tag) + " の中核州になる";
        break;
      case "add_claim_by":
        text = st + " に " + country(tag) + " の請求権を獲得する";
        break;
      case "add_extra_state_shared_building_slots":
        text = st + " の建築スロットが " + n + " 増加する";
        break;
      case "add_building_construction":
        text =
          "📍 " +
          st +
          " に " +
          (r.building === "infrastructure" ? "🛤" : "🏭") +
          " " +
          loc(r.building) +
          " を " +
          (r.level ?? r.amount ?? 1) +
          " 個追加する";
        break;
      case "add_offsite_building":
        text =
          "🏭 国家直轄（枠外）: " + loc(r.building) + " × " + (r.level ?? 1);
        break;
      case "add_equipment_to_stockpile":
        text =
          "📦 備蓄に " +
          loc(r.kind ?? r.equipment) +
          " が " +
          r.amount +
          " 個追加される" +
          (r.producer ? " / 生産国 " + country(r.producer) : "");
        break;
      case "create_unit":
        text = "⚑ " + st + " に " + r.division + " 師団が出現する";
        break;
      case "add_tech_bonus":
        text =
          "🔬 " +
          loc(r.category ?? r.target) +
          " の研究に " +
          Math.round(Number(r.bonus) * 100) +
          "% のボーナス（" +
          (r.uses ?? 1) +
          "回）";
        break;
      default:
        return oldFormat(r);
    }
    return { text, color: n < 0 ? "#ef7777" : "#82d69a" };
  }
  function apply(s, r) {
    if (r.unsupported) {
      (s.unappliedRewards ||= []).push(r);
      return s;
    }
    // Explicit country scopes never accidentally mutate the player country.
    if (r.script && r.scopeCountry && r.scopeCountry !== s.country) {
      s.countryEffects ||= {};
      const foreign = (s.countryEffects[r.scopeCountry] ||= {
        country: r.scopeCountry,
      });
      return apply(foreign, { ...r, scopeCountry: undefined });
    }
    const map = typeof MapRenderer !== "undefined" ? MapRenderer : null;
    const sid = r.location ?? r.state,
      states = map?.states || (s.states ||= {});
    const st = sid != null ? (states[sid] ||= { name: "州 " + sid }) : null;
    const tag = target(r),
      add = (obj, k, v) => (obj[k] = (Number(obj[k]) || 0) + Number(v || 0));
    switch (r.type) {
      case "set_politics":
        s.ideology = r.ruling_party;
        s.rulingParty = r.ruling_party;
        break;
      case "puppet":
        (s.subjects ||= {})[tag] = { overlord: s.country, autonomy: "puppet" };
        s.puppets = [
          ...new Set([...(Array.isArray(s.puppets) ? s.puppets : []), tag]),
        ];
        break;
      case "give_guarantee":
        s.guarantees = [...new Set([...(s.guarantees || []), tag])];
        break;
      case "add_to_faction":
        s.factionMembers = [
          ...new Set([...(s.factionMembers || [s.country]), tag]),
        ];
        if (typeof DiplomacyManager !== "undefined") {
          let f = DiplomacyManager.factions.find((x) =>
            x.members.includes(s.country),
          );
          if (!f) {
            f = {
              name: s.country + "陣営",
              leader: s.country,
              members: [s.country],
            };
            DiplomacyManager.factions.push(f);
          }
          if (!f.members.includes(tag)) f.members.push(tag);
        }
        break;
      case "create_wargoal":
        (s.wargoals ||= []).push({
          target: tag,
          type: r.goal ?? r.kind ?? "conquer",
        });
        if (typeof WarGoals !== "undefined" && s.strategy)
          WarGoals.grant(tag, "focus");
        break;
      case "transfer_state":
        if (map?.captureState) map.captureState(String(r.value), s.country);
        else {
          const x = (states[r.value] ||= {});
          x.owner = s.country;
          x.controller = s.country;
        }
        break;
      case "add_core_of":
      case "add_claim_by":
        if (!st) {
          (s.unappliedRewards ||= []).push(r);
          break;
        }
        {
          const key = r.type === "add_core_of" ? "cores" : "claims";
          st[key] = [...new Set([...(st[key] || []), tag])];
        }
        break;
      case "add_extra_state_shared_building_slots":
        if (st) add(st, "extraBuildingSlots", r.value);
        else (s.unappliedRewards ||= []).push(r);
        break;
      case "add_equipment_to_stockpile": {
        const type = r.kind ?? r.equipment,
          alias = {
            infantry_equipment: "infantry",
            support_equipment: "support_equipment",
            light_tank_equipment: "tank",
          };
        const stock =
          typeof ProductionManager !== "undefined"
            ? ProductionManager.account(s.country).stock
            : (s.stockpile ||= {});
        add(stock, alias[type] || type, r.amount);
        break;
      }
      case "add_tech_bonus":
        (s.techBonuses ||= []).push({
          category: r.category ?? r.target,
          bonus: Number(r.bonus),
          uses: Number(r.uses ?? 1),
        });
        break;
      case "create_unit": {
        const unit = {
          id: "focus-" + (s.rewardUnitSerial = (s.rewardUnitSerial || 0) + 1),
          name: r.division,
          template: r.division,
          state: String(sid),
          country: s.country,
          strength: 100,
          organization: 100,
        };
        (s.spawnedDivisions ||= []).push(unit);
        if (s.strategy && map?.ready) {
          const pid = map.states?.[sid]?.provinces?.find((p) =>
            map.provCentroid.has(p),
          );
          const c = map.provCentroid?.get(pid);
          if (c)
            (s.strategy.reserves ||= []).push({
              ...unit,
              id: s.strategy.nextDivisionId++,
              pid,
              x: c[0],
              y: c[1],
              org: 60,
              maxOrg: 60,
              type: "infantry",
              comp: { infantry: 6 },
            });
        }
        break;
      }
      case "annex_country": {
        const tags = [r.target ?? r.country ?? r.value]
          .flat()
          .filter((t) => t && t !== s.country);
        for (const t of tags) {
          if (t === s.country || (s.annexedCountries || []).includes(t))
            continue;
          // Snapshot troops before changing ownership: forces() marks units
          // without remaining territory as defeated, so never call it afterwards.
          let foreign = s.strategy?.worldForces?.[t];
          if (
            s.strategy &&
            typeof IntelOperations !== "undefined" &&
            map?.ready
          )
            foreign = IntelOperations.forces(t);
          const foreignDivisions = (foreign?.divisions || [])
            .filter((u) => !u.defeated)
            .map((u) => ({ ...u }));
          for (const [id, x] of Object.entries(states))
            if (x.owner === t) {
              if (map?.captureState) map.captureState(id, s.country);
              else x.owner = x.controller = s.country;
            }
          if (s.strategy?.economies?.[t]) {
            const a = s.strategy.economies[s.country],
              b = s.strategy.economies[t];
            if (a) {
              for (const [k, v] of Object.entries(b.stock || {}))
                add(a.stock, k, v);
              b.stock = {};
            }
          }
          if (foreign) {
            if (
              typeof ArmyRoster !== "undefined" &&
              typeof ArmyRoster.absorbDivisions === "function"
            ) {
              ArmyRoster.absorbDivisions(foreignDivisions, t);
            } else if (s.strategy) {
              (s.strategy.reserves ||= []).push(
                ...foreignDivisions.map((u) => ({
                  ...u,
                  country: s.country,
                  tag: s.country,
                  org: u.org ?? 60,
                  maxOrg: u.maxOrg ?? 60,
                  comp: { ...(u.comp || { infantry: 6 }) },
                })),
              );
            }
            if (typeof BattlePlanManager !== "undefined")
              BattlePlanManager.navy.push(
                ...(foreign.navy || []).map((u) => ({
                  ...u,
                  country: s.country,
                  tag: s.country,
                })),
              );
            foreign.divisions = [];
            foreign.navy = [];
          }
        }
        s.annexedCountries = [
          ...new Set([...(s.annexedCountries || []), ...tags]),
        ];
        s.occupiedCountries = [
          ...new Set([...(s.occupiedCountries || []), ...tags]),
        ];
        if (map?.invalidateModes) map.invalidateModes();
        break;
      }
      case "add_building_construction":
        if (st) {
          st.b ||= {};
          st.buildings = st.b;
          add(st.b, r.building, r.level ?? r.amount ?? 1);
          if (r.building === "infrastructure")
            add(st, "supply", r.level ?? r.amount ?? 1);
          if (map?.invalidateModes) map.invalidateModes();
        }
        oldApply(s, r);
        break;
      case "add_offsite_building":
        s.offsiteBuildings ||= {};
        add(s.offsiteBuildings, r.building, r.level ?? 1);
        oldApply(s, r);
        break;
      default:
        oldApply(s, r);
    }
    return s;
  }
  g.parseCompletionReward = parseCompletionReward;
  g.CompletionReward = {
    parseAST: ast,
    parse: parseCompletionReward,
    format,
    apply,
    localize: loc,
  };
  config.applyEffect = apply;
  config.formatEffect = format;
  g.applyEffect = apply;
  g.formatEffect = format;
})(window);
