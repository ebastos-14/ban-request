
const DROPS = {
  "albion online": "codeKeyAlbion",
  "aion 2": "codeVipAion"
};

const categoryCache = new Map();
const CACHE_MS = 30_000;

async function getCategory(channelName) {
  const cached = categoryCache.get(channelName);

  if (cached && Date.now() - cached.time < CACHE_MS) {
    return cached.category;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = process.env.TWITCH_APP_TOKEN;

  if (!clientId || !token) {
    throw new Error("Faltan las credenciales de Twitch");
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelName)}`,
    {
      headers: {
        "Client-Id": clientId,
        "Authorization": `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Twitch API: ${response.status}`);
  }

  const data = await response.json();
  const category = data.data?.[0]?.game_name ?? null;

  categoryCache.set(channelName, {
    category,
    time: Date.now()
  });

  return category;
}

export default {
  name: "drops",
  enabled: true,

  channels: ["ebastos14_", "jaciitv"],

  async handleMessage({ client, channel, channelName, message }) {
    if (message.trim().toLowerCase() !== "!drop") return;

    try {
      const category = await getCategory(channelName);

      if (!category) {
        await client.say(
          channel,
          "No se pudo detectar el juego. El canal podría estar desconectado."
        );
        return;
      }

      const key = category.trim().toLowerCase();
      const code = DROPS[key];

      if (!code) return;

      await client.say(channel, code);
    } catch (error) {
      console.error("[drops]", error);
      await client.say(
        channel,
        "No pude consultar los drops en este momento."
      );
    }
  }
};
