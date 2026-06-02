import express from "express";
import tmi from "tmi.js";
import { CONFIG } from "./config.js";

const app = express();
const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| TWITCH CLIENT (CHAT)
|--------------------------------------------------------------------------
*/

const twitchClient = new tmi.Client({
    identity: {
        username: CONFIG.BOT_USERNAME,
        password: CONFIG.OAUTH_TOKEN
    },
    channels: CONFIG.ALLOWED_CHANNELS
});

twitchClient.connect()
    .then(() => console.log("Connected to Twitch"))
    .catch(err => console.error("Twitch error:", err));

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const normalize = (c) => c.replace(/^#/, "").toLowerCase();

async function getUserId(login) {

    const res = await fetch(
        `https://api.twitch.tv/helix/users?login=${login}`,
        {
            headers: {
                "Client-ID": process.env.TWITCH_CLIENT_ID,
                "Authorization": `Bearer ${process.env.TWITCH_APP_TOKEN}`
            }
        }
    );

    const json = await res.json();
    return json.data?.[0]?.id;
}

/*
|--------------------------------------------------------------------------
| REAL BAN (HELIX)
|--------------------------------------------------------------------------
*/

async function banUser(channel, target, requester) {

    try {

        const broadcasterLogin = normalize(channel);

        const broadcasterId = await getUserId(broadcasterLogin);
        const moderatorId = await getUserId(CONFIG.BOT_USERNAME);
        const userId = await getUserId(target);

        if (!broadcasterId || !moderatorId || !userId) {
            throw new Error("Missing IDs (broadcaster/moderator/target)");
        }

        const res = await fetch(
            `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}`,
            {
                method: "POST",
                headers: {
                    "Client-ID": process.env.TWITCH_CLIENT_ID,
                    "Authorization": `Bearer ${process.env.TWITCH_APP_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    data: {
                        user_id: userId,
                        reason: `TEST BAN por @${requester}`
                    }
                })
            }
        );

        const text = await res.text();

        if (!res.ok) {
            throw new Error(text);
        }

        console.log("[REAL BAN SUCCESS]", target);

        twitchClient.say(
            channel,
            `🔨 BAN REAL ejecutado: @${target} (solicitado por @${requester})`
        );

    } catch (err) {

        console.error("[REAL BAN FAILED]", err.message);

        twitchClient.say(
            channel,
            `❌ BAN FALLÓ para @${target}`
        );
    }
}

/*
|--------------------------------------------------------------------------
| CHAT EVENTS
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const user = tags.username;

    console.log({ channel, user, message });

    /*
    |--------------------------------------------------------------------------
    | TEST BAN COMMAND
    |--------------------------------------------------------------------------
    | !reqban user
    */

    if (message.startsWith("!reqban ")) {

        const target = message.split(" ")[1]?.replace("@", "");

        if (!target) return;

        twitchClient.say(
            channel,
            `⚠️ Ejecutando BAN REAL para @${target}...`
        );

        await banUser(channel, target, user);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | PLACEHOLDER VOTES
    |--------------------------------------------------------------------------
    */

    if (message === "!votosi") {
        twitchClient.say(channel, `👍 voto SI registrado`);
        return;
    }

    if (message === "!votono") {
        twitchClient.say(channel, `👎 voto NO registrado`);
        return;
    }

});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.send("Bot online");
});

app.listen(PORT, () => {
    console.log("Server running on", PORT);
});
