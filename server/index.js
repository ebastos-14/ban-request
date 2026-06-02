import express from "express";
import tmi from "tmi.js";

import { CONFIG } from "./config.js";
import { getChannel } from "./state.js";

console.log("CONFIG CHANNELS:", CONFIG.ALLOWED_CHANNELS);

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
| CHAT EVENTS
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
| ROUTES
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.send("Community Ban Bot Online");

});

app.get("/event", (req, res) => {

    return res.json({

        configChannels: CONFIG.ALLOWED_CHANNELS,

        firstConfigChannel: CONFIG.ALLOWED_CHANNELS[0],

        hasHash: CONFIG.ALLOWED_CHANNELS[0].startsWith("#"),

        queryChannel: req.query.channel

    });

});
/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});

console.log("Bot starting...");
