import { avatar, contentWidth, footer, footerHeight, pbBadge, statusBadge, tierText, wrBadge } from '../card.js';
import { measure } from '../metrics.js';
import { escapeXml, fit, hline, rect, styles, svgDocument, text, textWidth, theme } from '../theme.js';

// One run on its own, laid out like the site's run page (/submissions/[uuid]):
// badges, the trial and time as one big headline, the player, then the
// video's preview frame beside a panel of facts, and the moderator's note.
const LEFT = theme.padding;
const PREVIEW_W = 540;
const PREVIEW_H = Math.round((PREVIEW_W * 9) / 16);
const SIDE_X = LEFT + PREVIEW_W + 32;
const SIDE_W = theme.width - theme.padding - SIDE_X;
const FACT_H = 46;

function wrapLines(value, style, maxWidth, maxLines) {
    const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure(candidate, style) <= maxWidth || !current) {
            current = candidate;
            continue;
        }
        lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);

    if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
        lines[maxLines - 1] = fit(`${lines[maxLines - 1]}…`, style, maxWidth);
    }
    return lines.map((line) => fit(line, style, maxWidth));
}

function preview({ dataUri, placeholder }, y) {
    const parts = [rect({ x: LEFT, y, width: PREVIEW_W, height: PREVIEW_H, fill: theme.surface, stroke: theme.line })];

    if (dataUri) {
        parts.push(
            `<clipPath id="preview-clip"><rect x="${LEFT + 1}" y="${y + 1}" width="${PREVIEW_W - 2}" height="${PREVIEW_H - 2}" /></clipPath>`,
            `<image x="${LEFT + 1}" y="${y + 1}" width="${PREVIEW_W - 2}" height="${PREVIEW_H - 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#preview-clip)" xlink:href="${escapeXml(dataUri)}" />`,
            // A play mark, so it reads as "there's a video behind this".
            `<circle cx="${LEFT + PREVIEW_W / 2}" cy="${y + PREVIEW_H / 2}" r="30" fill="#080808" opacity="0.72" />`,
            `<path d="M${LEFT + PREVIEW_W / 2 - 9} ${y + PREVIEW_H / 2 - 13} l23 13 l-23 13 z" fill="${theme.text}" />`,
        );
    } else {
        parts.push(text(placeholder || 'No preview', { x: LEFT + PREVIEW_W / 2, y: y + PREVIEW_H / 2 + 6, fill: theme.subtle, anchor: 'middle', ...styles.caps(16) }));
    }

    return parts.join('');
}

function facts(items, y) {
    const parts = [hline(SIDE_X, y, SIDE_W)];
    items.forEach((item, index) => {
        const top = y + index * FACT_H;
        const baseline = top + FACT_H / 2 + 6;
        const labelStyle = styles.caps(14);
        parts.push(text(item.label, { x: SIDE_X, y: baseline, fill: theme.subtle, ...labelStyle }));

        const valueStyle = item.mono === false ? styles.body(16, 500) : styles.num(17, item.strong ? 600 : 500);
        const room = SIDE_W - textWidth(item.label, labelStyle) - 16;
        parts.push(text(fit(item.value, valueStyle, room), { x: SIDE_X + SIDE_W, y: baseline, fill: item.color || theme.text, anchor: 'end', ...valueStyle }));
        parts.push(hline(SIDE_X, top + FACT_H, SIDE_W, theme.rowLine));
    });
    return parts.join('');
}

// {
//   eyebrow, meta, label, value, state, isWr, isPb,
//   player: { name, tier, avatarDataUri },
//   preview: { dataUri, placeholder },
//   facts: [{ label, value, color?, strong?, mono? }],
//   note: { text, by } | null,
// }
export function renderSubmissionCard({ eyebrow, meta, label, value, state, isWr, isPb, player, preview: previewImage, facts: factItems, note }) {
    const parts = [];
    const capsStyle = styles.caps(15);

    parts.push(text(eyebrow, { x: LEFT, y: 56, fill: theme.subtle, ...capsStyle }));
    if (meta) parts.push(text(meta, { x: theme.width - theme.padding, y: 56, fill: theme.subtle, anchor: 'end', ...capsStyle }));

    // Badges.
    let badgeX = LEFT;
    const badgeY = 92;
    const status = statusBadge(state, badgeX, badgeY);
    parts.push(status.svg);
    badgeX += status.width + 8;
    if (isWr) {
        const badge = wrBadge(badgeX, badgeY);
        parts.push(badge.svg);
        badgeX += badge.width + 8;
    } else if (isPb) {
        parts.push(pbBadge(badgeX, badgeY).svg);
    }

    // Headline: "CRYSTAL 11.111", on one line when it fits.
    const titleStyle = styles.title(76);
    const valueStyle = styles.num(54, 600);
    const valueWidth = textWidth(value, valueStyle);
    const sameLine = textWidth(label, titleStyle) + 28 + valueWidth <= contentWidth;
    let y = 178;

    if (sameLine) {
        parts.push(text(label, { x: LEFT, y, fill: theme.text, ...titleStyle }));
        parts.push(text(value, { x: LEFT + textWidth(label, titleStyle) + 28, y, fill: isWr ? theme.gold : theme.text, ...valueStyle }));
    } else {
        parts.push(text(fit(label, titleStyle, contentWidth), { x: LEFT, y, fill: theme.text, ...titleStyle }));
        y += 58;
        parts.push(text(value, { x: LEFT, y, fill: isWr ? theme.gold : theme.text, ...valueStyle }));
    }

    // Player line.
    y += 26;
    const avatarSize = 34;
    parts.push(avatar({ id: 'run-avatar', x: LEFT, y, size: avatarSize, dataUri: player.avatarDataUri, name: player.name }));
    const nameStyle = styles.body(19, 500);
    const shownName = fit(player.name, nameStyle, contentWidth - 260);
    parts.push(text(shownName, { x: LEFT + avatarSize + 12, y: y + 24, fill: theme.text, ...nameStyle }));
    if (player.tier) parts.push(tierText(player.tier, LEFT + avatarSize + 12 + textWidth(shownName, nameStyle) + 16, y + 24, { size: 16 }));

    y += avatarSize + 24;
    parts.push(hline(LEFT, y, contentWidth));
    y += 24;

    parts.push(preview(previewImage || {}, y));
    parts.push(facts(factItems, y));
    y += Math.max(PREVIEW_H, factItems.length * FACT_H);

    if (note?.text) {
        const noteStyle = styles.body(16, 400);
        const lines = wrapLines(note.text, noteStyle, contentWidth - 40, 3);
        const boxHeight = 52 + lines.length * 24;
        y += 24;
        parts.push(rect({ x: LEFT, y, width: contentWidth, height: boxHeight, fill: theme.surface, stroke: theme.line }));
        parts.push(text(note.by ? `Moderator note · ${note.by}` : 'Moderator note', { x: LEFT + 20, y: y + 30, fill: theme.subtle, ...styles.caps(14) }));
        lines.forEach((line, index) => parts.push(text(line, { x: LEFT + 20, y: y + 58 + index * 24, fill: theme.text, ...noteStyle })));
        y += boxHeight;
    }

    const height = y + 16 + footerHeight();
    parts.push(footer(height));

    return { svg: svgDocument(theme.width, height, parts.join('')), width: theme.width };
}
