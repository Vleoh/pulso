type MarketTrend = "up" | "down" | "flat";

export type WeatherSnapshot = {
  location: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  condition: string;
  windKmh: number | null;
  updatedAt: string;
};

export type MarketSnapshot = {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  currency: string;
  trend: MarketTrend;
};

type SignalPayload = {
  weather: WeatherSnapshot;
  markets: MarketSnapshot[];
};

const MARKET_TICKERS = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "SPY", label: "SPDR S&P" },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "NVDA", label: "NVIDIA" },
  { symbol: "TSLA", label: "Tesla" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "GOOGL", label: "Alphabet" },
] as const;

const MARKET_LABELS = new Map(MARKET_TICKERS.map((entry) => [entry.symbol.toUpperCase(), entry.label]));
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ?? "";
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY ?? "";

const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  "^GSPC": "SPY",
  "^IXIC": "QQQ",
  "^DJI": "DIA",
  SPY: "SPY",
  AAPL: "AAPL",
  MSFT: "MSFT",
  NVDA: "NVDA",
  TSLA: "TSLA",
  AMZN: "AMZN",
  GOOGL: "GOOGL",
};

const FALLBACK_MARKETS: MarketSnapshot[] = MARKET_TICKERS.map((item, index) => ({
  symbol: item.symbol,
  label: item.label,
  price: null,
  changePct: [0.25, -0.18, 0.12, 0.14, -0.06, 0.31, 0.44][index] ?? 0,
  currency: "USD",
  trend: "flat",
}));

const FALLBACK_WEATHER: WeatherSnapshot = {
  location: "Buenos Aires",
  temperatureC: 23,
  feelsLikeC: 24,
  condition: "Parcialmente nublado",
  windKmh: 14,
  updatedAt: new Date().toISOString(),
};

let signalCache: { expiresAt: number; value: SignalPayload } | null = null;

function weatherCodeLabel(code: number | null): string {
  switch (code) {
    case 0:
      return "Despejado";
    case 1:
    case 2:
      return "Parcialmente nublado";
    case 3:
      return "Nublado";
    case 45:
    case 48:
      return "Neblina";
    case 51:
    case 53:
    case 55:
      return "Llovizna";
    case 61:
    case 63:
    case 65:
      return "Lluvia";
    case 71:
    case 73:
    case 75:
      return "Nieve";
    case 80:
    case 81:
    case 82:
      return "Chaparrones";
    case 95:
      return "Tormenta";
    default:
      return "Condicion variable";
  }
}

function toTrend(changePct: number | null): MarketTrend {
  if (changePct === null || Number.isNaN(changePct)) {
    return "flat";
  }
  if (changePct > 0.03) {
    return "up";
  }
  if (changePct < -0.03) {
    return "down";
  }
  return "flat";
}

async function fetchWeather(): Promise<WeatherSnapshot> {
  if (OPENWEATHER_API_KEY) {
    const owResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=-34.61&lon=-58.38&units=metric&lang=es&appid=${encodeURIComponent(
        OPENWEATHER_API_KEY,
      )}`,
      {
        headers: { accept: "application/json" },
      },
    );
    if (!owResponse.ok) {
      throw new Error(`OpenWeather ${owResponse.status}`);
    }

    const owPayload = (await owResponse.json()) as {
      dt?: number;
      weather?: Array<{ description?: string }>;
      main?: { temp?: number; feels_like?: number };
      wind?: { speed?: number };
    };

    return {
      location: "Buenos Aires",
      temperatureC: typeof owPayload.main?.temp === "number" ? Math.round(owPayload.main.temp) : null,
      feelsLikeC: typeof owPayload.main?.feels_like === "number" ? Math.round(owPayload.main.feels_like) : null,
      condition: owPayload.weather?.[0]?.description?.trim() || "Condicion variable",
      windKmh: typeof owPayload.wind?.speed === "number" ? Math.round(owPayload.wind.speed * 3.6) : null,
      updatedAt: typeof owPayload.dt === "number" ? new Date(owPayload.dt * 1000).toISOString() : new Date().toISOString(),
    };
  }

  const response = await fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=-34.61&longitude=-58.38&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=America%2FArgentina%2FBuenos_Aires",
    {
      headers: { accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}`);
  }

  const payload = (await response.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };

  const current = payload.current ?? {};
  return {
    location: "Buenos Aires",
    temperatureC: typeof current.temperature_2m === "number" ? Math.round(current.temperature_2m) : null,
    feelsLikeC: typeof current.apparent_temperature === "number" ? Math.round(current.apparent_temperature) : null,
    condition: weatherCodeLabel(typeof current.weather_code === "number" ? current.weather_code : null),
    windKmh: typeof current.wind_speed_10m === "number" ? Math.round(current.wind_speed_10m) : null,
    updatedAt: current.time ? new Date(current.time).toISOString() : new Date().toISOString(),
  };
}

function normalizeSymbols(symbols?: string[]): string[] {
  if (!symbols || symbols.length === 0) {
    return MARKET_TICKERS.map((item) => item.symbol);
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawSymbol of symbols) {
    const cleaned = rawSymbol.trim().toUpperCase();
    if (!cleaned) {
      continue;
    }
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      normalized.push(cleaned);
    }
    if (normalized.length >= 25) {
      break;
    }
  }
  return normalized.length > 0 ? normalized : MARKET_TICKERS.map((item) => item.symbol);
}

