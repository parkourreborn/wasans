import { footer, layout } from '../card.js';
import { nameInitials } from '../avatar.js';
import { fitText, pill, rect, svgDocument, text, theme } from '../theme.js';

// The stats card is a profile sheet rather than a list: identity block on top,
// a row of headline tiles, then the player's most recent run.
const HEIGHT = 476;
const AVATAR_R = 52;
const AVATAR_CX = layout.padding + 68;
const AVATAR_CY = 104;
const IDENTITY_X = AVATAR_CX + AVATAR_R + 28;
const TILE_Y = 214;
const TILE_HEIGHT = 96;
const LATEST_Y = 330;
const LATEST_HEIGHT = 76;

function avatar(dataUri, name) {
    const clip = [
        '<clipPath id="avatar-clip">',
        `<circle cx="${AVATAR_CX}" cy="${AVATAR_CY}" r="${AVATAR_R}" />`,
        '</clipPath>',
    ].join('');

    const ring = `<circle cx="${AVATAR_CX}" cy="${AVATAR_CY}" r="${AVATAR_R + 3}" fill="none" stroke="${theme.accent}" stroke-width="3" />`;

    if (dataUri) {
        return [
            clip,
            `<image x="${AVATAR_CX - AVATAR_R}" y="${AVATAR_CY - AVATAR_R}" width="${AVATAR_R * 2}" height="${AVATAR_R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" xlink:href="${dataUri}" />`,
            ring,
        ].join('');
    }

    return [
        `<circle cx="${AVATAR_CX}" cy="${AVATAR_CY}" r="${AVATAR_R}" fill="${theme.panelStrong}" />`,
        text(nameInitials(name), {
            x: AVATAR_CX,
            y: AVATAR_CY + 13,
            size: 36,
            weight: 900,
            fill: theme.muted,
            anchor: 'middle',
        }),
        ring,
    ].join('');
}

function tile(index, count, label, value, { accent = false } = {}) {
    const available = theme.width - layout.padding * 2;
    const gap = 12;
    const width = (available - gap * (count - 1)) / count;
    const x = layout.padding + index * (width + gap);

    return [
        rect({ x, y: TILE_Y, width, height: TILE_HEIGHT, rx: 16, fill: theme.panel, stroke: theme.panelBorder }),
        text(String(label).toUpperCase(), {
            x: x + 18,
            y: TILE_Y + 32,
            size: 11,
            weight: 900,
            fill: theme.muted,
            letterSpacing: 1.6,
        }),
        text(fitText(value, 28, width - 36, 900), {
            x: x + 18,
            y: TILE_Y + 72,
            size: 28,
            weight: 900,
            fill: accent ? theme.accent : theme.text,
        }),
    ].join('');
}

export function renderStatsCard({
    name,
    handle = null,
    avatarDataUri = null,
    score,
    rank = null,
    tiles = [],
    latest = null,
}) {
    const identityLimit = theme.width - layout.padding - 240 - IDENTITY_X;

    const body = [
        avatar(avatarDataUri, name),

        text('WASANS · PLAYER PROFILE', {
            x: IDENTITY_X,
            y: 72,
            size: 12,
            weight: 900,
            fill: theme.accent,
            letterSpacing: 2.4,
        }),
        text(fitText(name, 36, identityLimit, 900), {
            x: IDENTITY_X,
            y: 112,
            size: 36,
            weight: 900,
            fill: theme.text,
        }),
        handle
            ? text(fitText(handle, 15, identityLimit, 500), {
                  x: IDENTITY_X,
                  y: 138,
                  size: 15,
                  weight: 500,
                  fill: theme.muted,
              })
            : '',

        text('SCORE', {
            x: theme.width - layout.padding,
            y: 72,
            size: 12,
            weight: 900,
            fill: theme.muted,
            letterSpacing: 2.4,
            anchor: 'end',
        }),
        text(score, {
            x: theme.width - layout.padding,
            y: 122,
            size: 46,
            weight: 900,
            fill: theme.accent,
            anchor: 'end',
        }),
        rank
            ? pill(rank, {
                  x: theme.width - layout.padding,
                  y: 138,
                  anchor: 'end',
                  height: 26,
                  size: 12,
                  fill: theme.accentSoft,
                  stroke: theme.accentDim,
                  color: '#ff8a8a',
              })
            : '',

        rect({ x: layout.padding, y: 182, width: theme.width - layout.padding * 2, height: 1, fill: theme.panelBorder }),
    ];

    tiles.forEach((entry, index) => {
        body.push(tile(index, tiles.length, entry.label, entry.value, { accent: entry.accent }));
    });

    body.push(
        rect({
            x: layout.padding,
            y: LATEST_Y,
            width: theme.width - layout.padding * 2,
            height: LATEST_HEIGHT,
            rx: 16,
            fill: theme.panel,
            stroke: theme.panelBorder,
        }),
        rect({ x: layout.padding + 1, y: LATEST_Y + 16, width: 3, height: LATEST_HEIGHT - 32, rx: 1.5, fill: theme.accent }),
        text('LATEST SUBMISSION', {
            x: layout.padding + 24,
            y: LATEST_Y + 30,
            size: 11,
            weight: 900,
            fill: theme.muted,
            letterSpacing: 1.6,
        }),
        text(fitText(latest?.label || 'No submissions yet', 20, theme.width - layout.padding * 2 - 220, 700), {
            x: layout.padding + 24,
            y: LATEST_Y + 60,
            size: 20,
            weight: 700,
            fill: latest ? theme.text : theme.dim,
        }),
    );

    if (latest?.time) {
        body.push(
            text(latest.time, {
                x: theme.width - layout.padding - 24,
                y: LATEST_Y + 52,
                size: 26,
                weight: 900,
                fill: theme.accent,
                anchor: 'end',
            }),
        );
    }

    body.push(footer(HEIGHT, {}));

    return { svg: svgDocument(theme.width, HEIGHT, body.join('')), width: theme.width };
}
