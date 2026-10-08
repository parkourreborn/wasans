// The site's "Timing board" look (src/app/globals.css), translated to SVG: a
// true-neutral black ground, hairline rows, condensed uppercase labels in
// Saira Condensed over IBM Plex, and magenta for "this one" highlights. Gold,
// silver and bronze mean records and the top three, nothing else; tier colors
// only ever label tiers.

import { measure } from './metrics.js';

export const theme = {
    width: 1000,
    padding: 40,
    radius: 6,

    background: '#080808',
    surface: '#0e0e0e',
    surface2: '#141414',
    surface3: '#1b1b1b',
    line: '#262626',
    lineStrong: '#333333',
    rowLine: '#1c1c1c',

    text: '#f7f7f7',
    muted: '#b1b1b1',
    subtle: '#868686',
    faint: '#5a5a5a',

    primary: '#f960cf',
    primaryTint: '#1f1019',
    success: '#5edb81',
    destructive: '#ff645f',

    gold: '#f7c747',
    silver: '#c5cbd2',
    bronze: '#da915f',
};

// The Saira Condensed files name a family per weight -- and the Bold one
// calls itself "Saira Condensed Condensed". Its licence reserves the name, so
// the files are used as they are and each weight is picked by that family.
const DISPLAY_FAMILIES = {
    600: 'Saira Condensed SemiBold',
    700: 'Saira Condensed Condensed',
    800: 'Saira Condensed ExtraBold',
};

function familyAttr(family, weight) {
    if (family === 'display') return `'${DISPLAY_FAMILIES[weight] || DISPLAY_FAMILIES[700]}'`;
    if (family === 'mono') return "'IBM Plex Mono'";
    return "'IBM Plex Sans'";
}

export function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Text styles used across the cards, named after the site's utilities.
export const styles = {
    // .label-caps: Saira 600, 0.08em tracking, uppercase.
    caps: (size = 14) => ({ family: 'display', weight: 600, size, letterSpacing: size * 0.08, upper: true }),
    title: (size = 60) => ({ family: 'display', weight: 800, size, upper: true }),
    // .num: Plex Mono, tabular.
    num: (size = 17, weight = 500) => ({ family: 'mono', weight, size }),
    body: (size = 16, weight = 500) => ({ family: 'sans', weight, size }),
};

function prepare(value, style) {
    const raw = String(value ?? '');
    return style.upper ? raw.toUpperCase() : raw;
}

export function textWidth(value, style) {
    return measure(prepare(value, style), style);
}

// Ellipsises `value` so it fits in `maxWidth` when set in `style`.
export function fit(value, style, maxWidth) {
    const raw = prepare(value, style);
    if (measure(raw, style) <= maxWidth) return raw;

    const chars = [...raw];
    while (chars.length > 1 && measure(`${chars.join('')}…`, style) > maxWidth) chars.pop();
    return `${chars.join('').trimEnd()}…`;
}

export function text(value, { x = 0, y = 0, fill = theme.text, anchor = 'start', opacity = 1, ...style } = {}) {
    const { family = 'sans', weight = 400, size = 16, letterSpacing = 0 } = style;
    const attrs = [
        `x="${x}"`,
        `y="${y}"`,
        `font-family="${familyAttr(family, weight)}"`,
        `font-size="${size}"`,
        `font-weight="${weight}"`,
        `fill="${fill}"`,
    ];

    if (anchor !== 'start') attrs.push(`text-anchor="${anchor}"`);
    if (letterSpacing) attrs.push(`letter-spacing="${letterSpacing}"`);
    if (opacity !== 1) attrs.push(`opacity="${opacity}"`);

    return `<text ${attrs.join(' ')}>${escapeXml(prepare(value, style))}</text>`;
}

export function rect({ x = 0, y = 0, width = 0, height = 0, rx = 0, fill = 'none', stroke = null, strokeWidth = 1, opacity = 1 } = {}) {
    const attrs = [`x="${x}"`, `y="${y}"`, `width="${width}"`, `height="${height}"`, `fill="${fill}"`];
    if (rx) attrs.push(`rx="${rx}"`);
    if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${strokeWidth}"`);
    if (opacity !== 1) attrs.push(`opacity="${opacity}"`);
    return `<rect ${attrs.join(' ')} />`;
}

export function hline(x, y, width, color = theme.line) {
    return rect({ x, y, width, height: 1, fill: color });
}

export function svgDocument(width, height, body, defs = '') {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        defs ? `<defs>${defs}</defs>` : '',
        rect({ x: 0, y: 0, width, height, rx: theme.radius, fill: theme.background }),
        rect({ x: 0.5, y: 0.5, width: width - 1, height: height - 1, rx: theme.radius, stroke: theme.line }),
        body,
        '</svg>',
    ].join('');
}
