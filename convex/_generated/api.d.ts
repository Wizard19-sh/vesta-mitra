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
import type * as betaAdmin from "../betaAdmin.js";
import type * as executionExceptions from "../executionExceptions.js";
import type * as executionSupport from "../executionSupport.js";
import type * as http from "../http.js";
import type * as interpreter from "../interpreter.js";
import type * as m1Setup from "../m1Setup.js";
import type * as m5 from "../m5.js";
import type * as messageTransport from "../messageTransport.js";
import type * as metaWhatsAppTransport from "../metaWhatsAppTransport.js";
import type * as mitra from "../mitra.js";
import type * as mitraInbound from "../mitraInbound.js";
import type * as mitraRoutines from "../mitraRoutines.js";
import type * as mitraRuntime from "../mitraRuntime.js";
import type * as productAnalytics from "../productAnalytics.js";
import type * as tarlaDayPlanning from "../tarlaDayPlanning.js";
import type * as tarlaDaySupport from "../tarlaDaySupport.js";
import type * as tarlaInbound from "../tarlaInbound.js";
import type * as tarlaInstruction from "../tarlaInstruction.js";
import type * as tarlaPlanning from "../tarlaPlanning.js";
import type * as tarlaProfiles from "../tarlaProfiles.js";
import type * as tarlaRuntime from "../tarlaRuntime.js";
import type * as tarlaSupport from "../tarlaSupport.js";
import type * as transportInbound from "../transportInbound.js";
import type * as transportMessages from "../transportMessages.js";
import type * as twilioTransport from "../twilioTransport.js";
import type * as vesta from "../vesta.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  betaAdmin: typeof betaAdmin;
  executionExceptions: typeof executionExceptions;
  executionSupport: typeof executionSupport;
  http: typeof http;
  interpreter: typeof interpreter;
  m1Setup: typeof m1Setup;
  m5: typeof m5;
  messageTransport: typeof messageTransport;
  metaWhatsAppTransport: typeof metaWhatsAppTransport;
  mitra: typeof mitra;
  mitraInbound: typeof mitraInbound;
  mitraRoutines: typeof mitraRoutines;
  mitraRuntime: typeof mitraRuntime;
  productAnalytics: typeof productAnalytics;
  tarlaDayPlanning: typeof tarlaDayPlanning;
  tarlaDaySupport: typeof tarlaDaySupport;
  tarlaInbound: typeof tarlaInbound;
  tarlaInstruction: typeof tarlaInstruction;
  tarlaPlanning: typeof tarlaPlanning;
  tarlaProfiles: typeof tarlaProfiles;
  tarlaRuntime: typeof tarlaRuntime;
  tarlaSupport: typeof tarlaSupport;
  transportInbound: typeof transportInbound;
  transportMessages: typeof transportMessages;
  twilioTransport: typeof twilioTransport;
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
