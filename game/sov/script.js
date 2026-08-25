// ==========================================
// 1. ゲーム内時間 & 速度管理システム
// ==========================================
let currentDate = new Date(1936, 0, 1);
let gameSpeed = 0;
let gameTimer = null;

const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };

const gameStats = {
  stability: 85,
  warSupport: 60,
  aggression: 42,
  politicalPower: 120
};

let allFocuses = [];
const focusMap = {};
const completedFocuses = new Set();
const lockedFocuses = new Set();

let activeFocus = null;
let focusDaysRemaining = 0;

// ローカライズデータを保持する辞書（ymlのキーと値）
let localizationMap = {};
// 動的テキスト（scripted_localisation）の定義を保持するマップ（txtの name と、そこから抽出した _default の localization_key を紐付け）
let scriptedLocMap = {};

// 取得したすべての yml / txt ファイルのリスト
const localisationFiles = [
  "scripted_localisation/00_scripted_localisation.txt",
  "scripted_localisation/NSB_soviet_scripted_loc.txt",
  "Juno_bop_l_japanese.yml",
  "POL_equipment_l_japanese.yml",
  "SEA_characters_l_japanese.yml",
  "SEA_decisions_l_japanese.yml",
  "SEA_events_l_japanese.yml",
  "SEA_focus_l_japanese.yml",
  "SEA_ideas_l_japanese.yml",
  "TAOG_characters_l_japanese.yml",
  "TAOG_decisions_l_japanese.yml",
  "TAOG_events_l_japanese.yml",
  "TAOG_flags_l_japanese.yml",
  "TAOG_focus_l_japanese.yml",
  "TAOG_ideas_l_japanese.yml",
  "TAOG_music_l_japanese.yml",
  "TAOG_operations_l_japanese.yml",
  "TAOG_raids_l_japanese.yml",
  "WUW_characters_l_japanese.yml",
  "WUW_decisions_l_japanese.yml",
  "WUW_events_l_japanese.yml",
  "WUW_focus_l_japanese.yml",
  "WUW_ideas_l_japanese.yml",
  "aat_bop_l_japanese.yml",
  "aat_characters_l_japanese.yml",
  "aat_decisions_l_japanese.yml",
  "aat_events_l_japanese.yml",
  "aat_focus_l_japanese.yml",
  "aat_ideas_l_japanese.yml",
  "aat_music_l_japanese.yml",
  "aat_tooltips_l_japanese.yml",
  "abilities_l_japanese.yml",
  "achievements_l_japanese.yml",
  "adjacency_rules_l_japanese.yml",
  "air_l_japanese.yml",
  "alerts_l_japanese.yml",
  "allied_speeches_l_japanese.yml",
  "alliedradio_l_japanese.yml",
  "army_hq_l_japanese.yml",
  "army_l_japanese.yml",
  "autonomy_l_japanese.yml",
  "battleplan_codenames_l_japanese.yml",
  "bba_afa_ideas_l_japanese.yml",
  "bba_bop_l_japanese.yml",
  "bba_characters_l_japanese.yml",
  "bba_decisions_l_japanese.yml",
  "bba_events_l_japanese.yml",
  "bba_focus_l_japanese.yml",
  "bba_ideas_l_japanese.yml",
  "bba_music_l_japanese.yml",
  "bftb_decisions_l_japanese.yml",
  "bftb_events_l_japanese.yml",
  "bftb_focus_l_japanese.yml",
  "bftb_ideas_l_japanese.yml",
  "bftb_music_l_japanese.yml",
  "bookmarks_l_japanese.yml",
  "buildings_l_japanese.yml",
  "career_profile_achievements_l_japanese.yml",
  "career_profile_more_customization_l_japanese.yml",
  "chat_l_japanese.yml",
  "collections_l_japanese.yml",
  "combat_l_japanese.yml",
  "constructions_l_japanese.yml",
  "core_l_japanese.yml",
  "countries_cosmetic_l_japanese.yml",
  "countries_l_japanese.yml",
  "country_l_japanese.yml",
  "decisions_l_japanese.yml",
  "deployment_l_japanese.yml",
  "designer_l_japanese.yml",
  "difficulty_l_japanese.yml",
  "diplomacy_l_japanese.yml",
  "dlc019_l_japanese.yml",
  "doctrines_l_japanese.yml",
  "dod_decisions_l_japanese.yml",
  "dod_events_l_japanese.yml",
  "dod_focus_l_japanese.yml",
  "dod_ideas_l_japanese.yml",
  "effects_l_japanese.yml",
  "equip_air_l_japanese.yml",
  "equip_naval_l_japanese.yml",
  "equipment_l_japanese.yml",
  "events_l_japanese.yml",
  "expansion_pass_1_music_l_japanese.yml",
  "factions_l_japanese.yml",
  "focus_filter_tag_l_japanese.yml",
  "focus_l_japanese.yml",
  "frontend_l_japanese.yml",
  "game_rules_l_japanese.yml",
  "germanmarchorder_l_japanese.yml",
  "goals_l_japanese.yml",
  "goe_characters_l_japanese.yml",
  "goe_decisions_l_japanese.yml",
  "goe_events_l_japanese.yml",
  "goe_focus_l_japanese.yml",
  "goe_ideas_l_japanese.yml",
  "goe_music_l_japanese.yml",
  "got_music_l_japanese.yml",
  "government_in_exile_l_japanese.yml",
  "ideas_l_japanese.yml",
  "intel_ledger_l_japanese.yml",
  "intelligence_agencies_l_japanese.yml",
  "international_market_l_japanese.yml",
  "la_resistance_music_l_japanese.yml",
  "la_resistance_preorder_bonus_l_japanese.yml",
  "lar_decisions_l_japanese.yml",
  "lar_events_l_japanese.yml",
  "lar_focus_l_japanese.yml",
  "lar_ideas_l_japanese.yml",
  "lar_operations_l_japanese.yml",
  "loading_tips_l_japanese.yml",
  "logistics_l_japanese.yml",
  "mantheguns_music_l_japanese.yml",
  "mapmode_l_japanese.yml",
  "military_industrial_organization_department_l_japanese.yml",
  "military_industrial_organization_l_japanese.yml",
  "military_raids_l_japanese.yml",
  "modifiers_l_japanese.yml",
  "mtg_decisions_l_japanese.yml",
  "mtg_events_l_japanese.yml",
  "mtg_focus_l_japanese.yml",
  "mtg_ideas_l_japanese.yml",
  "multiplayer_l_japanese.yml",
  "mun_bop_l_japanese.yml",
  "mun_characters_l_japanese.yml",
  "mun_decisions_l_japanese.yml",
  "mun_events_l_japanese.yml",
  "mun_focus_l_japanese.yml",
  "mun_ideas_l_japanese.yml",
  "mun_music_l_japanese.yml",
  "music_l_japanese.yml",
  "musicplayer_l_japanese.yml",
  "names_l_japanese.yml",
  "navy_l_japanese.yml",
  "ncns_music_l_japanese.yml",
  "no_translation_required_l_japanese.yml",
  "nsb_characters_l_japanese.yml",
  "nsb_decisions_l_japanese.yml",
  "nsb_events_l_japanese.yml",
  "nsb_focus_l_japanese.yml",
  "nsb_ideas_l_japanese.yml",
  "nsb_music_l_japanese.yml",
  "nudge_l_japanese.yml",
  "operatives_l_japanese.yml",
  "parties_l_japanese.yml",
  "pdxonline_l_japanese.yml",
  "peace_l_japanese.yml",
  "plane_designer_l_japanese.yml",
  "poland_dlc_decisions_l_japanese.yml",
  "poland_dlc_events_l_japanese.yml",
  "poland_dlc_focus_l_japanese.yml",
  "politics_l_japanese.yml",
  "popserror_l_japanese.yml",
  "production_l_japanese.yml",
  "province_names_l_japanese.yml",
  "radio_pack_soundtrack_l_japanese.yml",
  "ranks_l_japanese.yml",
  "research_l_japanese.yml",
  "resistance_and_occupation_l_japanese.yml",
  "richpresence_l_japanese.yml",
  "rules_l_japanese.yml",
  "sabatonsoundtrack_l_japanese.yml",
  "scripted_triggers_l_japanese.yml",
  "sea_bop_l_japanese.yml",
  "ship_modules_l_japanese.yml",
  "social_gui_l_japanese.yml",
  "songs_of_the_eastern_front_l_japanese.yml",
  "special_projects_l_japanese.yml",
  "state_l_japanese.yml",
  "state_names_l_japanese.yml",
  "stats_l_japanese.yml",
  "strategic_locations_l_japanese.yml",
  "strategic_region_names_l_japanese.yml",
  "subscription_l_japanese.yml",
  "supply_area_names_l_japanese.yml",
  "tactics_l_japanese.yml",
  "tank_modules_l_japanese.yml",
  "technology_sharing_l_japanese.yml",
  "terrain_l_japanese.yml",
  "tfv_events_l_japanese.yml",
  "theater_l_japanese.yml",
  "toa_characters_l_japanese.yml",
  "toa_decisions_l_japanese.yml",
  "toa_events_l_japanese.yml",
  "toa_focus_l_japanese.yml",
  "toa_ideas_l_japanese.yml",
  "toa_music_l_japanese.yml",
  "togetherforvictory_music_l_japanese.yml",
  "topbar_l_japanese.yml",
  "trade_l_japanese.yml",
  "traits_l_japanese.yml",
  "treaty_org_l_japanese.yml",
  "triggers_l_japanese.yml",
  "tutorial_l_japanese.yml",
  "unit_l_japanese.yml",
  "unit_medals_l_japanese.yml",
  "victory_points_l_japanese.yml",
  "videos_l_japanese.yml",
  "wakingthetiger_music_l_japanese.yml",
  "war_l_japanese.yml",
  "waroverview_l_japanese.yml",
  "wtt_border_conflict_l_japanese.yml",
  "wtt_decisions_l_japanese.yml",
  "wtt_events_l_japanese.yml",
  "wtt_focus_l_japanese.yml",
  "wtt_ideas_l_japanese.yml",
  "wtt_infiltration_l_japanese.yml",
  "wtt_political_power_struggle_l_japanese.yml",
  "wtt_ss_recruitment_l_japanese.yml"
];

