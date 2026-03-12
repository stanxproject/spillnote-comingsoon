const RADIO_BASES = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

function clampInt(value, min, max, fallback){
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const intVal = Math.trunc(num);
  if (intVal < min) return min;
  if (intVal > max) return max;
  return intVal;
}

function cleanSearchText(value = "", maxLen = 80){
  return String(value)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^\w\s\-_,.+#/&()]/g, "")
    .trim()
    .slice(0, maxLen);
}

function allowSort(value){
  const allowed = ["votes", "clickcount", "name", "bitrate", "lastcheckok"];
  return allowed.includes(value) ? value : "votes";
}

async function radioApiRequest(pathWithQuery){
  for (const base of RADIO_BASES) {
    try {
      const response = await fetch(`${base}${pathWithQuery}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "SPILLNOTE-Radio/1.0"
        },
        cf: {
          cacheTtl: 120,
          cacheEverything: false
        }
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data)) {
        return { ok: true, data };
      }
    } catch (error) {
      continue;
    }
  }

  return {
    ok: false,
    error: {
      message: "All radio nodes failed. Please try again."
    }
  };
}

function json(data, status = 200){
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestGet(context){
  const { request } = context;
  const url = new URL(request.url);

  const q = cleanSearchText(url.searchParams.get("q") || "", 80);
  const tag = cleanSearchText(url.searchParams.get("tag") || "", 60);
  const onlyUS = (url.searchParams.get("us") || "1") === "1";
  const sort = allowSort(url.searchParams.get("sort") || "votes");
  const page = clampInt(url.searchParams.get("page"), 0, 500, 0);
  const limit = clampInt(url.searchParams.get("limit"), 10, 30, 12);
  const offset = page * limit;

  const params = new URLSearchParams({
    hidebroken: "true",
    limit: String(limit),
    offset: String(offset),
    order: sort,
    reverse: "true"
  });

  if (q) params.set("name", q);
  if (tag) params.set("tag", tag);
  if (onlyUS) params.set("countrycode", "US");

  const result = await radioApiRequest(`/json/stations/search?${params.toString()}`);

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  const stations = result.data
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const stream = String(s.url_resolved || s.url || "").trim();
      if (!/^https?:\/\//i.test(stream)) return null;

      return {
        uuid: String(s.stationuuid || ""),
        name: String(s.name || "Unknown Station"),
        country: String(s.country || ""),
        countrycode: String(s.countrycode || ""),
        state: String(s.state || ""),
        language: String(s.language || ""),
        tags: String(s.tags || ""),
        favicon: String(s.favicon || ""),
        bitrate: Number(s.bitrate || 0),
        codec: String(s.codec || ""),
        votes: Number(s.votes || 0),
        clickcount: Number(s.clickcount || 0),
        lastcheckok: Number(s.lastcheckok || 0),
        stream
      };
    })
    .filter(Boolean);

  return json({
    ok: true,
    page,
    limit,
    count: stations.length,
    stations
  });
}

export async function onRequestOptions(){
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}