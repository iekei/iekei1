// --- 1. 指導者データ（全世界・全時代 / Wikipedia APIから画像と説明を取得） ---
const leaders = [
  // 古代
  { id: "alexander", name: "アレクサンドロス3世", wikiTitle: "アレクサンドロス3世", rank: "SSR", era: "古代", years: "前356年〜前323年", region: "マケドニア王国", color: "#B8860B" },
  { id: "caesar", name: "ユリウス・カエサル", wikiTitle: "ユリウス・カエサル", rank: "SSR", era: "古代", years: "前100年〜前44年", region: "ローマ", color: "#A0522D" },
  { id: "cleopatra", name: "クレオパトラ7世", wikiTitle: "クレオパトラ7世", rank: "SR", era: "古代", years: "前69年〜前30年", region: "プトレマイオス朝エジプト", color: "#DAA520" },
  { id: "qin", name: "始皇帝", wikiTitle: "始皇帝", rank: "SSR", era: "古代", years: "前259年〜前210年", region: "秦", color: "#C9A227" },
  { id: "hammurabi", name: "ハンムラビ", wikiTitle: "ハンムラビ", rank: "R", era: "古代", years: "在位 前1792年〜前1750年", region: "バビロニア", color: "#7A6A2A" },
  { id: "pericles", name: "ペリクレス", wikiTitle: "ペリクレス", rank: "R", era: "古代", years: "前495年〜前429年", region: "アテナイ", color: "#3A6EA5" },
  { id: "darius", name: "ダレイオス1世", wikiTitle: "ダレイオス1世", rank: "R", era: "古代", years: "前550年〜前486年", region: "アケメネス朝", color: "#6A5ACD" },
  { id: "augustus", name: "アウグストゥス", wikiTitle: "アウグストゥス", rank: "SR", era: "古代", years: "前63年〜14年", region: "ローマ帝国", color: "#708090" },
  // 中世〜近世
  { id: "genghis", name: "チンギス・ハン", wikiTitle: "チンギス・ハン", rank: "SSR", era: "中世", years: "1162年?〜1227年", region: "モンゴル帝国", color: "#1E5AA8" },
  { id: "charlemagne", name: "カール大帝", wikiTitle: "カール大帝", rank: "SR", era: "中世", years: "742年?〜814年", region: "フランク王国", color: "#A0522D" },
  { id: "saladin", name: "サラーフッディーン", wikiTitle: "サラーフッディーン", rank: "SR", era: "中世", years: "1137年〜1193年", region: "アイユーブ朝", color: "#2E7D4F" },
  { id: "richard1", name: "リチャード1世", wikiTitle: "リチャード1世 (イングランド王)", rank: "R", era: "中世", years: "1157年〜1199年", region: "イングランド", color: "#B22222" },
  { id: "joan", name: "ジャンヌ・ダルク", wikiTitle: "ジャンヌ・ダルク", rank: "SR", era: "中世", years: "1412年〜1431年", region: "フランス", color: "#3A6EA5" },
  { id: "suleiman", name: "スレイマン1世", wikiTitle: "スレイマン1世", rank: "SR", era: "中世〜近世", years: "1494年〜1566年", region: "オスマン帝国", color: "#2F4F4F" },
  { id: "elizabeth1", name: "エリザベス1世", wikiTitle: "エリザベス1世 (イングランド女王)", rank: "SR", era: "近世", years: "1533年〜1603年", region: "イングランド", color: "#5C7A99" },
  { id: "nobunaga", name: "織田信長", wikiTitle: "織田信長", rank: "SSR", era: "戦国時代", years: "1534年〜1582年", region: "日本", color: "#9B1B30" },
  { id: "shingen", name: "武田信玄", wikiTitle: "武田信玄", rank: "R", era: "戦国時代", years: "1521年〜1573年", region: "日本", color: "#704214" },
  { id: "hideyoshi", name: "豊臣秀吉", wikiTitle: "豊臣秀吉", rank: "R", era: "戦国時代", years: "1537年〜1598年", region: "日本", color: "#B8860B" },
  { id: "ieyasu", name: "徳川家康", wikiTitle: "徳川家康", rank: "SR", era: "戦国〜江戸", years: "1543年〜1616年", region: "日本", color: "#556B2F" },
  { id: "peter1", name: "ピョートル1世", wikiTitle: "ピョートル1世", rank: "SR", era: "近世", years: "1672年〜1725年", region: "ロシア", color: "#4169E1" },
  { id: "catherine2", name: "エカチェリーナ2世", wikiTitle: "エカチェリーナ2世", rank: "SSR", era: "近世", years: "1729年〜1796年", region: "ロシア", color: "#7B2D8B" },
  { id: "washington", name: "ジョージ・ワシントン", wikiTitle: "ジョージ・ワシントン", rank: "SR", era: "近世", years: "1732年〜1799年", region: "アメリカ", color: "#708090" },
  { id: "napoleon", name: "ナポレオン・ボナパルト", wikiTitle: "ナポレオン・ボナパルト", rank: "SSR", era: "近世", years: "1769年〜1821年", region: "フランス", color: "#2244AA" },
  { id: "bolivar", name: "シモン・ボリバル", wikiTitle: "シモン・ボリバル", rank: "SR", era: "近世", years: "1783年〜1830年", region: "ラテンアメリカ", color: "#3CB371" },
  // 近代〜現代
  { id: "lincoln", name: "アブラハム・リンカーン", wikiTitle: "アブラハム・リンカーン", rank: "SSR", era: "近代", years: "1809年〜1865年", region: "アメリカ", color: "#2F4F4F" },
  { id: "bismarck", name: "オットー・フォン・ビスマルク", wikiTitle: "オットー・フォン・ビスマルク", rank: "SSR", era: "近代", years: "1815年〜1898年", region: "ドイツ", color: "#4B5320" },
  { id: "meiji", name: "明治天皇", wikiTitle: "明治天皇", rank: "SR", era: "近代", years: "1852年〜1912年", region: "日本", color: "#800020" },
  { id: "theodore", name: "セオドア・ルーズベルト", wikiTitle: "セオドア・ルーズベルト", rank: "R", era: "近代", years: "1858年〜1919年", region: "アメリカ", color: "#8B4513" },
  { id: "gandhi", name: "マハトマ・ガンジー", wikiTitle: "マハトマ・ガンジー", rank: "SSR", era: "近代", years: "1869年〜1948年", region: "インド", color: "#CC7722" },
  { id: "sunwen", name: "孫文", wikiTitle: "孫文", rank: "SR", era: "近代", years: "1866年〜1925年", region: "中国", color: "#2E7D32" },
  { id: "lenin", name: "ウラジーミル・レーニン", wikiTitle: "ウラジーミル・レーニン", rank: "SSR", era: "近代", years: "1870年〜1924年", region: "ロシア", color: "#8B0000" },
  { id: "churchill", name: "ウィンストン・チャーチル", wikiTitle: "ウィンストン・チャーチル", rank: "SSR", era: "近代〜現代", years: "1874年〜1965年", region: "イギリス", color: "#7A4A2A" },
  { id: "ataturk", name: "ムスタファ・ケマル・アタテュルク", wikiTitle: "ムスタファ・ケマル・アタテュルク", rank: "SR", era: "近代〜現代", years: "1881年〜1938年", region: "トルコ", color: "#B22222" },
  { id: "fdr", name: "フランクリン・ルーズベルト", wikiTitle: "フランクリン・ルーズベルト", rank: "SSR", era: "近代〜現代", years: "1882年〜1945年", region: "アメリカ", color: "#2C5F8A" },
  { id: "degaulle", name: "シャルル・ド・ゴール", wikiTitle: "シャルル・ド・ゴール", rank: "SR", era: "近代〜現代", years: "1890年〜1970年", region: "フランス", color: "#3A6EA5" },
  { id: "hochiminh", name: "ホー・チ・ミン", wikiTitle: "ホー・チ・ミン", rank: "SR", era: "近代〜現代", years: "1890年〜1969年", region: "ベトナム", color: "#B03A2E" },
  { id: "tito", name: "ヨシップ・ブロズ・チトー", wikiTitle: "ヨシップ・ブロズ・チトー", rank: "R", era: "近代〜現代", years: "1892年〜1980年", region: "ユーゴスラビア", color: "#46628A" },
  { id: "mao", name: "毛沢東", wikiTitle: "毛沢東", rank: "SSR", era: "近代〜現代", years: "1893年〜1976年", region: "中国", color: "#9B2226" },
  { id: "kim", name: "金日成", wikiTitle: "金日成", rank: "R", era: "近代〜現代", years: "1912年〜1994年", region: "朝鮮", color: "#A0432A" },
  { id: "mandela", name: "ネルソン・マンデラ", wikiTitle: "ネルソン・マンデラ", rank: "SSR", era: "現代", years: "1918年〜2013年", region: "南アフリカ", color: "#1E7A4D" },
  { id: "mlk", name: "マーティン・ルーサー・キング・ジュニア", wikiTitle: "マーティン・ルーサー・キング・ジュニア", rank: "SR", era: "現代", years: "1929年〜1968年", region: "アメリカ", color: "#5B7BB5" },
  { id: "thatcher", name: "マーガレット・サッチャー", wikiTitle: "マーガレット・サッチャー", rank: "SR", era: "現代", years: "1925年〜2013年", region: "イギリス", color: "#4682B4" },
  { id: "castro", name: "フィデル・カストロ", wikiTitle: "フィデル・カストロ", rank: "SR", era: "現代", years: "1926年〜2016年", region: "キューバ", color: "#2E7D4F" },
  { id: "johnpaul2", name: "ヨハネ・パウロ2世", wikiTitle: "ヨハネ・パウロ2世", rank: "R", era: "現代", years: "1920年〜2005年", region: "ローマ教皇庁", color: "#6B8E23" },
  { id: "deng", name: "鄧小平", wikiTitle: "鄧小平", rank: "SR", era: "現代", years: "1904年〜1997年", region: "中国", color: "#B5651D" },
  { id: "gorbachev", name: "ミハイル・ゴルバチョフ", wikiTitle: "ミハイル・ゴルバチョフ", rank: "SR", era: "現代", years: "1931年〜2022年", region: "ソ連", color: "#8B7500" },
  // --- 追加100名: 古代 ---
  { id: "ramses2", name: "ラムセス2世", wikiTitle: "ラムセス2世", rank: "SSR", era: "古代", years: "在位 前1279年〜前1213年", region: "エジプト（新王国）", color: "#DAA520" },
  { id: "ashoka", name: "アショーカ王", wikiTitle: "アショーカ王", rank: "SR", era: "古代", years: "在位 前268年〜前232年", region: "マウリヤ朝（インド）", color: "#CC7722" },
  { id: "liubang", name: "劉邦", wikiTitle: "劉邦", rank: "R", era: "古代", years: "前256年〜前195年", region: "漢", color: "#B5651D" },
  { id: "marcus", name: "マルクス・アウレリウス", wikiTitle: "マルクス・アウレリウス・アントニヌス", rank: "SR", era: "古代", years: "121年〜180年", region: "ローマ帝国", color: "#708090" },
  { id: "constantine", name: "コンスタンティヌス1世", wikiTitle: "コンスタンティヌス1世", rank: "SR", era: "古代〜中世", years: "272年?〜337年", region: "ローマ帝国", color: "#3A6EA5" },
  // --- 追加: 中世 ---
  { id: "justinian", name: "ユスティニアヌス1世", wikiTitle: "ユスティニアヌス1世", rank: "SR", era: "中世", years: "482年?〜565年", region: "東ローマ帝国", color: "#6A5ACD" },
  { id: "harun", name: "ハールーン・アッ＝ラシード", wikiTitle: "ハールーン・アッ＝ラシード", rank: "R", era: "中世", years: "763年?〜809年", region: "アッバース朝", color: "#3CB371" },
  { id: "karamarton", name: "カール・マルテル", wikiTitle: "カール・マルテル", rank: "R", era: "中世", years: "688年?〜741年", region: "フランク王国", color: "#8B4513" },
  { id: "alfred", name: "アルフレッド大王", wikiTitle: "アルフレッド大王", rank: "R", era: "中世", years: "849年?〜899年", region: "イングランド", color: "#5C7A99" },
  { id: "wuzetian", name: "武則天", wikiTitle: "武則天", rank: "SR", era: "中世", years: "624年〜705年", region: "唐", color: "#7B2D8B" },
  { id: "lishimin", name: "李世民（唐太宗）", wikiTitle: "李世民", rank: "SR", era: "中世", years: "598年〜649年", region: "唐", color: "#B8860B" },
  { id: "friedrich1", name: "フリードリヒ1世（赤髭王）", wikiTitle: "フリードリヒ1世 (神聖ローマ皇帝)", rank: "R", era: "中世", years: "1122年?〜1190年", region: "神聖ローマ帝国", color: "#B22222" },
  { id: "taira", name: "平清盛", wikiTitle: "平清盛", rank: "R", era: "中世", years: "1118年〜1181年", region: "日本", color: "#704214" },
  { id: "minamoto", name: "源頼朝", wikiTitle: "源頼朝", rank: "SR", era: "中世", years: "1147年〜1199年", region: "日本", color: "#556B2F" },
  { id: "hojo", name: "北条時宗", wikiTitle: "北条時宗", rank: "R", era: "中世", years: "1251年〜1284年", region: "日本", color: "#2F4F4F" },
  { id: "timur", name: "ティムール", wikiTitle: "ティムール", rank: "SR", era: "中世", years: "1336年〜1405年", region: "ティムール朝", color: "#A0432A" },
  { id: "zhu", name: "朱元璋（洪武帝）", wikiTitle: "朱元璋", rank: "SR", era: "中世〜近世", years: "1328年〜1398年", region: "明", color: "#9B1B30" },
  { id: "yiseonggye", name: "李成桂", wikiTitle: "李成桂", rank: "R", era: "中世〜近世", years: "1335年〜1408年", region: "朝鮮", color: "#2E7D4F" },
  { id: "sejong", name: "世宗（朝鮮王）", wikiTitle: "世宗 (朝鮮王)", rank: "SR", era: "中世〜近世", years: "1397年〜1450年", region: "朝鮮", color: "#1E7A4D" },
  { id: "mehmet2", name: "メフメト2世", wikiTitle: "メフメト2世", rank: "SR", era: "中世〜近世", years: "1432年〜1481年", region: "オスマン帝国", color: "#2F4F4F" },
  { id: "uesugi", name: "上杉謙信", wikiTitle: "上杉謙信", rank: "R", era: "戦国時代", years: "1530年〜1578年", region: "日本", color: "#1F4E79" },
  // --- 追加: 近世 ---
  { id: "babur", name: "バーブル", wikiTitle: "バーブル", rank: "R", era: "中世〜近世", years: "1483年〜1530年", region: "ムガル帝国", color: "#B5651D" },
  { id: "akbar", name: "アクバル", wikiTitle: "アクバル", rank: "SSR", era: "近世", years: "1542年〜1605年", region: "ムガル帝国", color: "#CC7722" },
  { id: "shahjahan", name: "シャー・ジャハーン", wikiTitle: "シャー・ジャハーン", rank: "R", era: "近世", years: "1592年〜1666年", region: "ムガル帝国", color: "#8A2BE2" },
  { id: "gustav2", name: "グスタフ2世アドルフ", wikiTitle: "グスタフ2世アドルフ", rank: "SR", era: "中世〜近世", years: "1594年〜1632年", region: "スウェーデン", color: "#4169E1" },
  { id: "ivan4", name: "イヴァン4世", wikiTitle: "イヴァン4世", rank: "SR", era: "近世", years: "1530年〜1584年", region: "ロシア", color: "#8B0000" },
  { id: "nurhaci", name: "ヌルハチ", wikiTitle: "ヌルハチ", rank: "SR", era: "中世〜近世", years: "1559年〜1626年", region: "後金（清）", color: "#9B2226" },
  { id: "willem1", name: "ウィレム1世（オラニエ公）", wikiTitle: "ウィレム1世 (オラニエ公)", rank: "R", era: "近世", years: "1533年〜1584年", region: "オランダ", color: "#B03A2E" },
  { id: "richelieu", name: "リシュリュー", wikiTitle: "リシュリュー", rank: "R", era: "近世", years: "1585年〜1642年", region: "フランス", color: "#7A4A2A" },
  { id: "cromwell", name: "オリバー・クロムウェル", wikiTitle: "オリバー・クロムウェル", rank: "SR", era: "近世", years: "1599年〜1658年", region: "イングランド", color: "#5C7A99" },
  { id: "kangxi", name: "康熙帝", wikiTitle: "康熙帝", rank: "SSR", era: "近世", years: "1654年〜1722年", region: "清", color: "#C9A227" },
  { id: "karl5", name: "カール5世", wikiTitle: "カール5世 (神聖ローマ皇帝)", rank: "SR", era: "近世", years: "1500年〜1558年", region: "神聖ローマ帝国", color: "#B8860B" },
  { id: "louis14", name: "ルイ14世", wikiTitle: "ルイ14世", rank: "SR", era: "近世", years: "1638年〜1715年", region: "フランス", color: "#DAA520" },
  { id: "maria", name: "マリア・テレジア", wikiTitle: "マリア・テレジア", rank: "SR", era: "近世", years: "1717年〜1780年", region: "ハプスブルク君主国", color: "#7B2D8B" },
  { id: "friedrich2", name: "フリードリヒ大王", wikiTitle: "フリードリヒ2世 (プロイセン王)", rank: "SSR", era: "近世", years: "1712年〜1786年", region: "プロイセン", color: "#2C5F8A" },
  { id: "louis16", name: "ルイ16世", wikiTitle: "ルイ16世", rank: "R", era: "近世", years: "1754年〜1793年", region: "フランス", color: "#46628A" },
  { id: "robespierre", name: "ロベスピエール", wikiTitle: "マクシミリアン・ロベスピエール", rank: "SR", era: "近代", years: "1758年〜1794年", region: "フランス", color: "#B22222" },
  { id: "toussaint", name: "トゥーサン・ルーヴェルチュール", wikiTitle: "トゥーサン・ルーヴェルチュール", rank: "R", era: "近世〜近代", years: "1743年〜1803年", region: "ハイチ", color: "#1E7A4D" },
  // --- 追加: 近代 ---
  { id: "jefferson", name: "トーマス・ジェファーソン", wikiTitle: "トーマス・ジェファーソン", rank: "SR", era: "近代", years: "1743年〜1826年", region: "アメリカ", color: "#708090" },
  { id: "jackson", name: "アンドリュー・ジャクソン", wikiTitle: "アンドリュー・ジャクソン", rank: "R", era: "近代", years: "1767年〜1845年", region: "アメリカ", color: "#8B4513" },
  { id: "metternich", name: "メッテルニヒ", wikiTitle: "クレメンス・フォン・メッテルニヒ", rank: "R", era: "近代", years: "1773年〜1859年", region: "オーストリア", color: "#5B7BB5" },
  { id: "garibaldi", name: "ジュゼッペ・ガリバルディ", wikiTitle: "ジュゼッペ・ガリバルディ", rank: "R", era: "近代", years: "1807年〜1882年", region: "イタリア", color: "#3CB371" },
  { id: "napoleon3", name: "ナポレオン3世", wikiTitle: "ナポレオン3世", rank: "R", era: "近代", years: "1808年〜1873年", region: "フランス", color: "#2244AA" },
  { id: "alexander2", name: "アレクサンドル2世", wikiTitle: "アレクサンドル2世", rank: "R", era: "近代", years: "1818年〜1881年", region: "ロシア", color: "#46628A" },
  { id: "victoria", name: "ヴィクトリア（英国女王）", wikiTitle: "ヴィクトリア (イギリス女王)", rank: "SSR", era: "近代", years: "1819年〜1901年", region: "イギリス", color: "#5C7A99" },
  { id: "lakshmi", name: "ラクシュミー・バーイー", wikiTitle: "ラクシュミー・バーイー", rank: "R", era: "近代", years: "1828年〜1858年", region: "インド", color: "#8E44AD" },
  { id: "saigo", name: "西郷隆盛", wikiTitle: "西郷隆盛", rank: "SR", era: "近代", years: "1828年〜1877年", region: "日本", color: "#556B2F" },
  { id: "okubo", name: "大久保利通", wikiTitle: "大久保利通", rank: "R", era: "近代", years: "1830年〜1878年", region: "日本", color: "#704214" },
  { id: "cixi", name: "西太后", wikiTitle: "西太后", rank: "SR", era: "近代", years: "1835年〜1908年", region: "清", color: "#B8860B" },
  { id: "yoshinobu", name: "徳川慶喜", wikiTitle: "徳川慶喜", rank: "R", era: "近代", years: "1837年〜1913年", region: "日本", color: "#2F4F4F" },
  { id: "rama5", name: "ラーマ5世", wikiTitle: "ラーマ5世", rank: "R", era: "近代", years: "1853年〜1910年", region: "タイ（シャム）", color: "#4169E1" },
  { id: "wilhelm2", name: "ヴィルヘルム2世（ドイツ皇帝）", wikiTitle: "ヴィルヘルム2世 (ドイツ皇帝)", rank: "SR", era: "近代", years: "1859年〜1941年", region: "ドイツ", color: "#4B5320" },
  { id: "yuan", name: "袁世凱", wikiTitle: "袁世凱", rank: "R", era: "近代", years: "1859年〜1916年", region: "中国", color: "#8B4513" },
  { id: "guangxu", name: "光緒帝", wikiTitle: "光緒帝", rank: "R", era: "近代", years: "1871年〜1908年", region: "清", color: "#556B2F" },
  { id: "clemenceau", name: "ジョルジュ・クレマンソー", wikiTitle: "ジョルジュ・クレマンソー", rank: "R", era: "近代", years: "1841年〜1929年", region: "フランス", color: "#3A6EA5" },
  { id: "ito", name: "伊藤博文", wikiTitle: "伊藤博文", rank: "SR", era: "近代", years: "1841年〜1909年", region: "日本", color: "#800020" },
  { id: "lloydgeorge", name: "デイヴィッド・ロイド・ジョージ", wikiTitle: "デイヴィッド・ロイド・ジョージ", rank: "R", era: "近代", years: "1863年〜1945年", region: "イギリス", color: "#4682B4" },
  { id: "nicholas2", name: "ニコライ2世", wikiTitle: "ニコライ2世", rank: "SR", era: "近代", years: "1868年〜1918年", region: "ロシア", color: "#6A5ACD" },
  { id: "wilson", name: "ウッドロウ・ウィルソン", wikiTitle: "ウッドロウ・ウィルソン", rank: "SR", era: "近代", years: "1856年〜1924年", region: "アメリカ", color: "#2C5F8A" },
  { id: "hindenburg", name: "パウル・フォン・ヒンデンブルク", wikiTitle: "パウル・フォン・ヒンデンブルク", rank: "R", era: "近代", years: "1847年〜1934年", region: "ドイツ", color: "#708090" },
  { id: "mussolini", name: "ベニート・ムッソリーニ", wikiTitle: "ベニート・ムッソリーニ", rank: "SR", era: "近代", years: "1883年〜1945年", region: "イタリア", color: "#B03A2E" },
  { id: "jinnah", name: "ムハンマド・アリー・ジンナー", wikiTitle: "ムハンマド・アリー・ジンナー", rank: "R", era: "近代", years: "1876年〜1948年", region: "パキスタン", color: "#2E7D32" },
  { id: "chiang", name: "蒋介石", wikiTitle: "蒋介石", rank: "SSR", era: "近代〜現代", years: "1888年〜1975年", region: "中国", color: "#1E5AA8" },
  // --- 追加: 現代 ---
  { id: "zhou", name: "周恩来", wikiTitle: "周恩来", rank: "SR", era: "近代〜現代", years: "1898年〜1976年", region: "中国", color: "#9B2226" },
  { id: "franco", name: "フランシスコ・フランコ", wikiTitle: "フランシスコ・フランコ", rank: "SR", era: "近代〜現代", years: "1892年〜1975年", region: "スペイン", color: "#B22222" },
  { id: "sukarno", name: "スカルノ", wikiTitle: "スカルノ", rank: "SR", era: "近代〜現代", years: "1901年〜1970年", region: "インドネシア", color: "#CC7722" },
  { id: "haile", name: "ハイレ・セラシエ1世", wikiTitle: "ハイレ・セラシエ1世", rank: "R", era: "近代〜現代", years: "1892年〜1975年", region: "エチオピア", color: "#B5651D" },
  { id: "bengurion", name: "ダヴィド・ベン＝グリオン", wikiTitle: "ダヴィド・ベン＝グリオン", rank: "R", era: "近代〜現代", years: "1886年〜1973年", region: "イスラエル", color: "#2C5F8A" },
  { id: "meir", name: "ゴルダ・メイア", wikiTitle: "ゴルダ・メイア", rank: "R", era: "近代〜現代", years: "1898年〜1978年", region: "イスラエル", color: "#4682B4" },
  { id: "truman", name: "ハリー・S・トルーマン", wikiTitle: "ハリー・S・トルーマン", rank: "SR", era: "近代〜現代", years: "1884年〜1972年", region: "アメリカ", color: "#2F4F4F" },
  { id: "eisenhower", name: "ドワイト・D・アイゼンハワー", wikiTitle: "ドワイト・D・アイゼンハワー", rank: "SR", era: "近代〜現代", years: "1890年〜1969年", region: "アメリカ", color: "#708090" },
  { id: "jfk", name: "ジョン・F・ケネディ", wikiTitle: "ジョン・F・ケネディ", rank: "SSR", era: "現代", years: "1917年〜1963年", region: "アメリカ", color: "#2C5F8A" },
  { id: "nixon", name: "リチャード・ニクソン", wikiTitle: "リチャード・ニクソン", rank: "R", era: "現代", years: "1913年〜1994年", region: "アメリカ", color: "#46628A" },
  { id: "reagan", name: "ロナルド・レーガン", wikiTitle: "ロナルド・レーガン", rank: "SR", era: "現代", years: "1911年〜2004年", region: "アメリカ", color: "#B8860B" },
  { id: "khrushchev", name: "ニキータ・フルシチョフ", wikiTitle: "ニキータ・フルシチョフ", rank: "SR", era: "現代", years: "1894年〜1971年", region: "ソ連", color: "#8B0000" },
  { id: "brezhnev", name: "レオニード・ブレジネフ", wikiTitle: "レオニード・ブレジネフ", rank: "R", era: "現代", years: "1906年〜1982年", region: "ソ連", color: "#A0432A" },
  { id: "nehru", name: "ジャワハルラール・ネルー", wikiTitle: "ジャワハルラール・ネルー", rank: "SR", era: "現代", years: "1889年〜1964年", region: "インド", color: "#CC7722" },
  { id: "indira", name: "インディラ・ガンディー", wikiTitle: "インディラ・ガンディー", rank: "SR", era: "現代", years: "1917年〜1984年", region: "インド", color: "#9B1B30" },
  { id: "dalai14", name: "ダライ・ラマ14世", wikiTitle: "ダライ・ラマ14世", rank: "SR", era: "現代", years: "1935年〜", region: "チベット", color: "#B8860B" },
  { id: "leeky", name: "リー・クアン・ユー", wikiTitle: "リー・クアン・ユー", rank: "SR", era: "現代", years: "1923年〜2015年", region: "シンガポール", color: "#1E5AA8" },
  { id: "mahathir", name: "マハティール・ビン・モハマド", wikiTitle: "マハティール・ビン・モハマド", rank: "SR", era: "現代", years: "1925年〜", region: "マレーシア", color: "#2E7D4F" },
  { id: "parkchunghee", name: "朴正煕", wikiTitle: "朴正煕", rank: "SR", era: "現代", years: "1917年〜1979年", region: "韓国", color: "#2F4F4F" },
  { id: "kimdaejung", name: "金大中", wikiTitle: "金大中", rank: "SR", era: "現代", years: "1924年〜2009年", region: "韓国", color: "#5B7BB5" },
  { id: "khomeini", name: "ルーホッラー・ホメイニー", wikiTitle: "ルーホッラー・ホメイニー", rank: "SR", era: "現代", years: "1900年?〜1989年", region: "イラン", color: "#556B2F" },
  { id: "nasser", name: "ガマール・アブドゥル＝ナーセル", wikiTitle: "ガマール・アブドゥル＝ナーセル", rank: "SR", era: "現代", years: "1918年〜1970年", region: "エジプト", color: "#C0392B" },
  { id: "sadat", name: "アンワル・アッ＝サーダート", wikiTitle: "アンワル・アッ＝サーダート", rank: "R", era: "現代", years: "1918年〜1981年", region: "エジプト", color: "#DAA520" },
  { id: "saddam", name: "サダム・フセイン", wikiTitle: "サダム・フセイン", rank: "R", era: "現代", years: "1937年〜2006年", region: "イラク", color: "#8B4513" },
  { id: "arafat", name: "ヤーセル・アラファート", wikiTitle: "ヤーセル・アラファート", rank: "R", era: "現代", years: "1929年〜2004年", region: "パレスチナ", color: "#1E7A4D" },
  { id: "gaddafi", name: "ムアンマル・アル＝カッザーフィー", wikiTitle: "ムアンマル・アル＝カッザーフィー", rank: "R", era: "現代", years: "1942年〜2011年", region: "リビア", color: "#3CB371" },
  { id: "nkrumah", name: "クワメ・エンクルマ", wikiTitle: "クワメ・エンクルマ", rank: "R", era: "現代", years: "1909年〜1972年", region: "ガーナ", color: "#B03A2E" },
  { id: "kenyatta", name: "ジョモ・ケニヤッタ", wikiTitle: "ジョモ・ケニヤッタ", rank: "R", era: "現代", years: "1890年?〜1978年", region: "ケニア", color: "#1E7A4D" },
  { id: "lumumba", name: "パトリス・ルムンバ", wikiTitle: "パトリス・ルムンバ", rank: "R", era: "現代", years: "1925年〜1961年", region: "コンゴ", color: "#CC7722" },
  { id: "amin", name: "イディ・アミン", wikiTitle: "イディ・アミン", rank: "R", era: "現代", years: "1925年?〜2003年", region: "ウガンダ", color: "#9B2226" },
  { id: "ceaushescu", name: "ニコラエ・チャウシェスク", wikiTitle: "ニコラエ・チャウシェスク", rank: "R", era: "現代", years: "1918年〜1989年", region: "ルーマニア", color: "#46628A" },
  { id: "aungsan", name: "アウンサン", wikiTitle: "アウンサン", rank: "R", era: "近代〜現代", years: "1915年〜1947年", region: "ビルマ（ミャンマー）", color: "#B5651D" },
  { id: "polpot", name: "ポル・ポト", wikiTitle: "ポル・ポト", rank: "R", era: "現代", years: "1925年〜1998年", region: "カンボジア", color: "#8B0000" },
  { id: "suharto", name: "スハルト", wikiTitle: "スハルト", rank: "R", era: "現代", years: "1921年〜2008年", region: "インドネシア", color: "#708090" },
  { id: "walesa", name: "レフ・ワレサ", wikiTitle: "レフ・ワレサ", rank: "SR", era: "現代", years: "1943年〜", region: "ポーランド", color: "#4169E1" },
  { id: "havel", name: "ヴァーツラフ・ハヴェル", wikiTitle: "ヴァーツラフ・ハヴェル", rank: "R", era: "現代", years: "1936年〜2011年", region: "チェコ", color: "#5B7BB5" },
  { id: "liushaoqi", name: "劉少奇", wikiTitle: "劉少奇", rank: "R", era: "現代", years: "1898年〜1969年", region: "中国", color: "#B03A2E" }
];

