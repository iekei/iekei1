/* マップ背景 */
#map {
  flex: 1;
  height: 100%;
  background: #000;
}

/* プロヴィンス（地区）の境界線を強調するCSSクラス */
.leaflet-interactive {
  transition: fill 0.2s ease, fill-opacity 0.2s ease, stroke 0.2s ease;
  cursor: pointer;
}

/* ツールチップデザイン */
.hoi4-tooltip {
  background: rgba(15, 20, 25, 0.95) !important;
  border: 1.5px solid #d4af37 !important;
  color: #e0e6ed !important;
  font-size: 13px !important;
  border-radius: 4px !important;
  padding: 8px 12px !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.8) !important;
}

.resource-badge {
  display: inline-block;
  padding: 2px 6px;
  margin: 2px;
  border-radius: 3px;
  background: #2a343d;
  font-size: 11px;
  border: 1px solid #4a5568;
}
