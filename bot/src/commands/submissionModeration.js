import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    GuildMember,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { botConfig } from '../config.js';
import { logger } from '../logger.js';

const CUSTOM_ID_PREFIX = 'submission-moderation';
const ACTION_APPROVE = 'approve';
const ACTION_REJECT = 'reject';
const ACTION_PENDING = 'pending';
const ACTION_TIME = 'time';
const ACTION_NOTE = 'note';
const ACTION_TIME_MODAL = 'time-modal';
const ACTION_NOTE_MODAL = 'note-modal';
const ACTION_DENY_MODAL = 'deny-modal';
const MODERATOR_NOTE_PREFIX = 'Moderator note:';

function buildCustomId(action, submissionId) {
    return `${CUSTOM_ID_PREFIX}:${action}:${submissionId}`;
}

function parseCustomId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) {
        return null;
    }

    const [, action, ...submissionParts] = customId.split(':');
    const submissionId = submissionParts.join(':');
    if (!action || !submissionId) {
        return null;
    }

    return { action, submissionId };
}

function getMessageLines(interaction) {
    const content = interaction.message?.content || '';
    return content.split('\n').map((line) => line.trim());
}

function getCurrentTimeValue(interaction) {
    const lines = getMessageLines(interaction);
    const comparisonLine = lines.find((line) => line.includes('->')) || '';
    const match = comparisonLine.match(/^\S+\s*->\s*([0-9]+(?:\.[0-9]+)?)$/);
    return match?.[1] || '';
}

function getCurrentNoteValue(interaction) {
    const lines = getMessageLines(interaction);
    const noteLine = lines.find((line) => line.startsWith(MODERATOR_NOTE_PREFIX));
    if (!noteLine) {
        return '';
    }

    const note = noteLine.slice(MODERATOR_NOTE_PREFIX.length).trim();
    return note === 'N/A' ? '' : note;
}

function buildApiErrorMessage(error, fallbackMessage) {
    const detail = error?.apiMessage || error?.message || fallbackMessage;
    return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage;
}

