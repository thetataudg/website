import pino from "pino";

const logger = pino({
  level: "info",
  base: {
    pid: undefined,
    hostname: undefined,
  },
});

export default logger;
