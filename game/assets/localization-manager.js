'use strict';

/* ==========================================================
 * localization-manager.js — HoI4 ローカライズ（多言語対応）マネージャー
 * ----------------------------------------------------------
 * HoI4 のローカライズファイル（.yml）を読み込み、
 * 「ローカライズキー → 実際のテキスト」のマッピングを管理する。
 *
 * 【特徴】
 *  1. UI に表示する名称・説明文をハードコードしない。
 *     方針データは「ローカライズキー（ID）」だけを持ち、
 *     実際の日本語テキストはこのマネージャーが解決する。
 *  2. HoI4 本来の .yml 形式をそのままパース可能。
 *  3. 7大国（GER/SOV/FRA/ENG/USA/JAP/ITA）それぞれ独立して
 *     ローカライズ辞書を保持できる（他国の辞書と混ざらない）。
 *
 * 【HoI4 .yml ファイルの形式（参考）】
 *   l_japanese:
 *     GER_rhineland:0 "ラインラント進駐"
 *     GER_rhineland_desc:1 "ラインラントへの進駐を行い…"
 *   ※ 先頭の l_japanese: は言語ブロック。:0 や :1 はバージョン番号。
 *
 * 【方針データ内のキー参照パターン】
 *   ・"$KEY$"          → HoI4 標準のローカライズ参照
 *   ・"[ScriptedToken]" → スクリプト化ローカライズ（コード生成トークン）
 *   ・"KEY"（単独）     → 辞書にあれば翻訳、なければそのまま表示
 * ========================================================== */
