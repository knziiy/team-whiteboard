/**
 * Konva hit detection patch for Brave browser fingerprinting protection.
 *
 * Brave の Canvas Fingerprinting Protection は getImageData() の RGB/Alpha 値に
 * 微小なノイズ (±1〜2) を加えるため、Konva の colorKey ベースの hit detection が
 * 一部のシェイプで失敗する。
 *
 * このパッチは Layer._getIntersection をオーバーライドし:
 *   1. Alpha 判定を緩和 (=== 255 → >= 250)
 *   2. 完全一致で見つからない場合に RGB ±2 の範囲で fuzzy マッチング
 */
import Konva from 'konva';
import { shapes } from 'konva/lib/Shape';
import { Util } from 'konva/lib/Util';

const HASH = '#';
const TOLERANCE = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LayerProto = Konva.Layer.prototype as any;

LayerProto._getIntersection = function (pos: { x: number; y: number }) {
  const ratio = this.hitCanvas.pixelRatio;
  const p = this.hitCanvas.context.getImageData(
    Math.round(pos.x * ratio),
    Math.round(pos.y * ratio),
    1,
    1,
  ).data;
  const alpha = p[3];

  // Alpha >= 250 をオペークとして扱う（オリジナルは === 255）
  if (alpha >= 250) {
    // まず完全一致を試す
    const colorKey = Util._rgbToHex(p[0], p[1], p[2]);
    const exactShape = shapes[HASH + colorKey];
    if (exactShape) {
      return { shape: exactShape };
    }

    // Fuzzy match: ±TOLERANCE の範囲で colorKey を検索
    for (let dr = -TOLERANCE; dr <= TOLERANCE; dr++) {
      for (let dg = -TOLERANCE; dg <= TOLERANCE; dg++) {
        for (let db = -TOLERANCE; db <= TOLERANCE; db++) {
          if (dr === 0 && dg === 0 && db === 0) continue;
          const r = p[0] + dr;
          const g = p[1] + dg;
          const b = p[2] + db;
          if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
          const key = Util._rgbToHex(r, g, b);
          const s = shapes[HASH + key];
          if (s) return { shape: s };
        }
      }
    }

    return { antialiased: true };
  } else if (alpha > 0) {
    return { antialiased: true };
  }
  return {};
};