// 図鑑所持状態（全世界版専用キー world_unlocked_cards）
let unlockedCards = JSON.parse(localStorage.getItem('world_unlocked_cards') || '[]');

function unlockCard(id) {
  if (!unlockedCards.includes(id)) {
    unlockedCards.push(id);
    localStorage.setItem('world_unlocked_cards', JSON.stringify(unlockedCards));
  }
}

// --- 1.5 Wikipedia API から画像・説明を抽出 ---
const WIKI_CACHE_KEY = 'world_wiki_cache_v1';
let wikiCache = {};
try { wikiCache = JSON.parse(localStorage.getItem(WIKI_CACHE_KEY) || '{}'); } catch (e) { wikiCache = {}; }

function saveWikiCache() {
  try { localStorage.setItem(WIKI_CACHE_KEY, JSON.stringify(wikiCache)); } catch (e) {}
}

// 導入部から2文程度・最大100文字に整形
function truncateDesc(text) {
  if (!text) return '';
  var t = text.replace(/\s+/g, ' ').trim();
  var parts = t.split('。');
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].trim() === '') continue;
    if (out.length + parts[i].length > 100) break;
    out += parts[i] + '。';
  }
  return out || t.slice(0, 100);
}

// MediaWiki API: ページ画像（サムネイル）＋ 導入部の説明文を取得
async function fetchWikiBatch(titles) {
  const url = 'https://ja.wikipedia.org/w/api.php?origin=*&action=query&format=json&redirects=1' +
    '&prop=pageimages%7Cextracts&piprop=thumbnail&pithumbsize=600' +
    '&explaintext=1&exintro=1&exlimit=20' +
    '&titles=' + encodeURIComponent(titles.join('|'));
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.query) return;

  const norm = {}, red = {};
  (data.query.normalized || []).forEach(function(n) { norm[n.from] = n.to; });
  (data.query.redirects || []).forEach(function(r) { red[r.from] = r.to; });
  const pages = data.query.pages || {};
  const titleMap = {};
  Object.keys(pages).forEach(function(pid) { titleMap[pages[pid].title] = pages[pid]; });

  titles.forEach(function(t) {
    let resolved = norm[t] || t;
    resolved = red[resolved] || resolved;
    const page = titleMap[resolved];
    if (!page) return;
    wikiCache[t] = {
      img: page.thumbnail ? page.thumbnail.source : null,
      desc: truncateDesc(page.extract)
    };
  });
}

