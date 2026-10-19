export default {
  name: "videos",
  enabled: true,

  // Pon aquí los canales donde quieras habilitar los comandos de videos.
  channels: ["ebastos14_", "jaciitv"],

  async handleMessage({ client, channel, message }) {
    if (message.toLowerCase() === "!mabel5") {
      await client.say(channel, "Maeve en 5' 📚 Mini guía y builds 📚 Albion Online en Español 📚 Jaciitv --- https://youtu.be/m4oJKZ3kFMA?si=SzmJSsJVIwN1vOvR");
    }
  };
  async handleMessage({ client, channel, message }) {
    if (message.toLowerCase() === "!santuario35") {
      await client.say(channel, "POV ❤️‍🔥 DRAGON SANCTUARY en 35 min. - Albion Online en Español --- https://youtu.be/5dOjhRMHgZg?si=yqMBF3tR5vlNzME0");
    }
  };
  async handleMessage({ client, channel, message }) {
    if (message.toLowerCase() === "!dracoguia") {
      await client.say(channel, "🐲DRAGONES 🪙 El mayor silver sink de la historia de Albion? 🪙 Guía y Builds 📚 AO en Español --- https://youtu.be/3EpXB9zAW4w?si=2_vtfPx3t-UKhuNA");
    }
  }
};