// ご指定のフローを正確に再現する関数
// 【フロー】yml(フォーカスID) -> ローカライズ(Get...Name取得) -> txt(defined_text) -> 末尾_defaultのキーを抽出 -> yml(再度探しに行く) -> 表示
function resolveDynamicLoc(targetId) {
  if (!targetId) return "";

  let cleanId = targetId.trim();
  if (cleanId.startsWith('[') && cleanId.endsWith(']')) {
    cleanId = cleanId.slice(1, -1);
  }

  // 1. まず yml（localizationMap）にそのままのIDがあるか確認する
  if (localizationMap[cleanId]) {
    return localizationMap[cleanId];
  }

  // 2. なければ、yml側から対応する値（例: "[GetFinishTheFiveYearPlanName]" など）を一度引いてみる
  let dynamicLocKey = localizationMap[cleanId];
  
  // もし yml にキー自体がない、または値が登録されていない場合は、IDから直接 Get...Name の形式を推測する
  if (!dynamicLocKey) {
    if (cleanId.startsWith('Get')) {
      dynamicLocKey = cleanId;
    } else {
      const pascalName = cleanId.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
      dynamicLocKey = `Get${pascalName}Name`;
    }
  } else {
    // yml から取得した値が [GetFinishTheFiveYearPlanName] のようになっている場合、括弧を外す
    if (dynamicLocKey.startsWith('[') && dynamicLocKey.endsWith(']')) {
      dynamicLocKey = dynamicLocKey.slice(1, -1);
    }
  }

  // 3. scripted_localisation（txt側）から、その動的テキスト名に一致するものを探し、末尾が `_default` の localization_key だけを抽出する
  if (scriptedLocMap[dynamicLocKey]) {
    const defaultKey = scriptedLocMap[dynamicLocKey]; // 内部で _default で終わるものだけを保持させています
    
    if (defaultKey) {
      // 4. 抽出した末尾 _default のキーを、もう一度 yml（localizationMap）に探しに行く
      if (localizationMap[defaultKey]) {
        // 5. 見つかったローカライズを返す
        return localizationMap[defaultKey];
      }
      return defaultKey; // ymlに見つからなければキー名をフォールバック
    }
  }

  // どこにもヒットしない場合は元のIDを返す
  return targetId;
}