// 取得データをリーダーオブジェクトへ反映（失敗時は年代・地域から代替説明を生成）
function applyWikiData(leader) {
  const c = wikiCache[leader.wikiTitle];
  if (c && (c.img || c.desc)) {
    leader.imgUrl = c.img || null;
    leader.desc = c.desc || (leader.name + 'は' + leader.era + 'に' + leader.region + 'で活躍した指導者。');
    if (leader.rank === 'SSR' && c.img) leader.cutinUrl = c.img;
  } else {
    leader.imgUrl = null;
    leader.desc = leader.name + 'は' + leader.era + 'に' + leader.region + 'で活躍した指導者。';
  }
  leader.wikiLoaded = true;
}

// カード生成前にその指導者のデータを保証
async function ensureLeaderData(leader) {
  if (leader.wikiLoaded) return;
  if (!wikiCache[leader.wikiTitle]) {
    try {
      await fetchWikiBatch([leader.wikiTitle]);
      saveWikiCache();
    } catch (e) {
      console.warn('Wikipedia取得失敗:', leader.wikiTitle, e);
    }
  }
  applyWikiData(leader);
}

// ページ裏読み込みで全指導者分を事前取得（20件ずつ）
async function loadAllWikiData() {
  const missing = leaders.filter(function(l) { return !wikiCache[l.wikiTitle]; });
  for (let i = 0; i < missing.length; i += 20) {
    const chunk = missing.slice(i, i + 20).map(function(l) { return l.wikiTitle; });
    try {
      await fetchWikiBatch(chunk);
      saveWikiCache();
    } catch (e) {
      console.warn('Wikipedia一括取得に失敗', e);
    }
  }
  const zm = document.getElementById('zukan-modal');
  if (zm && zm.style.display === 'flex') renderZukan();
}

