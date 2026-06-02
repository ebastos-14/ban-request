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

twitchClient.connect();

/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

const channelState = new Map();

function getState(channel) {

    const key = channel.replace(/^#/, "").toLowerCase();

    if (!channelState.has(key)) {

        channelState.set(key, {
            state: "idle",
            activeVote: null,
            cooldownUntil: 0,
            timeout: null
        });

    }

    return channelState.get(key);
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

async function isModerator(login, channelLogin) {

    return login === channelLogin; 
    // simplificación: broadcaster = protegido automáticamente
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
                    reason: `Petición por @${requester}`
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
| END / CANCEL LOGIC
|--------------------------------------------------------------------------
*/

function clearVote(state) {

    state.state = "idle";
    state.activeVote = null;

    if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
    }
}

/*
|--------------------------------------------------------------------------
| VOTE END (AUTO TIMEOUT 5 MIN CONFIRM)
|--------------------------------------------------------------------------
*/

function startConfirmTimeout(channel, state) {

    if (state.timeout) clearTimeout(state.timeout);

    state.timeout = setTimeout(() => {

        if (state.state !== "awaiting_mod") return;

        twitchClient.say(
            channel,
            `⏱️ Sin respuesta del moderador. Caso cancelado.`
        );

        clearVote(state);

    }, 5 * 60 * 1000);
}

/*
|--------------------------------------------------------------------------
| CHAT
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const user = tags.username;
    const channelLogin = channel.replace(/^#/, "").toLowerCase();
    const state = getState(channel);

    /*
    |--------------------------------------------------------------------------
    | REQUEST BAN
    |--------------------------------------------------------------------------
    */

    if (message.startsWith("!requestban ")) {

        if (state.state !== "idle") return;

        const target = message.split(" ")[1]?.replace("@", "");

        if (!target) return;

        // 🚨 PROTECCIÓN: NO BANEAR MOD / BROADCASTER
        const isMod =
            tags.mod ||
            tags.badges?.broadcaster;

        if (isMod || target === CONFIG.BOT_USERNAME) {

            twitchClient.say(
                channel,
                `🛡️ @${target} está protegido. Caso cancelado.`
            );

            state.state = "idle";

            return;
        }

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

                startConfirmTimeout(channel, state);

            } else {

                twitchClient.say(
                    channel,
                    `🛡️ Protegido (${yes}-${no})`
                );

                clearVote(state);
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
    | MOD ACCEPT
    |--------------------------------------------------------------------------
    */

    if (message === "!accept") {

        if (state.state !== "awaiting_mod") return;

        const isMod =
            tags.mod ||
            tags.badges?.broadcaster;

        if (!isMod) return;

        const vote = state.activeVote;

        try {

            await banUser(channel, vote.target, vote.requester);

            twitchClient.say(
                channel,
                `🔨 @${vote.target} baneado por decisión del mod`
            );

        } catch (err) {

            twitchClient.say(
                channel,
                `❌ Error al banear @${vote.target}`
            );
        }

        clearVote(state);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | MOD CANCEL
    |--------------------------------------------------------------------------
    */

    if (message === "!cancel") {

        const isMod =
            tags.mod ||
            tags.badges?.broadcaster;

        if (!isMod) return;

        twitchClient.say(
            channel,
            `❌ Caso cancelado por moderación`
        );

        clearVote(state);

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