// ローカライズファイル（ymlおよびtxt）の読み込み・パース処理
async function loadLocalisation() {
  try {
    const promises = localisationFiles.map(async (filename) => {
      // 修正版：上位階層の正しい data/ フォルダを指すように変更
      let url = `../../data/localisation/japanese/${filename}`;
      if (filename.includes('scripted_localisation/')) {
        url = `../../data/localisation/${filename}`;
      }
      
      // もし上記でもダメな場合（dataフォルダが同じ sov/ の中にある場合など）は、以下を試してください
      // let url = `../data/localisation/japanese/${filename}`;
      // if (filename.includes('scripted_localisation/')) {
      //   url = `../data/localisation/${filename}`;
      // }

      const res = await fetch(url);
      if (!res.ok) return { text: "", isTxt: filename.endsWith('.txt') };
      return { text: await res.text(), isTxt: filename.endsWith('.txt') };
    });

    const results = await Promise.all(promises);

    results.forEach(({ text, isTxt }) => {
      if (!text) return;

      if (isTxt) {
        // txtファイル（defined_text）のパース処理
        const definedTextMatches = text.matchAll(/defined_text\s*=\s*\{([\s\S]*?)\}/g);
        for (const dtMatch of definedTextMatches) {
          const body = dtMatch[1];
          const nameMatch = body.match(/name\s*=\s*([A-Za-z0-9_]+)/);
          if (!nameMatch) continue;
          
          const locName = nameMatch[1]; // 例: GetFinishTheFiveYearPlanName
          let defaultKey = "";
          
          const textBlockMatches = body.matchAll(/text\s*=\s*\{([\s\S]*?)\}/g);
          for (const tb of textBlockMatches) {
            const tbBody = tb[1];
            const keyMatch = tbBody.match(/localization_key\s*=\s*([A-Za-z0-9_]+)/);
            if (!keyMatch) continue;

            const foundKey = keyMatch[1];

            // ★要望通り：見つかった localization_key のうち、末尾が _default のものだけを厳密に抽出する
            if (foundKey.endsWith('_default')) {
              defaultKey = foundKey;
              break; // _default が見つかったら決定
            }
          }
          
          if (defaultKey) {
            scriptedLocMap[locName] = defaultKey;
          }
        }
      } else {
        // 通常の yml パース
        const lines = text.split('\n');
        lines.forEach(line => {
          const match = line.match(/^\s*([A-Za-z0-9_]+)(?::\d*)?\s+"(.*)"/);
          if (match) {
            localizationMap[match[1]] = match[2];
          }
        });
      }
    });

    console.log(`ローカライズ読み込み完了: yml ${Object.keys(localizationMap).length} 件, scripted_loc _default抽出済み ${Object.keys(scriptedLocMap).length} 件`);
  } catch (e) {
    console.log("ローカライズファイルの読み込みエラー:", e);
  }
}

