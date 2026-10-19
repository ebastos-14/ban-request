# Bot modular de Twitch

Bot de chat con módulos independientes. Cada carpeta dentro de `modules/` se descubre automáticamente: no hay que registrar los módulos en un archivo central.

## Requisitos
- Node.js 18 o superior.
- Una cuenta de bot de Twitch y su token de chat.
- Para el módulo `ban`, credenciales de la API de Twitch con los permisos necesarios para moderación.

## Instalación
1. Instala Node.js.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env` y completa los valores.
4. Ajusta los canales dentro del `index.js` de cada módulo.
5. Ejecuta `npm start`.

No subas `.env` a GitHub.

## Cómo se cargan los módulos
El hub busca automáticamente cada carpeta inmediata dentro de `modules/` que contenga un `index.js`.
Cada módulo exporta:
- `name`: nombre descriptivo.
- `channels`: canales donde puede actuar.
- `enabled`: permite apagarlo sin borrarlo.
- `handleMessage(context)`: recibe los mensajes de chat.

El bot se conecta a la unión de los canales declarados por los módulos habilitados. Los mensajes solo se entregan a un módulo cuando el canal está en su lista.

## Añadir una función
1. Crea `modules/mi-funcion/`.
2. Crea `modules/mi-funcion/index.js`.
3. Exporta la estructura descrita abajo.
4. Reinicia el bot.

Ejemplo mínimo:

```js
export default {
  name: "Mi función",
  enabled: true,
  channels: ["nombre_de_canal"],
  async handleMessage({ client, channel, message, username }) {
    if (message.trim().toLowerCase() === "!hola") {
      await client.say(channel, `Hola @${username}!`);
    }
  }
};
```

Para desactivar un módulo, cambia `enabled` a `false`. Para quitarlo, elimina su carpeta. Para renombrarlo, renombra la carpeta; no necesitas actualizar un registro central.

## Comandos iniciales
- `requestban @usuario`: inicia la votación de ban.
- `voteban` y `votedef`: votan a favor o en contra.
- `accept` y `cancel`: el moderador confirma o cancela la decisión.
- `!redes`, `!video` y `!tutorial`: ejemplos editables.

Los módulos de ejemplo usan canales de demostración; cambia sus listas `channels` por los canales que correspondan.
