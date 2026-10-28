
import { getAppAccessToken } from "../../server/twitch-api.js";

export default {
  name: "shoutout",
  enabled: true,
  channels: ["ebastos14", "jaciitv", "boteb14"],

  // Déjalo en false hasta comprobar que !solast funciona.
  // Después puedes cambiarlo a true para automatizar raids de 40+.
  autoShoutoutFor40Plus: false,

  lastRaiderByChannel: {},

  async getTwitchUserId(login) {
    const clientId = process.env.TWITCH_CLIENT_ID;

    if (!clientId) {
      throw new Error("Falta TWITCH_CLIENT_ID.");
    }

    const appToken = await getAppAccessToken();

    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      {
        headers: {
          "Client-Id": clientId,
          Authorization: `Bearer ${appToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Error buscando a ${login}: HTTP ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();

    if (!data.data?.length) {
      throw new Error(`No se encontró el usuario ${login}.`);
    }

    return data.data[0].id;
  },

  async sendOfficialShoutout(channelName, raiderUsername) {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const userToken = process.env.TWITCH_SHOUTOUT_TOKEN;
    const botUsername = process.env.TWITCH_BOT_USERNAME;

    if (!clientId || !userToken || !botUsername) {
      throw new Error(
        "Falta TWITCH_CLIENT_ID, TWITCH_SHOUTOUT_TOKEN o TWITCH_BOT_USERNAME."
      );
    }

    // La cuenta del token debe ser la del bot, y este debe ser
    // moderador del canal donde se enviará el shoutout.
    const [broadcasterId, raiderId, moderatorId] = await Promise.all([
      this.getTwitchUserId(channelName),
      this.getTwitchUserId(raiderUsername),
      this.getTwitchUserId(botUsername),
    ]);

    const params = new URLSearchParams({
      from_broadcaster_id: broadcasterId,
      to_broadcaster_id: raiderId,
      moderator_id: moderatorId,
    });

    const response = await fetch(
      `https://api.twitch.tv/helix/chat/shoutouts?${params}`,
      {
        method: "POST",
        headers: {
          "Client-Id": clientId,
          Authorization: `Bearer ${userToken}`,
        },
      }
    );

    // Twitch responde 204 cuando el shoutout se envía correctamente.
    if (response.status !== 204) {
      const detail = await response.text();

      throw new Error(
        `Twitch rechazó el shoutout: HTTP ${response.status} ${detail}`
      );
    }

    console.log(
      `[shoutout] Shoutout oficial enviado en #${channelName} a ${raiderUsername}`
    );
  },

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

    if (viewerCount >= 1 && viewerCount <= 39) {
      await client.say(
        `#${targetChannel}`,
        `/me Raid de ${raider} jaciitMatecito`
      );
    }

    if (viewerCount >= 40) {
      await client.say(
        `#${targetChannel}`,
        "/me Ojito esa raid ameising doble guatafak jaciitMatecito jaciitMatecito"
      );

      // Automatización preparada, desactivada por defecto.
      if (this.autoShoutoutFor40Plus) {
        try {
          await this.sendOfficialShoutout(targetChannel, raider);
        } catch (error) {
          console.error(
            `[shoutout] Falló el automático en #${targetChannel}:`,
            error
          );
        }
      }
    }
  },

  async handleMessage({ client, channel, message, isMod }) {
    if (message.trim().toLowerCase() !== "!solast") return;
    if (!isMod) return;

    const targetChannel = channel
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
      await this.sendOfficialShoutout(
        targetChannel,
        raid.username
      );

      await client.say(
        channel,
        `Hola @${raid.username}!`
      );
    } catch (error) {
      console.error(
        `[shoutout] Error con !solast en #${targetChannel}:`,
        error
      );

      await client.say(
        channel,
        "No se puede coso, falta el cosito"
      );
    }
  },
};