function updateCalendarUI() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

function tickDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateCalendarUI();

  localStorage.setItem('gameDate', currentDate.toISOString());
  localStorage.setItem('gameSpeed', gameSpeed);

  if (activeFocus) {
    focusDaysRemaining--;
    const activeNodeEl = document.querySelector(`.focus-node[data-id="${activeFocus.id}"]`);
    if (activeNodeEl) {
      const progressEl = activeNodeEl.querySelector('.focus-progress');
      if (progressEl) progressEl.textContent = `残り ${focusDaysRemaining}日`;
    }

    if (focusDaysRemaining <= 0) {
      completeActiveFocus();
    }
  }
}

function setGameSpeed(speed) {
  gameSpeed = speed;
  if (gameTimer) clearInterval(gameTimer);

  localStorage.setItem('gameSpeed', gameSpeed);
  document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));

  if (speed === 0) {
    document.getElementById('btn-pause').classList.add('active');
  } else {
    const activeBtn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    gameTimer = setInterval(tickDay, speedIntervals[speed]);
  }
}

// ==========================================
// 2. NF進行 & 排他ロック・報酬適用
// ==========================================
function startFocus(nf) {
  const title = resolveDynamicLoc(nf.id);
  if (activeFocus) {
    setLogText(`【変更】国家方針を「${title}」に変更しました。`);
  } else {
    setLogText(`【国家方針開始】「${title}」の実行を開始。（必要日数: ${nf.cost || 70}日）`);
  }

  activeFocus = nf;
  focusDaysRemaining = nf.cost || 70;
  renderTree();
}

