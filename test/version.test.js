const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { getVersion } = require('../src/version')

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/

test('getVersion returns a valid semver string', () => {
  const version = getVersion()
  assert.strictEqual(typeof version, 'string')
  assert.match(version, SEMVER_RE)
})

test('getVersion matches version.txt content in project root', () => {
  const fileVersion = fs.readFileSync(path.join(__dirname, '..', 'version.txt'), 'utf8').trim()
  assert.strictEqual(getVersion(), fileVersion)
})

test('getVersion result is cached and stable', () => {
  assert.strictEqual(getVersion(), getVersion())
})
