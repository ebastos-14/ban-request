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
| HELPERS
|--------------------------------------------------------------------------
*/

const normalize = (c) => c.replace(/^#/, "").toLowerCase();

/*
|--------------------------------------------------------------------------
| STATE (por canal en memoria)
|--------------------------------------------------------------------------
*/

const channelState = new Map();

function getState(channel) {

    const key = normalize(channel);

    if (!channelState.has(key)) {

        channelState.set(key, {
            state: "idle",
            activeVote: null,
            cooldownUntil: 0
        });

    }

    return channelState.get(key);
}

/*
|--------------------------------------------------------------------------
| TWITCH API HELPERS
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

async function banUser(channel, target, requester) {

    const broadcasterLogin = normalize(channel);

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
        const err = await res.text();
        throw new Error(err);
    }

    console.log("[BAN OK]", target);
}

/*
|--------------------------------------------------------------------------
| VOTE START
|--------------------------------------------------------------------------
*/

function startVote(state, target, requester) {

    state.state = "voting";

    state.activeVote = {
        target,
        requester,
        yes: new Set(),
        no: new Set()
    };
}

/*
|--------------------------------------------------------------------------
| END VOTE
|--------------------------------------------------------------------------
*/

async function endVote(channel, state) {

    const vote = state.activeVote;

    if (!vote) return;

    const yes = vote.yes.size;
    const no = vote.no.size;

    if (yes > no) {

        state.state = "awaiting_mod";

        twitchClient.say(
            channel,
            `⚖️ Resultado ${yes}-${no}. Esperando !accept`
        );

    } else if (no > yes) {

        twitchClient.say(
            channel,
            `🛡️ @${vote.target} protegido (${yes}-${no})`
        );

        state.state = "idle";
        state.activeVote = null;

    } else {

        twitchClient.say(
            channel,
            `⚖️ Empate ${yes}-${no}. Sin acción`
        );

        state.state = "idle";
        state.activeVote = null;
    }
}

/*
|--------------------------------------------------------------------------
| CHAT
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const user = tags.username;
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

        startVote(state, target, user);

        twitchClient.say(
            channel,
            `⚖️ Juicio iniciado contra @${target} por @${user} (60s)`
        );

        setTimeout(() => {
            endVote(channel, state);
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

        const vote = state.activeVote;

        vote.no.delete(user);
        vote.yes.add(user);

        return;
    }

    if (message === "!votono") {

        if (state.state !== "voting") return;

        const vote = state.activeVote;

        vote.yes.delete(user);
        vote.no.add(user);

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

        const yes = vote.yes.size;
        const no = vote.no.size;

        try {

            await banUser(channel, vote.target, vote.requester);

            twitchClient.say(
                channel,
                `🔨 @${vote.target} ha sido baneado (${yes}/${no})`
            );

        } catch (err) {

            console.error("[BAN FAIL]", err.message);

            twitchClient.say(
                channel,
                `❌ No se pudo banear a @${vote.target}`
            );
        }

        state.state = "idle";
        state.activeVote = null;

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
