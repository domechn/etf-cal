const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_QUOTE_SUMMARY_URL = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';

type Market = 'US' | 'HK';

export interface ETFSearchResult {
  symbol: string;
  shortname: string;
  longname: string;
  exchange: string;
}

export interface Holding {
  symbol: string;
  name: string;
  percent: number;
}

export interface OverlapCell {
  weight: number;
  count: number;
  common: {
    symbol: string;
    name: string;
    weight_a: number;
    weight_b: number;
  }[];
}

export interface AnalysisResult {
  holdings: Record<string, Holding[]>;
  etf_info: Record<string, { shortname: string; longname: string; currency: string }>;
  overlap_matrix: OverlapCell[][];
  tickers: string[];
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    quoteType?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
  }>;
}

interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      price?: {
        shortName?: string | null;
        longName?: string | null;
        currency?: string;
      };
      topHoldings?: {
        holdings?: Array<{
          symbol?: string;
          holdingName?: string;
          holdingPercent?: number;
        }>;
      };
    }>;
    error?: {
      description?: string;
    } | null;
  };
}

const getYahooLocale = (market: Market) => {
  if (market === 'HK') {
    return {
      lang: 'zh-Hant-HK',
      region: 'HK',
    };
  }

  return {
    lang: 'en-US',
    region: 'US',
  };
};

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    mode: 'cors',
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Yahoo Finance request failed (${response.status}) for ${url}: ${responseText || 'empty response'}`
    );
  }

  return response.json() as Promise<T>;
};

const normalizeHoldingPercent = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  // Yahoo Finance normally returns holdingPercent as a decimal (0.07 = 7%).
  // If it comes back as a whole percentage (7 = 7%), only values above 1 are
  // divided by 100; values at or below 1 are treated as decimals and left as-is.
  return value > 1 ? value / 100 : value;
};

const buildOverlapMatrix = (
  tickers: string[],
  holdingsByEtf: Record<string, Holding[]>
): OverlapCell[][] => {
  const etfWeights = Object.fromEntries(
    Object.entries(holdingsByEtf).map(([etf, holdings]) => [
      etf,
      Object.fromEntries(holdings.map((holding) => [holding.symbol, holding.percent])),
    ])
  ) as Record<string, Record<string, number>>;

  return tickers.map((etf1) => {
    const w1 = etfWeights[etf1] || {};
    const holdings1 = holdingsByEtf[etf1] || [];

    return tickers.map((etf2) => {
      const w2 = etfWeights[etf2] || {};

      if (etf1 === etf2) {
        return {
          weight: 1,
          count: Object.keys(w1).length,
          common: Object.keys(w1).map((symbol) => ({
            symbol,
            name: holdings1.find((holding) => holding.symbol === symbol)?.name || symbol,
            weight_a: w1[symbol],
            weight_b: w1[symbol],
          })),
        };
      }

      const commonSymbols = Object.keys(w1).filter((symbol) => symbol in w2);
      let overlapWeight = 0;

      const common = commonSymbols.map((symbol) => {
        const weightA = w1[symbol];
        const weightB = w2[symbol];
        overlapWeight += Math.min(weightA, weightB);

        return {
          symbol,
          name: holdings1.find((holding) => holding.symbol === symbol)?.name || symbol,
          weight_a: weightA,
          weight_b: weightB,
        };
      });

      return {
        weight: overlapWeight,
        count: commonSymbols.length,
        common,
      };
    });
  });
};

export const searchETFs = async (query: string, market: Market): Promise<ETFSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const { lang, region } = getYahooLocale(market);
  const url = new URL(YAHOO_SEARCH_URL);
  url.searchParams.set('q', trimmedQuery);
  url.searchParams.set('quotesCount', '10');
  url.searchParams.set('newsCount', '0');
  url.searchParams.set('enableFuzzyQuery', 'false');
  url.searchParams.set('enableNavLinks', 'false');
  url.searchParams.set('enableEnhancedTrivialQuery', 'true');
  url.searchParams.set('lang', lang);
  url.searchParams.set('region', region);

  const response = await getJson<YahooSearchResponse>(url.toString());

  return (response.quotes || [])
    .filter((quote) => quote.quoteType === 'ETF' && quote.symbol)
    .map((quote) => ({
      symbol: quote.symbol!,
      shortname: quote.shortname || '',
      longname: quote.longname || '',
      exchange: quote.exchange || '',
    }));
};

export const analyzeETFs = async (tickers: string[], market: Market): Promise<AnalysisResult> => {
  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.trim()).filter(Boolean))];
  const { lang, region } = getYahooLocale(market);

  if (uniqueTickers.length === 0) {
    return {
      holdings: {},
      etf_info: {},
      overlap_matrix: [],
      tickers: [],
    };
  }

  const holdings: Record<string, Holding[]> = {};
  const etfInfo: AnalysisResult['etf_info'] = {};

  await Promise.all(
    uniqueTickers.map(async (symbol) => {
      const url = new URL(`${YAHOO_QUOTE_SUMMARY_URL}/${encodeURIComponent(symbol)}`);
      url.searchParams.set('modules', 'topHoldings,price,summaryDetail');
      url.searchParams.set('formatted', 'false');
      url.searchParams.set('lang', lang);
      url.searchParams.set('region', region);
      url.searchParams.set('corsDomain', 'finance.yahoo.com');

      try {
        const response = await getJson<YahooQuoteSummaryResponse>(url.toString());
        const result = response.quoteSummary?.result?.[0];

        if (!result) {
          throw new Error(response.quoteSummary?.error?.description || `No Yahoo Finance data for ${symbol}`);
        }

        const price = result.price;
        etfInfo[symbol] = {
          shortname: price?.shortName || symbol,
          longname: price?.longName || symbol,
          currency: price?.currency || '',
        };

        holdings[symbol] = (result.topHoldings?.holdings || [])
          .filter((holding) => holding.symbol)
          .map((holding) => ({
            symbol: holding.symbol!,
            name: holding.holdingName || holding.symbol!,
            percent: normalizeHoldingPercent(holding.holdingPercent),
          }));
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        holdings[symbol] = [];
        etfInfo[symbol] = {
          shortname: symbol,
          longname: symbol,
          currency: '',
        };
      }
    })
  );

  return {
    holdings,
    etf_info: etfInfo,
    overlap_matrix: buildOverlapMatrix(uniqueTickers, holdings),
    tickers: uniqueTickers,
  };
};