function completeActiveFocus() {
  const completedNf = activeFocus;
  completedFocuses.add(completedNf.id);

  if (completedNf.mutually_exclusive) {
    const targets = Array.isArray(completedNf.mutually_exclusive) 
      ? completedNf.mutually_exclusive 
      : [completedNf.mutually_exclusive];
    targets.forEach(id => lockedFocuses.add(id));
  }

  applyFocusEffects(completedNf.effect);

  const title = resolveDynamicLoc(completedNf.id);
  const effectClean = completedNf.effect ? completedNf.effect.replace(/\n/g, ' / ') : '特記事項なし';
  setLogText(`🎉【国家方針完了】「${title}」を達成！ 報酬: [ ${effectClean} ]`);

  activeFocus = null;
  focusDaysRemaining = 0;
  renderTree();
}

function setLogText(text) {
  const target = document.getElementById("typewriter-text");
  if (target) target.textContent = text;
}

// ==========================================
// 3. ズーム & パン（ドラッグ移動）機能
// ==========================================
let scale = 1;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let isDragging = false;

const container = document.getElementById('tree-container');
const viewport = document.getElementById('tree-viewport');

function updateTransform() {
  viewport.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
}

container.addEventListener('mousedown', (e) => {
  if (e.target.closest('.focus-node')) return;
  isDragging = true;
  startX = e.clientX - pointX;
  startY = e.clientY - pointY;
  container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  pointX = e.clientX - startX;
  pointY = e.clientY - startY;
  updateTransform();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  container.style.cursor = 'grab';
});

container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const xs = (e.clientX - pointX) / scale;
  const ys = (e.clientY - pointY) / scale;
  const delta = -e.deltaY;

  if (delta > 0) {
    scale = Math.min(scale * 1.1, 2.5);
  } else {
    scale = Math.max(scale / 1.1, 0.3);
  }

  pointX = e.clientX - xs * scale;
  pointY = e.clientY - ys * scale;
  updateTransform();
});

// ==========================================
// 4. 本家HOI4風：幹・枝描画システム
// ==========================================
function isUnlocked(nf) {
  if (lockedFocuses.has(nf.id)) return false;
  if (!nf.prerequisites || nf.prerequisites.length === 0) return true;
  return nf.prerequisites.every(parentId => completedFocuses.has(parentId));
}

