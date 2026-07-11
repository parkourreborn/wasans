import { DEFAULT_GUILD_ID } from './constants.js';

function csvToIds(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

export const botConfig = {
    guild_id: DEFAULT_GUILD_ID,
    submissions_forum_channel_id: process.env.SUBMISSIONS_FORUM_CHANNEL_ID || '1351374148881874944',
    wr_ping_role_id: process.env.WR_PING_ROLE_ID || '1335389577883418736',
    submission_base_url: process.env.SUBMISSION_BASE_URL || 'https://wasans.tully.sh/submissions/',
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

const configuredRankingScope = botConfig.managed_role_scopes.ranking;
if (configuredRankingScope.length === 0) {
    botConfig.managed_role_scopes.ranking = [
        ...Object.values(botConfig.role_ranks),
        botConfig.wasans_member_role_id,
    ];
}

const configuredMemberScope = botConfig.managed_role_scopes.member;
if (configuredMemberScope.length === 0) {
    botConfig.managed_role_scopes.member = [botConfig.wasans_member_role_id];
}

export const sortedRankRoles = Object.entries(botConfig.role_ranks)
    .map(([score, roleId]) => ({ score: Number(score), roleId }))
    .sort((a, b) => a.score - b.score);
