#!/usr/bin/env node
const { serveQishuiApi } = require('./server')

function parseArgs(argv) {
  const args = { port: undefined, host: undefined }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    if (flag === '--port' || flag === '-p') {
      const port = Number.parseInt(next, 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error(`无效端口: ${next}（应为 1-65535 的整数）`)
        process.exit(1)
      }
      args.port = port
      i++
    } else if (flag === '--host' || flag === '-H') {
      if (typeof next !== 'string' || !next.trim()) {
        console.error('无效主机地址: --host 需要一个非空参数')
        process.exit(1)
      }
      args.host = next.trim()
      i++
    } else if (flag === '--help' || flag === '-h') {
      console.log('用法: qishui-api [--port <1-65535>] [--host <address>]\n端口也可通过环境变量 PORT 指定，优先级: 命令行 > 环境变量 > 默认 3300')
      process.exit(0)
    }
  }
  return args
}

const { port, host } = parseArgs(process.argv.slice(2))

serveQishuiApi({ port, host }).catch((error) => {
  console.error(error)
  process.exit(1)
})
