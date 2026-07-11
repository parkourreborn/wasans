export const PORT = Number(process.env.PORT || 4500);
export const API_SECRET = process.env.API_SECRET;
export const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN

export const DEFAULT_GUILD_ID = process.env.GUILD_ID;
export const ALLOWED_USER_ID = "694274948071555154";

export const HONEYPOT_CHANNEL_ID = "1524517132786864279";
export const LOGGING_CHANNEL_ID = "1525557722714607756";

export const HONEYPOT_WARNING_MESSAGE = "# <:no_nightplay:1404656718729973860>  DO NOT TYPE IN THIS CHANNEL! YOU WILL BE BANNED!\n\n" +
"This is a honeypot channel designed to catch scammers.\n\n" +
"If you send a messsage here, you will be banned and all your messages from the last 7 days will be deleted!\n\n" +
"Bans originating from here are permanent.\n" +
"# BE CAREFUL!";