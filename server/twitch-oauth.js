
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth central de BotEB14.
 * - Authorization Code Grant.
 * - Renovación automática del Access Token.
 * - Persistencia del Refresh Token actualizado.
 *
 * Requiere un Persistent Disk de Render montado en /var/data.
 */

export const TWITCH_SCOPES = [
  "user:bot",
  "user:read:chat",
  "user:write:chat",
  "channel:bot",
  "channel:moderate",
  "moderator:read:banned_users",
  "moderator:manage:banned_users",
  "moderator:read:moderators",
  "channel:manage:moderators",
  "moderator:read:vips",
  "channel:read:vips",
  "channel:manage:vips",
  "channel:read:subscriptions",
  "channel:manage:raids",
  "moderator:read:shoutouts",
  "moderator:manage:shoutouts",
  "channel:read:predictions",
  "channel:manage:predictions",
  "channel:read:polls",
  "channel:manage:polls",
  "channel:read:redemptions",
  "channel:manage:redemptions"
];

const TOKEN_FILE =
  process.env.TWITCH_OAUTH_FILE || "/var/data/twitch-oauth.json";

const AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";

let tokenData = null;
let pendingState = null;
let refreshInProgress = null;

function getConfig() {
  const clientId = process.env.TWITCH_BOT_CLIENT_ID;
  const clientSecret = process.env.TWITCH_BOT_CLIENT_SECRET;
  const redirectUri = process.env.TWITCH_BOT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Configura TWITCH_BOT_CLIENT_ID, TWITCH_BOT_CLIENT_SECRET y TWITCH_BOT_REDIRECT_URI en Render."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

async function saveTokens(data) {
  const directory = path.dirname(TOKEN_FILE);

  await fs.mkdir(directory, { recursive: true });

  const temporaryFile = `${TOKEN_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    JSON.stringify(data, null, 2),
    {
      encoding: "utf8",
      mode: 0o600
    }
  );

  await fs.rename(temporaryFile, TOKEN_FILE);

  tokenData = data;
}

async function loadTokens() {
  if (tokenData) return tokenData;

  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf8");
    tokenData = JSON.parse(raw);
    return tokenData;
  } catch (error) {
    if (error.code === "ENOENT") return null;

    throw new Error(
      `No se pudo leer el archivo OAuth: ${error.message}`
    );
  }
}

async function readTwitchError(response) {
  const body = await response.text();

  return `Twitch respondió HTTP ${response.status}: ${body}`;
}

function safeStateEquals(received, expected) {
  if (
    typeof received !== "string" ||
    typeof expected !== "string"
  ) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

/**
 * Registra las rutas de autorización de BotEB14.
 *
 * Abrir:
 * https://TU-SERVICIO.onrender.com/auth/twitch
 */
export function registerTwitchOAuthRoutes(app) {

  // Iniciar autorización
  app.get("/auth/twitch", (req, res) => {
    try {
      const { clientId, redirectUri } = getConfig();

      pendingState = randomBytes(32).toString("hex");

      const url = new URL(AUTH_URL);

      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set(
        "scope",
        TWITCH_SCOPES.join(" ")
      );
      url.searchParams.set("state", pendingState);
      url.searchParams.set("force_verify", "true");

      res.redirect(url.toString());

    } catch (error) {
      console.error("[OAuth Twitch]", error);
      res.status(500).send(error.message);
    }
  });

  // Recibir autorización de Twitch
  app.get("/auth/twitch/callback", async (req, res) => {
    try {
      const {
        code,
        state,
        error,
        error_description: errorDescription
      } = req.query;

      if (error) {
        pendingState = null;

        return res.status(400).send(
          `Twitch no autorizó la aplicación: ${String(
            errorDescription || error
          )}`
        );
      }

      if (
        !code ||
        !safeStateEquals(
          String(state || ""),
          pendingState
        )
      ) {
        pendingState = null;

        return res.status(400).send(
          "Autorización inválida o expirada. Vuelve a abrir /auth/twitch."
        );
      }

      pendingState = null;

      const {
        clientId,
        clientSecret,
        redirectUri
      } = getConfig();

      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          grant_type: "authorization_code",
          redirect_uri: redirectUri
        })
      });

      if (!response.ok) {
        throw new Error(await readTwitchError(response));
      }

      const result = await response.json();

      const grantedScopes = Array.isArray(result.scope)
        ? result.scope
        : [];

      const missingScopes = TWITCH_SCOPES.filter(
        (scope) => !grantedScopes.includes(scope)
      );

      const data = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at:
          Date.now() +
          Number(result.expires_in || 0) * 1000,
        scope: grantedScopes,
        token_type: result.token_type || "bearer",
        updated_at: new Date().toISOString()
      };

      if (!data.access_token || !data.refresh_token) {
        throw new Error(
          "Twitch no devolvió Access Token y Refresh Token."
        );
      }

      await saveTokens(data);

      console.log(
        `[OAuth Twitch] Autorización guardada. Scopes recibidos: ${grantedScopes.length}/22`
      );

      const missingMessage = missingScopes.length
        ? `<p><b>Scopes no concedidos (${missingScopes.length}):</b> ${missingScopes.join(", ")}</p>`
        : "<p>Los 22 scopes solicitados fueron concedidos.</p>";

      res.status(200).send(`
        <!doctype html>
        <html lang="es">
        <meta charset="utf-8">
        <title>BotEB14 autorizado</title>
        <body style="font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 16px">
          <h2>BotEB14 quedó autorizado</h2>
          <p>Access Token y Refresh Token guardados en el almacenamiento persistente.</p>
          <p>Scopes recibidos: <b>${grantedScopes.length}/22</b></p>
          ${missingMessage}
          <p>Ya puedes cerrar esta página.</p>
        </body>
        </html>
      `);

    } catch (error) {
      console.error("[OAuth Twitch callback]", error);

      res.status(500).send(
        `No se pudo completar la autorización: ${error.message}`
      );
    }
  });
}

/**
 * Renueva el token cuando está próximo a caducar.
 * También guarda el Refresh Token nuevo si Twitch lo rota.
 */
async function refreshAccessToken(current) {
  const { clientId, clientSecret } = getConfig();

  if (!current?.refresh_token) {
    throw new Error(
      "No existe Refresh Token. Abre /auth/twitch para autorizar BotEB14 nuevamente."
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `No se pudo renovar el token (HTTP ${response.status}). Autoriza nuevamente en /auth/twitch. ${detail}`
    );
  }

  const result = await response.json();

  const next = {
    access_token: result.access_token,

    refresh_token:
      result.refresh_token || current.refresh_token,

    expires_at:
      Date.now() +
      Number(result.expires_in || 0) * 1000,

    scope: Array.isArray(result.scope)
      ? result.scope
      : current.scope || [],

    token_type: result.token_type || "bearer",

    updated_at: new Date().toISOString()
  };

  await saveTokens(next);

  console.log(
    "[OAuth Twitch] Access Token renovado y Refresh Token guardado."
  );

  return next;
}

/**
 * Función central que utilizarán los módulos.
 */
export async function getTwitchUserAccessToken() {
  if (refreshInProgress) {
    return refreshInProgress;
  }

  const current = await loadTokens();

  if (
    !current?.access_token ||
    !current?.refresh_token
  ) {
    throw new Error(
      "BotEB14 aún no está autorizado. Abre /auth/twitch."
    );
  }

  // Renovar dos minutos antes de la caducidad.
  if (
    Date.now() <
    Number(current.expires_at || 0) - 120_000
  ) {
    return current.access_token;
  }

  refreshInProgress = refreshAccessToken(current);

  try {
    const refreshed = await refreshInProgress;
    return refreshed.access_token;
  } finally {
    refreshInProgress = null;
  }
}

export async function validateTwitchUserToken() {
  const accessToken = await getTwitchUserAccessToken();

  const response = await fetch(VALIDATE_URL, {
    headers: {
      Authorization: `OAuth ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(await readTwitchError(response));
  }

  return response.json();
}

export async function getTwitchOAuthStatus() {
  const current = await loadTokens();

  if (!current) {
    return {
      authorized: false,
      scopes: [],
      expiresAt: null
    };
  }

  return {
    authorized: Boolean(
      current.access_token &&
      current.refresh_token
    ),
    scopes: current.scope || [],
    expiresAt: current.expires_at || null
  };
}
