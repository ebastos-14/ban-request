
export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14_", "jaciitv"],

  lastRaiderByChannel: {},

  async handleRaid({ channel, username }) {
    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .toLowerCase();

    const raider = String(username ?? "").replace(/^@/, "").trim();

    if (!this.channels.includes(targetChannel) || !raider) return;

    this.lastRaiderByChannel[targetChannel] = raider;

    console.log(
      `[shoutout] Raid recibida en #${targetChannel} desde ${raider}`
    );
  },

  async handleMessage({ client, channel, message, isMod }) {
    if (message.trim().toLowerCase() !== "!solast") return;
    if (!isMod) return;

    const targetChannel = channel.replace(/^#/, "").toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    const raider = this.lastRaiderByChannel[targetChannel];

    if (!raider) {
      await client.say(channel, "No hay ninguna raid registrada en este canal.");
      return;
    }

    await client.say(channel, `/me ${raider}`);
  },
};
