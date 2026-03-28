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
  const symbols = normalizeSymbols(symbolsInput);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
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
    quoteResponse?: {
      result?: Array<{
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        currency?: string;
      }>;
    };
  };

  const bySymbol = new Map(
    (payload.quoteResponse?.result ?? [])
      .filter((item) => item.symbol)
      .map((item) => [item.symbol as string, item]),
  );

  return symbols.map((symbol) => {
    const quote = bySymbol.get(symbol);
    const price = typeof quote?.regularMarketPrice === "number" ? Number(quote.regularMarketPrice.toFixed(2)) : null;
    const changePct =
      typeof quote?.regularMarketChangePercent === "number" ? Number(quote.regularMarketChangePercent.toFixed(2)) : null;
    return {
      symbol,
      label: MARKET_LABELS.get(symbol) ?? symbol,
      price,
      changePct,
      currency: quote?.currency ?? "USD",
      trend: toTrend(changePct),
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
