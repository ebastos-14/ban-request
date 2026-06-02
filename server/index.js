import express from "express";
import tmi from "tmi.js";
import { CONFIG } from "./config.js";
import { getChannel } from "./state.js";

const app = express();
const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| TWITCH CLIENT
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

function normalizeChannel(channel) {
    return channel.replace(/^#/, "").toLowerCase();
}

/*
|--------------------------------------------------------------------------
| DIRECT BAN TEST (NEW)
|--------------------------------------------------------------------------
*/

async function directBan(channel, target, requester) {

    try {

        console.log(`[TEST BAN] ${target} requested by ${requester}`);

        // método más estable actualmente en TMI
        await twitchClient.say(
            channel,
            `/ban ${target} Petición por @${requester}`
        );

        console.log(`[TEST BAN SUCCESS] ${target}`);

        twitchClient.say(
            channel,
            `🔨 TEST: @${target} baneado por petición de @${requester}`
        );

    } catch (err) {

        console.error("[TEST BAN FAILED]", err);

        twitchClient.say(
            channel,
            `❌ TEST BAN FALLÓ para @${target}`
        );
    }
}

/*
|--------------------------------------------------------------------------
| CHAT HANDLER
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const cleanChannel = normalizeChannel(channel);
    const user = tags.username;

    console.log({ channel, user, message });

    /*
    |--------------------------------------------------------------------------
    | 🔥 TEST COMMAND (NEW)
    |--------------------------------------------------------------------------
    | Uso: !reqban usuario
    */

    if (message.startsWith("!reqban ")) {

        const target = message.split(" ")[1]?.replace("@", "");

        if (!target) return;

        twitchClient.say(
            channel,
            `⚠️ TEST BAN ejecutando para @${target}...`
        );

        await directBan(channel, target, user);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | VOTING SYSTEM (SIMPLIFIED PLACEHOLDER)
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
| API (OVERLAY READY)
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.send("Community Ban Bot Online");
});

app.get("/event", (req, res) => {

    const channel = req.query.channel;

    if (!channel) {
        return res.status(400).json({ error: "channel required" });
    }

    const data = getChannel(normalizeChannel(channel));

    res.json(data);
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
