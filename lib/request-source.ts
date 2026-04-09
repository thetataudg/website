type RequestLike = {
  headers: Headers;
  method?: string;
  url: string;
};

export function getRequestSource(req: RequestLike) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientIp = req.headers.get("x-nf-client-connection-ip") || "";
  const userAgent = req.headers.get("user-agent") || "";
  const referer = req.headers.get("referer") || "";
  const origin = req.headers.get("origin") || "";
  const host = req.headers.get("host") || "";

  return {
    method: req.method || "GET",
    url: req.url,
    ip: clientIp || forwardedFor.split(",")[0]?.trim() || "",
    forwardedFor,
    userAgent,
    referer,
    origin,
    host,
  };
}