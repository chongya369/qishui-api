# 更新日志（Changelog）

所有对外的显著变更将记录在本文件中。版本号遵循语义化版本（SemVer），当前版本以项目根目录 `version.txt` 与 `package.json` 为准。

## [0.1.1] - 2026-09-28

### 新增

- **启动参数支持**（`app.js`）：新增 `--port <1-65535>`（`-p`）与 `--host <address>`（`-H`）命令行参数，`--help`（`-h`）查看用法；参数优先级：命令行 > 环境变量（`PORT`/`HOST`）> 默认值（`0.0.0.0:3300`）；非法参数校验失败时输出明确错误并以退出码 1 结束。
- **二进制产物全量 API 验证脚本**（`test/binary-api-test.js`，位于 gitignore 的 `test/` 目录）：启动 `dist/` 二进制后逐个验证全部 36 个接口，自动生成验证报告；本次验证结果 33 通过 / 3 项为预期的登录态限制 / 0 失败。
- **接口调用说明文档**（`docs/API.md`）：覆盖 API 概述、基础地址、统一响应与错误码、36 个接口的方法/参数/请求与响应示例、环境变量配置、接口速查表。
- **版本控制文件** `version.txt`，版本号与 `package.json`、`openapi.json` 三处保持一致。
- **版本号统一读取**（`src/version.js`）：`GET /` 返回的版本号改为从 `version.txt` 读取（候选路径：二进制所在目录 → 工作目录 → 源码根目录），内容经 SemVer 格式校验，脏数据自动跳过；全部候选不可用时回退 `package.json` 的 `version` 字段，保证服务始终可启动。`package.json` 与 `openapi.json` 的版本号仍为静态元数据，发布时需手动同步。

### 修复

- **端口被占用时进程静默退出**（`server.js` `serveQishuiApi`）：原有实现在 Windows 下（libuv 默认 `SO_REUSEADDR`）二次绑定同端口会先触发 listening 回调、随后异步收到 `EADDRINUSE`，但 server 未挂 `error` 处理器，进程以退出码 0 静默退场。现已在 server 上挂 `error` 处理器，冲突时输出 `qishui-api 启动失败: listen EADDRINUSE...` 并以退出码 1 结束。

### 已知问题

- `GET /media/player?track_id=...` 必然返回 `40000 "media_id 或 track_id 不能为空"`：`server.js` 的 `mergeInput()` 无条件附加空 `body:{}`，而 `mediaPlayer()` 只要 `query.body` 是对象就直接将其作为 payload、不回退读取 query 参数。请使用 `POST /media/player` + JSON body 传 `media_id`（详见 `docs/API.md` 4.7.3 备注）。

### 变更说明

- `package.json` 与 `openapi.json` 的版本号由 `1.0.0` 调整为 `0.1.1`，与 `version.txt` 统一（此前的版本历史未单独记录，以本文件为起点）。

## [未发布]

- （暂无）
