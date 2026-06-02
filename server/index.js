import express from "express";
import tmi from "tmi.js";
import { CONFIG } from "./config.js";

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
| STATE
|--------------------------------------------------------------------------
*/

const channelState = new Map();
const cooldowns = new Map();

function getState(channel) {

    const key = channel.replace(/^#/, "").toLowerCase();

    if (!channelState.has(key)) {
        channelState.set(key, {
            state: "idle",
            activeVote: null,
            timeout: null
        });
    }

    return channelState.get(key);
}

/*
|--------------------------------------------------------------------------
| COOLDOWN
|--------------------------------------------------------------------------
*/

function isOnCooldown(channel) {
    return (cooldowns.get(channel) || 0) > Date.now();
}

function setCooldown(channel, ms = 120000) {
    cooldowns.set(channel, Date.now() + ms);
}

/*
|--------------------------------------------------------------------------
| TWITCH API
|--------------------------------------------------------------------------
*/

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
| BAN REAL
|--------------------------------------------------------------------------
*/

async function banUser(channel, target, requester) {

    const broadcasterLogin = channel.replace(/^#/, "");

    const broadcasterId = await getUserId(broadcasterLogin);
    const moderatorId = await getUserId(CONFIG.BOT_USERNAME);
    const userId = await getUserId(target);

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
                    reason: `Votación del chat por @${requester}`
                }
            })
        }
    );

    if (!res.ok) {
        throw new Error(await res.text());
    }
}

/*
|--------------------------------------------------------------------------
| CLEAN STATE
|--------------------------------------------------------------------------
*/

function clearState(state) {

    state.state = "idle";
    state.activeVote = null;

    if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
    }
}

/*
|--------------------------------------------------------------------------
| CHAT
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const user = tags.username.toLowerCase();
    const channelKey = channel.replace(/^#/, "").toLowerCase();

    const state = getState(channel);

    /*
    |--------------------------------------------------------------------------
    | REQUEST BAN
    |--------------------------------------------------------------------------
    */

    if (message.startsWith("!requestban ")) {

        if (state.state !== "idle") return;

        if (isOnCooldown(channelKey)) {
            twitchClient.say(channel, `⏳ En cooldown (2min).`);
            return;
        }

        const target = message.split(" ")[1]?.replace("@", "").toLowerCase();
        if (!target) return;

        state.state = "voting";

        state.activeVote = {
            target,
            requester: user,
            yes: new Set(),
            no: new Set()
        };

        twitchClient.say(
            channel,
            `⚖️ Juicio contra @${target} iniciado por @${user} (60s)`
        );

        setTimeout(() => {

            const vote = state.activeVote;
            if (!vote) return;

            const yes = vote.yes.size;
            const no = vote.no.size;

            if (yes > no) {

                state.state = "awaiting_mod";

                twitchClient.say(
                    channel,
                    `⚖️ Resultado ${yes}-${no}. Esperando !accept o !cancel`
                );

                state.timeout = setTimeout(() => {

                    twitchClient.say(
                        channel,
                        `⏱️ Sin respuesta del mod. Caso cancelado.`
                    );

                    setCooldown(channelKey);
                    clearState(state);

                }, 5 * 60 * 1000);

            } else {

                twitchClient.say(
                    channel,
                    `🛡️ Protegido (${yes}-${no})`
                );

                setCooldown(channelKey);
                clearState(state);
            }

        }, 60000);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | VOTES
    |--------------------------------------------------------------------------
    */

    if (message === "!votosi") {

        if (state.state !== "voting") return;

        state.activeVote.no.delete(user);
        state.activeVote.yes.add(user);

        return;
    }

    if (message === "!votono") {

        if (state.state !== "voting") return;

        state.activeVote.yes.delete(user);
        state.activeVote.no.add(user);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | ACCEPT (FORZAR BAN)
    |--------------------------------------------------------------------------
    */

    if (message === "!accept") {

        if (state.state !== "awaiting_mod") return;

        const vote = state.activeVote;

        try {

            await banUser(channel, vote.target, vote.requester);

            twitchClient.say(
                channel,
                `🔨 @${vote.target} ha sido baneado por decisión del chat`
            );

        } catch (err) {

            twitchClient.say(
                channel,
                `❌ Error al banear @${vote.target}`
            );
        }

        setCooldown(channelKey);
        clearState(state);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | CANCEL
    |--------------------------------------------------------------------------
    */

    if (message === "!cancel") {

        if (state.state !== "awaiting_mod") return;

        twitchClient.say(
            channel,
            `❌ Caso cancelado`
        );

        setCooldown(channelKey);
        clearState(state);

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
