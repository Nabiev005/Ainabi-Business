/**
 * Runs tests/db/*.test.ts against a throwaway PostgreSQL that lives only for
 * this run:  npm run test:db
 *
 * Starts a private cluster in the temp folder on a free local port, applies
 * the migrations, runs the tests, then deletes it. DATABASE_URL is always
 * overridden here, so a real database can never be touched by accident.
 *
 * Needs the PostgreSQL server tools (initdb, pg_ctl) on PATH, in PG_BIN, or
 * in the usual install folder.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

function findPgBin() {
  const installed = ["C:/Program Files/PostgreSQL", "/usr/lib/postgresql"]
    .filter((root) => existsSync(root))
    .flatMap((root) => readdirSync(root).sort((a, b) => parseFloat(b) - parseFloat(a)).map((v) => join(root, v, "bin")));
  return [process.env.PG_BIN, ...(process.env.PATH ?? "").split(delimiter), ...installed].find(
    (dir) => dir && existsSync(join(dir, exe("initdb"))) && existsSync(join(dir, exe("pg_ctl"))),
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "ignore", ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function must(label, status) {
  if (status !== 0) throw new Error(`${label} failed (exit ${status})`);
}

const bin = findPgBin();
if (!bin) {
  console.error("PostgreSQL (initdb, pg_ctl) not found. Install it or set PG_BIN.");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "ainabi-test-db-"));
const data = join(dir, "data");
const port = await freePort();
const url = `postgresql://postgres@127.0.0.1:${port}/ainabi_test`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  JWT_ACCESS_SECRET: "test-access-secret",
  JWT_REFRESH_SECRET: "test-refresh-secret",
  // Never talk to the outside world from a test.
  TELEGRAM_BOT_TOKEN: "",
  RESEND_API_KEY: "",
  ANTHROPIC_API_KEY: "",
};

let status = 1;
try {
  must("initdb", run(join(bin, exe("initdb")), ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"]));
  must(
    "pg_ctl start",
    run(join(bin, exe("pg_ctl")), ["-D", data, "-l", join(dir, "log.txt"), "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "-w", "start"]),
  );
  // "migrate deploy" also creates the database.
  must("migrate deploy", run("npx prisma migrate deploy", [], { env, shell: true, stdio: ["ignore", "ignore", "inherit"] }));
  const files = readdirSync("tests/db")
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => `tests/db/${f}`);
  status = run(process.execPath, ["--import", "tsx", "--test", ...files], { env, stdio: "inherit" });
} catch (error) {
  console.error(error.message);
} finally {
  if (existsSync(data)) run(join(bin, exe("pg_ctl")), ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(status);
