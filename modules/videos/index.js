export default {
  name: "videos",
  enabled: true,

  // Pon aquí los canales donde quieras habilitar los comandos de videos.
  channels: ["ebastos14_"],

  async handleMessage({ client, channel, message }) {
    if (message.toLowerCase() === "!video") {
      await client.say(channel, "Añade aquí tu enlace o la lógica de recomendación de videos.");
    }
  }
};