function renderTree() {
  const nodesContainer = document.getElementById('focus-nodes');
  const svgLines = document.getElementById('svg-lines');
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  // 1. ノードを描画
  allFocuses.forEach(nf => {
    const node = document.createElement('div');
    node.className = 'focus-node';
    node.setAttribute('data-id', nf.id);

    const isCompleted = completedFocuses.has(nf.id);
    const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
    const isActive = activeFocus && activeFocus.id === nf.id;

    if (isCompleted) {
      node.classList.add('completed');
    } else if (isActive) {
      node.classList.add('in-progress');
    } else if (isLocked) {
      node.classList.add('locked');
      if (lockedFocuses.has(nf.id)) node.classList.add('mutually-blocked');
    } else {
      node.classList.add('available');
    }

    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    const checkMarkHtml = isCompleted ? `<div class="check-mark">✔</div>` : '';
    const progressTextHtml = isActive 
      ? `<div class="focus-progress">残り ${focusDaysRemaining}日</div>` 
      : `<div class="focus-cost">${nf.cost || 70}日</div>`;

    let displayName = resolveDynamicLoc(nf.id);
    if (!displayName || displayName === nf.id) {
      displayName = nf.title || nf.id; 
    }
    
    let iconHtml = `<div class="focus-symbol">⭐</div>`;
    const rawIcon = nf.icon || nf.iconPath;
    
    if (rawIcon) {
      let fileName = rawIcon.split('/').pop().split('\\').pop();
      fileName = fileName.replace(/\.[^/.]+$/, "");
      if (fileName.startsWith('GFX_')) {
        fileName = fileName.slice(4);
      }
      
      fileName = fileName.replace(/_ccp_2d_sov_compatibility$/, "");

      const filenameOverrides = {
        "SOV_the_glory_of_the_red_army_alt": "SOV_the_glory_of_the_red_army_alternative"
      };
      if (filenameOverrides[fileName]) {
        fileName = filenameOverrides[fileName];
      }

      iconHtml = `<img class="focus-icon" src="/iekei1/game/data/image/goals/focus_${fileName}_result.png" alt="" onerror="this.style.display='none'">`;
    }

    node.innerHTML = `
      ${checkMarkHtml}
      ${iconHtml}
      <div class="focus-title">${displayName}</div>
      ${progressTextHtml}
    `;

    node.addEventListener('mouseenter', (e) => showTooltip(e, nf));
    node.addEventListener('mousemove', (e) => moveTooltip(e));
    node.addEventListener('mouseleave', hideTooltip);

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isCompleted) return;
      if (isLocked) {
        setLogText(`【選択不可】前提条件を満たしていないか、反対の分岐を選択済みです。`);
        return;
      }
      startFocus(nf);
    });

    nodesContainer.appendChild(node);
  });

  // 2. 親ごとにグループ化してHOI4風の「横幹線＋下分岐」を描画
  const parentGroups = {};

  allFocuses.forEach(nf => {
    if (nf.prerequisites && Array.isArray(nf.prerequisites)) {
      nf.prerequisites.forEach(parentId => {
        if (!parentGroups[parentId]) parentGroups[parentId] = [];
        parentGroups[parentId].push(nf);
      });
    }
  });

  Object.keys(parentGroups).forEach(parentId => {
    const parent = focusMap[parentId];
    if (!parent) return;

    const children = parentGroups[parentId];
    const parentX = parent.x + 55;
    const parentY = parent.y + 75;
    const isParentDone = completedFocuses.has(parentId);

    if (children.length === 1) {
      const child = children[0];
      const childX = child.x + 55;
      const childY = child.y;

      if (parentX === childX) {
        drawDirectLine(parentX, parentY, childX, childY, svgLines, isParentDone);
      } else {
        const midY = parentY + (childY - parentY) / 2;
        drawDirectLine(parentX, parentY, parentX, midY, svgLines, isParentDone);
        drawDirectLine(parentX, midY, childX, midY, svgLines, isParentDone);
        drawDirectLine(childX, midY, childX, childY, svgLines, isParentDone);
      }
    } else {
      const childXs = children.map(c => c.x + 55);
      const minChildX = Math.min(...childXs);
      const maxChildX = Math.max(...childXs);
      const minChildY = Math.min(...children.map(c => c.y));
      
      const branchY = parentY + Math.max(20, (minChildY - parentY) / 2);

      drawDirectLine(parentX, parentY, parentX, branchY, svgLines, isParentDone);

      const mainLineLeft = Math.min(parentX, minChildX);
      const mainLineRight = Math.max(parentX, maxChildX);
      drawDirectLine(mainLineLeft, branchY, mainLineRight, branchY, svgLines, isParentDone);

      children.forEach(child => {
        const childX = child.x + 55;
        drawDirectLine(childX, branchY, childX, child.y, svgLines, isParentDone);
      });
    }
  });

  // 3. 排他選択の赤破線描画
  allFocuses.forEach(nf => {
    if (nf.mutually_exclusive) {
      const targets = Array.isArray(nf.mutually_exclusive) ? nf.mutually_exclusive : [nf.mutually_exclusive];
      targets.forEach(targetId => {
        const targetNf = focusMap[targetId];
        if (targetNf && nf.id < targetId) {
          drawExclusiveLine(nf.x + 55, nf.y + 37, targetNf.x + 55, targetNf.y + 37, svgLines);
        }
      });
    }
  });
}

function drawDirectLine(x1, y1, x2, y2, svg, isActive) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', isActive ? 'nf-line active' : 'nf-line');
  svg.appendChild(line);
}

function drawExclusiveLine(x1, y1, x2, y2, svg) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', 'nf-exclusive-line');
  svg.appendChild(line);
}

function applyFocusEffects(effectText) {
  if (!effectText) return;
  const lines = effectText.split('\n');
  lines.forEach(line => {
    const match = line.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!match) return;
    const val = parseFloat(match[1]);

    if (line.includes('安定度')) gameStats.stability += val;
    else if (line.includes('戦争協力度')) gameStats.warSupport += val;
    else if (line.includes('政治力')) gameStats.politicalPower += val;
    else if (line.includes('攻撃力') || line.includes('緊張度')) gameStats.aggression += val;
  });
  updateStatusBarUI();
}

