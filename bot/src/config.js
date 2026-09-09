export const PORT = Number(process.env.PORT || 4500);
export const API_SECRET = process.env.API_SECRET || '';
export const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '';

export const DEFAULT_GUILD_ID = '1257994787512913961';
export const ALLOWED_USER_ID = '694274948071555154';
export const LOGGING_CHANNEL_ID = '1525557722714607756';

function csvToIds(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Every slash command reply and every page turn rasterises a card, which is
// CPU-bound and uploads a few hundred KB, so both draw on one per-user budget.
export const cardRateLimit = {
    limit: positiveNumber(process.env.CARD_RATE_LIMIT_USER, 5),
    windowMs: positiveNumber(process.env.CARD_RATE_LIMIT_USER_WINDOW_MS, 60_000),
};

export const botConfig = {
    guild_id: DEFAULT_GUILD_ID,
    submissions_forum_channel_id: process.env.SUBMISSIONS_FORUM_CHANNEL_ID || '1351374148881874944',
    rank_milestones_channel_id: process.env.RANK_MILESTONES_CHANNEL_ID || '1258680561929814066',
    giveaways_channel_id: process.env.GIVEAWAYS_CHANNEL_ID || '1547074738176663612',
    wr_ping_role_id: process.env.WR_PING_ROLE_ID || '1335389577883418736',
    submission_base_url: process.env.SUBMISSION_BASE_URL || 'https://wasans.tully.sh/submissions/',
    submission_assets_base_url: process.env.SUBMISSION_ASSETS_BASE_URL || 'https://assets.wasans.tully.sh/scores/',
    player_base_url: process.env.PLAYER_BASE_URL || 'https://wasans.tully.sh/players/',
    submission_api_base_url: process.env.SUBMISSION_API_BASE_URL || 'https://wasans.tully.sh/v2/submissions/',
    bot_token: BOT_TOKEN,
    api_secret: API_SECRET,
    moderator_role_id: process.env.MODERATOR_ROLE_ID || '1547026410307194920',
    state_tags: {
        pending: process.env.TAG_PENDING_ID || '1351580041896656936',
        approved: process.env.TAG_APPROVED_ID || '1351581039499284521',
        denied: process.env.TAG_DENIED_ID || '1351581072043020442',
        wr_tag: process.env.TAG_WR_ID || '1351581114841436230',
    },
    role_ranks: {
        0.0: '1257994886070800465',
        0.3: '1501720864872206568',
        0.4: '1501720851748229294',
        0.5: '1373849841494523984',
        0.6: '1373849485003980820',
        0.7: '1305891664413593651',
        0.8: '1493644824237052075',
        0.9: '1257994883059290245',
    },
    role_names: {
        '1257994886070800465': 'unranked',
        '1501720864872206568': 'platinum',
        '1501720851748229294': 'diamond',
        '1373849841494523984': 'master III',
        '1373849485003980820': 'master II',
        '1305891664413593651': 'master I',
        '1493644824237052075': 'elite',
        '1257994883059290245': 'router',
    },
    wasans_member_role_id: process.env.WASANS_MEMBER_ROLE_ID || '1371654123446992936',
    managed_role_scopes: {
        ranking: csvToIds(process.env.SCOPE_RANKING_ROLE_IDS),
        member: csvToIds(process.env.SCOPE_MEMBER_ROLE_IDS),
    },
};

if (botConfig.managed_role_scopes.ranking.length === 0) {
    botConfig.managed_role_scopes.ranking = [
        ...Object.values(botConfig.role_ranks),
        botConfig.wasans_member_role_id,
    ];
}

if (botConfig.managed_role_scopes.member.length === 0) {
    botConfig.managed_role_scopes.member = [botConfig.wasans_member_role_id];
}

export const sortedRankRoles = Object.entries(botConfig.role_ranks)
    .map(([score, roleId]) => ({ score: Number(score), roleId }))
    .sort((a, b) => a.score - b.score);

if (!BOT_TOKEN) {
    console.warn('[config] BOT_TOKEN (or DISCORD_TOKEN) is not set; Discord login will fail.');
}

if (!API_SECRET) {
    console.warn('[config] API_SECRET is not set; all HTTP API requests will be rejected with 401/500.');
}
