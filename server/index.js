console.log("CONFIG CHANNELS:", CONFIG.ALLOWED_CHANNELS);
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
.then(() => {

    console.log("Connected to Twitch");

})
.catch(error => {

    console.error("Twitch connection error:", error);

});

/*
|--------------------------------------------------------------------------
| TWITCH CHAT EVENTS
|--------------------------------------------------------------------------
*/

twitchClient.on("message", (channel, tags, message, self) => {

    if (self) return;

    console.log({
        channel,
        user: tags.username,
        message
    });

});

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.send("Community Ban Bot Online");

});

app.get("/event", (req, res) => {

    const channel = req.query.channel;

    return res.json({
        received: channel,
        allowedChannels: CONFIG.ALLOWED_CHANNELS,
        includes: CONFIG.ALLOWED_CHANNELS.includes(channel)
    });

});

/*
|--------------------------------------------------------------------------
| SERVER START
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});

console.log("Bot starting...");
