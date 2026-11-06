/**
 * Entry point for `npm run db:seed`.
 *
 * The seeder has to run in two very different environments:
 *
 *   - Local dev: sources are present and `tsx` is installed, so running
 *     `prisma/seed.ts` directly is fine.
 *   - Docker image: only compiled output ships (`dist/`, `dist-seed/`). There is
 *     no `src/`, no `prisma/*.ts` and no `tsx` — it is a devDependency and the
 *     production stage installs with `--omit=dev`.
 *
 * Rather than make the caller pick a script name per environment, this picks the
 * compiled build when it exists and falls back to `tsx` on the sources. Both are
 * the same program; only the module format differs.
 *
 * Usage:
 *   node prisma/run-seed.mjs         # prisma/seed.ts (destructive — wipes data)
 *   node prisma/run-seed.mjs users   # prisma/add-test-users.ts (additive)
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prismaDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(prismaDir, "..");

const target = process.argv[2] === "users" ? "add-test-users" : "seed";
const compiled = path.join(backendRoot, "dist-seed", "prisma", `${target}.js`);
const source = path.join(prismaDir, `${target}.ts`);

if (existsSync(compiled)) {
  await import(compiled);
} else if (existsSync(source)) {
  // Local dev: no build yet. `--import tsx` registers the loader that resolves
  // the `.js` specifiers back to the sibling `.ts` files. Going through
  // process.execPath (not `npx`) keeps this working on Windows, where `npx` is
  // a `.cmd` shim that spawnSync cannot launch without a shell.
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.relative(backendRoot, source)],
    { stdio: "inherit", cwd: backendRoot }
  );
  process.exit(result.status ?? 1);
} else {
  console.error(
    `Cannot find ${path.relative(backendRoot, compiled)} or ${path.relative(backendRoot, source)}.\n` +
      "The image was built before the seed was compiled — rebuild it, or run `npm run seed:build` locally."
  );
  process.exit(1);
}
