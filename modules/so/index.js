
import { getAppAccessToken } from "../../server/twitch-api.js";

async function getUserId(login) {
  if (!login) throw new Error("Falta el nombre del usuario.");

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
        Authorization: `Bearer ${appToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Twitch users API: ${response.status}`);
  }

  const json = await response.json();
  return json.data?.[0]?.id ?? null;
}

async function sendShoutout(channelName, raider) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const shoutoutToken = process.env.TWITCH_SHOUTOUT_TOKEN
    ?.replace(/^oauth:/i, "")
    .trim();

  if (!clientId || !shoutoutToken) {
    throw new Error(
      "Falta TWITCH_CLIENT_ID o TWITCH_SHOUTOUT_TOKEN en Render."
    );
  }

  const broadcasterId = await getUserId(channelName);
  const moderatorId = await getUserId(process.env.TWITCH_BOT_USERNAME);
  const raiderId = await getUserId(raider);

  if (!broadcasterId || !moderatorId || !raiderId) {
    throw new Error("No se pudo encontrar el ID del canal, bot o streamer.");
  }

  const response = await fetch(
    "https://api.twitch.tv/helix/chat/shoutouts" +
      `?from_broadcaster_id=${encodeURIComponent(broadcasterId)}` +
      `&to_broadcaster_id=${encodeURIComponent(raiderId)}` +
      `&moderator_id=${encodeURIComponent(moderatorId)}`,
    {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${shoutoutToken}`,
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twitch Shoutouts API ${response.status}: ${detail}`);
  }
}

export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14_", "jaciitv", "mrryden"],

  lastRaiderByChannel: {},

  async handleRaid({ client, channel, username, viewers }) {
    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    const raider = String(username ?? "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

    const count = Number(viewers);

    if (!this.channels.includes(targetChannel) || !raider) return;

    const viewerCount =
      Number.isFinite(count) && count >= 0 ? count : 0;

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

  async handleMessage(ctx) {
    const { client, channel, username, message, isMod, isBroadcaster } = ctx;

    if (String(message ?? "").trim().toLowerCase() !== "!soubad") return;

    if (!isMod && !isBroadcaster) return;

    const targetChannel = String(channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    const raid = this.lastRaiderByChannel[targetChannel];

    if (!raid) {
      await client.say(channel, "No hay ninguna raid reciente registrada.");
      return;
    }

    try {
      await sendShoutout(targetChannel, raid.username);

      console.log(
        `[shoutout] Shoutout oficial a ${raid.username} en #${targetChannel}, solicitado por ${username}`
      );

      await client.say(
        channel,
        `📣 ¡Shoutout enviado a @${raid.username}!`
      );
    } catch (error) {
      console.error("[shoutout] Error al enviar el shoutout:", error.message);

      await client.say(
        channel,
        "No se pudo enviar el shoutout oficial. Revisa los permisos del token y los logs de Render."
      );
    }
  },
};
