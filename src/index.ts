import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
