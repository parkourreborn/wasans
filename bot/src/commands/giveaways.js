import { MessageFlags } from 'discord.js';
import { parseGiveawayCustomId } from '../giveaways/render.js';
import { fetchPlayerUuidByDiscordId, joinGiveawayAsPlayer } from '../wasansApi.js';

async function handleJoinButton(interaction, giveawayUuid) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let playerUuid;
    try {
        playerUuid = await fetchPlayerUuidByDiscordId(interaction.user.id);
    } catch (error) {
        console.error('Failed to resolve player for giveaway join:', error);
        await interaction.editReply('Failed to look up your account. Please try again.');
        return true;
    }

    if (!playerUuid) {
        await interaction.editReply(
            "You haven't linked your Discord account to a wasans account yet. Log in at https://wasans.tully.sh/ with Discord, then try again.",
        );
        return true;
    }

    try {
        await joinGiveawayAsPlayer(giveawayUuid, playerUuid);
        await interaction.editReply("🎉 You're in! Good luck.");
    } catch (error) {
        console.error('Failed to join giveaway:', error);
        await interaction.editReply(error.message || 'Failed to join this giveaway. Please try again.');
    }

    return true;
}

// Entry point for the "Join Giveaway" button on the bot's embed (see
// buildGiveawayComponents in giveaways/render.js). The embed itself is
// created/edited entirely through /v3/giveaways/sync -- this only handles
// the click.
export async function handleGiveawayInteraction(interaction) {
    if (!interaction.isButton()) {
        return false;
    }

    const parsed = parseGiveawayCustomId(interaction.customId);
    if (!parsed) {
        return false;
    }

    if (parsed.action === 'join') {
        return await handleJoinButton(interaction, parsed.giveawayUuid);
    }

    return false;
}
