import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { historyHtml } from "../src/history-ui.ts";
import { fixture, issue, otherIssue } from "./helpers/fixture.ts";
import { digest } from "../src/model.ts";
import config from "../examples/inactive-a.json" with { type: "json" };

test("rendered MCP bridge: bounded 1205-event traversal, keyboard, narrow/dark, safe text and failure states", async () => {
  const f = fixture(),
    store = f.store;
  f.setup();
  let original = "";
  for (let i = 0; i < 1205; i++) {
    if (i === 1204) await new Promise((r) => setTimeout(r, 3));
    const saved = await store.appendEvent("writer", {
      expectedDigest: digest(config),
      event: {
        action: i === 1204 ? "correction" : "execution",
        ...(i === 1204 ? { correctsEventId: original } : {}),
        scope:
          i === 1
            ? { type: "project", id: "PROJECT-1" }
            : { type: "issue", id: issue },
        issueId: issue,
        issueIdentifier: "SYN-1",
        reason: '<img src=x onerror="window.pwned=true"> Synthetic decision',
        result: `Synthetic observed result ${i}`,
        outcome: "uncertain",
        evidenceRefs: [],
        observedAt: "2026-01-01T00:00:00Z",
        threadId: "synthetic-thread",
        turnId: "synthetic-turn",
        correlationId: "synthetic-batch",
      },
    });
    if (i === 0) original = saved.event.eventId;
  }
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/view") return res.end(historyHtml);
    res.end(`<!doctype html><iframe title="History" src="/view" style="border:0;width:100%;height:800px"></iframe><script>
    window.calls=[]; window.replies=[];window.delivered=0; window.mode='ok'; window.delay=0;
    addEventListener('message', async (event) => {
      if(event.source !== document.querySelector('iframe').contentWindow) return;
      const m=event.data; const reply=(result)=>event.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
      if(m.method==='ui/initialize') reply({protocolVersion:'2026-01-26',hostCapabilities:{serverTools:{}},hostContext:{theme:'light'}});
      if(m.method==='ui/notifications/initialized') event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{historyFilters:{order:'desc'}}}},'*');
      if(!m.method && m.id !== undefined) window.replies.push(m.id);
      if(m.method==='tools/call') { window.calls.push(m.params); event.source.postMessage({jsonrpc:'2.0',id:m.id,method:window.mode==='teardown'?'ui/resource-teardown':'ping',params:{}},'*'); const result=await window.fixtureCall(m.params,window.mode); setTimeout(()=>{reply(result);window.delivered++},window.delay); }
    });</script>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 900 },
    });
    await page.exposeFunction(
      "fixtureCall",
      async (
        params: { name: string; arguments: Record<string, unknown> },
        mode: string,
      ) => {
        assert.equal(params.name, "list_coordination_events");
        assert.equal(params.arguments.limit, 50);
        if (mode === "denied")
          return {
            isError: true,
            structuredContent: { error: "UNAUTHORIZED" },
          };
        if (mode === "error")
          return { isError: true, structuredContent: { error: "UNAVAILABLE" } };
        if (mode === "cursor")
          return {
            isError: true,
            structuredContent: { error: "INVALID_CURSOR" },
          };
        if (mode === "oversize")
          return {
            structuredContent: {
              events: Array(51).fill({}),
              hasMore: false,
              nextCursor: null,
            },
          };
        return { structuredContent: await store.listEvents(params.arguments) };
      },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    const ui = page.frameLocator("iframe");
    await ui.locator("article").first().waitFor();
    assert.equal(await ui.locator("article").count(), 50);
    assert.equal(
      await ui
        .locator("article")
        .first()
        .locator('dt:text-is("Scope") + dd')
        .textContent(),
      "issue",
    );
    assert.equal(
      await ui
        .locator("article")
        .first()
        .locator('dt:text-is("Issue") + dd')
        .textContent(),
      "SYN-1",
    );
    assert.equal(await ui.locator("img").count(), 0);
    assert.equal(await ui.locator("a").count(), 0);
    assert.ok(
      (await ui.locator("article").first().textContent())?.includes(
        "<img src=x",
      ),
    );
    await ui.locator("summary").first().focus();
    await page.keyboard.press("Enter");
    assert.ok(
      (await ui.locator("details").first().getAttribute("open")) !== null,
    );
    assert.ok(
      (await ui.locator("details").first().textContent())?.includes(original),
    );
    assert.ok(
      (await ui.locator("details").first().textContent())?.includes(
        "synthetic-batch",
      ),
    );
    mkdirSync("/tmp/ceo-ui-evidence", { recursive: true });
    await page.screenshot({ path: "/tmp/ceo-ui-evidence/light.png" });
    const seen: string[] = [];
    for (let p = 1; p <= 25; p++) {
      await ui
        .locator("#status")
        .filter({ hasText: `history page ${p}` })
        .waitFor();
      seen.push(
        ...(await ui.locator("details dl dd:first-of-type").allTextContents()),
      );
      assert.ok((await ui.locator("article").count()) <= 50);
      assert.ok((await ui.locator("*").count()) < 3000);
      if (p < 25) await ui.getByRole("button", { name: "Next page" }).click();
    }
    const projectCard = ui
      .locator("article")
      .filter({
        has: ui.getByRole("heading", {
          name: "execution · PROJECT-1",
          exact: true,
        }),
      });
    assert.equal(
      await projectCard.locator('dt:text-is("Scope") + dd').textContent(),
      "project · PROJECT-1",
    );
    assert.equal(
      await projectCard.locator('dt:text-is("Issue") + dd').textContent(),
      "SYN-1",
    );
    assert.equal(seen.length, 1205);
    assert.equal(new Set(seen).size, 1205);
    assert.equal(
      await ui.getByRole("button", { name: "Next page" }).isDisabled(),
      true,
    );
    assert.equal(await page.evaluate("window.calls.length"), 25);
    assert.equal(await page.evaluate("window.replies.length"), 25);
    await ui.getByRole("button", { name: "First page" }).click();
    await ui.locator("article").first().waitFor();
    await page.setViewportSize({ width: 375, height: 900 });
    await page.evaluate(() =>
      document.querySelector("iframe")!.contentWindow!.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/host-context-changed",
          params: { theme: "dark" },
        },
        "*",
      ),
    );
    assert.equal(await ui.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(
      await ui.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
      true,
    );
    await page.screenshot({ path: "/tmp/ceo-ui-evidence/dark-mobile.png" });
    await ui.getByLabel("Scope", { exact: true }).selectOption("issue");
    await ui.getByLabel("Scope identifier", { exact: true }).fill(issue);
    await ui.getByRole("button", { name: "Apply filters" }).click();
    await ui.locator("article").first().waitFor();
    await ui.getByLabel("Issue UUID", { exact: true }).fill(otherIssue);
    await ui.getByRole("button", { name: "Apply filters" }).click();
    await ui
      .locator("#status")
      .filter({ hasText: "No events match" })
      .waitFor();
    await page.screenshot({ path: "/tmp/ceo-ui-evidence/empty.png" });
    await ui.getByLabel("Issue UUID", { exact: true }).fill(issue);
    await page.evaluate("window.delay=300");
    await ui.getByRole("button", { name: "Apply filters" }).click();
    assert.equal(await ui.locator("#events").getAttribute("aria-busy"), "true");
    assert.equal(
      await ui
        .getByRole("button", { name: "Refresh", exact: true })
        .isDisabled(),
      true,
    );
    await ui.locator("article").first().waitFor();
    for (const [mode, message] of [
      ["denied", "Access unavailable or expired"],
      ["error", "History is unavailable"],
      ["cursor", "cursor is no longer available"],
      ["oversize", "History is unavailable"],
    ]) {
      await page.evaluate(`window.mode='${mode}';window.delay=0`);
      await ui.getByRole("button", { name: "Refresh", exact: true }).click();
      await ui.locator("#status").filter({ hasText: message }).waitFor();
      assert.equal(await ui.locator("article").count(), 0);
      assert.equal(
        await ui.getByRole("button", { name: "Next page" }).isDisabled(),
        true,
      );
    }
    await page.evaluate(
      "window.mode='teardown';window.delay=100;window.delivered=0",
    );
    await ui.getByRole("button", { name: "Refresh", exact: true }).click();
    await ui
      .locator("#status")
      .filter({ hasText: "History view closed." })
      .waitFor();
    await page.waitForFunction("window.delivered===1");
    assert.equal(await ui.locator("article").count(), 0);
    assert.equal(
      await ui
        .getByRole("button", { name: "Refresh", exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
    await page.goto(`http://127.0.0.1:${address.port}/view`);
    assert.ok(
      await page.getByText("Open this history view inside ChatGPT").count(),
    );
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
    f.cleanup();
  }
});
