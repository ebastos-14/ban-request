export const channels = {};

export function getChannel(channelName) {

    if (!channels[channelName]) {

        channels[channelName] = {

            state: "idle",

            activeVote: null,

            cooldownUntil: 0,

            history: []

        };

    }

    return channels[channelName];

}
