import { app } from "../src/server/d1/app";

// Local acceptance entry for the same native D1 router used by the Next route.
// The full OpenNext build and smoke remain separate required deployment checks.
const worker = {
  fetch(request: Request, env: { D1_DB: D1Database }) {
    return app.fetch(request, { DB: env.D1_DB });
  },
};

export default worker;