(function (global) {
  'use strict';

  class LocalizationManager {
    constructor() {
      // 辞書: language -> Map<key, text>
      // 例: this.dictionaries.get('japanese').get('GER_rhineland') -> "ラインラント進駐"
      this.dictionaries = new Map();
      this.currentLanguage = 'japanese';
      // 国別辞書: language -> country -> Map<key, text>
      this.countryDictionaries = new Map();
      this.loadedBaseLanguages = new Set();
      this.loadedCountryLanguages = new Set();
    }

    // ---- 言語の切替 ----
    setLanguage(lang) {
      this.currentLanguage = lang;
    }

    // ---- 現在の言語の辞書を取得（なければ空 Map） ----
    dict() {
      return this.dictionaries.get(this.currentLanguage) || new Map();
    }

    // ---- 国別辞書を取得 ----
    countryDict(country, language = this.currentLanguage) {
      return this.countryDictionaries.get(language)?.get(country) || new Map();
    }

    // ==========================================================
    // パース処理: HoI4 の .yml テキストを解析して辞書へ格納
    // ==========================================================
    // ymlText: .yml ファイルの生テキスト
    // country: 任意。指定すると国別辞書にも格納する（他国と混ざらない）
    parseYml(ymlText, country) {
      if (!ymlText || typeof ymlText !== 'string') return;

      const lines = ymlText.replace(/^\uFEFF/, '').split(/\r?\n/);
      let currentLang = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        // 言語ブロック検出: "l_japanese:" / "l_english:" など
        const langMatch = /^l_([a-zA-Z_]+)\s*:/.exec(line);
        if (langMatch) {
          currentLang = langMatch[1];
          if (!this.dictionaries.has(currentLang)) {
            this.dictionaries.set(currentLang, new Map());
          }
          continue;
        }

        // キー定義行: "KEY:0 \"テキスト\"" または "KEY:1 \"テキスト\""
        // バージョン番号（:0, :1 など）を取り除いてキーとテキストを抽出
        const entryMatch = /^([A-Za-z0-9_.]+)\s*:\s*\d*\s*"(.*)"\s*$/.exec(line);
        if (!entryMatch) continue;

        const key = entryMatch[1];
        // エスケープされた引用符・改行を元に戻す
        const text = entryMatch[2]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');

        // 言語ブロックが未検出なら現在の言語へ（デフォルト japanese）
        const lang = currentLang || this.currentLanguage;
        if (!this.dictionaries.has(lang)) this.dictionaries.set(lang, new Map());
        this.dictionaries.get(lang).set(key, text);

        // 国別辞書へも格納（指定時のみ）
        if (country) {
          if (!this.countryDictionaries.has(lang)) this.countryDictionaries.set(lang, new Map());
          const countries = this.countryDictionaries.get(lang);
          if (!countries.has(country)) countries.set(country, new Map());
          countries.get(country).set(key, text);
        }
      }
    }

    // ==========================================================
    // ファイル/URL からローカライズを読み込む（非同期）
    // ==========================================================
    // sources: 文字列の配列（URL またはパス）。順番に fetch してパースする。
    // country: 任意。国別辞書へ格納。
    async load(sources, country) {
      const list = Array.isArray(sources) ? sources : [sources];
      for (const src of list) {
        try {
          const res = await fetch(src);
          if (!res.ok) continue;
          const text = await res.text();
          this.parseYml(text, country);
        } catch (e) {
          console.warn(`[LocalizationManager] 読み込み失敗: ${src}`, e.message);
        }
      }
    }

    async loadGameData(country) {
      const language = this.currentLanguage;
      if (!this.loadedBaseLanguages.has(language)) {
        await this.load([
          `data/localisation/${language}/focus_l_${language}.yml`,
          `data/localisation/${language}/research_l_${language}.yml`,
          `data/localisation/${language}/state_names_l_${language}.yml`,
          `data/localisation/${language}/victory_points_l_${language}.yml`,
          `data/localisation/${language}/province_names_l_${language}.yml`,
          `data/localisation/${language}/strategic_region_names_l_${language}.yml`
        ]);
        this.loadedBaseLanguages.add(language);
      }

      if (country) {
        const cacheKey = `${language}:${country}`;
        if (!this.loadedCountryLanguages.has(cacheKey)) {
          await this.load(
            `${country.toLowerCase()}/data/localisation/${country}_focuses_l_${language}.yml`,
            country
          );
          this.loadedCountryLanguages.add(cacheKey);
        }
      }
    }

    // ==========================================================
    // キーからテキストを取得
    // ==========================================================
    // key: ローカライズキー（例: "GER_rhineland"）
    // country: 任意。指定すると国別辞書を優先的に検索する。
    t(key, country) {
      if (!key) return '';
      const k = String(key);
      // 国別辞書を優先
      if (country) {
        const c = this.countryDict(country).get(k);
        if (c) return c;
      }
      // 共通辞書
      const d = this.dict();
      return d.get(k) || k; // 見つからなければキーをそのまま返す
    }

    // ==========================================================
    // 文字列中のローカライズ参照を解決して実際のテキストを返す
    // ==========================================================
    // 3つの参照パターンを解決:
    //   "$KEY$"          → t(KEY)
    //   "[ScriptedToken]" → t(ScriptedToken)（見つからなければそのまま）
    //   "plain text"     → そのまま
    resolve(text, country) {
      if (!text || typeof text !== 'string') return text || '';

      // 1. $KEY$ 形式の参照を解決
      let result = text.replace(/\$([A-Za-z0-9_.]+)\$/g, (_, key) => {
        const resolved = this.t(key, country);
        return resolved !== key ? resolved : `$${key}$`;
      });

      // 2. [ScriptedToken] 形式の参照を解決
      result = result.replace(/\[([A-Za-z0-9_.]+)\]/g, (_, token) => {
        const resolved = this.t(token, country);
        return resolved !== token ? resolved : `[${token}]`;
      });

      return result;
    }

    // ---- 辞書の内容を確認用に出力（デバッグ用） ----
    stats() {
      const langs = {};
      for (const [lang, dict] of this.dictionaries) langs[lang] = dict.size;
      return { currentLanguage: this.currentLanguage, dictionaries: langs };
    }
  }

  // グローバルへ公開（シングルトン）
  global.LocalizationManager = LocalizationManager;
  global.l10n = new LocalizationManager();
})(window);