// --- 2. 3Dシーン初期化 ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 影の設定
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ライティング
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const mainDirLight = new THREE.DirectionalLight(0xffffff, 0.65);
mainDirLight.position.set(-5, 7, 5);
mainDirLight.castShadow = true;
mainDirLight.shadow.mapSize.width = 1024;
mainDirLight.shadow.mapSize.height = 1024;
mainDirLight.shadow.camera.near = 0.5;
mainDirLight.shadow.camera.far = 15;
mainDirLight.shadow.bias = -0.001;
scene.add(mainDirLight);

const fillLight = new THREE.DirectionalLight(0xd0d5dd, 0.25);
fillLight.position.set(5, -2, 3);
scene.add(fillLight);

const pointLight = new THREE.PointLight(0xffd700, 0.5, 8);
pointLight.position.set(0, 0, 3);
scene.add(pointLight);

// 影を受ける背面プレーン
const shadowPlaneGeo = new THREE.PlaneGeometry(20, 20);
const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
shadowPlane.position.z = -0.5;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// --- 3. ギザギザ形状作成ヘルパー ---
function createZigZagShape(width, height, teethCount, toothDepth) {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const toothWidth = width / teethCount;

  shape.moveTo(-halfW, 0);
  for (let i = 0; i < teethCount; i++) {
    const x1 = -halfW + i * toothWidth + toothWidth / 2;
    const y1 = toothDepth;
    const x2 = -halfW + (i + 1) * toothWidth;
    const y2 = 0;
    shape.lineTo(x1, y1);
    shape.lineTo(x2, y2);
  }
  shape.lineTo(halfW, -height);
  shape.lineTo(-halfW, -height);
  shape.closePath();

  return shape;
}

