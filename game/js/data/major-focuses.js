/** Country-specific focuses with executable completion_reward objects. */
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
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
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
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
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "ger_focus_6",
      "tag": "GER",
      "title": "空軍再建",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_military_factories": 2,
        "add_fuel": 3000
      },
      "reward_description": "軍需工場 +2／燃料 +3000"
    },
    {
      "id": "ger_focus_7",
      "tag": "GER",
      "title": "航空機増産",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ger_focus_6"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_command_power": 20
      },
      "reward_description": "軍需工場 +3／指揮力 +20"
    },
    {
      "id": "ger_focus_8",
      "tag": "GER",
      "title": "制空戦略",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ger_focus_7"
      ],
      "completion_reward": {
        "add_fuel": 6000,
        "add_war_support": 5
      },
      "reward_description": "燃料 +6000／戦争協力度 +5"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
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
        "add_fuel": 4000
      },
      "reward_description": "軍需工場 +3／燃料 +4000"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
    },
    {
      "id": "usa_focus_4",
      "tag": "USA",
      "title": "陸軍拡張",
      "x": 110,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "usa_focus_3"
      ],
      "completion_reward": {
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
    },
    {
      "id": "usa_focus_5",
      "tag": "USA",
      "title": "連合軍の兵站",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "usa_focus_4"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "usa_focus_6",
      "tag": "USA",
      "title": "両洋艦隊法",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_dockyards": 2,
        "add_fuel": 3000
      },
      "reward_description": "造船所 +2／燃料 +3000"
    },
    {
      "id": "usa_focus_7",
      "tag": "USA",
      "title": "海軍航空隊",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "usa_focus_6"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_convoys": 30
      },
      "reward_description": "造船所 +3／輸送船 +30"
    },
    {
      "id": "usa_focus_8",
      "tag": "USA",
      "title": "太平洋戦略",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "usa_focus_7"
      ],
      "completion_reward": {
        "add_convoys": 50,
        "add_fuel": 6000,
        "add_command_power": 20
      },
      "reward_description": "輸送船 +50／燃料 +6000／指揮力 +20"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_political_power": 40
      },
      "reward_description": "民需工場 +3／政治力 +40"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
    },
    {
      "id": "sov_focus_5",
      "tag": "SOV",
      "title": "祖国防衛",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "sov_focus_4"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "sov_focus_6",
      "tag": "SOV",
      "title": "航空産業局",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_military_factories": 2,
        "add_fuel": 3000
      },
      "reward_description": "軍需工場 +2／燃料 +3000"
    },
    {
      "id": "sov_focus_7",
      "tag": "SOV",
      "title": "航空学校拡張",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "sov_focus_6"
      ],
      "completion_reward": {
        "add_military_factories": 3,
        "add_command_power": 20
      },
      "reward_description": "軍需工場 +3／指揮力 +20"
    },
    {
      "id": "sov_focus_8",
      "tag": "SOV",
      "title": "航空戦力集中",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "sov_focus_7"
      ],
      "completion_reward": {
        "add_fuel": 6000,
        "add_war_support": 5
      },
      "reward_description": "燃料 +6000／戦争協力度 +5"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
    },
    {
      "id": "eng_focus_5",
      "tag": "ENG",
      "title": "本土防衛",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "eng_focus_4"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "eng_focus_6",
      "tag": "ENG",
      "title": "王立海軍近代化",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_dockyards": 2,
        "add_fuel": 3000
      },
      "reward_description": "造船所 +2／燃料 +3000"
    },
    {
      "id": "eng_focus_7",
      "tag": "ENG",
      "title": "船団護衛",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "eng_focus_6"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_convoys": 30
      },
      "reward_description": "造船所 +3／輸送船 +30"
    },
    {
      "id": "eng_focus_8",
      "tag": "ENG",
      "title": "大西洋の生命線",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "eng_focus_7"
      ],
      "completion_reward": {
        "add_convoys": 50,
        "add_fuel": 6000,
        "add_command_power": 20
      },
      "reward_description": "輸送船 +50／燃料 +6000／指揮力 +20"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
    },
    {
      "id": "jap_focus_5",
      "tag": "JAP",
      "title": "兵站網整備",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "jap_focus_4"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "jap_focus_6",
      "tag": "JAP",
      "title": "海軍航空隊",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_dockyards": 2,
        "add_fuel": 3000
      },
      "reward_description": "造船所 +2／燃料 +3000"
    },
    {
      "id": "jap_focus_7",
      "tag": "JAP",
      "title": "空母機動部隊",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "jap_focus_6"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_convoys": 30
      },
      "reward_description": "造船所 +3／輸送船 +30"
    },
    {
      "id": "jap_focus_8",
      "tag": "JAP",
      "title": "太平洋の防衛",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "jap_focus_7"
      ],
      "completion_reward": {
        "add_convoys": 50,
        "add_fuel": 6000,
        "add_command_power": 20
      },
      "reward_description": "輸送船 +50／燃料 +6000／指揮力 +20"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
    },
    {
      "id": "ita_focus_5",
      "tag": "ITA",
      "title": "アルプス防衛",
      "x": 110,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ita_focus_4"
      ],
      "completion_reward": {
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "ita_focus_6",
      "tag": "ITA",
      "title": "我らの海",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_dockyards": 2,
        "add_fuel": 3000
      },
      "reward_description": "造船所 +2／燃料 +3000"
    },
    {
      "id": "ita_focus_7",
      "tag": "ITA",
      "title": "造船計画",
      "x": 220,
      "y": 75,
      "cost": 70,
      "prerequisites": [
        "ita_focus_6"
      ],
      "completion_reward": {
        "add_dockyards": 3,
        "add_convoys": 30
      },
      "reward_description": "造船所 +3／輸送船 +30"
    },
    {
      "id": "ita_focus_8",
      "tag": "ITA",
      "title": "地中海の制海権",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "ita_focus_7"
      ],
      "completion_reward": {
        "add_convoys": 50,
        "add_fuel": 6000,
        "add_command_power": 20
      },
      "reward_description": "輸送船 +50／燃料 +6000／指揮力 +20"
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
        "add_stability": 3
      },
      "reward_description": "民需工場 +2／安定度 +3"
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
        "add_war_support": 5
      },
      "reward_description": "人的資源 +50000／戦争協力度 +5"
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
        "add_military_factories": 2,
        "add_command_power": 25
      },
      "reward_description": "軍需工場 +2／指揮力 +25"
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
        "add_manpower": 75000,
        "add_war_support": 8
      },
      "reward_description": "人的資源 +75000／戦争協力度 +8"
    },
    {
      "id": "fra_focus_6",
      "tag": "FRA",
      "title": "航空産業再編",
      "x": 220,
      "y": 0,
      "cost": 70,
      "prerequisites": [],
      "completion_reward": {
        "add_military_factories": 2,
        "add_fuel": 3000
      },
      "reward_description": "軍需工場 +2／燃料 +3000"
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
        "add_military_factories": 3,
        "add_command_power": 20
      },
      "reward_description": "軍需工場 +3／指揮力 +20"
    },
    {
      "id": "fra_focus_8",
      "tag": "FRA",
      "title": "本土制空網",
      "x": 220,
      "y": 150,
      "cost": 70,
      "prerequisites": [
        "fra_focus_7"
      ],
      "completion_reward": {
        "add_fuel": 6000,
        "add_war_support": 5
      },
      "reward_description": "燃料 +6000／戦争協力度 +5"
    }
  ]
};
