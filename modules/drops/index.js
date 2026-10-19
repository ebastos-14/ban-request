
import { getAppAccessToken } from "../../server/twitch-api.js";
const DROPS = {
  "albiononline": "cat Albion",
  "aion2": "cat Aion"
};

function normalizarCategoria(nombre = "") {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function twitchGet(endpoint, params = {}) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getAppAccessToken();
  
  if (!clientId) {
    throw new Error("Falta TWITCH_CLIENT_ID en Render.");
}

  const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
  const detalle = await response.text();
  console.error(
    `[drops] ${endpoint}: HTTP ${response.status}`,
    detalle
  );
  throw new Error(`Twitch API respondió HTTP ${response.status}`);
}

  return response.json();
}

async function consultarCanal(channelName) {
  const users = await twitchGet("users", {
    login: channelName
  });

  const user = users.data?.[0];

  if (!user) {
    throw new Error(`No se encontró el canal ${channelName}`);
  }

  const [channels, streams] = await Promise.all([
    twitchGet("channels", {
      broadcaster_id: user.id
    }),
    twitchGet("streams", {
      user_id: user.id
    })
  ]);

  const informacion = channels.data?.[0];

  if (!informacion) {
    throw new Error("Twitch no devolvió la información del canal");
  }

  return {
    categoria: informacion.game_name || "",
    enDirecto: (streams.data?.length ?? 0) > 0
  };
}

export default {
  name: "drops",
  enabled: true,

  channels: ["ebastos14_", "jaciitv"],

  async handleMessage({ client, channel, channelName, message }) {
    if (message.trim().toLowerCase() !== "!drops") return;

    try {
      const info = await consultarCanal(channelName);
      const categoria = normalizarCategoria(info.categoria);
      const codigo = DROPS[categoria];

      if (codigo) {
        await client.say(channel, codigo);
        return;
      }

      if (!info.categoria) {
        await client.say(
          channel,
          info.enDirecto
            ? "No pude detectar la categoría actual del canal."
            : "El canal está offline y no tiene una categoría disponible en Twitch."
        );
        return;
      }

      await client.say(
        channel,
        `No hay drops establecidos para la categoría: ${info.categoria}.`
      );
    } catch (error) {
      console.error("[drops]", error);

      await client.say(
        channel,
        "Hubo un error consultando Twitch. Revisa las credenciales y la consola del bot."
      );
    }
  }
};
