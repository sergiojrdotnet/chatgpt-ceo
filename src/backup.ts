import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Store } from "./store.ts";
const source = process.env.DATABASE_PATH,
  target = process.argv[2];
if (
  !source ||
  !target ||
  !existsSync(source) ||
  existsSync(target) ||
  resolve(source) === resolve(target)
)
  throw new Error("Require existing DATABASE_PATH and new backup destination");
mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
const store = new Store(source);
try {
  await store.backup(target);
  console.log(
    "Backup integrity verified; off-host copy and restore verification remain operator responsibilities.",
  );
} finally {
  store.close();
}
