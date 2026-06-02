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
const cooldowns = new Map();

function getState(channel) {

    const key = channel.replace(/^#/, "").toLowerCase();

    if (!channelState.has(key)) {
        channelState.set(key, {
            state: "idle",
            activeVote: null,
            timeout: null,
            startedAt: null
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
                    reason: `Peticion por: @${requester}`
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
    state.startedAt = null;

    if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
    }
}

/*
|--------------------------------------------------------------------------
| CHAT (TU LOGICA SIN CAMBIOS)
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
            twitchClient.say(channel, ``);
            return;
        }

        const target = message.split(" ")[1]?.replace("@", "").toLowerCase();
        if (!target) return;

        state.state = "voting";
        state.startedAt = Date.now();

        state.activeVote = {
            target,
            requester: user,
            yes: new Set(),
            no: new Set()
        };

        twitchClient.say(
            channel,
            `⏲️ 60s ⏲️ @${user} ha iniciado un juicio contra @${target}... ⚖️ !voteban o !votedef ⚖️`
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
                    `🛎️ Si ${yes}/${no} No 🛎️ Esperando confirmacion del mod...`
                );

                state.timeout = setTimeout(() => {

                    twitchClient.say(
                        channel,
                        `⌛ Zzz ⌛ @${target} ha sido salvado por la campana`
                    );

                    setCooldown(channelKey);
                    clearState(state);

                }, 5 * 60 * 1000);

            } else {

                twitchClient.say(
                    channel,
                    `🛡️ GG 🛡️ @${target} ha sido protegido por el chat (Si ${yes}/${no} No)`
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

    if (message === "!voteban") {

        if (state.state !== "voting") return;

        state.activeVote.no.delete(user);
        state.activeVote.yes.add(user);

        return;
    }

    if (message === "!votedef") {

        if (state.state !== "voting") return;

        state.activeVote.yes.delete(user);
        state.activeVote.no.add(user);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | ACCEPT
    |--------------------------------------------------------------------------
    */

    if (message === "!accept") {

        if (state.state !== "awaiting_mod") return;

        const vote = state.activeVote;

        try {

            await banUser(channel, vote.target, vote.requester);

            twitchClient.say(
                channel,
                `☠️ F ☠️ @${vote.target} ha sido baneado por decisión del chat`
            );

        } catch (err) {

            twitchClient.say(
                channel,
                `❗Equisde❓No se pudo banear a @${vote.target}`
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
            `⚔️ Bueno ⚔️ el mod ha cancelado el baneo`
        );

        setCooldown(channelKey);
        clearState(state);

        return;
    }

});

/*
|--------------------------------------------------------------------------
| OVERLAY API (NUEVO)
|--------------------------------------------------------------------------
*/

app.get("/event", (req, res) => {

    const channel = (req.query.channel || "").toLowerCase();
    const state = getState("#" + channel);

    const vote = state.activeVote;

    const yes = vote?.yes?.size || 0;
    const no = vote?.no?.size || 0;

    const total = yes + no;
    const noRatio = total === 0 ? 0.5 : no / total;

    const timeLeft = state.startedAt
        ? Math.max(0, 60 - Math.floor((Date.now() - state.startedAt) / 1000))
        : 0;

    res.json({
        channel,
        state: state.state,
        target: vote?.target || null,
        requester: vote?.requester || null,
        yes,
        no,
        timeLeft,
        noRatio
    });
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
