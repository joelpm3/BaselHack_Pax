// Lets plain Node scripts (scripts/converse.ts) import server-only modules without the
// react-server condition, which would break client packages such as next-intl.
const Module = require("node:module");
const path = require("node:path");

const empty = path.join(path.dirname(require.resolve("server-only")), "empty.js");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? empty : resolve.call(this, request, ...rest);
};
