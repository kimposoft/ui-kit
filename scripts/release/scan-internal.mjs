#!/usr/bin/env node
/**
 * 发布前内容复扫：检查本仓库里不该对外的内容。
 *
 * 扫描范围：git 跟踪的全部文本文件（git ls-files），不看未跟踪文件。
 * 内置通用规则两类：
 *   path       本机绝对路径与工具目录（/Users/…、.claude/…、/private/tmp/…）
 *   credential 私钥与常见云服务 / 平台密钥样式字符串
 * 维护者私有规则（可选）：环境变量 KIMPO_SDK_SCAN_RULES 指向仓库外的 JSON 文件
 *   { "rules": [{ "category", "pattern", "flags" }], "allowlist": [<与 internal-allowlist.json 同形的条目>] }，
 *   扫描时追加这些规则与例外。私有规则文件不进公开仓库。
 *
 * 例外：scripts/release/internal-allowlist.json 逐条登记。每条字段：
 *   path      文件路径，支持 * 与 **
 *   category  可选；单个类别或类别数组，省略表示全部类别
 *   match     可选；正则，命中词或整行匹配才算该例外
 *   reason    必填；保留或延后的原因
 *   kind：
 *   keep      合理保留（协议字段名、公开接口名、误报等），不影响预检
 *   deferred  应清理但本轮不能改，--strict 时视为失败
 *   public-name 公开接口名登记（改名即破坏性变更的导出名、协议服务名等）。登记的作用是留下「为什么保留」
 *             的记录，并由扫描器核对 match 仍能在 path 匹配的文件里找到；不参与命中豁免，必须带 match
 *
 * 用法：
 *   node scripts/release/scan-internal.mjs                 # 文本报告；有未登记命中时退出码 1
 *   node scripts/release/scan-internal.mjs --strict        # deferred 例外也算失败
 *   node scripts/release/scan-internal.mjs --format=md     # 输出 Markdown 明细
 *   node scripts/release/scan-internal.mjs --format=json   # 机器可读
 *   node scripts/release/scan-internal.mjs --all           # 文本报告里同时列出已登记例外的明细
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const args = new Set(process.argv.slice(2));
const format = [...args].find((a) => a.startsWith('--format='))?.slice('--format='.length) ?? 'text';
const strict = args.has('--strict');
const showAll = args.has('--all');

// ---- 规则 ----------------------------------------------------------------

const rules = [
  { category: 'path', re: /\/Users\/[^\s'"`)]*|(?<![A-Za-z0-9_-])\.claude\/[^\s'"`)]*|\/private\/tmp\/[^\s'"`)]*|scratchpad/g },
  {
    category: 'credential',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{13,}|ghp_[A-Za-z0-9]{20,}/g,
  },
];

// 维护者私有规则（仓库外文件，可选）
const privateRulesFile = process.env.KIMPO_SDK_SCAN_RULES || '';
let privateAllowlist = [];
if (privateRulesFile) {
  const pr = JSON.parse(readFileSync(privateRulesFile, 'utf8'));
  for (const r of pr.rules ?? []) {
    const flags = (r.flags ?? '').includes('g') ? r.flags : `${r.flags ?? ''}g`;
    rules.push({ category: r.category, re: new RegExp(r.pattern, flags) });
  }
  privateAllowlist = pr.allowlist ?? [];
}

// ---- 例外 ----------------------------------------------------------------

const allowlistPath = join(here, 'internal-allowlist.json');
const allEntries = [...JSON.parse(readFileSync(allowlistPath, 'utf8')).entries, ...privateAllowlist].map((e, i) => ({
  ...e,
  index: i + 1,
  pathRe: globToRegExp(e.path),
  matchRe: e.match ? new RegExp(e.match) : null,
  hits: 0,
}));
// 命中豁免只看 keep / deferred；public-name 是公开接口名登记，单独核对是否仍存在。
const allowlist = allEntries.filter((e) => e.kind !== 'public-name');
const publicNames = allEntries.filter((e) => e.kind === 'public-name');

/** 把 path 字段（支持 ** 与 *）转成正则；不含通配符时按精确路径匹配。 */
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') {
      out += '[^/]*';
    } else {
      out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** 命中是否被例外覆盖：路径匹配 + 类别一致 + （可选）命中词或整行匹配 match。 */
function findException(file, category, token, line) {
  return allowlist.find(
    (e) =>
      e.pathRe.test(file) &&
      (!e.category || [].concat(e.category).includes(category)) &&
      (!e.matchRe || e.matchRe.test(token) || e.matchRe.test(line)),
  );
}

// ---- 扫描 ----------------------------------------------------------------

const files = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const hits = [];
for (const file of files) {
  let text;
  try {
    const buf = readFileSync(join(repoRoot, file));
    if (buf.includes(0)) continue; // 二进制文件跳过
    text = buf.toString('utf8');
  } catch {
    continue; // 已在索引但被删的文件
  }
  // 公开接口名登记：path 匹配且 match 在文件里出现，即视为该登记仍有效。
  for (const e of publicNames) {
    if (e.matchRe && e.pathRe.test(file) && e.matchRe.test(text)) e.hits++;
  }
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    for (const rule of rules) {
      rule.re.lastIndex = 0;
      for (const m of line.matchAll(rule.re)) {
        const token = m[0];
        const exc = findException(file, rule.category, token, line);
        if (exc) exc.hits++;
        hits.push({
          file,
          line: idx + 1,
          category: rule.category,
          token,
          text: Array.from(line.trim()).slice(0, 160).join(''),
          exception: exc ? { index: exc.index, kind: exc.kind, reason: exc.reason } : null,
        });
      }
    }
  });
}

