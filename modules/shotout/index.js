
import { getAppAccessToken } from "../../server/twitch-api.js";

async function getUserId(login) {
  if (!login) return null;

  const clientId = process.env.TWITCH_CLIENT_ID;
  const appToken = await getAppAccessToken();

  if (!clientId) {
    throw new Error("Falta TWITCH_CLIENT_ID.");
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

  if (!response.ok) {
    throw new Error(`Twitch users API: ${response.status}`);
  }

  const json = await response.json();
  return json.data?.[0]?.id ?? null;
}

async function sendShoutout(channelName, target) {
  const broadcasterId = await getUserId(channelName);
  const moderatorId = await getUserId(
    process.env.TWITCH_BOT_USERNAME
  );
  const userId = await getUserId(target);

  const clientId = process.env.TWITCH_CLIENT_ID;
  const shoutoutToken = process.env.TWITCH_SHOUTOUT_TOKEN;

  if (!broadcasterId || !moderatorId || !userId) {
    throw new Error("No se pudo encontrar un ID de Twitch.");
  }

  if (!clientId || !shoutoutToken) {
    throw new Error(
      "Falta TWITCH_CLIENT_ID o TWITCH_SHOUTOUT_TOKEN."
    );
  }

  const url = new URL(
    "https://api.twitch.tv/helix/chat/shoutouts"
  );

  url.searchParams.set("from_broadcaster_id", broadcasterId);
  url.searchParams.set("to_broadcaster_id", userId);
  url.searchParams.set("moderator_id", moderatorId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${shoutoutToken}`
    }
  });

  if (response.status !== 204) {
    const detail = await response.text();
    throw new Error(
      `Twitch Shoutout API: ${response.status} ${detail}`
    );
  }
}

export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14", "jaciitv", "boteb14"],

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
      viewers: viewerCount
    };

    console.log(
      `[shoutout] Raid en #${targetChannel}: ${raider}, espectadores=${viewerCount}`
    );

    if (viewerCount >= 1 && viewerCount <= 39) {
      await client.say(
        `#${targetChannel}`,
        `/me Raid de ${raider} jaciitMatecito`
      );
    } else if (viewerCount >= 40) {
      await client.say(
        `#${targetChannel}`,
        `/me Ojito esa raid ameising doble guatafak jaciitMatecito jaciitMatecito`
      );
    }
  },

  async handleMessage({
    client,
    channel,
    channelName,
    message,
    isMod,
    isBroadcaster
  }) {
    if (message.trim().toLowerCase() !== "!solast") return;
    if (!isMod && !isBroadcaster) return;

    const targetChannel = String(channelName ?? channel ?? "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();

    if (!this.channels.includes(targetChannel)) return;

    const raid = this.lastRaiderByChannel[targetChannel];

    if (!raid) {
      await client.say(channel, "No hay coso");
      return;
    }

    try {
      await sendShoutout(targetChannel, raid.username);

      await client.say(
        channel,
        `Hola ${raid.username}`
      );
    } catch (error) {
      console.error(
        `[shoutout] Error con !solast en #${targetChannel}:`,
        error
      );

      await client.say(
        channel,
        "No coso, falta el cosito"
      );
    }
  }
};
