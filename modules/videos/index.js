
const videoCommands = {
  "!mabel5": "Maeve en 5' 📚 Mini guía y builds 📚 Albion Online en Español 📚 Jaciitv --- https://youtu.be/m4oJKZ3kFMA?si=SzmJSsJVIwN1vOvR",

  "!santuario35": "POV ❤️‍🔥 DRAGON SANCTUARY en 35 min. - Albion Online en Español --- https://youtu.be/5dOjhRMHgZg?si=yqMBF3tR5vlNzME0",

  "!dracoguia": "🐲DRAGONES 🪙 El mayor silver sink de la historia de Albion? 🪙 Guía y Builds 📚 AO en Español --- https://youtu.be/3EpXB9zAW4w?si=2_vtfPx3t-UKhuNA",

  "!que": "so",
};

export default {
  name: "videos",
  enabled: true,

  // Canales donde estarán habilitados los comandos.
  channels: ["ebastos14", "jaciitv", "mrryden", "vonkure"],

  async handleMessage({ client, channel, message }) {
    const command = message.trim().toLowerCase();
    const response = videoCommands[command];

    if (response) {
      await client.say(channel, response);
    }
  },
};
