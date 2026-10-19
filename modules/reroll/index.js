
export default {
  name: "sorteotv",
  enabled: true,

  channels: ["ebastos14_", "jaciitv"],

  states: {},
  timers: {},

  async handleMessage({ client, channel, username, message }) {
    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    const sender = String(username ?? "").toLowerCase();
    const text = String(message ?? "").trim();

    if (!this.channels.includes(targetChannel)) return;

    const chatChannel = `#${targetChannel}`;

    // Detectar el anuncio del ganador de Nightbot.
    if (sender === "nightbot") {
      const match = text.match(
        /Congratulations,\s+([^!]+)!\s+You won the giveaway!/i
      );

      if (match) {
        const winner = match[1].trim().replace(/^@/, "");

        if (this.timers[targetChannel]) {
          clearTimeout(this.timers[targetChannel]);
        }

        const state = {
          winner,
          announcedAt: Date.now(),
          stage: "waiting_response",
          requests: new Map(),
        };

        this.states[targetChannel] = state;

        console.log(
          `[sorteotv] Ganador anunciado en #${targetChannel}: ${winner}`
        );

        await client.say(
          chatChannel,
          `jaciitMatecito `
        );

        this.timers[targetChannel] = setTimeout(async () => {
          if (
            this.states[targetChannel] !== state ||
            state.stage !== "waiting_response"
          ) return;

          state.stage = "awaiting_next_winner";

          await client.say(
            chatChannel,
            `Pasaron 30 segundos y ${winner} no respondió.`
          );

          console.log(
            `[sorteotv] ${winner} no respondió en #${targetChannel}`
          );
        }, 30000);

        return;
      }
    }

    const state = this.states[targetChannel];
    if (!state) return;

    // Etapa 1: esperar la respuesta del ganador.
    if (state.stage === "waiting_response") {
      if (sender !== state.winner.toLowerCase()) return;

      const elapsed = Math.min(
        30,
        Math.floor((Date.now() - state.announcedAt) / 1000)
      );

      clearTimeout(this.timers[targetChannel]);

      state.stage = "collecting_requests";
      state.requests = new Map();

      await client.say(
        chatChannel,
        `${state.winner} respondio en ${elapsed}s. Tienen 30 segundos para solicitar RR con jaciitMatecito`
      );

      this.timers[targetChannel] = setTimeout(async () => {
        if (
          this.states[targetChannel] !== state ||
          state.stage !== "collecting_requests"
        ) return;

        state.stage = "awaiting_decision";

        let rr = 0;
        let reroll = 0;
        let emote = 0;

        for (const type of state.requests.values()) {
          if (type === "rr") rr++;
          if (type === "reroll") reroll++;
          if (type === "emote") emote++;
        }

        const total = state.requests.size;

        console.log(
          `[sorteotv] #${targetChannel}: RR=${rr}, reroll=${reroll}, emote=${emote}, total=${total}`
        );

        await client.say(
          chatChannel,
          `El chat acumuló ${total} peticiones jaciitMatecito `
        );
      }, 30000);

      return;
    }

    // Etapa 2: contar solicitudes, una por usuario.
    if (state.stage === "collecting_requests") {
      if (!sender || state.requests.has(sender)) return;

      const normalized = text.toLowerCase();
      let requestType = null;

      if (normalized === "rr") {
        requestType = "rr";
      } else if (normalized === "reroll") {
        requestType = "reroll";
      } else if (/\bjaciitmatecito\b/i.test(text)) {
        requestType = "emote";
      }

      if (!requestType) return;

      state.requests.set(sender, requestType);

      console.log(
        `[sorteotv] Solicitud ${requestType} de ${sender} en #${targetChannel}`
      );
    }
  },
};
