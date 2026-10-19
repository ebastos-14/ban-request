import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulesDirectory = path.resolve(here, "../modules");

export async function loadModules() {
  let entries;

  try {
    entries = await readdir(modulesDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`No existe la carpeta de módulos: ${modulesDirectory}`);
    }
    throw error;
  }

  const loaded = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;

    const entryFile = path.join(modulesDirectory, entry.name, "index.js");

    try {
      const imported = await import(pathToFileURL(entryFile).href);
      const module = imported.default ?? imported.module;

      if (!module || typeof module.handleMessage !== "function") {
        console.warn(`[hub] Se omite "${entry.name}": debe exportar default.handleMessage().`);
        continue;
      }

      module.name ??= entry.name;
      module.channels ??= [];
      module.enabled ??= true;

      if (!Array.isArray(module.channels)) {
        console.warn(`[hub] Se omite "${entry.name}": channels debe ser un arreglo.`);
        continue;
      }

      loaded.push(module);
      console.log(`[hub] Cargado "${entry.name}" (${module.enabled ? "activo" : "desactivado"})`);
    } catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes(entryFile)) {
        console.warn(`[hub] Se omite "${entry.name}": no tiene index.js.`);
      } else {
        console.error(`[hub] No se pudo cargar "${entry.name}":`, error);
      }
    }
  }

  return loaded;
}