// --- 4. WORLD パックテクスチャ生成（ネイビー×ゴールド） ---
function createPackBodyTexture(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  const packGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  packGrad.addColorStop(0, '#16233f');
  packGrad.addColorStop(0.5, '#0e1830');
  packGrad.addColorStop(1, '#060b18');
  ctx.fillStyle = packGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '180px serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('🌐', 256, 330);

  ctx.font = 'bold 42px serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('全世界・全時代', 256, 510);

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText('指導者パック', 256, 565);

  callback(new THREE.CanvasTexture(canvas));
}

function createPackTopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  const topGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  topGrad.addColorStop(0, '#16233f');
  topGrad.addColorStop(1, '#0e1830');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  return new THREE.CanvasTexture(canvas);
}

// --- 5. カードテクスチャ描画 ---
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const characters = text.split('');
  let line = '';
  let currentY = y;

  for (let n = 0; n < characters.length; n++) {
    const testLine = line + characters[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = characters[n];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

function createCardBackTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = leader.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const innerGrad = ctx.createRadialGradient(256, 384, 50, 256, 384, 400);
  innerGrad.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
  innerGrad.addColorStop(0.8, 'rgba(10, 20, 40, 0.6)');
  innerGrad.addColorStop(1, 'rgba(4, 8, 20, 0.9)');
  ctx.fillStyle = innerGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 12;
  drawRoundedRect(ctx, 16, 16, canvas.width - 32, canvas.height - 32, 24);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '190px serif';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('🌐', 256, 384);

  callback(new THREE.CanvasTexture(canvas));
}

function createCardTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(256, 384, 50, 256, 384, 400);
  bgGrad.addColorStop(0, '#122240');
  bgGrad.addColorStop(0.7, '#0a1428');
  bgGrad.addColorStop(1, '#040810');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderCardContent = (img) => {
    const imgX = 35, imgY = 85, imgW = 442, imgH = 440, radius = 16;

    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.clip();

    if (img) {
      const imgRatio = img.width / img.height;
      const boxRatio = imgW / imgH;
      let sW = img.width, sH = img.height, sX = 0, sY = 0;

      if (imgRatio > boxRatio) {
        sW = img.height * boxRatio;
        sX = (img.width - sW) / 2;
      } else {
        sH = img.width / boxRatio;
        sY = (img.height - sH) * 0.25; // 顔が上寄りになるよう補正
      }
      ctx.drawImage(img, sX, sY, sW, sH, imgX, imgY, imgW, imgH);
    } else {
      const phGrad = ctx.createLinearGradient(imgX, imgY, imgX + imgW, imgY + imgH);
      phGrad.addColorStop(0, '#16324f');
      phGrad.addColorStop(1, '#0a1626');
      ctx.fillStyle = phGrad;
      ctx.fillRect(imgX, imgY, imgW, imgH);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '120px serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('🌐', imgX + imgW / 2, imgY + imgH / 2);
    }
    ctx.restore();

    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.stroke();

    ctx.lineWidth = 14;
    ctx.strokeStyle = leader.color;
    drawRoundedRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 28);
    ctx.stroke();

    ctx.fillStyle = leader.color;
    ctx.beginPath();
    ctx.arc(65, 65, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leader.rank, 65, 65);

    // 時代・年代バッジ（右上）
    const badgeText = leader.era + '｜' + leader.years;
    ctx.font = 'bold 20px sans-serif';
    const bw = Math.min(ctx.measureText(badgeText).width + 28, 400);
    const bx = canvas.width - 14 - bw;
    drawRoundedRect(ctx, bx, 40, bw, 44, 10);
    ctx.fillStyle = 'rgba(5, 10, 25, 0.78)';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, bx, 40, bw, 44, 10);
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.fillText(badgeText, bx + bw / 2, 62);

    const textAreaX = 35, textAreaY = 545, textAreaW = 442, textAreaH = 185;
    ctx.fillStyle = 'rgba(8, 14, 30, 0.92)';
    drawRoundedRect(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 12);
    ctx.fill();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold ' + (leader.name.length > 13 ? 21 : 28) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.name, 256, 583);

    ctx.fillStyle = '#dddddd';
    ctx.font = '19px sans-serif';
    wrapText(ctx, leader.desc, 256, 630, 410, 26);

    callback(new THREE.CanvasTexture(canvas));
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = leader.imgUrl || '';
  img.onload = () => renderCardContent(img);
  img.onerror = () => renderCardContent(null);
}

