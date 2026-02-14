import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { TmdbClient } from "../media/tmdb/tmdb.client.js";

declare module "fastify" {
  interface FastifyInstance {
    tmdb?: TmdbClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { TMDB_ACCESS_TOKEN } = fastify.config;

    if (!TMDB_ACCESS_TOKEN) {
      fastify.log.warn("TMDB not configured (set TMDB_ACCESS_TOKEN), discovery unavailable");
      return;
    }

    const client = new TmdbClient(TMDB_ACCESS_TOKEN);

    try {
      await client.loadGenres();
      fastify.log.info(
        {
          movieGenres: client.movieGenres.size,
          tvGenres: client.tvGenres.size,
        },
        "TMDB connected, genre cache loaded",
      );
    } catch (err) {
      fastify.log.error(
        { err },
        "TMDB genre loading failed on startup, client registered with empty genre cache",
      );
    }

    fastify.decorate("tmdb", client);
  },
  { name: "tmdb", dependencies: ["database"] },
);
