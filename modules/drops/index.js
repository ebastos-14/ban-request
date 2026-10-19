export default {
  name: "redes",
  enabled: true,
  channels: ["ebastos14_"],

  async handleMessage({ client, channel, message }) {
    if (message.toLowerCase() === "!drops") {
      await client.say(channel, "Redes sociales: edita este mensaje en modules/redes/index.js");
    }
  }
};