async function replyEphemeral(interaction, content) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() => {});
        return;
    }

    if (interaction.isRepliable()) {
        await interaction.reply({
            content,
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }
}

async function isModerator(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
        return false;
    }

    const moderatorRoleId = botConfig.moderator_role_id;
    if (!moderatorRoleId) {
        await logger.error('Moderator permission check failed', 'MODERATOR_ROLE_ID is not configured', {
            moderator_id: interaction.user.id,
        }).catch(() => {});
        return false;
    }

    let member = interaction.member instanceof GuildMember ? interaction.member : null;
    if (!member) {
        try {
            member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (error) {
            await logger.error('Moderator permission check failed', error.message, {
                moderator_id: interaction.user.id,
                stage: 'fetch_member',
            }).catch(() => {});
            return false;
        }
    }

    let moderatorRole = interaction.guild.roles.cache.get(moderatorRoleId) || null;
    if (!moderatorRole) {
        try {
            moderatorRole = await interaction.guild.roles.fetch(moderatorRoleId);
        } catch (error) {
            await logger.error('Moderator permission check failed', error.message, {
                moderator_id: interaction.user.id,
                moderator_role_id: moderatorRoleId,
                stage: 'fetch_role',
            }).catch(() => {});
        }
    }

    if (!moderatorRole) {
        await logger.error('Moderator permission check failed', `Moderator role ${moderatorRoleId} was not found`, {
            moderator_id: interaction.user.id,
            moderator_role_id: moderatorRoleId,
            stage: 'missing_role',
        }).catch(() => {});
        return false;
    }

    const isAdministrator = member.permissions.has(PermissionFlagsBits.Administrator);
    const rolePositionComparison = member.roles.highest.comparePositionTo(moderatorRole);
    return isAdministrator || rolePositionComparison >= 0;
}

async function ensureModerator(interaction) {
    const allowed = await isModerator(interaction);
    if (allowed) {
        return true;
    }

    await replyEphemeral(interaction, 'You do not have permission to use this.');
    return false;
}

async function patchSubmission(submissionId, body) {
    if (!botConfig.api_secret) {
        throw new Error('API_SECRET is not configured');
    }

    const response = await fetch(`${botConfig.submission_api_base_url}${encodeURIComponent(submissionId)}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${botConfig.api_secret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const rawBody = await response.text();
    let parsedBody;
    if (rawBody) {
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            parsedBody = null;
        }
    }

    if (!response.ok) {
        const apiMessage =
            parsedBody?.error?.message ||
            parsedBody?.error ||
            parsedBody?.message ||
            parsedBody?.detail ||
            rawBody ||
            `Request failed with status ${response.status}`;
        const error = new Error(apiMessage);
        error.apiMessage = apiMessage;
        error.status = response.status;
        throw error;
    }

    return parsedBody;
}

async function sendModerationRequest(interaction, submissionId, payload, successMessage) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const body = {
        discordId: interaction.user.id,
        ...payload,
    };

    try {
        await patchSubmission(submissionId, body);
        await interaction.editReply({ content: successMessage });
        await logger.log('Submission moderated', `Submission ${submissionId}`, {
            moderator_id: interaction.user.id,
            fields: Object.keys(payload).join(', '),
        }).catch(() => {});
    } catch (error) {
        console.error('Submission moderation failed:', error);
        await logger.error('Submission moderation failed', error.message, {
            submission_id: submissionId,
            moderator_id: interaction.user.id,
        }).catch(() => {});
        await interaction.editReply({
            content: buildApiErrorMessage(error, 'Failed to update submission'),
        });
    }

    return true;
}

function buildTimeModal(submissionId, value = '') {
    const input = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Submitted time')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    if (value) {
        input.setValue(value.slice(0, 4000));
    }

    return new ModalBuilder()
        .setCustomId(buildCustomId(ACTION_TIME_MODAL, submissionId))
        .setTitle('Change submitted time')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildNoteModal(submissionId, value = '') {
    const input = new TextInputBuilder()
        .setCustomId('moderator_note')
        .setLabel('Moderator note')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    if (value) {
        input.setValue(value.slice(0, 4000));
    }

    return new ModalBuilder()
        .setCustomId(buildCustomId(ACTION_NOTE_MODAL, submissionId))
        .setTitle('Add or edit moderator note')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildDenyReasonModal(submissionId) {
    const input = new TextInputBuilder()
        .setCustomId('deny_reason')
        .setLabel('Deny reason')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    return new ModalBuilder()
        .setCustomId(buildCustomId(ACTION_DENY_MODAL, submissionId))
        .setTitle('Reject submission')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

export function buildSubmissionModerationComponentsForSubmission(submissionId, state) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(buildCustomId(ACTION_APPROVE, submissionId))
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setDisabled(state === 'approved'),
            new ButtonBuilder()
                .setCustomId(buildCustomId(ACTION_PENDING, submissionId))
                .setLabel('Pending')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state === 'pending'),
            new ButtonBuilder()
                .setCustomId(buildCustomId(ACTION_REJECT, submissionId))
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(state === 'denied'),
            new ButtonBuilder()
                .setCustomId(buildCustomId(ACTION_TIME, submissionId))
                .setLabel('Change Time')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(buildCustomId(ACTION_NOTE, submissionId))
                .setLabel('Add/Edit Note')
                .setStyle(ButtonStyle.Secondary),
        ),
    ];
}

async function handleButtonInteraction(interaction, parsed) {
    if (!await ensureModerator(interaction)) {
        return true;
    }

    if (parsed.action === ACTION_APPROVE) {
        return await sendModerationRequest(interaction, parsed.submissionId, { state: 'approved' }, 'Submission approved.');
    }

    if (parsed.action === ACTION_REJECT) {
        await interaction.showModal(buildDenyReasonModal(parsed.submissionId));
        return true;
    }

    if (parsed.action === ACTION_PENDING) {
        return await sendModerationRequest(interaction, parsed.submissionId, { state: 'pending' }, 'Submission marked as pending.');
    }

    if (parsed.action === ACTION_TIME) {
        await interaction.showModal(buildTimeModal(parsed.submissionId, getCurrentTimeValue(interaction)));
        return true;
    }

    if (parsed.action === ACTION_NOTE) {
        await interaction.showModal(buildNoteModal(parsed.submissionId, getCurrentNoteValue(interaction)));
        return true;
    }

    return false;
}

async function handleModalInteraction(interaction, parsed) {
    if (!await ensureModerator(interaction)) {
        return true;
    }

    if (parsed.action === ACTION_TIME_MODAL) {
        const rawValue = interaction.fields.getTextInputValue('time').trim();
        const time = Number(rawValue);
        if (!rawValue || !Number.isFinite(time) || time <= 0) {
            await interaction.reply({
                content: 'Failed to update submission: time must be a positive number.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (rawValue === getCurrentTimeValue(interaction)) {
            await interaction.reply({
                content: 'No changes to save.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        return await sendModerationRequest(interaction, parsed.submissionId, { time }, 'Submission time updated.');
    }

    if (parsed.action === ACTION_DENY_MODAL) {
        const denyReason = interaction.fields.getTextInputValue('deny_reason').trim();

        if (!denyReason) {
            await interaction.reply({
                content: 'Failed to reject submission: a deny reason is required.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        return await sendModerationRequest(
            interaction,
            parsed.submissionId,
            { moderator_note: denyReason, state: 'denied' },
            'Submission rejected.',
        );
    }

    if (parsed.action === ACTION_NOTE_MODAL) {
        const moderatorNote = interaction.fields.getTextInputValue('moderator_note').trim();
        if (moderatorNote === getCurrentNoteValue(interaction)) {
            await interaction.reply({
                content: 'No changes to save.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        return await sendModerationRequest(
            interaction,
            parsed.submissionId,
            { moderator_note: moderatorNote },
            'Moderator note updated.',
        );
    }

    return false;
}

export async function handleSubmissionModerationInteraction(interaction) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed) {
        return false;
    }

    if (interaction.isButton()) {
        return await handleButtonInteraction(interaction, parsed);
    }

    if (interaction.isModalSubmit()) {
        return await handleModalInteraction(interaction, parsed);
    }

    return false;
}
