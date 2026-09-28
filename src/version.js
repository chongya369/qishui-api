const fs = require('fs')
const path = require('path')

// 唯一版本号来源：项目根目录 version.txt。
// 读取顺序：
//   1. 打包二进制所在目录（exe 同目录放置 version.txt）
//   2. 当前工作目录（部署目录）
//   3. 源码运行（src/../version.txt）
// 全部失败时回退到 package.json 的 version 字段，保证服务始终可启动。

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/
const CANDIDATES = [
  path.join(path.dirname(process.execPath), 'version.txt'),
  path.join(process.cwd(), 'version.txt'),
  path.join(__dirname, '..', 'version.txt'),
]

let cached

function getVersion() {
  if (cached !== undefined) return cached
  for (const file of CANDIDATES) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim().replace(/^\uFEFF/, '')
      if (VERSION_RE.test(raw)) {
        cached = raw
        return cached
      }
    } catch {
      // 文件不存在或不可读，尝试下一个候选路径
    }
  }
  cached = require('../package.json').version
  return cached
}

module.exports = { getVersion }