async function fetchMarketsBySymbols(symbolsInput?: string[]): Promise<MarketSnapshot[]> {
  if (FINNHUB_API_KEY) {
    const symbols = normalizeSymbols(symbolsInput);
    const responses = await Promise.all(
      symbols.map(async (symbol) => {
        const providerSymbol = FINNHUB_SYMBOL_MAP[symbol] ?? symbol;
        try {
          const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(providerSymbol)}&token=${encodeURIComponent(
              FINNHUB_API_KEY,
            )}`,
            {
              headers: { accept: "application/json" },
            },
          );
          if (!response.ok) {
            throw new Error(`Finnhub ${response.status}`);
          }
          const payload = (await response.json()) as { c?: number; pc?: number; dp?: number };
          const price = typeof payload.c === "number" ? Number(payload.c.toFixed(2)) : null;
          const changePct =
            typeof payload.dp === "number"
              ? Number(payload.dp.toFixed(2))
              : typeof payload.c === "number" && typeof payload.pc === "number" && payload.pc !== 0
                ? Number((((payload.c - payload.pc) / payload.pc) * 100).toFixed(2))
                : null;
          return {
            symbol,
            label: MARKET_LABELS.get(symbol) ?? symbol,
            price,
            changePct,
            currency: "USD",
            trend: toTrend(changePct),
          } satisfies MarketSnapshot;
        } catch {
          return null;
        }
      }),
    );

    const usable = responses.filter((item): item is MarketSnapshot => Boolean(item && item.price !== null));
    if (usable.length >= Math.max(2, Math.floor(symbols.length / 2))) {
      const bySymbol = new Map(usable.map((item) => [item.symbol, item]));
      return symbols.map(
        (symbol) =>
          bySymbol.get(symbol) ?? {
            symbol,
            label: MARKET_LABELS.get(symbol) ?? symbol,
            price: null,
            changePct: null,
            currency: "USD",
            trend: "flat",
          },
      );
    }
  }

  const symbols = normalizeSymbols(symbolsInput);
  const responses = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        {
          headers: {
            accept: "application/json",
            "user-agent": "PulsoPais/1.0",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Yahoo Finance ${response.status}`);
      }

      const payload = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              currency?: string;
            };
            indicators?: {
              quote?: Array<{
                close?: Array<number | null>;
              }>;
            };
          }>;
        };
      };

      const result = payload.chart?.result?.[0];
      const meta = result?.meta;
      const closeSeries = result?.indicators?.quote?.[0]?.close ?? [];
      const lastClose =
        [...closeSeries]
          .reverse()
          .find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
      const previousClose =
        typeof meta?.previousClose === "number" && Number.isFinite(meta.previousClose)
          ? meta.previousClose
          : closeSeries.length >= 2
            ? [...closeSeries]
                .slice(0, -1)
                .reverse()
                .find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null
            : null;

      const priceRaw =
        typeof meta?.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice)
          ? meta.regularMarketPrice
          : lastClose;
      const price = typeof priceRaw === "number" ? Number(priceRaw.toFixed(2)) : null;
      const changePct =
        typeof priceRaw === "number" && typeof previousClose === "number" && previousClose !== 0
          ? Number((((priceRaw - previousClose) / previousClose) * 100).toFixed(2))
          : null;

      return {
        symbol,
        label: MARKET_LABELS.get(symbol) ?? symbol,
        price,
        changePct,
        currency: meta?.currency ?? "USD",
        trend: toTrend(changePct),
      } satisfies MarketSnapshot;
    }),
  );

  return responses.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }
    const symbol = symbols[index] ?? `SYM-${index + 1}`;
    return {
      symbol,
      label: MARKET_LABELS.get(symbol) ?? symbol,
      price: null,
      changePct: null,
      currency: "USD",
      trend: "flat" as const,
    };
  });
}

export async function getSignalData(): Promise<SignalPayload> {
  if (signalCache && Date.now() < signalCache.expiresAt) {
    return signalCache.value;
  }

  const [weatherResult, marketsResult] = await Promise.allSettled([fetchWeather(), fetchMarketsBySymbols()]);

  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : FALLBACK_WEATHER;
  const markets = marketsResult.status === "fulfilled" ? marketsResult.value : FALLBACK_MARKETS;

  const value: SignalPayload = { weather, markets };
  signalCache = {
    value,
    expiresAt: Date.now() + 4 * 60 * 1000,
  };

  return value;
}

export async function getMarketData(symbolsInput?: string[]): Promise<MarketSnapshot[]> {
  try {
    return await fetchMarketsBySymbols(symbolsInput);
  } catch {
    if (!symbolsInput || symbolsInput.length === 0) {
      return FALLBACK_MARKETS;
    }
    const symbols = normalizeSymbols(symbolsInput);
    return symbols.map((symbol) => ({
      symbol,
      label: MARKET_LABELS.get(symbol) ?? symbol,
      price: null,
      changePct: null,
      currency: "USD",
      trend: "flat",
    }));
  }
}

export async function getWeatherData(): Promise<WeatherSnapshot> {
  try {
    return await fetchWeather();
  } catch {
    return FALLBACK_WEATHER;
  }
}
