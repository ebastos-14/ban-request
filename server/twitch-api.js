
let cachedToken = null;
let tokenExpiresAt = 0;
let pendingRequest = null;

export async function getAppAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  // Evita pedir varios tokens simultáneamente.
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET en Render."
      );
    }

    const response = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials"
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `No se pudo obtener el token de Twitch: HTTP ${response.status}. ${detail}`
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error("Twitch no devolvió un access token.");
    }

    cachedToken = data.access_token;
    tokenExpiresAt =
      Date.now() + Number(data.expires_in) * 1000;

    return cachedToken;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}