function updateStatusBarUI() {
  document.getElementById('val-stability').textContent = `${Math.min(100, Math.max(0, gameStats.stability))} / 100`;
  document.getElementById('val-war-support').textContent = `${Math.min(100, Math.max(0, gameStats.warSupport))} / 100`;
  document.getElementById('val-aggression').textContent = `${Math.min(100, Math.max(0, gameStats.aggression))} / 100`;
  document.getElementById('val-pp').textContent = `${Math.min(100, Math.max(0, gameStats.politicalPower))} / 100`;
}

const tooltip = document.getElementById('nf-tooltip');
function showTooltip(e, nf) {
  const isCompleted = completedFocuses.has(nf.id);
  const isActive = activeFocus && activeFocus.id === nf.id;
  const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
  
  let titleName = resolveDynamicLoc(nf.id);
  if (!titleName || titleName === nf.id) {
    titleName = nf.title || nf.id;
  }

  let status = isCompleted ? "【達成済み】" : (isActive ? "【実行中】" : (isLocked ? "🔒【選択不可/排他】" : "🔓【選択可能】"));
  
  document.getElementById('tooltip-title').textContent = `${titleName} ${status}`;
  document.getElementById('tooltip-time').textContent = `⏱️ 必要時間: ${isActive ? focusDaysRemaining + "日 (進行中)" : (nf.cost || 70) + "日"}`;
  document.getElementById('tooltip-effect').textContent = nf.effect || "効果なし";
  
  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = `${e.clientX + 15}px`;
  tooltip.style.top = `${e.clientY + 15}px`;
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

// ==========================================
// 5. 初期化 & ローカライズ・soviet.json 読み込み処理
// ==========================================
document.getElementById('btn-pause').addEventListener('click', () => setGameSpeed(0));
document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const speed = parseInt(e.target.getAttribute('data-speed'), 10);
    setGameSpeed(speed);
  });
});

async function init() {
  // 1. すべてのローカライズファイル群（yml & txt）を読み込む
  await loadLocalisation();

  let rawData = [];

  try {
    const res = await fetch('./data/soviet.json');
    if (res.ok) {
      rawData = await res.json();
    } else {
      console.warn("soviet.jsonの読み込みに失敗しました。");
    }
  } catch (e) {
    console.error("fetchエラー:", e);
  }

  if (rawData.length === 0) {
    rawData = [
      { id: "SOV_1936", title: "1936年計画", x: 4, y: 0, cost: 70, effect: "政治力 +50" },
      { id: "SOV_stalin", title: "スターリン主義", relative_position_id: "SOV_1936", offsetX: -1, offsetY: 1, cost: 70, prerequisites: ["SOV_1936"], effect: "安定度 +10" }
    ];
  }

  rawData.forEach(nf => {
    nf.title = resolveDynamicLoc(nf.id);
    const effectKey = `${nf.id}_effect`;
    if (localizationMap[effectKey]) {
      nf.effect = localizationMap[effectKey];
    }
  });

  const GRID_SIZE_X = 220; 
  const GRID_SIZE_Y = 130; 

  const tempMap = {};
  rawData.forEach(nf => tempMap[nf.id] = nf);

  rawData.forEach(nf => {
    if (nf.relative_position_id && tempMap[nf.relative_position_id]) {
      const parent = tempMap[nf.relative_position_id];
      nf.x = parent.x + (nf.offsetX || 0) * GRID_SIZE_X;
      nf.y = parent.y + (nf.offsetY || 0) * GRID_SIZE_Y;
    } else {
      nf.x = (nf.offsetX !== undefined ? nf.offsetX : (nf.x || 4)) * GRID_SIZE_X;
      nf.y = (nf.offsetY !== undefined ? nf.offsetY : (nf.y || 0)) * GRID_SIZE_Y;
    }
  });

  allFocuses = rawData;
  allFocuses.forEach(nf => focusMap[nf.id] = nf);

  updateCalendarUI();
  updateStatusBarUI();
  renderTree();
}

init();
