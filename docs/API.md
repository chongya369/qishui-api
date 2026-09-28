# qishui-api 接口调用说明文档

> 本文档依据项目源码（`server.js`、`src/qishuiClient.js`、`src/normalizers.js`、`src/capabilities.js`、`module/*.js`）编写，与代码实际行为保持一致。生成物 `openapi.json` 可作为机器可读的补充参考。

## 目录

- [1. API 概述](#1-api-概述)
- [2. 基础请求地址](#2-基础请求地址)
- [3. 统一响应结构与错误码](#3-统一响应结构与错误码)
- [4. 接口明细](#4-接口明细)
  - [4.1 系统接口](#41-系统接口)
  - [4.2 发现与推荐](#42-发现与推荐)
  - [4.3 歌单](#43-歌单)
  - [4.4 电台](#44-电台)
  - [4.5 Feed 流](#45-feed-流)
  - [4.6 搜索](#46-搜索)
  - [4.7 曲目与视频](#47-曲目与视频)
  - [4.8 音频信息、下载与解密](#48-音频信息下载与解密)
  - [4.9 分享解析](#49-分享解析)
  - [4.10 登录与账号](#410-登录与账号)
- [5. 环境变量配置参考](#5-环境变量配置参考)

---

## 1. API 概述

qishui-api 是汽水音乐的 Node.js API 聚合服务，整合静态逆向、分享页解析和 Luna 接口，对外提供 36 个 HTTP 接口，覆盖发现页、推荐、歌单、电台、搜索、曲目详情、评论、歌词、音频下载与解密、扫码登录等能力。

**通用约定：**

| 约定 | 说明 |
|---|---|
| 传参方式 | 标注「GET/POST」的接口同时支持 query 传参和 POST JSON body 传参，参数名一致，body 优先；标注「POST bodyOnly」的接口只接受 JSON body，携带 query 参数会直接报 `40000` 错误 |
| 登录态 | 账号类接口通过请求头 `Cookie` 或 JSON body 中的 `sessionid` 字段传入登录态，服务端仅透传给上游，不会在响应中回显 |
| 脱敏 | `/media/player` 的播放敏感字段（`url_player_info`、`video_model`、`play_auth`、`spade_a` 等）默认脱敏为布尔摘要；`include_raw=true` 时仅返回上游业务响应体，不回显入站凭据 |
| 分页 | 支持 `cursor`/`count` 透传分页的接口，响应含 `has_more` 与 `next_cursor`（或 `cursor`）字段；`count` 最大值受 `QISHUI_MAX_PAGE_SIZE` 限制（默认 50） |
| 上游超时 | 服务端请求上游默认超时 15 秒（`QISHUI_REQUEST_TIMEOUT_MS` 可调），超时抛出 `50200` 错误 |
| 响应体量 | POST JSON body 受 1MB 限制；大文件场景请传 `audio_url` 而非 base64 |

## 2. 基础请求地址

| 项目 | 值 |
|---|---|
| 默认监听 | `http://0.0.0.0:3300` |
| 本机调用 | `http://127.0.0.1:3300` |
| 命令行参数 | `--port <1-65535>`（简写 `-p`）指定端口；`--host <address>`（简写 `-H`）指定绑定地址；`--help`/`-h` 查看用法 |
| 自定义端口 | 命令行 `--port` 或环境变量 `PORT`（整数），**优先级：命令行 > 环境变量 > 默认 3300** |
| 自定义绑定地址 | 命令行 `--host` 或环境变量 `HOST`（默认 `0.0.0.0`，局域网可访问） |

启动示例：

```bash
node app.js --port 4500              # Node 方式
./dist/qishui_api_win.exe -p 4500    # 二进制方式（Windows）
PORT=4500 ./dist/qishui_api_linux    # 环境变量方式（Linux）
```

下文示例均以 `http://127.0.0.1:3300` 为基准。

**CORS**：默认 `CORS_ALLOW_ORIGIN=*`（允许所有来源）；若配置为具体来源列表（逗号分隔），仅列表内来源可跨域访问。

## 3. 统一响应结构与错误码

### 3.1 统一响应结构

所有接口返回如下 JSON 结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "trace_id": "m8x2k1-abcd1234"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | integer | `0` 表示成功，非 `0` 为错误码（见 3.2） |
| `message` | string | `success` 或错误描述 |
| `data` | object / null | 业务数据；失败时为脱敏后的错误详情（可为 `null`） |
| `trace_id` | string | 链路追踪 ID；请求头传 `X-Trace-Id` 可指定，否则自动生成 |

### 3.2 错误码说明

| HTTP 状态码 | 错误码 | 含义 | 典型触发场景 |
|---|---|---|---|
| 200 | 0 | 成功 | — |
| 400 | 40000 | 参数校验失败 / 业务前置条件不满足 | 必填参数缺失、`bodyOnly` 接口收到 query 参数、`Cookie 或 sessionid 不能为空`、音频地址不在白名单域名、超过 `max_bytes` 限制、`QISHUI_ENABLE_DECRYPT=false` 时调用解密 |
| 404 | 40400 | 接口不存在 | 路径拼写错误 |
| 500 | 50000 | 服务器内部错误 | 未预期的服务端异常 |
| 502 | 50200 | 上游请求失败 | 上游返回非 2xx（`上游请求失败：HTTP xxx`）、上游超时（`上游请求超时`）、网络不可达 |

**上游业务状态说明**（HTTP 200 但上游拒绝业务，通过 `data.upstream` 或 `data.supported_without_app_context` 体现）：

| 场景 | 表现 |
|---|---|
| `/daily/mix` 裸调（无 App 上下文） | 上游返回 `status_code=1000006`，服务端将其转换为 `supported_without_app_context: false` |
| PC 搜索/曲目详情在部分网络环境 | 上游可能要求 Cookie 或签名 header（`QISHUI_X_HELIOS`/`QISHUI_X_MEDUSA`），缺失时可能返回 `ERR_REQUEST_FORBIDDEN` 类业务错误 |

**注意**：错误响应中 `data` 字段为脱敏后的详情（如上游 URL、状态码、响应体片段），请求头、Cookie、sessionid 不会被回显。

## 4. 接口明细

> 响应示例中的 `raw` / `upstream` 字段为上游原始数据（结构随上游变动），示例中一律以 `"...": "（上游原始数据，已省略）"` 表示。
> 曲目/歌单/视频资源对象的通用字段结构见 [4.11 资源对象结构速查](#411-资源对象结构速查)。

### 4.1 系统接口

#### 4.1.1 健康检查

| 项目 | 值 |
|---|---|
| 路径 | `/health` |
| 方式 | GET |
| 参数 | 无 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/health"
```

**响应示例**

```json
{
  "code": 0,
  "message": "success",
  "data": { "status": "ok" },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.1.2 列出已挂载接口

| 项目 | 值 |
|---|---|
| 路径 | `/api/list` |
| 方式 | GET |
| 参数 | 无 |

**响应示例**

```json
{
  "code": 0,
  "message": "success",
  "data": [
    { "route": "/discover", "file": "discover.js" },
    { "route": "/search", "file": "search.js" }
  ],
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.1.3 能力清单

| 项目 | 值 |
|---|---|
| 路径 | `/api/capabilities` |
| 方式 | GET |
| 参数 | 无 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "count": 33,
    "capabilities": [
      {
        "group": "search",
        "route": "/search",
        "methods": ["GET", "POST"],
        "auth": false,
        "app_context": false,
        "raw": true,
        "description": "PC 搜索歌曲"
      }
    ]
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

| 字段 | 说明 |
|---|---|
| `auth` | `true` 表示该接口需要登录态（Cookie/sessionid） |
| `app_context` | `true` 表示裸调可能被上游拒绝，需 App 上下文 |
| `raw` | `true` 表示响应主要透传上游数据 |

### 4.2 发现与推荐

#### 4.2.1 发现页

| 项目 | 值 |
|---|---|
| 路径 | `/discover` |
| 方式 | GET / POST |
| 参数 | 无 |

返回发现页原始块数据（透传上游），电台信息可从中提取（见 [4.4.1 电台列表](#441-电台列表)）。

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "blocks": [
      { "type": "discover_feed_radio", "inner_block": [ "..." ] }
    ]
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.2.2 发现页混合流

| 项目 | 值 |
|---|---|
| 路径 | `/discover/mix` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| block_type | string | 否 | — | 块类型过滤 |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | 10 | 每页数量，正整数 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/discover/mix?count=10"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "inner_block": [ "..." ],
    "has_more": true,
    "next_cursor": "7001",
    "session_id": "abc123"
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.2.3 推荐歌单

| 项目 | 值 |
|---|---|
| 路径 | `/recommend/playlist` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| count | integer | 否 | 10 | 歌单数量 |
| cursor | string | 否 | — | 分页游标 |

内部调用发现页混合流并提取歌单。

**请求示例**

```bash
curl "http://127.0.0.1:3300/recommend/playlist?count=10"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "playlists": [
      {
        "id": "7031087107562424328",
        "title": "华语经典重温",
        "type": 2,
        "description": "",
        "cover_url": "https://...",
        "count_tracks": 50,
        "raw": "..."
      }
    ],
    "has_more": true,
    "next_cursor": "7001",
    "session_id": "abc123",
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.3 歌单

#### 4.3.1 歌单详情

| 项目 | 值 |
|---|---|
| 路径 | `/playlist/detail` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| playlist_id | string | **是** | — | 歌单 ID；也接受 `id` 或分享链接 `url`（自动提取 ID） |
| playlist_type | integer | 否 | 0 | 歌单类型 |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | 20 | 每页媒体数量 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/playlist/detail?playlist_id=7096700219496368135&count=5"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "playlist": {
      "id": "7096700219496368135",
      "title": "晚风轻拂",
      "cover_url": "https://...",
      "count_tracks": 30,
      "raw": "..."
    },
    "media_resources": [
      {
        "id": "7079108541549643812",
        "type": "track",
        "track": {
          "id": "7079108541549643812",
          "name": "示例歌曲",
          "duration": 214000,
          "vid": "",
          "media_type": "track",
          "album": { "id": "7001", "name": "示例专辑", "cover_url": "https://...", "release_date": "2024-01-01" },
          "artists": [ { "id": "100", "name": "示例歌手", "avatar_url": "https://...", "raw": "..." } ],
          "stats": {},
          "raw": "..."
        },
        "recommend_reason": null,
        "predict_info": null,
        "raw": "..."
      }
    ],
    "next_cursor": "",
    "session_id": "abc123",
    "raw": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.3.2 歌单相关推荐媒体

| 项目 | 值 |
|---|---|
| 路径 | `/playlist/related/media` |
| 方式 | GET / POST |
| 登录态 | 通常需要（`auth: true, app_context: true`） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| playlist_id | string | **是** | — | 歌单 ID；也接受 `id`/`url` |
| playlist_type | integer | 否 | 0 | 歌单类型 |
| count | integer | 否 | 10 | 请求数量（上游字段名 `req_count`） |
| played_media | array | 否 | [] | 已播放媒体列表 |
| feed_extra | object | 否 | {} | Feed 扩展参数 |

**响应**：透传上游 `/luna/playlist/related_media` 原始 body。

#### 4.3.3 歌单媒体 Feed

| 项目 | 值 |
|---|---|
| 路径 | `/playlist/feed/media` |
| 方式 | GET / POST |
| 登录态 | 通常需要（`auth: true, app_context: true`） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| playlist_id | string | **是** | — | 歌单 ID；也接受 `id`/`url` |
| playlist_type | integer | 否 | 0 | 歌单类型 |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | 10 | 每页数量 |
| feed_session_id | string | 否 | — | Feed 会话 ID |
| played_media | array | 否 | [] | 已播放媒体列表 |

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/playlist/feed/media" \
  -H "Content-Type: application/json" \
  -d '{"playlist_id":"7096700219496368135","count":5}'
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ { "id": "7079108541549643812", "type": "track", "track": { "..." : "..." } } ],
    "has_more": true,
    "feed_session_id": "fs-1",
    "server_session_id": "ss-1",
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.4 电台

#### 4.4.1 电台列表

| 项目 | 值 |
|---|---|
| 路径 | `/radio/list` |
| 方式 | GET / POST |
| 参数 | 无 |

内部调用发现页接口并从 `discover_feed_radio` 块提取电台。

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "radios": [
      { "id": "676100069", "name": "私人电台", "type": "0", "raw": "..." }
    ],
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.4.2 电台歌曲

| 项目 | 值 |
|---|---|
| 路径 | `/radio/tracks` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| radio_id | string | **是** | — | 电台 ID；也接受 `id` |
| count | integer | 否 | 10 | 每页数量 |
| cursor | string | 否 | — | 分页游标 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/radio/tracks?radio_id=676100069&count=10"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ { "id": "7079108541549643812", "type": "track", "track": { "..." : "..." }, "recommend_reason": "..." } ],
    "has_more": true,
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.5 Feed 流

#### 4.5.1 Feed 模式

| 项目 | 值 |
|---|---|
| 路径 | `/feed/mode` |
| 方式 | GET / POST |
| 参数 | 无 |

**响应**：透传上游 `/luna/feed/mode` 原始 body。

#### 4.5.2 Feed 模式引导

| 项目 | 值 |
|---|---|
| 路径 | `/feed/mode/guidance` |
| 方式 | GET / POST |
| 参数 | 无 |

**响应**：透传上游 `/luna/feed/mode/guidance` 原始 body。

#### 4.5.3 听歌视频 Feed

| 项目 | 值 |
|---|---|
| 路径 | `/feed/listen/video` |
| 方式 | GET / POST |
| 登录态 | 通常需要（`auth: true, app_context: true`） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | 10 | 每页数量 |
| played_media | array | 否 | [] | 已播放媒体列表 |
| feed_extra | object | 否 | {} | Feed 扩展参数 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [ { "..." : "..." } ],
    "has_more": true,
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.5.4 DailyMix 主推荐流

| 项目 | 值 |
|---|---|
| 路径 | `/daily/mix` |
| 方式 | GET / POST |
| 登录态 | 裸调通常被上游拒绝（`ERR_REQUEST_FORBIDDEN`），需 App 上下文 |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| （POST body） | object | 否 | {} | 原始上游 payload，POST 时可传任意上游接受的字段 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "supported_without_app_context": false,
    "upstream": { "status_code": 1000006 }
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.6 搜索

> PC 搜索使用运行时生成的临时设备标识；如需固定测试环境，配置 `QISHUI_DEVICE_ID`、`QISHUI_INSTALL_ID`、`QISHUI_FP`。部分网络环境可能要求签名 header（见 [5. 环境变量](#5-环境变量配置参考)）。

#### 4.6.1 歌曲搜索

| 项目 | 值 |
|---|---|
| 路径 | `/search` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| keywords | string | **是** | — | 搜索关键词；也接受 `keyword`/`q` |
| cursor | integer | 否 | 0 | 分页偏移；也接受 `offset` |

**请求示例**

```bash
curl "http://127.0.0.1:3300/search?keywords=%E5%91%A8%E6%9D%B0%E4%BC%A6"
```

**响应**：透传上游 `/luna/pc/search/track` 原始 body（含 `result_groups` 等字段）。

#### 4.6.2 歌单搜索

| 项目 | 值 |
|---|---|
| 路径 | `/search/playlist` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| keywords | string | **是** | — | 搜索关键词 |
| cursor | integer | 否 | 0 | 分页偏移 |
| count | integer | 否 | 10 | 数量上限 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "playlists": [ { "id": "7031087107562424328", "title": "..." } ],
    "source_strategy": "pc_search_playlist",
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

`source_strategy` 可能的取值：`pc_search_playlist`（PC 歌单搜索成功）或 `pc_search_mixed_playlist_extract`（PC 歌单搜索失败后自动降级，从混合搜索结果中提取歌单）。

#### 4.6.3 混合搜索

| 项目 | 值 |
|---|---|
| 路径 | `/search/mixed` |
| 方式 | GET / POST |

参数与 `/search` 一致（`keywords` 必填，`cursor` 可选）。

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tracks": [ { "id": "7079108541549643812", "name": "示例歌曲", "artists": [ { "..." : "..." } ] } ],
    "playlists": [ ],
    "videos": [ ],
    "mixed": [ { "type": "track", "track": { "..." : "..." } } ],
    "source_strategy": "pc_search_mixed",
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.7 曲目与视频

#### 4.7.1 曲目详情（PC）

| 项目 | 值 |
|---|---|
| 路径 | `/track/detail` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| track_id | string | **是** | — | 曲目 ID；也接受 `id` 或分享链接 `url`（自动提取 ID） |
| media_type | string | 否 | track | 媒体类型 |
| queue_type | string | 否 | — | 队列类型 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/track/detail?track_id=7079108541549643812"
```

**响应**：透传上游 `/luna/pc/track_v2` 原始 body。

#### 4.7.2 H5 SEO 曲目详情

| 项目 | 值 |
|---|---|
| 路径 | `/h5/seo/track` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| track_id | string | **是** | — | 曲目 ID；也接受 `id`/`url` |
| device_platform | string | 否 | web | 设备平台 |

**响应**：透传上游 `/luna/h5/seo_track` 原始 body（含 `seo_track.track`、`lyric.content`、`track_player.video_model` 等）。

#### 4.7.3 App 播放信息摘要

| 项目 | 值 |
|---|---|
| 路径 | `/media/player` |
| 方式 | POST（推荐）；GET 受已知问题影响不可用，见下方备注 |
| 登录态 | 需要登录态体验完整能力（`auth: true, app_context: true`） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| media_id | string | **是** | — | 媒体 ID（即曲目 ID），**必须放在 JSON body 中**；也接受 `track_id`/`id`/`url`（自动提取） |
| media_type | string | 否 | track | 媒体类型 |
| queue_type | string | 否 | — | 队列类型 |
| enable_dash | boolean | 否 | true | 是否启用 DASH |
| enable_refresh_api | boolean | 否 | false | 是否刷新 API |
| scene_name | string | 否 | — | 场景名 |

> **已知问题**：GET 方式传 `track_id` 必然返回 `40000 "media_id 或 track_id 不能为空"`。原因：`server.js` 的 `mergeInput()` 无条件附加空 `body:{}`，而 `mediaPlayer()` 只要 `query.body` 是对象就直接将其作为 payload、不回退读取 query 参数。请一律使用 POST + JSON body 方式调用。

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/media/player" \
  -H "Content-Type: application/json" \
  -d '{"media_id":"7079108541549643812"}'
```

**响应示例**（敏感字段已脱敏）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "request": { "media_id": "7079108541549643812", "media_type": "track", "enable_dash": true },
    "player_infos": [
      {
        "media_id": "7079108541549643812",
        "expire_at": 1735689600,
        "video_model_type": 0,
        "has_url_player_info": true,
        "has_video_model": true,
        "audio_effect_keys": []
      }
    ],
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

原始的 `url_player_info`、`video_model`、`play_auth`、`spade_a`、签名 URL 等播放敏感值不会返回，只保留是否存在（`has_*`）、过期时间与字段摘要。

#### 4.7.4 歌曲评论列表

| 项目 | 值 |
|---|---|
| 路径 | `/comment` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| group_id | string | **是**（三选一） | — | 评论组 ID；`track_id`、`id` 三者传其一即可 |
| track_id | string | **是**（三选一） | — | 曲目 ID（作为 group_id） |
| id | string | **是**（三选一） | — | 同上 |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | 20 | 每页数量；也接受 `page_size`/`pagesize` |
| group_type | string | 否 | track | 评论组类型 |
| image_strategy | string | 否 | tplv-luna-shrink:200:200 | 图片处理策略 |
| sort_type | string | 否 | hot | 排序方式（`hot` 等） |

**请求示例**

```bash
curl "http://127.0.0.1:3300/comment?track_id=7079108541549643812&count=5"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "comments": [
      { "id": "7201", "content": "好听到单曲循环", "user": { "..." : "..." }, "reply_count": 0 },
      { "..." : "..." }
    ],
    "total": 128,
    "cursor": "",
    "has_more": true,
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.7.5 视频详情

| 项目 | 值 |
|---|---|
| 路径 | `/video/detail` |
| 方式 | **POST（bodyOnly）** |
| 登录态 | **必须**（Cookie 或 body 传 `sessionid`） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| video_id | string | **是** | — | 视频 ID；也接受 `id` 或视频链接 `url`（自动提取） |
| sessionid | string | **是**（或 Cookie 头） | — | 登录会话 ID |
| include_raw | boolean | 否 | false | 是否附加原始响应 |
| type | string | 否 | ugc_video | 视频类型 |
| scene_name | string | 否 | library | 场景名 |
| queue_type | string | 否 | favorite_track_playlist | 队列类型 |

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/video/detail" \
  -H "Content-Type: application/json" \
  -d '{"video_id":"7300123456789012345","sessionid":"你的sessionid"}'
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "video": { "id": "7300123456789012345", "title": "示例视频", "duration": 60000, "cover_url": "https://..." },
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.8 音频信息、下载与解密

> 下载与解密仅用于合法授权内容；下载 URL 必须为 HTTPS 且命中白名单域名（默认：`douyin.com`、`qishui.com`、`douyinvod.com`、`bytedance.com`、`bytedance.net`、`byted.org`、`bytecdn.cn`、`bytecdntp.com`、`snssdk.com`，可用 `QISHUI_DOWNLOAD_ALLOWED_HOSTS` 覆盖）；单文件大小上限默认 50MB（`QISHUI_DOWNLOAD_MAX_BYTES`）。

#### 4.8.1 歌曲详情（分享页解析）

| 项目 | 值 |
|---|---|
| 路径 | `/song/detail` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| track_id | string | **是**（二选一） | — | 曲目 ID；也接受 `id` |
| url | string | **是**（二选一） | — | 分享链接（也可传含 `track_id` 的任意 URL） |

两者至少传一个。传 `track_id` 时内部走 H5 SEO 接口；传分享链接时抓取 H5 页面解析。

**请求示例**

```bash
curl "http://127.0.0.1:3300/song/detail?track_id=7079108541549643812"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "track_id": "7079108541549643812",
    "name": "示例歌曲",
    "artists": [ { "id": "100", "name": "示例歌手" } ],
    "album": { "id": "7001", "name": "示例专辑" },
    "audio_url": "https://...",
    "lyric": "[00:00.00] 示例歌词",
    "raw": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.2 歌词解析

| 项目 | 值 |
|---|---|
| 路径 | `/lyric` |
| 方式 | GET / POST |
| 参数 | 与 `/song/detail` 相同（`track_id` 或 `url` 二选一，必填） |

**请求示例**

```bash
curl "http://127.0.0.1:3300/lyric?track_id=7079108541549643812"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "lrc": "[00:00.00] 示例歌词\n[00:12.50] ...",
    "lines": [],
    "raw": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.3 音频信息摘要

| 项目 | 值 |
|---|---|
| 路径 | `/audio/info` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| track_id | string | **是**（二选一） | — | 曲目 ID |
| url | string | **是**（二选一） | — | 分享链接 |
| include_raw | boolean | 否 | false | 是否附加原始上游数据 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/audio/info?track_id=7079108541549643812"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "track_id": "7079108541549643812",
    "name": "示例歌曲",
    "artists": [ { "id": "100", "name": "示例歌手" } ],
    "album": { "id": "7001", "name": "示例专辑" },
    "audio_url": "https://...",
    "has_audio_url": true,
    "spade_a": "",
    "has_spade_a": false,
    "play_auth": null
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.4 解析下载地址

| 项目 | 值 |
|---|---|
| 路径 | `/download/url` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| track_id | string | **是**（二选一） | — | 曲目 ID |
| url | string | **是**（二选一） | — | 分享链接 |
| sessionid | string | 否 | — | 登录会话 ID（部分曲目需登录态才能取到播放地址） |

内部先调用 `/audio/info` 解析音频地址，再校验白名单域名；解析不到地址时报 `40000 未解析到音频下载地址`。

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "track_id": "7079108541549643812",
    "name": "示例歌曲",
    "audio_url": "https://www.douyinvod.com/...",
    "has_audio_url": true,
    "spade_a": "...",
    "has_spade_a": true,
    "play_auth": null
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.5 受控下载音频文件

| 项目 | 值 |
|---|---|
| 路径 | `/download/file` |
| 方式 | **POST（bodyOnly）** |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| audio_url | string | **是**（多选一） | — | 音频直链；也接受 `download_url`；必须 HTTPS 且在白名单域名内 |
| url | string | **是**（多选一） | — | 音频直链（与 `audio_url` 等价） |
| track_id | string | **是**（多选一） | — | 曲目 ID，服务端自动解析下载地址；也可传 `sessionid` 辅助解析 |
| max_bytes | integer | 否 | 52428800 | 单文件大小上限（字节） |

以上下载来源参数至少提供一个，否则报 `40000`。

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/download/file" \
  -H "Content-Type: application/json" \
  -d '{"audio_url":"https://www.douyinvod.com/xxx.mp3"}'
```

**响应示例**（节选，`audio_base64` 为完整文件内容，此处截断）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "url": "https://www.douyinvod.com/xxx.mp3",
    "filename": "xxx.mp3",
    "content_type": "audio/mp4",
    "size": 3456789,
    "audio_base64": "AAAAIGZ0eXBpc29t...(base64)"
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

**错误响应示例**（域名不在白名单）

```json
{
  "code": 40000,
  "message": "音频地址域名不在允许列表",
  "data": { "host": "evil.example.com" },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.6 spade 令牌解密

| 项目 | 值 |
|---|---|
| 路径 | `/decrypt/spade` |
| 方式 | **POST（bodyOnly）** |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| spade_a | string | **是**（二选一） | — | 上游返回的 `spade_a` 令牌；也接受 `spadeA` |
| hex_key | string | **是**（二选一） | — | 直接提供 32 位 AES hex key（跳过解密）；也接受 `key` |

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/decrypt/spade" \
  -H "Content-Type: application/json" \
  -d '{"spade_a":"你的spade_a"}'
```

**响应示例**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "hex_key": "00112233445566778899aabbccddeeff",
    "key_byte_length": 16,
    "decrypted_from_spade_a": true
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.8.7 本地音频解密

| 项目 | 值 |
|---|---|
| 路径 | `/audio/decrypt` |
| 方式 | **POST（bodyOnly）** |
| 开关 | 环境变量 `QISHUI_ENABLE_DECRYPT=false` 时返回 `40000 本地解密接口未启用` |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| spade_a | string | **是**（二选一） | — | 解密密钥来源一；也接受 `spadeA` |
| hex_key | string | **是**（二选一） | — | 直接提供 32 位 AES hex key；也接受 `key` |
| audio_base64 | string | **是**（多选一） | — | 加密音频的 base64 内容；也接受 `file_base64` |
| audio_url | string | **是**（多选一） | — | 加密音频的 HTTPS 直链（白名单域名内）；也接受 `download_url` |
| track_id | string | **是**（多选一） | — | 曲目 ID，服务端自动解析音频地址 |
| return_base64 | boolean | 否 | true | 是否返回解密后音频 base64（`false` 时 `audio_base64` 为空字符串，仅返回元数据） |
| max_bytes | integer | 否 | 52428800 | 大小上限（字节） |

密钥（`spade_a`/`hex_key`）与音频来源（`audio_base64`/`audio_url`/`track_id`）各自至少提供一个，否则报 `40000`。

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/audio/decrypt" \
  -H "Content-Type: application/json" \
  -d '{"hex_key":"00112233445566778899aabbccddeeff","audio_url":"https://www.douyinvod.com/xxx.enc","return_base64":true}'
```

**响应示例**（节选，`audio_base64` 已截断）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "source_url": "https://www.douyinvod.com/xxx.enc",
    "filename": "xxx.m4a",
    "content_type": "audio/mp4",
    "codec": "mp4a.40.2",
    "sample_count": 9437184,
    "size": 3245012,
    "audio_base64": "AAAAIGZ0eXBpc29t...(base64)"
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

### 4.9 分享解析

#### 4.9.1 分享链接资源识别

| 项目 | 值 |
|---|---|
| 路径 | `/share/resolve` |
| 方式 | GET / POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| url | string | **是**（多选一） | — | 分享链接；也接受 `id`（两者至少传一个） |
| track_id | string | **是**（多选一） | — | 显式指定曲目 ID 或含 ID 的链接 |
| playlist_id | string | **是**（多选一） | — | 显式指定歌单 ID 或链接 |
| video_id | string | **是**（多选一） | — | 显式指定视频 ID 或链接 |

纯本地解析，不访问上游。资源类型识别优先级：`track_id` → `playlist_id` → `video_id` → 从 `url`/`id` 中正则提取。

**请求示例**

```bash
curl "http://127.0.0.1:3300/share/resolve?track_id=7079108541549643812"
```

**响应示例**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "input": "7079108541549643812",
    "ids": { "track_id": "7079108541549643812", "video_id": "", "playlist_id": "" },
    "resource_types": ["track"],
    "primary_type": "track"
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

`primary_type` 可能的取值：`track` / `playlist` / `video` / `ambiguous`（识别出多种类型）/ `""`（未识别）。

### 4.10 登录与账号

> 账号接口（`/auth/me`、`/me/playlists`、`/me/collection/mixed`）通过请求头 `Cookie` 或 JSON body 的 `sessionid` 传入登录态；`/video/detail` 同理。缺失时返回 `40000 Cookie 或 sessionid 不能为空`。
> 扫码登录上游要求使用已登录的**抖音 APP** 扫码验证，使用汽水音乐 App 扫码可能无法完成确认。

#### 4.10.1 获取登录二维码

| 项目 | 值 |
|---|---|
| 路径 | `/auth/qrcode` |
| 方式 | GET |
| 参数 | 无 |

**请求示例**

```bash
curl "http://127.0.0.1:3300/auth/qrcode"
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "v1:abc123...",
    "qrcode": "data:image/png;base64,...(二维码图片 base64)",
    "qrcode_index_url": "https://...",
    "expire_time": 180,
    "web_name": "汽水音乐",
    "copywriting": "请使用抖音 APP 扫码验证"
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

调用方应展示 `qrcode`，并用 `token` 轮询 `/auth/qrcode/status`。

#### 4.10.2 轮询二维码登录状态

| 项目 | 值 |
|---|---|
| 路径 | `/auth/qrcode/status` |
| 方式 | POST |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| token | string | **是** | — | `/auth/qrcode` 返回的 token |

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/auth/qrcode/status" \
  -H "Content-Type: application/json" \
  -d '{"token":"v1:abc123..."}'
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "confirmed",
    "error_code": 0,
    "scan_app_id": 1234,
    "auth": { "aid": 386088, "sessionid": "登录成功后返回的 sessionid" }
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

| 字段 | 说明 |
|---|---|
| `status` | 扫码状态（`new`/`scanned`/`confirmed`/`expired` 等，以上游为准） |
| `auth.sessionid` | 仅确认（`confirmed`）后返回；调用方需自行安全保存 |

#### 4.10.3 当前账号信息

| 项目 | 值 |
|---|---|
| 路径 | `/auth/me` |
| 方式 | POST（需登录态） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| sessionid | string | **是**（或 Cookie 头） | — | 登录会话 ID |
| include_raw | boolean | 否 | false | 是否附加原始响应 |
| aid | integer | 否 | 386088 | 上游应用 ID |

**请求示例**

```bash
curl -X POST "http://127.0.0.1:3300/auth/me" \
  -H "Content-Type: application/json" \
  -d '{"sessionid":"你的sessionid"}'
```

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "profile": {
      "id": "10001",
      "nickname": "示例用户",
      "douyin_id": "example_user",
      "is_vip": true,
      "vip_stage": "黄金VIP",
      "raw": "..."
    },
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.10.4 我的歌单

| 项目 | 值 |
|---|---|
| 路径 | `/me/playlists` |
| 方式 | POST（需登录态） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| sessionid | string | **是**（或 Cookie 头） | — | 登录会话 ID |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | — | 每页数量 |
| include_raw | boolean | 否 | false | 是否附加原始响应 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "playlists": [ { "id": "7031087107562424328", "title": "我喜欢的音乐", "cover_url": "https://..." } ],
    "total_num": 12,
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

#### 4.10.5 我的收藏混合流

| 项目 | 值 |
|---|---|
| 路径 | `/me/collection/mixed` |
| 方式 | POST（需登录态） |

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| sessionid | string | **是**（或 Cookie 头） | — | 登录会话 ID |
| cursor | string | 否 | — | 分页游标 |
| count | integer | 否 | — | 每页数量 |
| include_raw | boolean | 否 | false | 是否附加原始响应 |

**响应示例**（节选）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "mixed_collections": [
      {
        "item_type": "playlist",
        "playlist": { "id": "7031087107562424328", "title": "..." },
        "track": null,
        "video": null,
        "raw": "..."
      }
    ],
    "total_num": 8,
    "upstream": "..."
  },
  "trace_id": "m8x2k1-abcd1234"
}
```

`mixed_collections` 数组元素结构：`{item_type, playlist, track, video, raw}`，三个资源对象按类型填充（非对应类型为 `null`）。

### 4.11 资源对象结构速查

文档中反复出现的标准化资源对象结构如下（均在 `src/normalizers.js` 中定义，`raw` 字段保留上游原始数据）：

**曲目（track）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 曲目 ID |
| name | string | 曲目名 |
| duration | number | 时长（毫秒） |
| vid | string | 关联视频 ID |
| media_type | string | 媒体类型（默认 `track`） |
| album | object/null | `{id, name, cover_url, release_date}` |
| artists | array | `[{id, name, avatar_url, raw}]` |
| stats | object | 播放/点赞等统计（透传） |
| raw | object | 上游原始数据 |

**歌单（playlist）**：`{id, title, type, description, cover_url, count_tracks, raw}`

**视频（video）**：`{id, title, cover_url, duration, media_type, raw}`

**Feed 项（feed item）**：`{id, type, track, recommend_reason, predict_info, raw}`

**评论（comment）**：`{id, content, user, reply_count, ...}`（含回复数、点赞等透传字段）

## 5. 环境变量配置参考

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3300 | 服务监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `QISHUI_REQUEST_TIMEOUT_MS` | 15000 | 上游请求超时（毫秒） |
| `QISHUI_MAX_PAGE_SIZE` | 50 | `count` 参数上限 |
| `QISHUI_DEVICE_ID` | 随机生成 | PC 接口设备 ID（固定测试环境时配置） |
| `QISHUI_INSTALL_ID` | 随机生成 | PC 接口安装 ID |
| `QISHUI_FP` | 空 | PC 接口指纹 |
| `QISHUI_X_HELIOS` | 空 | PC 接口签名 header（部分网络环境必需） |
| `QISHUI_X_MEDUSA` | 空 | PC 接口签名 header |
| `QISHUI_ENABLE_DECRYPT` | true | 是否启用 `/audio/decrypt` |
| `QISHUI_DOWNLOAD_ALLOWED_HOSTS` | 内置白名单 | 下载域名白名单（逗号分隔） |
| `QISHUI_DOWNLOAD_MAX_BYTES` | 52428800 | 下载/解密单文件上限（字节） |
| `CORS_ALLOW_ORIGIN` | * | 跨域来源白名单（逗号分隔） |
| `QISHUI_LUNA_API_HOST` | https://beta-luna.douyin.com | Luna 上游地址 |
| `QISHUI_PC_API_HOST` | https://api.qishui.com | PC 上游地址 |
| `QISHUI_MUSIC_SHARE_HOST` | https://music.douyin.com | 分享页上游地址 |

---

## 附：接口速查表

| 路径 | 方式 | 必填参数 | 需登录态 | 说明 |
|---|---|---|---|---|
| `/health` | GET | — | 否 | 健康检查 |
| `/api/list` | GET | — | 否 | 已挂载接口列表 |
| `/api/capabilities` | GET | — | 否 | 能力清单 |
| `/discover` | GET/POST | — | 否 | 发现页 |
| `/discover/mix` | GET/POST | — | 否 | 发现页混合流 |
| `/recommend/playlist` | GET/POST | — | 否 | 推荐歌单 |
| `/playlist/detail` | GET/POST | playlist_id | 否 | 歌单详情 |
| `/playlist/related/media` | GET/POST | playlist_id | 通常需要 | 歌单相关推荐 |
| `/playlist/feed/media` | GET/POST | playlist_id | 通常需要 | 歌单媒体 Feed |
| `/radio/list` | GET/POST | — | 否 | 电台列表 |
| `/radio/tracks` | GET/POST | radio_id | 否 | 电台歌曲 |
| `/feed/mode` | GET/POST | — | 否 | Feed 模式 |
| `/feed/mode/guidance` | GET/POST | — | 否 | Feed 模式引导 |
| `/feed/listen/video` | GET/POST | — | 通常需要 | 听歌视频 Feed |
| `/daily/mix` | GET/POST | — | 需 App 上下文 | DailyMix（裸调常被拒） |
| `/search` | GET/POST | keywords | 否 | 歌曲搜索 |
| `/search/playlist` | GET/POST | keywords | 否 | 歌单搜索 |
| `/search/mixed` | GET/POST | keywords | 否 | 混合搜索 |
| `/track/detail` | GET/POST | track_id | 否 | 曲目详情（PC） |
| `/h5/seo/track` | GET/POST | track_id | 否 | H5 SEO 曲目 |
| `/media/player` | POST | media_id（body） | 需登录态 | 播放信息摘要（脱敏） |
| `/comment` | GET/POST | group_id/track_id/id 三选一 | 否 | 评论列表 |
| `/video/detail` | POST | video_id + sessionid | **是** | 视频详情 |
| `/song/detail` | GET/POST | track_id 或 url | 否 | 歌曲详情 |
| `/lyric` | GET/POST | track_id 或 url | 否 | 歌词 |
| `/audio/info` | GET/POST | track_id 或 url | 否 | 音频信息 |
| `/download/url` | GET/POST | track_id 或 url | 可选 | 下载地址解析 |
| `/download/file` | POST | audio_url/url/track_id 之一 | 否 | 受控下载（base64） |
| `/decrypt/spade` | POST | spade_a 或 hex_key | 否 | spade 解密 |
| `/audio/decrypt` | POST | (spade_a 或 hex_key) + (audio 来源) | 否 | 本地解密 |
| `/share/resolve` | GET/POST | url/id 或显式资源 ID | 否 | 分享解析（本地） |
| `/auth/qrcode` | GET | — | 否 | 登录二维码 |
| `/auth/qrcode/status` | POST | token | 否 | 轮询扫码状态 |
| `/auth/me` | POST | sessionid（或 Cookie） | **是** | 账号信息 |
| `/me/playlists` | POST | sessionid（或 Cookie） | **是** | 我的歌单 |
| `/me/collection/mixed` | POST | sessionid（或 Cookie） | **是** | 我的收藏混合流 |

> 以上接口均已通过 `test/binary-api-test.js` 对 dist 二进制产物做过全量验证（36 用例），验证报告见 `test/binary-api-report.md`。唯一与本文档调用方式相关的已知问题为 `/media/player` 的 GET 方式不可用（见 4.7.3 备注）。
