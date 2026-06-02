const channels = {};

export function getChannel(channelName) {

```
const channel = channelName
    .replace(/^#/, "")
    .trim()
    .toLowerCase();

if (!channels[channel]) {

    channels[channel] = {

        state: "idle",

        activeVote: null,

        cooldownUntil: 0,

        history: []

    };

}

return channels[channel];
```

}

export function createVote(channelName, requester, target) {

```
const channel = getChannel(channelName);

channel.state = "voting";

channel.activeVote = {

    requester,

    target,

    yesVotes: [],

    noVotes: [],

    startedAt: Date.now(),

    endsAt: Date.now() + 60000

};
```

}

export function finishVote(channelName) {

```
const channel = getChannel(channelName);

channel.activeVote = null;

channel.state = "idle";
```

}

export function startCooldown(channelName, seconds = 120) {

```
const channel = getChannel(channelName);

channel.cooldownUntil = Date.now() + (seconds * 1000);
```

}

export function addHistory(channelName, entry) {

```
const channel = getChannel(channelName);

channel.history.unshift(entry);

channel.history = channel.history.slice(0, 100);
```

}
