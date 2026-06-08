import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

const traceStorage = new AsyncLocalStorage();

function createPinoInstance() {
  const level = process.env.AGENT_ORCHESTRATOR_LOG_LEVEL || "info";
  const transport = process.env.AGENT_ORCHESTRATOR_LOG_PRETTY
    ? pino.transport({
        target: "pino/file",
        options: { destination: 1 },
      })
    : undefined;

  return pino({
    level,
    transport,
    serializers: {
      err: pino.stdSerializers.err,
    },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

const rootPino = createPinoInstance();

function buildBindings(module) {
  const traceId = traceStorage.getStore();
  const base = { module };
  if (traceId) base.traceId = traceId;
  return base;
}

export function Logger(module) {
  const instance = rootPino.child(buildBindings(module));

  const wrapper = new Proxy(instance, {
    get(target, prop) {
      if (prop === "child") {
        return (bindings) => {
          const child = target.child(bindings);
          const childWrapper = new Proxy(child, {
            get(t, p) {
              if (p === "child") return childWrapper.child;
              if (p === "setTraceId") return childWrapper.setTraceId;
              if (p === "getTraceId") {
                return () => traceStorage.getStore() || null;
              }
              if (p === "setLevel") return (lvl) => { t.level = lvl; };
              if (typeof t[p] === "function") return t[p].bind(t);
              return t[p];
            },
          });
          return childWrapper;
        };
      }
      if (prop === "setTraceId") {
        return (id) => {
          traceStorage.enterWith(id);
        };
      }
      if (prop === "getTraceId") {
        return () => traceStorage.getStore() || null;
      }
      if (prop === "setLevel") {
        return (lvl) => { instance.level = lvl; };
      }
      if (typeof instance[prop] === "function") {
        return instance[prop].bind(instance);
      }
      return instance[prop];
    },
  });

  return wrapper;
}

export function runWithTraceId(traceId, fn) {
  return traceStorage.run(traceId, fn);
}
