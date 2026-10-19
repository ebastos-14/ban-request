
export default {
  name: "shoutout",
  enabled: true,

  // Canales donde estará habilitado.
  channels: ["ebastos14_", "jaciitv"],

  // Guarda el último streamer que hizo raid.
  lastRaider: null,

  // Se llama cuando el bot detecta un raid.
  async handleRaid({ channel, username }) {
    const targetChannel = channel.replace(/^#/, "").toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    if (username) {
      this.lastRaider = username.replace(/^@/, "");
      console.log(`[shoutout] Último raid: ${this.lastRaider}`);
    }
  },

  // Comando para hacer shoutout al último streamer.
  async handleMessage({ client, channel, message }) {
    if (message.trim().toLowerCase() !== "!solast") return;

    const targetChannel = channel.replace(/^#/, "").toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    if (!this.lastRaider) {
      await client.say(channel, "No hay coso.");
      return;
    }

    await client.say(channel, `/me ${this.lastRaider}`);
  },
};
