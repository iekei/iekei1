#!/usr/bin/env python3
"""国家方針 (national focus) の completion_rewards を一括生成する。

HOI4 の国家方針は「70日かけて1つの方針を完了し、完了時に completion_reward を
受け取る」という仕組み。本スクリプトは各 TAG の `*_nf_batch*.json` を読み、
方針 ID / タイトル / 効果説明文から HOI4 相当の報酬を推定して
`completion_rewards` と `cost` (=70日) を書き戻す。

報酬は必ず決定論的 (同じ入力 → 同じ出力) になるよう、ID のハッシュで
小さな揺らぎだけを与える。再実行しても差分が出ない。

使い方:
    python3 game/tools/generate_focus_rewards.py            # 全 TAG を更新
    python3 game/tools/generate_focus_rewards.py --dry-run  # 件数だけ表示
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAGS = ['ger', 'sov', 'usa', 'eng', 'fra', 'ita', 'jap']
FOCUS_DAYS = 70  # HOI4 の国家方針は既定 70 日

# ---- 対象国タグの推定 (タイトル/説明文中の国名 → TAG) ----
TARGET_KEYWORDS = [
    (r'アンシュルス|オーストリア', 'AUS'),
    (r'ズデーテン|チェコスロバキア|チェコ', 'CZE'),
    (r'メーメル', 'LIT'),
    (r'ダンツィヒ|ポーランド回廊|ポーランド', 'POL'),
    (r'フランス|マジノ|ヴィシー', 'FRA'),
    (r'ソビエト|ソ連|バルバロッサ|モスクワ|ロシア', 'SOV'),
    (r'イギリス本土|イギリス|英国|シーライオン|ブリテン', 'ENG'),
    (r'アメリカ合衆国|アメリカ|米国', 'USA'),
    (r'イタリア|ローマ', 'ITA'),
    (r'大日本帝国|日本', 'JAP'),
    (r'ハンガリー', 'HUN'),
    (r'ルーマニア', 'ROM'),
    (r'ユーゴスラビア|ユーゴ', 'YUG'),
    (r'ギリシャ', 'GRE'),
    (r'トルコ', 'TUR'),
    (r'スペイン', 'SPR'),
    (r'ベルギー', 'BEL'),
    (r'オランダ', 'HOL'),
    (r'デンマーク', 'DEN'),
    (r'ノルウェー', 'NOR'),
    (r'スウェーデン', 'SWE'),
    (r'フィンランド', 'FIN'),
    (r'中国|中華民国|南京|北京', 'CHI'),
    (r'満洲国|満州国|満洲|満州', 'MAN'),
    (r'メキシコ', 'MEX'),
    (r'ブラジル', 'BRA'),
    (r'カナダ', 'CAN'),
    (r'オーストラリア', 'AST'),
    (r'インド', 'RAJ'),
    (r'南アフリカ', 'SAF'),
    (r'アルゼンチン', 'ARG'),
    (r'チリ', 'CHL'),
    (r'エチオピア', 'ETH'),
    (r'アルバニア', 'ALB'),
    (r'トゥヴァ|タンヌ', 'TAN'),
    (r'ラトビア', 'LAT'),
    (r'リトアニア', 'LIT'),
    (r'エストニア', 'EST'),
    (r'ブルガリア', 'BUL'),
    (r'スロバキア', 'SLO'),
    (r'クロアチア', 'CRO'),
    (r'オスマン|トルコ', 'TUR'),
    (r'南方資源地帯|南方作戦|蘭印|オランダ領東インド', 'INS'),
]

# 併合 (annex_country) を起こす強いキーワード
ANNEX_RULES = [
    (r'アンシュルス', 'AUS'),
    (r'ズデーテン', 'CZE'),
    (r'メーメル', 'LIT'),
    (r'オーストリア併合', 'AUS'),
    (r'チェコスロバキアを併合|チェコを併合', 'CZE'),
    (r'ポーランドを併合', 'POL'),
    (r'トゥヴァ併合|タンヌ・トゥヴァ', 'TAN'),
    (r'アルバニアを併合|アルバニア占領', 'ALB'),
]

# 宣戦事由 (create_wargoal) を起こすキーワード
WARGOAL_RE = re.compile(
    r'宣戦|開戦|侵攻|攻略|征服|打倒|占領|併合|布告|進撃|攻撃を開始|交戦|支配権|領土を要求|武力')

# カテゴリ判定 (JP) ------------------------------------------------------
RE_CIV = re.compile(r'民需|民間|工業化|産業|経済|インフラ|建設|工場建設|生産力|資源|自給')
RE_MIL = re.compile(r'軍需|軍備|兵器|軍拡|再軍備|軍需工場|軍生産|軍の拡張')
RE_DOCK = re.compile(r'造船|海軍工廠|ドック|艦船|艦隊の拡張|造船所')
RE_FORT = re.compile(r'要塞|防備|防衛線|西の壁|東の壁|大西洋の壁|マジノ|ジークリ|塹壕|陣地|国境線')
RE_COASTAL = re.compile(r'大西洋の壁|沿岸|海岸|海防')
RE_RESEARCH = re.compile(r'研究|科学|技術|開発|理論|実験|工学')
RE_ARMY_XP = re.compile(r'陸軍|歩兵|装甲|戦車|師団|将校|演習|訓練|軍事顧問')
RE_NAVY_XP = re.compile(r'海軍|艦隊|潜水艦|空母|水兵')
RE_AIR_XP = re.compile(r'空軍|航空|飛行機|爆撃機|戦闘機|パイロット')
RE_STABILITY = re.compile(r'安定|宣伝|世論|国民の|結束|プロパガンダ|民心')
RE_WAR_SUPPORT = re.compile(r'戦争協力|愛国|戦意|動員|士気|熱狂')
RE_MANPOWER = re.compile(r'人的資源|徴兵|動員|人口|兵員')
RE_TENSION = re.compile(r'緊張|外交|条約|協定|講和|国際|同盟')


def stable_seed(node_id: str) -> int:
    return int(hashlib.sha1(node_id.encode('utf-8')).hexdigest()[:8], 16)


def jitter(seed: int, spread: int) -> int:
    """-spread..+spread の決定論的な揺らぎ。"""
    return (seed % (spread * 2 + 1)) - spread


def depth_of(node: dict, by_id: dict, seen=None) -> int:
    seen = seen or set()
    if node['id'] in seen:
        return 0
    seen.add(node['id'])
    prereqs = [p for p in node.get('prerequisites', []) if p in by_id]
    if not prereqs:
        return 0
    return 1 + max(depth_of(by_id[p], by_id, seen) for p in prereqs)


def load_valid_tags() -> set:
    """mapdata/states.json に登場する国タグだけを有効な対象とする。"""
    path = os.path.join(ROOT, 'mapdata', 'states.json')
    tags = set()
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            states = json.load(fh)
        for state in states.values():
            if isinstance(state, dict):
                owner = state.get('owner') or state.get('tag')
                if owner:
                    tags.add(owner)
    return tags


VALID_TAGS = set()


def target_of(text: str, own_tag: str):
    for pattern, tag in TARGET_KEYWORDS:
        if tag == own_tag:
            continue
        if VALID_TAGS and tag not in VALID_TAGS:
            continue
        if re.search(pattern, text):
            return tag
    return None


def build_rewards(tag: str, node: dict, depth: int) -> list:
    title = node.get('title') or node.get('name') or ''
    body = node.get('effect') or ''
    if isinstance(body, dict):
        body = json.dumps(body, ensure_ascii=False)
    text = f'{title} {body}'
    seed = stable_seed(node['id'])
    rewards: list = []

    # --- 政治力: ツリーの浅い (重要な) 方針ほど多い。HOI4 は 50〜150 が標準。 ---
    base_pp = {0: 120, 1: 90, 2: 70}.get(min(depth, 2), 50)
    if depth >= 3:
        base_pp = 50
    pp = base_pp + jitter(seed, 10)
    if pp > 0:
        rewards.append({'type': 'add_political_power', 'value': pp})

    # --- 民需工場 / 軍需工場 / 造船所 ---
    if RE_CIV.search(text):
        level = 3 if depth == 0 and re.search(r'四カ年|五カ年|大規模|総合|計画', title) else (2 if depth <= 1 else 1)
        rewards.append({'type': 'add_building_construction', 'building': 'industrial_complex', 'level': level})
    if RE_MIL.search(text):
        level = 2 if depth <= 1 else 1
        if re.search(r'軍拡|大規模|総動員', title):
            level += 1
        rewards.append({'type': 'add_building_construction', 'building': 'arms_factory', 'level': level})
    if RE_DOCK.search(text):
        rewards.append({'type': 'add_building_construction', 'building': 'dockyard', 'level': 1 + (1 if depth == 0 else 0)})

    # --- 要塞 (陸軍要塞 / 沿岸要塞) ---
    if RE_FORT.search(text):
        building = 'coastal_bunker' if RE_COASTAL.search(text) else 'bunker'
        rewards.append({'type': 'add_building_construction', 'building': building, 'level': 3 if depth <= 1 else 2})

    # --- 研究ボーナス: 実時間 -50% (HOI4 の "研究ボーナス 50%") ---
    if RE_RESEARCH.search(text):
        category = '全般'
        if RE_ARMY_XP.search(text):
            category = '陸軍'
        elif RE_NAVY_XP.search(text):
            category = '海軍'
        elif RE_AIR_XP.search(text):
            category = '空軍'
        rewards.append({'type': 'add_tech_bonus', 'category': category, 'bonus': 0.5, 'uses': 1})

    # --- 併合 / 宣戦事由 ---
    annexed = None
    for pattern, target in ANNEX_RULES:
        if VALID_TAGS and target not in VALID_TAGS:
            continue
        if re.search(pattern, text) and target != tag:
            annexed = target
            break
    if annexed:
        rewards.append({'type': 'annex_country', 'country': [annexed]})
    else:
        # タイトルが「〜か戦争か」「〜を要求」等なら宣戦事由。
        # ただし「戦争準備」「防衛」など備え系のタイトルは対象外。
        titleWar = re.search(r'戦争|要求|請求', title) and not re.search(r'防衛|防備|対策|準備|回避|抑止|終結|賠償', title)
        if WARGOAL_RE.search(text) or titleWar:
            target = target_of(text, tag)
            if target:
                rewards.append({'type': 'create_wargoal', 'target': target, 'wargoal': 'annex_everything'})

    # --- 経験値 ---
    if RE_AIR_XP.search(title) or re.search(r'空軍', body[:60]):
        rewards.append({'type': 'add_air_experience', 'value': 20 + jitter(seed, 10)})
    elif RE_NAVY_XP.search(title):
        rewards.append({'type': 'add_navy_experience', 'value': 20 + jitter(seed, 10)})
    elif RE_ARMY_XP.search(text):
        rewards.append({'type': 'add_army_experience', 'value': 15 + jitter(seed, 10)})

    # --- 安定度 / 戦争協力度 ---
    if RE_STABILITY.search(text):
        rewards.append({'type': 'add_stability', 'value': 5 + (seed % 6)})
    if RE_WAR_SUPPORT.search(text):
        rewards.append({'type': 'add_war_support', 'value': 5 + (seed % 11)})

    # --- 人的資源 ---
    if RE_MANPOWER.search(text):
        rewards.append({'type': 'add_manpower', 'value': 5000 + (seed % 8) * 2500})

    # --- 世界緊張度 (外交方針のみ) ---
    if RE_TENSION.search(title):
        rewards.append({'type': 'add_world_tension', 'value': 2 + (seed % 5)})

    # 同じ type が重複した場合は最初の1件だけ残す (建設は種類別に許可)
    seen = set()
    unique = []
    for reward in rewards:
        key = (reward['type'], reward.get('building'))
        if key in seen:
            continue
        seen.add(key)
        unique.append(reward)
    return unique


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    VALID_TAGS.update(load_valid_tags())

    total = 0
    per_tag = {}
    for tag in TAGS:
        tag_upper = tag.upper()
        files = sorted(glob.glob(os.path.join(ROOT, tag, 'data', f'{tag_upper}_nf_batch*.json')))
        nodes = []
        for path in files:
            with open(path, encoding='utf-8') as fh:
                nodes.extend(json.load(fh))
        by_id = {n['id']: n for n in nodes}
        counts = {'annex': 0, 'wargoal': 0, 'research': 0, 'factory': 0, 'fort': 0}
        for node in nodes:
            depth = depth_of(node, by_id)
            rewards = build_rewards(tag_upper, node, depth)
            node['cost'] = FOCUS_DAYS
            node['days'] = FOCUS_DAYS
            node['completion_rewards'] = rewards
            for reward in rewards:
                t = reward['type']
                if t == 'annex_country':
                    counts['annex'] += 1
                elif t == 'create_wargoal':
                    counts['wargoal'] += 1
                elif t == 'add_tech_bonus':
                    counts['research'] += 1
                elif t == 'add_building_construction':
                    if reward['building'] == 'bunker' or reward['building'] == 'coastal_bunker':
                        counts['fort'] += 1
                    else:
                        counts['factory'] += 1
        total += len(nodes)
        per_tag[tag_upper] = (len(nodes), counts)
        if not args.dry_run:
            # 元のファイル分割を維持して書き戻す
            for path in files:
                with open(path, encoding='utf-8') as fh:
                    batch = json.load(fh)
                lookup = {n['id']: n for n in nodes}
                out = [lookup[n['id']] for n in batch]
                with open(path, 'w', encoding='utf-8') as fh:
                    json.dump(out, fh, ensure_ascii=False, indent=2)
                    fh.write('\n')
    for tag, (count, counts) in per_tag.items():
        print(f'{tag}: {count} focuses  annex={counts["annex"]} wargoal={counts["wargoal"]} '
              f'research={counts["research"]} factories={counts["factory"]} forts={counts["fort"]}')
    print(f'total focuses: {total}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
