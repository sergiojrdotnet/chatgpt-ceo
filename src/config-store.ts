import { randomUUID } from "node:crypto";
import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";
import { configuration, digest, fail, DomainError } from "./model.ts";

// One server process owns this file. Synchronous replacement serializes its writers.
export class ConfigStore {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  private current() {
    let raw: Buffer;
    try {
      raw = readFileSync(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    if (raw.length > 256 * 1024) fail("INVALID_CONFIGURATION");
    const c = configuration(JSON.parse(raw.toString("utf8")));
    return { configuration: c, digest: digest(c) };
  }
  adminRead() {
    const current = this.current();
    return {
      schemaVersion: 2,
      setupRequired: !current,
      configuration: current?.configuration ?? null,
      digest: current?.digest ?? null,
    };
  }
  read(subject: "context" | "agents" | "selection", expectedDigest?: string) {
    const current = this.current();
    if (!current) fail("SETUP_REQUIRED");
    if (expectedDigest !== undefined && current.digest !== expectedDigest)
      fail("CONFIGURATION_CONFLICT");
    const c = current.configuration;
    const data =
      subject === "context"
        ? {
            profileId: c.profileId,
            ownerRef: c.ownerRef,
            timezone: c.timezone,
            bindings: c.bindings,
          }
        : subject === "agents"
          ? { agents: c.agents }
          : {
              capacity: c.capacity,
              selection: c.selection,
              timezone: c.timezone,
            };
    return {
      schemaVersion: 2,
      digest: current.digest,
      complete: true,
      readAt: new Date().toISOString(),
      effectiveAt: c.effectiveAt,
      active: c.active,
      fixtureOnly: c.fixtureOnly,
      executionEnabled: c.executionEnabled,
      subject,
      data,
    };
  }
  update(expectedDigest: string | null, reviewDigest: string, input: unknown) {
    const c = configuration(input),
      nextDigest = digest(c);
    if (nextDigest !== reviewDigest) fail("REVIEW_DIGEST_MISMATCH");
    if ((this.current()?.digest ?? null) !== expectedDigest)
      fail("CONFIGURATION_CONFLICT");
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.config-${randomUUID()}.tmp`);
    let fd: number | undefined,
      replaced = false;
    try {
      fd = openSync(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      writeFileSync(fd, JSON.stringify(c));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, this.path);
      replaced = true;
      fd = openSync(directory, constants.O_RDONLY);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      return { digest: nextDigest };
    } catch (e) {
      if (replaced) throw new DomainError("CONFIGURATION_WRITE_UNCERTAIN");
      throw e;
    } finally {
      if (fd !== undefined) closeSync(fd);
      try {
        unlinkSync(temporary);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }
}
