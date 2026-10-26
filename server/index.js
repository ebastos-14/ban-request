import "dotenv/config";
import express from "express";
import tmi from "tmi.js";
import { loadModules } from "./module-hub.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Estado de la conexión con Twitch
let twitchConnected = false;
let twitchConnectedAt = null;
let twitchDisconnectedAt = null;
let twitchReconnectAttempts = 0;

// Página principal
app.get("/", (req, res) => {
  res.status(200).send("Bot de Twitch activo");
});

// Endpoint para UptimeRobot
app.get("/health", (req, res) => {
  const health = {
    status: "online",
    service: "community-ban-bot",
    timestamp: Date.now(),
    twitch: {
      connected: twitchConnected,
      connectedAt: twitchConnectedAt,
      disconnectedAt: twitchDisconnectedAt,
      reconnectAttempts: twitchReconnectAttempts
    }
  };

  // El servidor HTTP está vivo aunque Twitch se desconecte.
  // UptimeRobot comprueba el servidor, no la conexión con Twitch.
  res.status(200).json(health);
});

// Iniciar servidor HTTP para Render y UptimeRobot
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor HTTP activo en el puerto ${PORT}`);
});

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const OAUTH_TOKEN = process.env.TWITCH_OAUTH;

if (!BOT_USERNAME || !OAUTH_TOKEN) {
  console.error(
    "Faltan TWITCH_BOT_USERNAME o TWITCH_OAUTH en las variables de entorno."
  );
  process.exit(1);
}

function normalizeChannel(channel) {
  return String(channel ?? "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
}

const modules = await loadModules();

const channels = [
  ...new Set(
    modules
      .filter((module) => module.enabled !== false)
      .flatMap((module) => module.channels ?? [])
      .map(normalizeChannel)
      .filter(Boolean)
  )
];

if (channels.length === 0) {
  console.error(
    "Ningún módulo tiene canales configurados. Edita channels en modules/*/index.js."
  );
  process.exit(1);
}

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels
});

// Conexión establecida
client.on("connected", (address, port) => {
  twitchConnected = true;
  twitchConnectedAt = new Date().toISOString();
  twitchDisconnectedAt = null;

  console.log(`Conectado a Twitch en ${address}:${port}`);
  console.log(`Canales: ${channels.map((channel) => `#${channel}`).join(", ")}`);
  console.log(
    `Módulos cargados: ${modules
      .map((module) => module.name ?? "sin nombre")
      .join(", ")}`
  );
});

// Desconexión de Twitch
client.on("disconnected", (reason) => {
  twitchConnected = false;
  twitchDisconnectedAt = new Date().toISOString();

  console.warn(`[Twitch] Desconectado: ${reason ?? "motivo desconocido"}`);
});

// Mensajes de chat
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
      console.error(
        `[${module.name ?? "módulo"}] Error en #${channel}:`,
        error
      );
    }
  }
});

// Avisos de Twitch
client.on("notice", (channel, msgid, message) => {
  console.warn(
    `[Twitch notice] ${channel ?? ""} ${msgid ?? ""} ${message ?? ""}`
  );
});

// Raids
client.on("raided", async (rawChannel, username, viewers) => {
  const channel = normalizeChannel(rawChannel);

  console.log(
    `[raid detectada] Canal receptor: #${channel} | Streamer: ${username} | Espectadores: ${viewers}`
  );

  for (const module of modules) {
    if (module.enabled === false) continue;
    if (typeof module.handleRaid !== "function") continue;

    const allowedChannels = (module.channels ?? []).map(normalizeChannel);
    if (!allowedChannels.includes(channel)) continue;

    try {
      await module.handleRaid({ channel, username, viewers, client });
    } catch (error) {
      console.error(`[${module.name}] Error al procesar raid:`, error);
    }
  }
});

// Conectar a Twitch
try {
  await client.connect();
} catch (error) {
  twitchConnected = false;
  console.error("No se pudo conectar a Twitch:", error);
  process.exit(1);
}

// Cierre ordenado
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("Cerrando conexión...");

  try {
    await client.disconnect();
  } catch (error) {
    console.warn("Error al cerrar Twitch:", error);
  }

  server.close(() => {
    process.exit(0);
  });

  // Evitar que el cierre quede bloqueado indefinidamente.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
