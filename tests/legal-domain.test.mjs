// 法律领域适配层测试：领域系统提示组合、术语词典命中提示、自定义领域画像覆盖。
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("applyDomain composes domain system prompt with the task prompt", async () => {
  const { applyDomain, DOMAIN_SYSTEM } = await import(`../legal-domain.mjs?d=${Date.now()}`);
  const composed = applyDomain("你是类案分析助理。");
  assert.ok(composed.includes(DOMAIN_SYSTEM), "应包含领域系统提示");
  assert.ok(composed.includes("你是类案分析助理。"), "应包含任务提示");
  assert.ok(composed.includes("依据强制"), "领域提示应强调依据强制");
  assert.ok(composed.includes("术语规范"), "领域提示应强调术语规范");
});

test("glossaryHint maps colloquial terms to canonical legal terms and injects on match", async () => {
  const { glossaryHint, applyDomain } = await import(`../legal-domain.mjs?d=${Date.now()}`);
  // 口语「欠钱不还」应命中「拖欠货款 / 欠款」规范术语。
  const hints = glossaryHint("对方欠钱不还怎么办");
  assert.ok(hints.some(line => line.includes("欠款")), "应命中欠款术语提示");

  // 命中术语会注入到组合后的 system；未命中则不注入术语块。
  const withHint = applyDomain("任务", "欠钱不还");
  assert.ok(withHint.includes("术语规范提示"), "命中术语时应注入术语提示块");
  const noHint = applyDomain("任务", "今天天气不错");
  assert.ok(!noHint.includes("术语规范提示"), "未命中术语时不应注入术语块");
});

test("concept groups are shared with the embedding engine (single source of truth)", async () => {
  const domain = await import(`../legal-domain.mjs?d=${Date.now()}`);
  assert.ok(Array.isArray(domain.LEGAL_CONCEPT_GROUPS) && domain.LEGAL_CONCEPT_GROUPS.length > 10);
  assert.ok(domain.LEGAL_CONCEPT_GROUPS.some(group => group.includes("拖欠") && group.includes("欠款")), "拖欠/欠款应在同一概念组");
  assert.equal(domain.domainProfileInfo().source, "builtin");
});

test("custom domain profile via HENGFA_DOMAIN_PROFILE overrides system and extends glossary", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hengfa-domain-"));
  const file = path.join(dir, "profile.json");
  writeFileSync(file, JSON.stringify({
    system: "自定义领域系统提示·占位",
    glossary: [{ aliases: ["独有俗称XQ"], canonical: "独有规范术语XQ", note: "测试用要点" }]
  }), "utf8");
  process.env.HENGFA_DOMAIN_PROFILE = file;
  try {
    const { DOMAIN_SYSTEM, glossaryHint, domainProfileInfo } = await import(`../legal-domain.mjs?d=${Date.now()}`);
    assert.equal(DOMAIN_SYSTEM, "自定义领域系统提示·占位", "自定义画像应覆盖领域系统提示");
    assert.ok(glossaryHint("涉及独有俗称XQ的问题").some(line => line.includes("独有规范术语XQ")), "应追加自定义术语");
    assert.equal(domainProfileInfo().source, file, "画像来源应指向自定义文件");
  } finally {
    delete process.env.HENGFA_DOMAIN_PROFILE;
    rmSync(dir, { recursive: true, force: true });
  }
});
