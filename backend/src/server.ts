import "./config/timezone";
import app from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Ainabi Business API ${env.port}-портто иштеп жатат (${env.nodeEnv})`);
});