// --- 6. 3Dオブジェクト構築 ---
const mainGroup = new THREE.Group();
scene.add(mainGroup);

const packGroup = new THREE.Group();
mainGroup.add(packGroup);

const packBaseMat = new THREE.MeshPhysicalMaterial({
  color: 0x101c33,
  roughness: 0.35,
  metalness: 0.15,
  clearcoat: 0.3,
  clearcoatRoughness: 0.3
});

const packBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.18), packBaseMat);
packBody.position.set(0, -0.3, 0.09);
packBody.castShadow = true;
packBody.receiveShadow = true;
packGroup.add(packBody);

const packTopGroup = new THREE.Group();
packTopGroup.position.set(0, 1.4, 0.09);
packGroup.add(packTopGroup);

const topBlock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.18), packBaseMat);
topBlock.position.set(0, 0.25, 0);
topBlock.castShadow = true;
topBlock.receiveShadow = true;
packTopGroup.add(topBlock);

const toothShape = createZigZagShape(2.6, 0.3, 26, 0.12);
const extrudeSettings = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 };
const toothGeo = new THREE.ExtrudeGeometry(toothShape, extrudeSettings);
toothGeo.center();

const packTooth = new THREE.Mesh(toothGeo, packBaseMat);
packTooth.position.set(0, 0.65, 0);
packTooth.castShadow = true;
packTooth.receiveShadow = true;
packTopGroup.add(packTooth);

