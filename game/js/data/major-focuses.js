/**
 * data/major-focuses.js — 国家方針（National Focus）ツリー
 *
 * 各国 9 ノード（3列 × 3段）。各ノードは 70 日で完成し、完成時に
 * `completion_reward` を EffectEngine が実行する。
 *
 * completion_reward の書式（HOI4 準拠）:
 *   add_political_power / add_stability / add_war_support / add_manpower
 *   add_civilian_factories / add_military_factories / add_dockyards / add_convoys / add_fuel
 *   add_research_bonus: { scope:'tech'|'category'|'any', match, reduction, label }
 *   add_research_slot / add_army_xp / add_navy_xp / add_air_xp / add_max_planning_bonus
 *   add_ideas: { id, name, desc, modifiers }   … 国家的精神（永続補正）
 *   annex: 'TAG'（併合） / create_wargoal: { tag, type }（宣戦事由）
 *   add_core / add_opinion: { target, amount } / add_world_tension
 *
 * `reward_description` はツリーのツールチップ・報酬ラベルに使用する。
 */

export const MAJOR_FOCUSES = {
  "GER": [
    {
      "id": "ger_focus_0",
      "tag": "GER",
      "title": "四カ年計画",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "四カ年計画"
        },
        "add_ideas": {
          "id": "four_year_plan",
          "name": "四カ年計画",
          "desc": "軍需生産効率 +5%",
          "modifiers": {
            "factoryOutput": 0.05
          }
        }
      },
      "reward_description": "民需工場 +2／政治力 +120／工業研究 -50%／国家的精神「四カ年計画」"
    },
    {
      "id": "ger_focus_1",
      "tag": "GER",
      "title": "産業動員",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ger_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "産業動員"
        }
      },
      "reward_description": "民需工場 +3／政治力 +40／工業研究 -50%"
    },
    {
      "id": "ger_focus_2",
      "tag": "GER",
      "title": "アウトバーン整備",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ger_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000,
        "add_convoys": 20
      },
      "reward_description": "軍需工場 +3／燃料 +4000／輸送船 +20"
    },
    {
      "id": "ger_focus_3",
      "tag": "GER",
      "title": "ラインラント",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_political_power": 50
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／政治力 +50"
    },
    {
      "id": "ger_focus_4",
      "tag": "GER",
      "title": "陸軍再編",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ger_focus_3"
      ],
      "completion_reward": {
        "add_military_factories": 2,
        "add_command_power": 25,
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "armor",
          "reduction": 0.5,
          "label": "陸軍再編"
        }
      },
      "reward_description": "軍需工場 +2／指揮力 +25／陸軍XP +50／装甲研究 -50%"
    },
    {
      "id": "ger_focus_5",
      "tag": "GER",
      "title": "機甲戦術",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ger_focus_4"
      ],
      "completion_reward": {
        "add_army_xp": 100,
        "add_ideas": {
          "id": "blitzkrieg_theory",
          "name": "電撃戦の理論",
          "desc": "突破 +5%",
          "modifiers": {
            "breakthrough": 0.05
          }
        },
        "add_max_planning_bonus": 0.05
      },
      "reward_description": "陸軍XP +100／国家的精神「電撃戦の理論」／計画準備上限 +5%"
    },
    {
      "id": "ger_focus_6",
      "tag": "GER",
      "title": "アンシュルス",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "ger_focus_3"
      ],
      "completion_reward": {
        "annex": "AUS",
        "add_core": "AUS",
        "add_political_power": 50,
        "add_manpower": 150000,
        "add_world_tension": 3
      },
      "reward_description": "オーストリアを併合（州の移譲・コア化）／政治力 +50／人的資源 +150000"
    },
    {
      "id": "ger_focus_7",
      "tag": "GER",
      "title": "ズデーテンラント",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ger_focus_6"
      ],
      "completion_reward": {
        "annex": "CZE",
        "add_core": "CZE",
        "add_military_factories": 4,
        "add_world_tension": 5
      },
      "reward_description": "チェコスロバキアを併合／軍需工場 +4／世界緊張度 +5"
    },
    {
      "id": "ger_focus_8",
      "tag": "GER",
      "title": "ダンツィヒか戦争か",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ger_focus_7"
      ],
      "completion_reward": {
        "create_wargoal": {
          "tag": "POL",
          "type": "conquest"
        },
        "add_war_support": 10,
        "add_world_tension": 5,
        "add_army_xp": 75
      },
      "reward_description": "ポーランドへの宣戦事由／戦争協力度 +10／陸軍XP +75"
    }
  ],
  "USA": [
    {
      "id": "usa_focus_0",
      "tag": "USA",
      "title": "ニューディール",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "ニューディール"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "usa_focus_1",
      "tag": "USA",
      "title": "公共事業促進局",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "usa_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40,
        "add_stability": 2
      },
      "reward_description": "民需工場 +3／政治力 +40／安定度 +2"
    },
    {
      "id": "usa_focus_2",
      "tag": "USA",
      "title": "民主主義の兵器廠",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "usa_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000,
        "add_convoys": 30,
        "add_ideas": {
          "id": "arsenal_of_democracy",
          "name": "民主主義の兵器廠",
          "desc": "軍需生産効率 +5%",
          "modifiers": {
            "factoryOutput": 0.05
          }
        }
      },
      "reward_description": "軍需工場 +3／燃料 +4000／輸送船 +30／国家的精神「民主主義の兵器廠」"
    },
    {
      "id": "usa_focus_3",
      "tag": "USA",
      "title": "選抜徴兵法",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "選抜徴兵法"
        }
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／歩兵研究 -50%"
    },
    {
      "id": "usa_focus_4",
      "tag": "USA",
      "title": "両洋艦隊法",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "usa_focus_3"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_navy_xp": 75,
        "add_research_bonus": {
          "scope": "category",
          "match": "naval",
          "reduction": 0.5,
          "label": "両洋艦隊法"
        }
      },
      "reward_description": "造船所 +3／海軍XP +75／海軍研究 -50%"
    },
    {
      "id": "usa_focus_5",
      "tag": "USA",
      "title": "レンドリース",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "usa_focus_4"
      ],
      "completion_reward": {
        "add_convoys": 50,
        "add_political_power": 100,
        "add_opinion": {
          "target": "ENG",
          "amount": 30
        }
      },
      "reward_description": "輸送船 +50／政治力 +100／イギリスとの関係 +30"
    },
    {
      "id": "usa_focus_6",
      "tag": "USA",
      "title": "マンハッタン計画",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "usa_focus_3"
      ],
      "completion_reward": {
        "add_research_bonus": {
          "scope": "category",
          "match": "engineering",
          "reduction": 0.5,
          "label": "マンハッタン計画"
        },
        "add_political_power": 50,
        "add_research_slot": 1
      },
      "reward_description": "工学・核研究 -50%／政治力 +50／研究枠 +1"
    },
    {
      "id": "usa_focus_7",
      "tag": "USA",
      "title": "真珠湾への道",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "usa_focus_6"
      ],
      "completion_reward": {
        "create_wargoal": {
          "tag": "JAP",
          "type": "conquest"
        },
        "add_war_support": 15,
        "add_world_tension": 8
      },
      "reward_description": "日本への宣戦事由／戦争協力度 +15／世界緊張度 +8"
    },
    {
      "id": "usa_focus_8",
      "tag": "USA",
      "title": "自由の兵工廠",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "usa_focus_7"
      ],
      "completion_reward": {
        "add_military_factories": 2,
        "add_war_support": 10,
        "add_army_xp": 75,
        "add_max_planning_bonus": 0.05
      },
      "reward_description": "軍需工場 +2／戦争協力度 +10／陸軍XP +75／計画準備上限 +5%"
    }
  ],
  "SOV": [
    {
      "id": "sov_focus_0",
      "tag": "SOV",
      "title": "第二次五カ年計画",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "五カ年計画"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "sov_focus_1",
      "tag": "SOV",
      "title": "重工業拡張",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "sov_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5
        }
      },
      "reward_description": "民需工場 +3／政治力 +40／工業研究 -50%"
    },
    {
      "id": "sov_focus_2",
      "tag": "SOV",
      "title": "ウラル産業基盤",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "sov_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
    },
    {
      "id": "sov_focus_3",
      "tag": "SOV",
      "title": "赤軍改革",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "赤軍改革"
        }
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／陸軍XP +50／歩兵研究 -50%"
    },
    {
      "id": "sov_focus_4",
      "tag": "SOV",
      "title": "縦深作戦",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "sov_focus_3"
      ],
      "completion_reward": {
        "add_army_xp": 100,
        "add_max_planning_bonus": 0.1,
        "add_ideas": {
          "id": "deep_battle",
          "name": "縦深作戦",
          "desc": "防御 +5%／計画準備上限 +10%",
          "modifiers": {
            "defense": 0.05
          }
        }
      },
      "reward_description": "陸軍XP +100／計画準備上限 +10%／国家的精神「縦深作戦」"
    },
    {
      "id": "sov_focus_5",
      "tag": "SOV",
      "title": "大祖国戦争",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "sov_focus_4"
      ],
      "completion_reward": {
        "add_war_support": 10,
        "add_manpower": 100000,
        "add_ideas": {
          "id": "great_patriotic_war",
          "name": "大祖国戦争",
          "desc": "防御 +10%",
          "modifiers": {
            "defense": 0.1
          }
        }
      },
      "reward_description": "戦争協力度 +10／人的資源 +100000／国家的精神「大祖国戦争」"
    },
    {
      "id": "sov_focus_6",
      "tag": "SOV",
      "title": "モロトフ・リッベントロップ協定",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "sov_focus_3"
      ],
      "completion_reward": {
        "add_political_power": 50,
        "add_opinion": {
          "target": "GER",
          "amount": 40
        },
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "独ソ技術協力"
        }
      },
      "reward_description": "政治力 +50／ドイツとの関係 +40／工業研究 -50%"
    },
    {
      "id": "sov_focus_7",
      "tag": "SOV",
      "title": "スターリングラードの誓い",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "sov_focus_6"
      ],
      "completion_reward": {
        "add_war_support": 15,
        "add_manpower": 200000,
        "add_army_xp": 100,
        "add_ideas": {
          "id": "not_one_step_back",
          "name": "一歩も退くな",
          "desc": "組織力 +5%／防御 +5%",
          "modifiers": {
            "org": 0.05,
            "defense": 0.05
          }
        }
      },
      "reward_description": "戦争協力度 +15／人的資源 +200000／陸軍XP +100／国家的精神「一歩も退くな」"
    },
    {
      "id": "sov_focus_8",
      "tag": "SOV",
      "title": "極東への圧力",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "sov_focus_7"
      ],
      "completion_reward": {
        "create_wargoal": {
          "tag": "JAP",
          "type": "conquest"
        },
        "add_army_xp": 100,
        "add_world_tension": 5
      },
      "reward_description": "日本への宣戦事由／陸軍XP +100／世界緊張度 +5"
    }
  ],
  "ENG": [
    {
      "id": "eng_focus_0",
      "tag": "ENG",
      "title": "帝国の再軍備",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "帝国の再軍備"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "eng_focus_1",
      "tag": "ENG",
      "title": "本国産業拡張",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "eng_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
    },
    {
      "id": "eng_focus_2",
      "tag": "ENG",
      "title": "戦時生産体制",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "eng_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
    },
    {
      "id": "eng_focus_3",
      "tag": "ENG",
      "title": "領土防衛軍",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "領土防衛軍"
        }
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／歩兵研究 -50%"
    },
    {
      "id": "eng_focus_4",
      "tag": "ENG",
      "title": "レーダー防衛網",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "eng_focus_3"
      ],
      "completion_reward": {
        "add_research_bonus": {
          "scope": "category",
          "match": "engineering",
          "reduction": 0.5,
          "label": "チェーンホーム"
        },
        "add_air_xp": 50,
        "add_ideas": {
          "id": "chain_home",
          "name": "チェーンホーム・レーダー網",
          "desc": "航空探知 +10%",
          "modifiers": {
            "airAttack": 0.05
          }
        }
      },
      "reward_description": "工学（レーダー）研究 -50%／空軍XP +50／国家的精神「チェーンホーム」"
    },
    {
      "id": "eng_focus_5",
      "tag": "ENG",
      "title": "王立海軍近代化",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "eng_focus_4"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_navy_xp": 75,
        "add_research_bonus": {
          "scope": "category",
          "match": "naval",
          "reduction": 0.5,
          "label": "王立海軍"
        }
      },
      "reward_description": "造船所 +3／海軍XP +75／海軍研究 -50%"
    },
    {
      "id": "eng_focus_6",
      "tag": "ENG",
      "title": "船団護衛",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "eng_focus_5"
      ],
      "completion_reward": {
        "add_convoys": 60,
        "add_navy_xp": 50,
        "add_ideas": {
          "id": "convoy_escort",
          "name": "船団護衛",
          "desc": "対潜・護衛 +10%",
          "modifiers": {
            "escortASW": 0.1
          }
        }
      },
      "reward_description": "輸送船 +60／海軍XP +50／国家的精神「船団護衛」"
    },
    {
      "id": "eng_focus_7",
      "tag": "ENG",
      "title": "大西洋の生命線",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "eng_focus_6"
      ],
      "completion_reward": {
        "add_navy_xp": 100,
        "add_political_power": 75,
        "add_opinion": {
          "target": "USA",
          "amount": 30
        }
      },
      "reward_description": "海軍XP +100／政治力 +75／アメリカとの関係 +30"
    },
    {
      "id": "eng_focus_8",
      "tag": "ENG",
      "title": "我らの最も暗い時",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "eng_focus_7"
      ],
      "completion_reward": {
        "add_war_support": 15,
        "add_stability": 5,
        "add_manpower": 100000,
        "add_ideas": {
          "id": "their_finest_hour",
          "name": "我らの最も暗い時",
          "desc": "防御 +10%／安定度 +5%",
          "modifiers": {
            "defense": 0.1
          }
        }
      },
      "reward_description": "戦争協力度 +15／安定度 +5／人的資源 +100000／国家的精神"
    }
  ],
  "JAP": [
    {
      "id": "jap_focus_0",
      "tag": "JAP",
      "title": "国家総動員",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "国家総動員"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "jap_focus_1",
      "tag": "JAP",
      "title": "重工業投資",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "jap_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
    },
    {
      "id": "jap_focus_2",
      "tag": "JAP",
      "title": "軍需生産拡張",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "jap_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
    },
    {
      "id": "jap_focus_3",
      "tag": "JAP",
      "title": "陸軍近代化",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "陸軍近代化"
        }
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／陸軍XP +50／歩兵研究 -50%"
    },
    {
      "id": "jap_focus_4",
      "tag": "JAP",
      "title": "歩兵装備更新",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "jap_focus_3"
      ],
      "completion_reward": {
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "artillery",
          "reduction": 0.5,
          "label": "歩兵装備更新"
        }
      },
      "reward_description": "陸軍XP +50／砲兵研究 -50%"
    },
    {
      "id": "jap_focus_5",
      "tag": "JAP",
      "title": "海軍航空隊",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "jap_focus_4"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_navy_xp": 100,
        "add_air_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "air",
          "reduction": 0.5,
          "label": "海軍航空隊"
        }
      },
      "reward_description": "造船所 +3／海軍XP +100／空軍XP +50／航空研究 -50%"
    },
    {
      "id": "jap_focus_6",
      "tag": "JAP",
      "title": "空母機動部隊",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "jap_focus_5"
      ],
      "completion_reward": {
        "add_dockyards": 2,
        "add_navy_xp": 75,
        "add_ideas": {
          "id": "carrier_task_force",
          "name": "空母機動部隊",
          "desc": "空母航空攻撃 +10%",
          "modifiers": {
            "carrierAir": 0.1
          }
        }
      },
      "reward_description": "造船所 +2／海軍XP +75／国家的精神「空母機動部隊」"
    },
    {
      "id": "jap_focus_7",
      "tag": "JAP",
      "title": "三国同盟",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "jap_focus_6"
      ],
      "completion_reward": {
        "add_political_power": 100,
        "add_opinion": {
          "target": "GER",
          "amount": 50
        },
        "add_ideas": {
          "id": "tripartite_pact",
          "name": "三国同盟",
          "desc": "安定度 +3%",
          "modifiers": {
            "stability": 0.03
          }
        }
      },
      "reward_description": "政治力 +100／ドイツとの関係 +50／国家的精神「三国同盟」"
    },
    {
      "id": "jap_focus_8",
      "tag": "JAP",
      "title": "南方作戦",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "jap_focus_7"
      ],
      "completion_reward": {
        "create_wargoal": {
          "tag": "USA",
          "type": "conquest"
        },
        "add_war_support": 15,
        "add_world_tension": 10,
        "add_navy_xp": 100
      },
      "reward_description": "アメリカへの宣戦事由／戦争協力度 +15／海軍XP +100／世界緊張度 +10"
    }
  ],
  "ITA": [
    {
      "id": "ita_focus_0",
      "tag": "ITA",
      "title": "産業復興公社",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "産業復興公社"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "ita_focus_1",
      "tag": "ITA",
      "title": "北部工業開発",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ita_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
    },
    {
      "id": "ita_focus_2",
      "tag": "ITA",
      "title": "戦時経済計画",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ita_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
    },
    {
      "id": "ita_focus_3",
      "tag": "ITA",
      "title": "陸軍改革",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "陸軍改革"
        }
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／陸軍XP +50／歩兵研究 -50%"
    },
    {
      "id": "ita_focus_4",
      "tag": "ITA",
      "title": "砲兵近代化",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ita_focus_3"
      ],
      "completion_reward": {
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "artillery",
          "reduction": 0.5,
          "label": "砲兵近代化"
        }
      },
      "reward_description": "陸軍XP +50／砲兵研究 -50%"
    },
    {
      "id": "ita_focus_5",
      "tag": "ITA",
      "title": "我らの海",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ita_focus_4"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_navy_xp": 100,
        "add_research_bonus": {
          "scope": "category",
          "match": "naval",
          "reduction": 0.5,
          "label": "我らの海"
        }
      },
      "reward_description": "造船所 +3／海軍XP +100／海軍研究 -50%"
    },
    {
      "id": "ita_focus_6",
      "tag": "ITA",
      "title": "アルプス防衛",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "ita_focus_3"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 5,
        "add_ideas": {
          "id": "alpine_wall",
          "name": "アルプス防衛線",
          "desc": "防御 +10%",
          "modifiers": {
            "defense": 0.1
          }
        }
      },
      "reward_description": "人的資源 +75000／戦争協力度 +5／国家的精神「アルプス防衛線」"
    },
    {
      "id": "ita_focus_7",
      "tag": "ITA",
      "title": "エジプト侵攻",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ita_focus_6"
      ],
      "completion_reward": {
        "create_wargoal": {
          "tag": "EGY",
          "type": "conquest"
        },
        "add_war_support": 10,
        "add_army_xp": 75,
        "add_world_tension": 5
      },
      "reward_description": "エジプトへの宣戦事由／戦争協力度 +10／陸軍XP +75"
    },
    {
      "id": "ita_focus_8",
      "tag": "ITA",
      "title": "鋼鉄協定",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ita_focus_7"
      ],
      "completion_reward": {
        "add_political_power": 100,
        "add_opinion": {
          "target": "GER",
          "amount": 50
        },
        "add_army_xp": 50,
        "add_ideas": {
          "id": "pact_of_steel",
          "name": "鋼鉄協定",
          "desc": "陸軍XP獲得 +5%",
          "modifiers": {
            "armyXp": 0.05
          }
        }
      },
      "reward_description": "政治力 +100／ドイツとの関係 +50／陸軍XP +50／国家的精神「鋼鉄協定」"
    }
  ],
  "FRA": [
    {
      "id": "fra_focus_0",
      "tag": "FRA",
      "title": "人民戦線",
      "x": 0,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_civilian_factories": 2,
        "add_stability": 3,
        "add_political_power": 120,
        "add_research_bonus": {
          "scope": "category",
          "match": "industry",
          "reduction": 0.5,
          "label": "人民戦線"
        }
      },
      "reward_description": "民需工場 +2／安定度 +3／政治力 +120／工業研究 -50%"
    },
    {
      "id": "fra_focus_1",
      "tag": "FRA",
      "title": "公共投資",
      "x": 0,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "fra_focus_0"
      ],
      "completion_reward": {
        "add_civilian_factories": 3,
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
    },
    {
      "id": "fra_focus_2",
      "tag": "FRA",
      "title": "国防産業国有化",
      "x": 0,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "fra_focus_1"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
    },
    {
      "id": "fra_focus_3",
      "tag": "FRA",
      "title": "マジノー線強化",
      "x": 110,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_manpower": 50000,
        "add_war_support": 5,
        "add_ideas": {
          "id": "maginot_line",
          "name": "マジノー線",
          "desc": "防御 +15%",
          "modifiers": {
            "defense": 0.15
          }
        },
        "add_army_xp": 25
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5／国家的精神「マジノー線」／陸軍XP +25"
    },
    {
      "id": "fra_focus_4",
      "tag": "FRA",
      "title": "陸軍再編成",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "fra_focus_3"
      ],
      "completion_reward": {
        "add_army_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "infantry",
          "reduction": 0.5,
          "label": "陸軍再編成"
        }
      },
      "reward_description": "陸軍XP +50／歩兵研究 -50%"
    },
    {
      "id": "fra_focus_5",
      "tag": "FRA",
      "title": "機甲予備軍",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "fra_focus_4"
      ],
      "completion_reward": {
        "add_army_xp": 100,
        "add_research_bonus": {
          "scope": "category",
          "match": "armor",
          "reduction": 0.5,
          "label": "機甲予備軍"
        }
      },
      "reward_description": "陸軍XP +100／装甲研究 -50%"
    },
    {
      "id": "fra_focus_6",
      "tag": "FRA",
      "title": "航空産業再編",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [
        "fra_focus_4"
      ],
      "completion_reward": {
        "add_military_factories": 2,
        "add_air_xp": 75,
        "add_research_bonus": {
          "scope": "category",
          "match": "air",
          "reduction": 0.5,
          "label": "航空産業再編"
        }
      },
      "reward_description": "軍需工場 +2／空軍XP +75／航空研究 -50%"
    },
    {
      "id": "fra_focus_7",
      "tag": "FRA",
      "title": "戦闘機増産",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "fra_focus_6"
      ],
      "completion_reward": {
        "add_air_xp": 50,
        "add_research_bonus": {
          "scope": "category",
          "match": "air",
          "reduction": 0.5,
          "label": "戦闘機増産"
        }
      },
      "reward_description": "空軍XP +50／航空研究 -50%"
    },
    {
      "id": "fra_focus_8",
      "tag": "FRA",
      "title": "自由フランス",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "fra_focus_7"
      ],
      "completion_reward": {
        "add_war_support": 15,
        "add_stability": 5,
        "add_political_power": 100,
        "create_wargoal": {
          "tag": "GER",
          "type": "conquest"
        }
      },
      "reward_description": "戦争協力度 +15／安定度 +5／政治力 +100／ドイツへの宣戦事由"
    }
  ]
};

export default MAJOR_FOCUSES;
