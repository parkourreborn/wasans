// Every multi-page or multi-tab reply is a session: which views it has (one
// per tab), which tab and page it's on, and who may drive it. Buttons carry
// the session id; pressing one updates the state and re-renders in place.
//
// Views load lazily, a page at a time, through the cached API client, so a
// command answers as soon as its first page is ready and paging past the
// first hundred rows works the same as paging through the first ten.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { cachedRender } from '../render/cache.js';
import { pngAttachment, renderPng } from '../render/png.js';

export const CUSTOM_ID_PREFIX = 'wasans-slash';
const MAX_SESSIONS = 1000;

const sessions = new Map();

export function componentId(action, sessionId, value = '') {
    return `${CUSTOM_ID_PREFIX}:${action}:${sessionId}:${value}`;
}

export function parseComponentId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) return null;

    const parts = customId.split(':');
    if (parts.length < 3) return null;

    return { action: parts[1], sessionId: parts[2] || null, value: parts.slice(3).join(':') || null };
}

// A view: { name, load(pageIndex) -> { card: { svg, width }, page, totalPages, options?, content? } }.
// `options` feed the "Open a run" menu: [{ label, value: 't:<uuid>' | 'c:<uuid>', description }].
export function createSession({ ownerId, views, tab, tabs = null, page = 0, links = [] }) {
    const id = randomUUID();
    sessions.set(id, { ownerId, views, tab: tab || Object.keys(views)[0], tabs, page, links });

    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    return id;
}

export function getSession(id) {
    return id ? sessions.get(id) || null : null;
}

function pagerRow(sessionId, page, totalPages) {
    const button = (label, target, disabled) =>
        new ButtonBuilder()
            .setCustomId(componentId('page', sessionId, `${target}${label === '⏮' || label === '⏭' ? ':jump' : ''}`))
            .setLabel(label)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);

    const buttons = [];
    if (totalPages > 2) buttons.push(button('⏮', 0, page === 0));
    buttons.push(button('◀', Math.max(page - 1, 0), page === 0));
    buttons.push(
        new ButtonBuilder()
            .setCustomId(componentId('noop', sessionId, 'label'))
            .setLabel(`${page + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
    );
    buttons.push(button('▶', Math.min(page + 1, totalPages - 1), page >= totalPages - 1));
    if (totalPages > 2) buttons.push(button('⏭', totalPages - 1, page >= totalPages - 1));

    return new ActionRowBuilder().addComponents(buttons);
}

function tabRow(sessionId, tabs, active) {
    return new ActionRowBuilder().addComponents(
        tabs.map((tab) =>
            new ButtonBuilder()
                .setCustomId(componentId('tab', sessionId, tab.key))
                .setLabel(tab.label)
                .setStyle(tab.key === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(tab.key === active),
        ),
    );
}

export function openMenuRow(options, placeholder = 'Open a run…') {
    const usable = options.filter((option) => option && option.value).slice(0, 25);
    if (usable.length === 0) return null;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(componentId('open', 'x'))
            .setPlaceholder(placeholder)
            .addOptions(
                usable.map((option) => ({
                    label: String(option.label).slice(0, 100),
                    value: option.value,
                    ...(option.description ? { description: String(option.description).slice(0, 100) } : {}),
                })),
            ),
    );
}

export function linkRow(links) {
    const buttons = links
        .filter((link) => link && (link.url || link.customId))
        .map((link) => {
            const button = new ButtonBuilder().setLabel(link.label);
            return link.url ? button.setStyle(ButtonStyle.Link).setURL(link.url) : button.setStyle(ButtonStyle.Secondary).setCustomId(link.customId);
        });
    return buttons.length > 0 ? new ActionRowBuilder().addComponents(buttons) : null;
}

// Builds the message for a session's current tab and page.
export async function renderSession(sessionId) {
    const session = sessions.get(sessionId);
    const view = session.views[session.tab];
    const result = await view.load(session.page);
    session.page = result.page;

    const png = cachedRender(`${sessionId}:${session.tab}:${result.page}`, () => renderPng(result.card.svg, result.card.width));
    const components = [];

    if (session.tabs) components.push(tabRow(sessionId, session.tabs, session.tab));
    if (result.totalPages > 1) components.push(pagerRow(sessionId, result.page, result.totalPages));
    const menu = openMenuRow(result.options || []);
    if (menu) components.push(menu);
    const links = linkRow(session.links);
    if (links) components.push(links);

    // `attachments: []` drops the previous image; without it Discord keeps
    // both the old and the new render on the message.
    return {
        content: result.content || '',
        embeds: [],
        files: [pngAttachment(png, `${view.name}-${result.page + 1}`)],
        attachments: [],
        components,
    };
}

// Clamps a requested page against a known row count.
export function clampPage(page, totalPages) {
    return Math.min(Math.max(Number(page) || 0, 0), Math.max(totalPages - 1, 0));
}

export function pageCount(total, pageSize) {
    return Math.max(Math.ceil((Number(total) || 0) / pageSize), 1);
}
