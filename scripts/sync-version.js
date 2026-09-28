#!/usr/bin/env node
// 版本号同步脚本：以项目根 version.txt 为唯一版本号来源，
// 将版本回写到 package.json 的 version 与 openapi.json 的 info.version。
// 用法：npm run sync-version（npm test 前也会经 pretest 自动执行）。

const fs = require('fs')
const path = require('path')

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/
const ROOT = path.join(__dirname, '..')

// 读取并校验 version.txt（与 src/version.js 的解析规则保持一致：去 BOM、trim）
function readVersion() {
  const raw = fs
    .readFileSync(path.join(ROOT, 'version.txt'), 'utf8')
    .trim()
    .replace(/^\uFEFF/, '')
  if (!VERSION_RE.test(raw)) {
    console.error(`[sync-version] version.txt 内容不是合法 SemVer："${raw}"`)
    process.exit(1)
  }
  return raw
}

// 同步单个 JSON 文件；内容无变化时跳过写盘（避免无意义的 mtime / git 噪音）
function syncJson(file, apply, version) {
  const fp = path.join(ROOT, file)
  const oldText = fs.readFileSync(fp, 'utf8')
  const data = JSON.parse(oldText)
  apply(data)
  const newText = JSON.stringify(data, null, 2) + '\n'
  if (newText === oldText) {
    console.log(`[sync-version] ${file}: 版本号已是 ${version}，跳过`)
    return
  }
  fs.writeFileSync(fp, newText)
  console.log(`[sync-version] ${file}: version -> ${version}`)
}

const version = readVersion()
syncJson('package.json', (d) => { d.version = version }, version)
syncJson('openapi.json', (d) => { d.info.version = version }, version)
console.log(`[sync-version] 已同步至 ${version}（源：version.txt）`)
