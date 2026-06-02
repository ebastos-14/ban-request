import express from "express";
import tmi from "tmi.js";
import { CONFIG } from "./config.js";
import {
    getChannel,
    createVote,
    finishVote,
    startCooldown,
    addHistory
} from "./state.js";

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

twitchClient.connect();

/*
|--------------------------------------------------------------------------
| HELIX HELPERS
|--------------------------------------------------------------------------
*/

async function getUserId(username) {

    const res = await fetch(
        `https://api.twitch.tv/helix/users?login=${username}`,
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

async function banUser(broadcasterId, moderatorId, userId, reason) {

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
                    reason
                }
            })
        }
    );

    if (!res.ok) {

        const err = await res.text();

        throw new Error(err);

    }

    return res.json();
}

/*
|--------------------------------------------------------------------------
| CHANNEL EVENT API
|--------------------------------------------------------------------------
*/

app.get("/event", (req, res) => {

    const channel = req.query.channel;

    const normalized = channel
        ?.replace(/^#/, "")
        .toLowerCase();

    res.json(getChannel(normalized));
});

/*
|--------------------------------------------------------------------------
| CHAT SYSTEM
|--------------------------------------------------------------------------
*/

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const cleanChannel = channel.replace(/^#/, "").toLowerCase();
    const channelData = getChannel(cleanChannel);
    const username = tags.username.toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | REQUEST BAN
    |--------------------------------------------------------------------------
    */

    if (message.startsWith("!requestban ")) {

        if (channelData.state !== "idle") return;

        if (Date.now() < channelData.cooldownUntil) return;

        const target = message.split(" ")[1]?.replace("@", "");

        if (!target) return;

        createVote(cleanChannel, username, target);

        twitchClient.say(
            channel,
            `⚖️ Juicio iniciado contra @${target} por @${username} (60s)`
        );

        setTimeout(() => runVoteResult(cleanChannel, channel), 60000);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | VOTES
    |--------------------------------------------------------------------------
    */

    if (message === "!votosi") {

        if (channelData.state !== "voting") return;

        channelData.activeVote.noVotes =
            channelData.activeVote.noVotes.filter(u => u !== username);

        if (!channelData.activeVote.yesVotes.includes(username)) {
            channelData.activeVote.yesVotes.push(username);
        }

        return;
    }

    if (message === "!votono") {

        if (channelData.state !== "voting") return;

        channelData.activeVote.yesVotes =
            channelData.activeVote.yesVotes.filter(u => u !== username);

        if (!channelData.activeVote.noVotes.includes(username)) {
            channelData.activeVote.noVotes.push(username);
        }

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | ACCEPT MOD
    |--------------------------------------------------------------------------
    */

    if (message === "!accept") {

        if (channelData.state !== "awaiting_mod") return;

        const isMod =
            tags.mod ||
            tags.badges?.broadcaster;

        if (!isMod) return;

        const vote = channelData.activeVote;

        const yes = vote.yesVotes.length;
        const no = vote.noVotes.length;

        try {

            const broadcasterId = process.env.TWITCH_BROADCASTER_ID;
            const moderatorId = process.env.TWITCH_MODERATOR_ID;

            const targetId = await getUserId(vote.target);

            await banUser(
                broadcasterId,
                moderatorId,
                targetId,
                `Petición por @${vote.requester} - ${yes} votos`
            );

            twitchClient.say(
                channel,
                `🔨 @${vote.target} ha sido baneado (${yes}/${no})`
            );

        } catch (err) {

            console.error("BAN FAILED:", err.message);

            twitchClient.say(
                channel,
                `❌ No se pudo banear a @${vote.target}`
            );

            return;
        }

        finishVote(cleanChannel);
        startCooldown(cleanChannel);

    }

});

/*
|--------------------------------------------------------------------------
| VOTE RESULT
|--------------------------------------------------------------------------
*/

function runVoteResult(cleanChannel, channel) {

    const data = getChannel(cleanChannel);

    if (!data.activeVote) return;

    const yes = data.activeVote.yesVotes.length;
    const no = data.activeVote.noVotes.length;

    const vote = data.activeVote;

    if (yes > no) {

        data.state = "awaiting_mod";

        twitchClient.say(
            channel,
            `⚖️ Resultado ${yes}-${no}. Esperando !accept`
        );

        return;
    }

    if (no > yes) {

        twitchClient.say(
            channel,
            `🛡️ @${vote.target} protegido (${yes}/${no})`
        );

        addHistory(cleanChannel, {
            result: "protected",
            requester: vote.requester,
            target: vote.target,
            yes,
            no,
            date: Date.now()
        });

        finishVote(cleanChannel);
        startCooldown(cleanChannel);

        return;
    }

    twitchClient.say(
        channel,
        `⚖️ Empate ${yes}-${no}. Sin acción.`
    );

    addHistory(cleanChannel, {
        result: "tie",
        requester: vote.requester,
        target: vote.target,
        yes,
        no,
        date: Date.now()
    });

    finishVote(cleanChannel);
    startCooldown(cleanChannel);
}

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log("Server running on", PORT);
});