createPackBodyTexture((bodyTexture) => {
  const bodyFrontMat = new THREE.MeshPhysicalMaterial({ map: bodyTexture, roughness: 0.35, clearcoat: 0.3 });
  packBody.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, bodyFrontMat, packBaseMat];
});

const topTexture = createPackTopTexture();
const topFrontMat = new THREE.MeshPhysicalMaterial({ map: topTexture, roughness: 0.35, clearcoat: 0.3 });
topBlock.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, topFrontMat, packBaseMat];

const cutLineMat = new THREE.LineDashedMaterial({
  color: 0xffd700,
  dashSize: 0.08,
  gapSize: 0.06,
  linewidth: 2
});
const cutLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.4, 0.19), new THREE.Vector3(1.3, 1.4, 0.19)]),
  cutLineMat
);
cutLine.computeLineDistances();
packGroup.add(cutLine);

const cutHitBox = new THREE.Mesh(
  new THREE.BoxGeometry(3.0, 0.9, 0.6),
  new THREE.MeshBasicMaterial({ visible: false })
);
cutHitBox.position.set(0, 1.75, 0.1);
packGroup.add(cutHitBox);

const cardGeo = new THREE.BoxGeometry(2.2, 3.2, 0.05);
let backMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
let frontMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const cardMaterials = [backMat, backMat, backMat, backMat, frontMat, backMat];
const card = new THREE.Mesh(cardGeo, cardMaterials);
card.position.set(0, -0.3, 0);
card.scale.set(0.9, 0.9, 0.9);
card.castShadow = true;
card.receiveShadow = true;
card.visible = false;
mainGroup.add(card);

const particleCount = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 8;
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffd700, transparent: true, opacity: 0 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- 7. カットイン再生 ---
function playP5CutIn(cutinImgUrl, offset, onCompleteCallback) {
  const overlay = document.getElementById('cutin-overlay');
  const banner = document.getElementById('cutin-banner');
  const img = document.getElementById('cutin-img');

  img.src = cutinImgUrl;
  const pos = offset || "center 30%";
  img.style.objectPosition = pos;

  overlay.style.display = 'block';
  gsap.set(img, { transformOrigin: pos });

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.style.display = 'none';
      if (onCompleteCallback) onCompleteCallback();
    }
  });

  tl.fromTo(banner, { xPercent: 100, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.25, ease: "power4.out" })
    .fromTo(img, { scale: 2.2, x: 100 }, { scale: 1.0, x: 0, duration: 0.3, ease: "back.out(1.4)" }, "<")
    .to(banner, { duration: 1.2 })
    .to(banner, { xPercent: -100, opacity: 0, duration: 0.2, ease: "power3.in" });
}

// --- 8. イベント・スワイプ & 回転処理 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isDragging = false;
let startX = 0, startY = 0;
let isOpened = false;
let isCardInteractable = false;

let isCardDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cardVelocity = { x: 0, y: 0 };

const instruction = document.getElementById('instruction');
const resultText = document.getElementById('result-text');
const resetBtn = document.getElementById('reset-btn');

function checkIntersection(clientX, clientY, targetObj) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(targetObj, true);
  return intersects.length > 0;
}

function onPointerDown(e) {
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

  if (!isOpened) {
    if (checkIntersection(clientX, clientY, cutHitBox)) {
      isDragging = true;
      startX = clientX;
      startY = clientY;
    }
  } else if (isCardInteractable) {
    if (checkIntersection(clientX, clientY, card)) {
      isCardDragging = true;
      previousMousePosition = { x: clientX, y: clientY };
      cardVelocity = { x: 0, y: 0 };
    }
  }
}

function onPointerMove(e) {
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

  if (isDragging && !isOpened) {
    const deltaX = clientX - startX;
    const deltaY = Math.abs(clientY - startY);

    if (Math.abs(deltaX) > 60 && deltaY < 80) {
      isDragging = false;
      openPack(deltaX > 0 ? 1 : -1);
    }
  } else if (isCardDragging && isCardInteractable) {
    const deltaMove = {
      x: clientX - previousMousePosition.x,
      y: clientY - previousMousePosition.y
    };

    const deltaRotationQuaternion = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(
        deltaMove.y * 0.01,
        deltaMove.x * 0.01,
        0,
        'XYZ'
      ));

    card.quaternion.multiplyQuaternions(deltaRotationQuaternion, card.quaternion);

    cardVelocity = {
      x: deltaMove.x * 0.008,
      y: deltaMove.y * 0.008
    };

    previousMousePosition = { x: clientX, y: clientY };
  }
}

function onPointerUp() {
  isDragging = false;
  isCardDragging = false;
}

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown);
window.addEventListener('touchmove', onPointerMove);
window.addEventListener('touchend', onPointerUp);