const unregistered = hits.filter((h) => !h.exception);
const deferred = hits.filter((h) => h.exception?.kind === 'deferred');
const kept = hits.filter((h) => h.exception?.kind === 'keep');
const unusedExceptions = allowlist.filter((e) => e.hits === 0);
const stalePublicNames = publicNames.filter((e) => e.hits === 0);

function countBy(list) {
  const out = {};
  for (const h of list) out[h.category] = (out[h.category] ?? 0) + 1;
  return out;
}

const summary = {
  files: files.length,
  total: hits.length,
  unregistered: unregistered.length,
  deferred: deferred.length,
  kept: kept.length,
  byCategory: {
    unregistered: countBy(unregistered),
    deferred: countBy(deferred),
    kept: countBy(kept),
  },
  unusedExceptions: unusedExceptions.map((e) => ({ index: e.index, path: e.path, match: e.match ?? null })),
  publicNames: publicNames.length,
  stalePublicNames: stalePublicNames.map((e) => ({ index: e.index, path: e.path, match: e.match ?? null })),
};

// ---- 输出 ----------------------------------------------------------------

if (format === 'json') {
  process.stdout.write(`${JSON.stringify({ summary, hits }, null, 2)}\n`);
} else if (format === 'md') {
  const esc = (s) => s.replace(/\|/g, '\\|').replace(/`/g, "'");
  const out = [];
  out.push('| 文件 | 行 | 类别 | 命中 | 处理 |', '|---|---|---|---|---|');
  for (const h of hits) {
    const handling = h.exception
      ? `${h.exception.kind === 'keep' ? '保留' : '延后'}（例外 #${h.exception.index}）`
      : '**未处理**';
    out.push(`| ${h.file} | ${h.line} | ${h.category} | ${esc(h.token)} | ${handling} |`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
} else {
  const print = (h) =>
    console.log(`  ${h.file}:${h.line} [${h.category}] ${h.token}  ${h.text}`);
  console.log(`内容复扫：${files.length} 个跟踪文件，规则 ${rules.length} 条（私有规则${privateRulesFile ? '已加载' : '未提供'}），命中 ${hits.length} 处`);
  console.log(`  未登记 ${unregistered.length}｜延后（deferred）${deferred.length}｜保留（keep）${kept.length}`);
  console.log(`  按类别：未登记 ${JSON.stringify(summary.byCategory.unregistered)}`);
  console.log(`          延后   ${JSON.stringify(summary.byCategory.deferred)}`);
  console.log(`          保留   ${JSON.stringify(summary.byCategory.kept)}`);
  if (unregistered.length) {
    console.log('\n未登记命中（必须清理或登记例外）：');
    unregistered.forEach(print);
  }
  if (showAll) {
    console.log('\n已登记例外明细：');
    [...deferred, ...kept].forEach((h) => {
      print(h);
      console.log(`      ↳ 例外 #${h.exception.index}（${h.exception.kind}）：${h.exception.reason}`);
    });
  }
  if (unusedExceptions.length) {
    console.log('\n提示：以下例外已无命中，可从 internal-allowlist.json 删除：');
    unusedExceptions.forEach((e) => console.log(`  #${e.index} ${e.path} ${e.match ?? ''}`));
  }
  console.log(`  公开接口名登记 ${publicNames.length} 条（保留原因见 internal-allowlist.json）`);
  if (stalePublicNames.length) {
    console.log('\n提示：以下公开接口名登记已找不到对应名字（可能已改名或删除），请核对后清理登记：');
    stalePublicNames.forEach((e) => console.log(`  #${e.index} ${e.path} ${e.match ?? ''}`));
  }
}

// 退出码：未登记命中必失败；--strict 下 deferred 也失败。
// 用 exitCode 而不是 process.exit()，避免管道输出未刷完就退出。
const failed = unregistered.length > 0 || (strict && deferred.length > 0);
process.exitCode = failed ? 1 : 0;
