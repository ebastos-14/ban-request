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
.then(() => {

    console.log("Connected to Twitch");

})
.catch(error => {

    console.error("Twitch connection error:", error);

});

app.get("/", (req, res) => {

    res.send("Community Ban Bot Online");

});

app.get("/event", (req, res) => {

    const channel = req.query.channel;

    if (!channel) {

        return res.status(400).json({
            error: "channel required"
        });

    }

    const normalizedChannel = channel
        .replace(/^#/, "")
        .trim()
        .toLowerCase();

    const allowedChannels = CONFIG.ALLOWED_CHANNELS.map(channel =>
        channel
            .replace(/^#/, "")
            .trim()
            .toLowerCase()
    );

    if (!allowedChannels.includes(normalizedChannel)) {

        return res.status(403).json({
            error: "channel not allowed"
        });

    }

    res.json(
        getChannel(normalizedChannel)
    );

});

twitchClient.on("message", async (channel, tags, message, self) => {

    if (self) return;

    const cleanChannel = channel
        .replace(/^#/, "")
        .toLowerCase();

    const channelData = getChannel(cleanChannel);

    const username = tags.username.toLowerCase();

    console.log({
        channel,
        user: username,
        message
    });

    if (message.startsWith("!requestban ")) {

        const now = Date.now();

        if (channelData.state !== "idle") {

            return;

        }

        if (now < channelData.cooldownUntil) {

            return;

        }

        const target = message
            .split(" ")[1]
            ?.replace("@", "")
            ?.toLowerCase();

        if (!target) {

            return;

        }

        createVote(
            cleanChannel,
            username,
            target
        );

        twitchClient.say(
            channel,
            `⚖️ Votación abierta contra @${target} por solicitud de @${username}. 60s`
        );

        setTimeout(() => {

            const currentChannel = getChannel(cleanChannel);

            if (
                !currentChannel.activeVote ||
                currentChannel.state !== "voting"
            ) {

                return;

            }

            const yes = currentChannel.activeVote.yesVotes.length;

            const no = currentChannel.activeVote.noVotes.length;

            if (yes > no) {

                currentChannel.state = "awaiting_mod";

                twitchClient.say(
                    channel,
                    `⚖️ Resultado: ${yes} a favor y ${no} en contra. Esperando !accept de un moderador.`
                );

                return;

            }

            if (no > yes) {

                twitchClient.say(
                    channel,
                    `🛡️ @${currentChannel.activeVote.target} ha recibido la protección de la comunidad. (${yes}/${no})`
                );

                addHistory(cleanChannel, {

                    result: "protected",

                    requester: currentChannel.activeVote.requester,

                    target: currentChannel.activeVote.target,

                    yes,

                    no,

                    moderator: null,

                    date: Date.now()

                });

                finishVote(cleanChannel);

                startCooldown(cleanChannel);

                return;

            }

            twitchClient.say(
                channel,
                `⚖️ Empate (${yes}/${no}). No se tomará ninguna acción.`
            );

            addHistory(cleanChannel, {

                result: "tie",

                requester: currentChannel.activeVote.requester,

                target: currentChannel.activeVote.target,

                yes,

                no,

                moderator: null,

                date: Date.now()

            });

            finishVote(cleanChannel);

            startCooldown(cleanChannel);

        }, CONFIG.VOTE_DURATION * 1000);

        return;

    }

    if (message === "!votosi") {

        if (channelData.state !== "voting") {

            return;

        }

        channelData.activeVote.noVotes =
            channelData.activeVote.noVotes.filter(
                user => user !== username
            );

        if (
            !channelData.activeVote.yesVotes.includes(username)
        ) {

            channelData.activeVote.yesVotes.push(username);

        }

        return;

    }

    if (message === "!votono") {

        if (channelData.state !== "voting") {

            return;

        }

        channelData.activeVote.yesVotes =
            channelData.activeVote.yesVotes.filter(
                user => user !== username
            );

        if (
            !channelData.activeVote.noVotes.includes(username)
        ) {

            channelData.activeVote.noVotes.push(username);

        }

        return;

    }

if (message === "!accept") {

    if (channelData.state !== "awaiting_mod") {

        return;

    }

    const isModerator =
        tags.mod ||
        tags.badges?.broadcaster;

    if (!isModerator) {

            return;
    
        }
    
        const vote = channelData.activeVote;
    
        const yes = vote.yesVotes.length;
    
        const no = vote.noVotes.length;
    
        try {
    
            await twitchClient.ban(
                channel,
                vote.target,
                `Petición por @${vote.requester} - ${yes} votos`
            );
    
            console.log(
                "BAN SUCCESS:",
                vote.target
            );
    
            twitchClient.say(
                channel,
                `🔨 @${vote.target} ha sido baneado. (${yes}/${no})`
            );
    
        } catch (error) {
    
            console.error(
                "BAN FAILED:",
                error
            );
    
            twitchClient.say(
                channel,
                `❌ No se pudo ejecutar el ban de @${vote.target}`
            );
    
        }
    
        addHistory(cleanChannel, {
    
            result: "banned",
    
            requester: vote.requester,
    
            target: vote.target,
    
            yes,
    
            no,
    
            moderator: username,
    
            date: Date.now()
    
        });
    
        finishVote(cleanChannel);
    
        startCooldown(cleanChannel);
    
    }

});

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});

console.log("Bot starting...");