async function openPack(direction) {
  if (isOpened) return;
  if (window.CardShop && !window.CardShop.spendCoins(100)) {
    instruction.innerText = 'コインが足りません！クイズで獲得できます';
    instruction.style.display = 'block';
    setTimeout(function() { if (!isOpened) instruction.innerText = 'パック上部をスワイプして開封！'; }, 2500);
    return;
  }
  isOpened = true;
  instruction.style.display = 'none';
  var pb = document.getElementById('purchase-btn');
  if (pb) pb.style.display = 'none';

  const picked = leaders[Math.floor(Math.random() * leaders.length)];
  unlockCard(picked.id);

  // Wikipediaから画像・説明を取得
  instruction.innerText = 'Wikipediaから指導者情報を取得中…';
  instruction.style.display = 'block';
  await ensureLeaderData(picked);
  instruction.style.display = 'none';

  createCardBackTexture(picked, (backTexture) => {
    cardMaterials[5] = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.3 });

    createCardTexture(picked, (frontTexture) => {
      cardMaterials[4] = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.3 });
      card.material = cardMaterials;

      const tl = gsap.timeline({
        onComplete: () => {
          resultText.innerHTML = `<span style="color:${picked.color}">【${picked.rank}】${picked.name}</span><br><small>${picked.era}｜${picked.years}（${picked.region}）</small><br><small>${picked.desc}</small>`;
          resetBtn.style.display = 'inline-block';
          isCardInteractable = true;
          instruction.innerText = "カードをドラッグして3D回転！";
          instruction.style.display = 'block';
        }
      });

      cutLine.visible = false;

      tl.to(packTopGroup.position, { x: direction * 4, y: 3.2, z: -2, duration: 0.6, ease: "power2.out" })
        .to(packTopGroup.rotation, { z: -direction * Math.PI * 2, duration: 0.6 }, "<")
        .call(() => {
          if (picked.rank === "SSR" && picked.cutinUrl) {
            tl.pause();
            playP5CutIn(picked.cutinUrl, picked.cutinOffset, () => {
              tl.resume();
            });
          }

          card.visible = true;
        }, null, "-=0.2")
        .to(card.position, { y: 1.3, z: 0.3, duration: 0.6, ease: "power2.out" })
        .to(packBody.position, { y: -4.5, duration: 0.5, ease: "power2.in" }, "+=0.1")
        .to(card.position, { y: 0, z: 2, duration: 0.8, ease: "back.out(1.2)" }, "<")
        .to(card.scale, { x: 1, y: 1, z: 1, duration: 0.8 }, "<")
        .to(card.rotation, { y: Math.PI * 6, duration: 1.0, ease: "power2.inOut" }, "<")
        .to(particleMat, { opacity: 1, duration: 0.4 }, "<")
        .to(particles.rotation, { y: Math.PI }, "<")
        .to(particleMat, { opacity: 0, duration: 0.6 });
    });
  });
}

resetBtn.addEventListener('click', () => {
  isOpened = false;
  isCardInteractable = false;
  resetBtn.style.display = 'none';
  instruction.innerText = 'パック上部をスワイプして開封！';
  instruction.style.display = 'block';
  var pb = document.getElementById('purchase-btn');
  if (pb) pb.style.display = '';
  resultText.innerText = '';

  packGroup.visible = true;
  packTopGroup.position.set(0, 1.4, 0.09);
  packTopGroup.rotation.set(0, 0, 0);
  packBody.position.set(0, -0.3, 0.09);
  cutLine.visible = true;

  card.visible = false;
  card.position.set(0, -0.3, 0);
  card.scale.set(0.9, 0.9, 0.9);
  card.quaternion.set(0, 0, 0, 1);
  cardVelocity = { x: 0, y: 0 };
});

// --- 9. 光源 ON / OFF 切り替え処理 ---
let isLightOn = true;
const lightBtn = document.getElementById('light-btn');

lightBtn.addEventListener('click', () => {
  isLightOn = !isLightOn;
  mainDirLight.visible = isLightOn;
  fillLight.visible = isLightOn;
  pointLight.visible = isLightOn;

  ambientLight.intensity = isLightOn ? 0.4 : 0.15;

  lightBtn.innerText = `光源: ${isLightOn ? 'ON' : 'OFF'}`;
  lightBtn.classList.toggle('off', !isLightOn);
});

// --- 10. 図鑑モーダル処理 ---
const zukanBtn = document.getElementById('zukan-btn');
const zukanModal = document.getElementById('zukan-modal');
const zukanCloseBtn = document.getElementById('zukan-close-btn');
const zukanGrid = document.getElementById('zukan-grid');

function renderZukan() {
  zukanGrid.innerHTML = '';
  leaders.forEach(leader => {
    const isUnlocked = unlockedCards.includes(leader.id);
    const cardEl = document.createElement('div');
    cardEl.className = `zukan-card ${isUnlocked ? 'unlocked' : 'locked'}`;

    if (isUnlocked) {
      cardEl.style.borderColor = leader.color;
      cardEl.innerHTML = `
        ${leader.imgUrl ? `<img src="${leader.imgUrl}" alt="${leader.name}">` : '<div class="zukan-noimg">🌐</div>'}
        <div class="card-info" style="border-top:2px solid ${leader.color}">
          ${leader.rank} ${leader.name}
          <span class="era-line">${leader.era}｜${leader.years}</span>
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <div class="question-mark">?</div>
        <div class="era-line">【 ${leader.era} 】</div>
      `;
    }
    zukanGrid.appendChild(cardEl);
  });
}

zukanBtn.addEventListener('click', () => {
  renderZukan();
  zukanModal.style.display = 'flex';
});

zukanCloseBtn.addEventListener('click', () => {
  zukanModal.style.display = 'none';
});

// --- 11. レンダリングループ ---
function animate() {
  requestAnimationFrame(animate);

  if (!isOpened) {
    const time = Date.now() * 0.005;
    const glow = (Math.sin(time) + 1) / 2;
    cutLineMat.color.setHSL(0.13, 1.0, 0.3 + glow * 0.3);

    mainGroup.rotation.y = Math.sin(Date.now() * 0.0015) * 0.08;
    mainGroup.rotation.x = Math.cos(Date.now() * 0.001) * 0.04;
  } else if (card.visible && isCardInteractable) {
    if (!isCardDragging) {
      if (Math.abs(cardVelocity.x) > 0.0001 || Math.abs(cardVelocity.y) > 0.0001) {
        const deltaRotationQuaternion = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(
            cardVelocity.y,
            cardVelocity.x,
            0,
            'XYZ'
          ));
        card.quaternion.multiplyQuaternions(deltaRotationQuaternion, card.quaternion);

        cardVelocity.x *= 0.95;
        cardVelocity.y *= 0.95;
      }
    }
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 12. Wikipediaデータの裏読み込み開始 ---
loadAllWikiData();
