import "dotenv/config";
import tmi from "tmi.js";
import { loadModules } from "./module-hub.js";

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const OAUTH_TOKEN = process.env.TWITCH_OAUTH;

if (!BOT_USERNAME || !OAUTH_TOKEN) {
  console.error("Faltan TWITCH_BOT_USERNAME o TWITCH_OAUTH en las variables de entorno.");
  process.exit(1);
}

const modules = await loadModules();
const channels = [...new Set(
  modules
    .filter((module) => module.enabled !== false)
    .flatMap((module) => module.channels ?? [])
    .map(normalizeChannel)
    .filter(Boolean)
)];

if (channels.length === 0) {
  console.error("Ningún módulo tiene canales configurados. Edita channels en modules/*/index.js.");
  process.exit(1);
}

function normalizeChannel(channel) {
  return String(channel ?? "").replace(/^#/, "").trim().toLowerCase();
}

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels
});

client.on("connected", (address, port) => {
  console.log(`Conectado a Twitch en ${address}:${port}`);
  console.log(`Canales: ${channels.map((channel) => `#${channel}`).join(", ")}`);
  console.log(`Módulos cargados: ${modules.map((module) => module.name ?? "sin nombre").join(", ")}`);
});

client.on("message", async (rawChannel, tags, rawMessage, self) => {
  if (self) return;

  const channel = normalizeChannel(rawChannel);
  const username = (tags.username ?? "").toLowerCase();
  const message = String(rawMessage ?? "").trim().replace(/\s+/g, " ");

  if (!message) return;

  const context = {
    client,
    channel: `#${channel}`,
    channelName: channel,
    username,
    userId: tags["user-id"] ?? null,
    displayName: tags["display-name"] ?? username,
    message,
    tags,
    isMod: Boolean(tags.mod || tags.badges?.broadcaster),
    isBroadcaster: Boolean(tags.badges?.broadcaster)
  };

  for (const module of modules) {
    if (module.enabled === false) continue;

    const allowedChannels = (module.channels ?? []).map(normalizeChannel);
    if (!allowedChannels.includes(channel)) continue;

    try {
      await module.handleMessage(context);
    } catch (error) {
      console.error(`[${module.name ?? "módulo"}] Error en #${channel}:`, error);
    }
  }
});

client.on("notice", (channel, msgid, message) => {
  console.warn(`[Twitch notice] ${channel ?? ""} ${msgid ?? ""} ${message ?? ""}`);
});

try {
  await client.connect();
} catch (error) {
  console.error("No se pudo conectar a Twitch:", error);
  process.exit(1);
}

async function shutdown() {
  console.log("Cerrando conexión...");
  try {
    await client.disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
