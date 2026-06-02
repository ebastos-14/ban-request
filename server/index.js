import express from "express";

import { CONFIG } from "./config.js";
import { getChannel } from "./state.js";

const app = express();

const PORT = process.env.PORT || 3000;

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

    if (!CONFIG.ALLOWED_CHANNELS.includes(channel)) {

        return res.status(403).json({
            error: "channel not allowed"
        });

    }

    const channelData = getChannel(channel);

    res.json(channelData);

});

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});

console.log("Bot starting...");
