const channels = {};

export function getChannel(channelName) {

    const channel = channelName.toLowerCase();

    if (!channels[channel]) {

        channels[channel] = {

            state: "idle",

            activeVote: null,

            cooldownUntil: 0,

            history: []

        };

    }

    return channels[channel];

}
