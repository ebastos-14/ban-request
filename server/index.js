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

const twitchClient = new tmi.Client({
    identity: {
        username: CONFIG.BOT_USERNAME,
        password: CONFIG.OAUTH_TOKEN
    },
    channels: CONFIG.ALLOWED_CHANNELS
});

twitchClient.connect()
    .then(() => console.log("Connected to Twitch"))
    .catch(console.error);

app.get("/", (req, res) => {
    res.send("Community Ban Bot Online");
});

app.get("/event", (req, res) => {

    const channel = req.query.channel;

    if (!channel) {
        return res.status(400).json({ error: "channel required" });
    }

    const clean = channel.replace(/^#/, "").toLowerCase();

    const allowed = CONFIG.ALLOWED_CHANNELS.map(c =>
        c.replace(/^#/, "").toLowerCase()
    );

    if (!allowed.includes(clean)) {
        return res.status(403).json({ error: "channel not allowed" });
    }

    return res.json(getChannel(clean));
});

/*
|--------------------------------------------------------------------------
| CHAT SYSTEM
|--------------------------------------------------------------------------
*/

twitchClient.on("message", (channel, tags, message, self) => {

    if (self) return;

    const cleanChannel = channel.replace(/^#/, "").toLowerCase();
    const state = getChannel(cleanChannel);
    const user = tags.username.toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | START VOTE
    |--------------------------------------------------------------------------
    */

    if (message.startsWith("!requestban ")) {

        const now = Date.now();

        if (state.state !== "idle") return;
        if (now < state.cooldownUntil) return;

        const target = message
            .split(" ")[1]
            ?.replace("@", "")
            ?.toLowerCase();

        if (!target) return;

        createVote(cleanChannel, user, target);

        twitchClient.say(
            channel,
            `⚖️ Votación contra @${target} iniciada. 60 segundos.`
        );

        setTimeout(() => {

            const s = getChannel(cleanChannel);

            if (!s.activeVote) return;

            const yes = s.activeVote.yesVotes.length;
            const no = s.activeVote.noVotes.length;

            const targetUser = s.activeVote.target;

            let resultMessage = "";

            if (yes > no) {

                resultMessage = `🔨 BAN @${targetUser} aprobado (${yes} vs ${no})`;

            } else if (no > yes) {

                resultMessage = `🛡️ @${targetUser} protegido (${yes} vs ${no})`;

            } else {

                resultMessage = `⚖️ Empate (${yes} vs ${no}). Sin acción.`;

            }

            twitchClient.say(channel, resultMessage);

            addHistory(cleanChannel, {
                requester: s.activeVote.requester,
                target: targetUser,
                yes,
                no,
                result: yes > no ? "ban" : no > yes ? "protect" : "tie",
                date: Date.now()
            });

            finishVote(cleanChannel);
            startCooldown(cleanChannel);

        }, 60000);

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | VOTOS (SILENCIOSOS)
    |--------------------------------------------------------------------------
    */

    if (message === "!votosi") {

        if (state.state !== "voting") return;

        state.activeVote.noVotes =
            state.activeVote.noVotes.filter(u => u !== user);

        if (!state.activeVote.yesVotes.includes(user)) {
            state.activeVote.yesVotes.push(user);
        }

        return;
    }

    if (message === "!votono") {

        if (state.state !== "voting") return;

        state.activeVote.yesVotes =
            state.activeVote.yesVotes.filter(u => u !== user);

        if (!state.activeVote.noVotes.includes(user)) {
            state.activeVote.noVotes.push(user);
        }

        return;
    }

});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
