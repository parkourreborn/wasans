import { Resvg } from '@resvg/resvg-js';
import { AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');

// Rendering at 2x keeps the text crisp in Discord, which downscales the
// attachment to the message width.
const SCALE = 2;

export function renderPng(svg, width) {
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: Math.round(width * SCALE) },
        font: {
            fontDirs: [FONT_DIR],
            loadSystemFonts: false,
            defaultFontFamily: 'Inter',
        },
    });

    return resvg.render().asPng();
}

export function pngAttachment(png, name) {
    return new AttachmentBuilder(png, { name: `${name}.png` });
}

export function renderAttachment(svg, width, name) {
    return pngAttachment(renderPng(svg, width), name);
}
