/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as interpreter from "../interpreter.js";
import type * as messageTransport from "../messageTransport.js";
import type * as mitra from "../mitra.js";
import type * as mitraInbound from "../mitraInbound.js";
import type * as mitraRoutines from "../mitraRoutines.js";
import type * as mitraRuntime from "../mitraRuntime.js";
import type * as vesta from "../vesta.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  interpreter: typeof interpreter;
  messageTransport: typeof messageTransport;
  mitra: typeof mitra;
  mitraInbound: typeof mitraInbound;
  mitraRoutines: typeof mitraRoutines;
  mitraRuntime: typeof mitraRuntime;
  vesta: typeof vesta;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
