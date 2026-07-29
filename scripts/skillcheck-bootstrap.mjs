#!/usr/bin/env node
import { bootstrapV03 } from "./bootstrap-v03.mjs";

await bootstrapV03();
await import("../skillcheck.mjs");
