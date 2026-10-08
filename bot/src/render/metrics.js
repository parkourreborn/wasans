// Real glyph advance widths, read straight from the bundled TTFs. resvg has no
// text-measuring API, and the cards right-align badges against names and
// ellipsise long ones, so guessing widths per character isn't good enough
// across three very different families (a condensed display face, a
// proportional sans and a monospace).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

function tableOffsets(buffer) {
    const count = buffer.readUInt16BE(4);
    const tables = {};
    for (let i = 0; i < count; i += 1) {
        const record = 12 + i * 16;
        tables[buffer.toString('latin1', record, record + 4)] = buffer.readUInt32BE(record + 8);
    }
    return tables;
}

// Maps code points to glyph ids from a format 4 (BMP) or 12 (full) subtable.
function readCmap(buffer, cmapOffset) {
    const count = buffer.readUInt16BE(cmapOffset + 2);
    let best = null;

    for (let i = 0; i < count; i += 1) {
        const record = cmapOffset + 4 + i * 8;
        const platform = buffer.readUInt16BE(record);
        const encoding = buffer.readUInt16BE(record + 2);
        const offset = cmapOffset + buffer.readUInt32BE(record + 4);
        const format = buffer.readUInt16BE(offset);
        const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
        if (!unicode || (format !== 4 && format !== 12)) continue;
        if (!best || format === 12) best = { offset, format };
    }

    const map = new Map();
    if (!best) return map;
    const { offset, format } = best;

    if (format === 12) {
        const groups = buffer.readUInt32BE(offset + 12);
        for (let i = 0; i < groups; i += 1) {
            const group = offset + 16 + i * 12;
            const start = buffer.readUInt32BE(group);
            const end = buffer.readUInt32BE(group + 4);
            const glyph = buffer.readUInt32BE(group + 8);
            for (let code = start; code <= end && code < 0x30000; code += 1) map.set(code, glyph + code - start);
        }
        return map;
    }

    const segments = buffer.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const rangeOffsets = deltas + segments * 2;

    for (let i = 0; i < segments; i += 1) {
        const end = buffer.readUInt16BE(ends + i * 2);
        const start = buffer.readUInt16BE(starts + i * 2);
        const delta = buffer.readInt16BE(deltas + i * 2);
        const rangeOffset = buffer.readUInt16BE(rangeOffsets + i * 2);

        for (let code = start; code <= end && code !== 0xffff; code += 1) {
            let glyph;
            if (rangeOffset === 0) {
                glyph = (code + delta) & 0xffff;
            } else {
                const at = rangeOffsets + i * 2 + rangeOffset + (code - start) * 2;
                glyph = buffer.readUInt16BE(at);
                if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
            }
            if (glyph !== 0) map.set(code, glyph);
        }
    }

    return map;
}

function loadAdvances(file) {
    const buffer = fs.readFileSync(path.join(FONT_DIR, file));
    const tables = tableOffsets(buffer);
    const unitsPerEm = buffer.readUInt16BE(tables.head + 18);
    const metricCount = buffer.readUInt16BE(tables.hhea + 34);
    const cmap = readCmap(buffer, tables.cmap);

    const advanceOf = (glyph) => buffer.readUInt16BE(tables.hmtx + Math.min(glyph, metricCount - 1) * 4);
    const advances = new Map();
    for (const [code, glyph] of cmap) advances.set(code, advanceOf(glyph) / unitsPerEm);

    return advances;
}

const FILES = {
    sans: { 400: 'IBMPlexSans-Regular.ttf', 500: 'IBMPlexSans-Medium.ttf', 600: 'IBMPlexSans-SemiBold.ttf' },
    mono: { 400: 'IBMPlexMono-Regular.ttf', 500: 'IBMPlexMono-Medium.ttf', 600: 'IBMPlexMono-SemiBold.ttf' },
    display: { 600: 'SairaCondensed-SemiBold.ttf', 700: 'SairaCondensed-Bold.ttf', 800: 'SairaCondensed-ExtraBold.ttf' },
};

const loaded = new Map();

function advancesFor(family, weight) {
    const weights = FILES[family] || FILES.sans;
    const available = Object.keys(weights).map(Number);
    const nearest = available.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
    const file = weights[nearest];

    if (!loaded.has(file)) loaded.set(file, loadAdvances(file));
    return loaded.get(file);
}

// Width in px of `value` set in `family` ('sans' | 'mono' | 'display').
export function measure(value, { family = 'sans', size = 16, weight = 400, letterSpacing = 0 } = {}) {
    const advances = advancesFor(family, weight);
    let units = 0;
    let count = 0;

    for (const char of String(value ?? '')) {
        // Glyphs the font lacks render from nothing; count them as a typical
        // character so a name in another script still gets truncated.
        units += advances.get(char.codePointAt(0)) ?? 0.6;
        count += 1;
    }

    return units * size + letterSpacing * count;
}
