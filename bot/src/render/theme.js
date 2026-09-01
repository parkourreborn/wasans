// Shared visual language for every rendered card. Keeping the palette and the
// text primitives in one place is what lets each command own a small template
// file instead of repeating the same chrome.

export const theme = {
    width: 920,
    radius: 28,

    background: '#0a0a0c',
    backgroundEdge: '#101014',
    border: '#26262d',

    panel: '#141418',
    panelBorder: '#212128',
    panelStrong: '#1b1b21',

    accent: '#e02222',
    accentDim: '#8d1616',
    accentSoft: '#2a1113',

    text: '#ffffff',
    muted: '#8a8a95',
    dim: '#5a5a66',

    gold: '#f0c245',
    silver: '#c6cad4',
    bronze: '#cd8244',

    approved: '#3fb950',
    pending: '#d99a26',
    denied: '#e5534b',
};

export const font = "Inter, 'DejaVu Sans', sans-serif";

// Rough per-glyph advance widths (as a fraction of font size) for Inter.
// resvg gives us no measuring API, so this is what ellipsis truncation and
// right-aligned pill sizing are based on. It only has to be close enough that
// text never overruns its box.
const NARROW = new Set([...`iIl1.,:;'"|!/\\()[]{}ijtfr `]);
const WIDE = new Set([...'MWmw@%']);

export function textWidth(value, fontSize, weight = 400) {
    const text = String(value ?? '');
    let units = 0;

    for (const char of text) {
        if (NARROW.has(char)) units += 0.32;
        else if (WIDE.has(char)) units += 0.88;
        else if (char >= '0' && char <= '9') units += 0.6;
        else if (char === char.toUpperCase() && char !== char.toLowerCase()) units += 0.68;
        else units += 0.56;
    }

    // Heavier weights are noticeably wider in Inter.
    const weightFactor = weight >= 900 ? 1.06 : weight >= 600 ? 1.03 : 1;
    return units * fontSize * weightFactor;
}

export function fitText(value, fontSize, maxWidth, weight = 400) {
    const text = String(value ?? '');
    if (textWidth(text, fontSize, weight) <= maxWidth) return text;

    let result = text;
    while (result.length > 1 && textWidth(`${result}…`, fontSize, weight) > maxWidth) {
        result = result.slice(0, -1);
    }

    return `${result.trimEnd()}…`;
}

export function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function text(value, options = {}) {
    const {
        x = 0,
        y = 0,
        size = 16,
        weight = 400,
        fill = theme.text,
        anchor = 'start',
        letterSpacing = 0,
        opacity = 1,
    } = options;

    const attrs = [
        `x="${x}"`,
        `y="${y}"`,
        `font-family="${font}"`,
        `font-size="${size}"`,
        `font-weight="${weight}"`,
        `fill="${fill}"`,
        `text-anchor="${anchor}"`,
    ];

    if (letterSpacing) attrs.push(`letter-spacing="${letterSpacing}"`);
    if (opacity !== 1) attrs.push(`opacity="${opacity}"`);

    return `<text ${attrs.join(' ')}>${escapeXml(value)}</text>`;
}

export function rect(options = {}) {
    const { x = 0, y = 0, width = 0, height = 0, rx = 0, fill = 'none', stroke = null, strokeWidth = 1, opacity = 1 } = options;

    const attrs = [
        `x="${x}"`,
        `y="${y}"`,
        `width="${width}"`,
        `height="${height}"`,
        `rx="${rx}"`,
        `fill="${fill}"`,
    ];

    if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${strokeWidth}"`);
    if (opacity !== 1) attrs.push(`opacity="${opacity}"`);

    return `<rect ${attrs.join(' ')} />`;
}

// A rounded label chip; width is derived from the measured text so the padding
// stays even no matter what goes inside it.
export function pill(label, options = {}) {
    const {
        x = 0,
        y = 0,
        height = 30,
        size = 13,
        weight = 700,
        fill = theme.panelStrong,
        stroke = null,
        color = theme.text,
        paddingX = 14,
        letterSpacing = 0.4,
        anchor = 'start',
    } = options;

    const width = Math.ceil(textWidth(label, size, weight) + letterSpacing * String(label).length + paddingX * 2);
    const left = anchor === 'end' ? x - width : x;

    return [
        rect({ x: left, y, width, height, rx: height / 2, fill, stroke, strokeWidth: 1 }),
        text(label, {
            x: left + width / 2,
            y: y + height / 2 + size * 0.36,
            size,
            weight,
            fill: color,
            anchor: 'middle',
            letterSpacing,
        }),
    ].join('');
}

export function svgDocument(width, height, body) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        '<defs>',
        `<linearGradient id="page-bg" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0" stop-color="${theme.backgroundEdge}" />`,
        `<stop offset="1" stop-color="${theme.background}" />`,
        '</linearGradient>',
        `<linearGradient id="accent-fade" x1="0" y1="0" x2="1" y2="0">`,
        `<stop offset="0" stop-color="${theme.accent}" stop-opacity="0.9" />`,
        `<stop offset="1" stop-color="${theme.accent}" stop-opacity="0" />`,
        '</linearGradient>',
        '</defs>',
        rect({ x: 0, y: 0, width, height, rx: theme.radius, fill: 'url(#page-bg)' }),
        rect({ x: 1, y: 1, width: width - 2, height: height - 2, rx: theme.radius - 1, fill: 'none', stroke: theme.border }),
        rect({ x: theme.radius, y: 0, width: width - theme.radius * 2, height: 3, rx: 1.5, fill: 'url(#accent-fade)' }),
        body,
        '</svg>',
    ].join('');
}
