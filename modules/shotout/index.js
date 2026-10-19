
export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14_", "jaciitv"],

  lastRaiderByChannel: {},

  async handleRaid({ client, channel, username, viewers }) {
    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .toLowerCase();

    const raider = String(username ?? "")
      .replace(/^@/, "")
      .trim();

    const count = Number(viewers);

    if (!this.channels.includes(targetChannel) || !raider) return;

    const viewerCount = Number.isFinite(count) && count >= 0
      ? count
      : 0;

    this.lastRaiderByChannel[targetChannel] = {
      username: raider,
      viewers: viewerCount,
    };

    console.log(
      `[shoutout] Raid en #${targetChannel}: ${raider}, espectadores=${viewerCount}`
    );

    if (viewerCount >= 1 && viewerCount <= 19) {
      await client.say(`#${targetChannel}`, `test0 ${viewerCount}`);
    }

    if (viewerCount >= 20 && viewerCount <= 39) {
      await client.say(`#${targetChannel}`, `test1 ${viewerCount}`);
    }

    if (viewerCount >= 40) {
      await client.say(`#${targetChannel}`, `test2 ${viewerCount}`);
    }
  },

  async handleMessage({ client, channel, message, isMod }) {
    if (message.trim().toLowerCase() !== "!solast") return;
    if (!isMod) return;

    const targetChannel = channel.replace(/^#/, "").toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    const raid = this.lastRaiderByChannel[targetChannel];

    if (!raid) {
      await client.say(channel, "No hay ninguna raid registrada en este canal.");
      return;
    }

    await client.say(channel, `hola ${raid.username}`);
  },
};
