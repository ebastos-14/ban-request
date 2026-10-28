import { getAppAccessToken } from "../../server/twitch-api.js";
const VOTE_DURATION_MS = 60_000;
const COOLDOWN_DURATION_MS = 10_000;
const MOD_RESPONSE_TIMEOUT_MS = 60_000;

// Estado y cooldown independientes por canal.
const channelStates = new Map();
const cooldowns = new Map();

function getState(channelName) {
  if (!channelStates.has(channelName)) {
    channelStates.set(channelName, {
      state: "idle",
      activeVote: null,
      timer: null
    });
  }
  return channelStates.get(channelName);
}

function onCooldown(channelName) {
  return (cooldowns.get(channelName) ?? 0) > Date.now();
}

function startCooldown(channelName) {
  cooldowns.set(channelName, Date.now() + COOLDOWN_DURATION_MS);
}

function clearState(state) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.state = "idle";
  state.activeVote = null;
}

async function getUserId(login) {
  if (!login) throw new Error("No se recibió el nombre de usuario.");

  const clientId = process.env.TWITCH_CLIENT_ID;
  const appToken = await getAppAccessToken();
  
  if (!clientId) {
    throw new Error("Falta TWITCH_CLIENT_ID en Render.");
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    {
      headers: {
        "Client-ID": clientId,
        "Authorization": `Bearer ${appToken}`
      }
    }
  );

  if (!response.ok) throw new Error(`Twitch users API: ${response.status}`);
  const json = await response.json();
  return json.data?.[0]?.id ?? null;
}

async function banUser(channelName, target, requester) {
  const broadcasterId = await getUserId(channelName);
  const moderatorId = await getUserId(process.env.TWITCH_BOT_USERNAME);
  const userId = await getUserId(target);

  if (!broadcasterId || !moderatorId || !userId) {
    throw new Error("No se pudo encontrar el ID del canal, bot o usuario.");
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(moderatorId)}`,
    {
      method: "POST",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${process.env.TWITCH_APP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: {
          user_id: userId,
          reason: `Petición por: @${requester}`
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Twitch moderation API: ${response.status}`);
}

export default {
  name: "ban",
  enabled: true,

  // Cambia esta lista sin modificar ningún otro archivo.
  channels: ["ebastos14", "jaciitv"],

  async handleMessage(ctx) {
    const { client, channel, channelName, username } = ctx;
    const message = ctx.message.trim().replace(/\s+/g, " ");
    const lower = message.toLowerCase();
    const state = getState(channelName);

    // Iniciar votación: requestban @usuario
    if (lower.startsWith("requestban ")) {
      if (state.state !== "idle" || onCooldown(channelName)) return;

      const targetToken = message.split(" ")[1] ?? "";
      const target = targetToken.replace(/^@/, "").toLowerCase();

      if (!target || !/^[a-z0-9_]{1,25}$/.test(target)) {
        await client.say(channel, "Uso: requestban @usuario");
        return;
      }
      if (target === username) {
        await client.say(channel, "No puedes solicitar un ban para ti mismo.");
        return;
      }

      state.state = "voting";
      state.activeVote = {
        target,
        requester: username,
        yes: new Set(),
        no: new Set()
      };

      await client.say(channel, `60s ⏱️ @${username} pide ban a @${target} ⚖️ voteban o votedef`);

      state.timer = setTimeout(async () => {
        const vote = state.activeVote;
        if (!vote || state.state !== "voting") return;

        const yes = vote.yes.size;
        const no = vote.no.size;

        if (yes > no) {
          state.state = "awaiting_mod";
          await client.say(channel, `(Sí ${yes} / ${no} No) ⏳ Esperando respuesta del mod para banear`);

          state.timer = setTimeout(async () => {
            if (state.state !== "awaiting_mod") return;
            await client.say(channel, "⌛ Ningún moderador respondió.");
            startCooldown(channelName);
            clearState(state);
          }, MOD_RESPONSE_TIMEOUT_MS);
        } else {
          await client.say(channel, `GG @${target} 🛡️ (Sí ${yes} / ${no} No), otro día será.`);
          startCooldown(channelName);
          clearState(state);
        }
      }, VOTE_DURATION_MS);

      return;
    }

    if (lower === "voteban" || lower === "votedef") {
      if (state.state !== "voting" || !state.activeVote) return;

      // Un usuario solo puede mantener un voto.
      state.activeVote.yes.delete(username);
      state.activeVote.no.delete(username);

      if (lower === "voteban") state.activeVote.yes.add(username);
      else state.activeVote.no.add(username);
      return;
    }

    if (lower === "accept") {
      if (state.state !== "awaiting_mod" || !state.activeVote) return;
      if (!ctx.isMod && !ctx.isBroadcaster) {
        await client.say(channel, `@${username}, solo un moderador puede confirmar el ban.`);
        return;
      }

      const vote = state.activeVote;
      try {
        await banUser(channelName, vote.target, vote.requester);
        await client.say(channel, `☠️ @${vote.target} baneado por petición del chat.`);
      } catch (error) {
        console.error("[ban] No se pudo ejecutar el ban:", error);
        await client.say(channel, "❓ No se pudo ejecutar el ban. Revisa permisos y credenciales de Twitch.");
      }

      startCooldown(channelName);
      clearState(state);
      return;
    }

    if (lower === "cancel") {
      if (state.state !== "awaiting_mod" || !state.activeVote) return;
      if (!ctx.isMod && !ctx.isBroadcaster) {
        await client.say(channel, `@${username}, solo un moderador puede cancelar.`);
        return;
      }

      await client.say(channel, "Votación cancelada por moderación.");
      startCooldown(channelName);
      clearState(state);
    }
  }
};
