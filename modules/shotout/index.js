
import {
  getTwitchUserAccessToken
} from "../../server/twitch-oauth.js";

/**
 * Obtener ID de un usuario de Twitch.
 */
async function getUserId(login) {
  if (!login) return null;

  const accessToken = await getTwitchUserAccessToken();

  const response = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    {
      headers: {
        "Client-ID": process.env.TWITCH_BOT_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Twitch Users API ${response.status}: ${detail}`
    );
  }

  const json = await response.json();

  return json.data?.[0]?.id ?? null;
}

/**
 * Enviar Shoutout oficial mediante Twitch API.
 */
async function sendShoutout(channelName, targetUsername) {
  const botUsername = process.env.TWITCH_BOT_USERNAME;
  const clientId = process.env.TWITCH_BOT_CLIENT_ID;

  if (!botUsername || !clientId) {
    throw new Error(
      "Falta TWITCH_BOT_USERNAME o TWITCH_BOT_CLIENT_ID en Render."
    );
  }

  const [
    broadcasterId,
    moderatorId,
    targetId
  ] = await Promise.all([
    getUserId(channelName),
    getUserId(botUsername),
    getUserId(targetUsername)
  ]);

  if (!broadcasterId || !moderatorId || !targetId) {
    throw new Error(
      "No se pudo encontrar el ID de uno de los canales de Twitch."
    );
  }

  const accessToken = await getTwitchUserAccessToken();

  const url = new URL(
    "https://api.twitch.tv/helix/chat/shoutouts"
  );

  url.searchParams.set(
    "from_broadcaster_id",
    broadcasterId
  );

  url.searchParams.set(
    "to_broadcaster_id",
    targetId
  );

  url.searchParams.set(
    "moderator_id",
    moderatorId
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status !== 204) {
    const detail = await response.text();

    throw new Error(
      `Twitch Shoutout API ${response.status}: ${detail}`
    );
  }
}

export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14_", "jaciitv"],

  lastRaiderByChannel: {},

  /**
   * Registrar la última raid recibida.
   */
  async handleRaid({
    client,
    channel,
    username,
    viewers
  }) {
    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    const raider = String(username ?? "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

    const count = Number(viewers);

    if (
      !this.channels.includes(targetChannel) ||
      !raider
    ) {
      return;
    }

    const viewerCount =
      Number.isFinite(count) && count >= 0
        ? count
        : 0;

    this.lastRaiderByChannel[targetChannel] = {
      username: raider,
      viewers: viewerCount
    };

    console.log(
      `[shoutout] Raid en #${targetChannel}: ${raider}, espectadores=${viewerCount}`
    );

    // Respuestas de prueba según espectadores.
    if (viewerCount >= 1 && viewerCount <= 19) {
      await client.say(
        `#${targetChannel}`,
        `test0 ${viewerCount}`
      );
    } else if (
      viewerCount >= 20 &&
      viewerCount <= 39
    ) {
      await client.say(
        `#${targetChannel}`,
        `test1 ${viewerCount}`
      );
    } else if (viewerCount >= 40) {
      await client.say(
        `#${targetChannel}`,
        `test2 ${viewerCount}`
      );
    }
  },

  /**
   * Comando !solast exclusivo para moderadores.
   */
  async handleMessage({
    client,
    channel,
    message,
    isMod,
    isBroadcaster
  }) {
    if (
      String(message ?? "").trim().toLowerCase() !==
      "!solast"
    ) {
      return;
    }

    if (!isMod && !isBroadcaster) return;

    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    const raid =
      this.lastRaiderByChannel[targetChannel];

    if (!raid) {
      await client.say(
        channel,
        "No hay coso reciente"
      );

      return;
    }

    try {
      await sendShoutout(
        targetChannel,
        raid.username
      );

      await client.say(
        channel,
        `Hola ${raid.username}`
      );

    } catch (error) {
      console.error(
        `[shoutout] Error en #${targetChannel}:`,
        error
      );

      await client.say(
        channel,
        "No coso, falta el cosito"
      );
    }
  }
};
