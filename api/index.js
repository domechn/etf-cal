import express from 'express';
import YahooFinance from 'yahoo-finance2';
import cors from 'cors';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const app = express();

app.use(cors());
app.use(express.json());

// 搜索 API
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  
  try {
    const results = await yahooFinance.search(q);
    const etfs = results.quotes
      .filter(q => q.quoteType === 'ETF')
      .map(q => ({
        symbol: q.symbol,
        shortname: q.shortname || '',
        longname: q.longname || '',
        exchange: q.exchange || ''
      }));
    res.json(etfs);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 分析 API
app.post('/api/analyze', async (req, res) => {
  const { tickers, market } = req.body;
  if (!tickers || !Array.isArray(tickers)) {
    return res.status(400).json({ error: 'Invalid tickers' });
  }

  const data = {};
  const etf_info = {};

  try {
    // 并行获取数据
    await Promise.all(tickers.map(async (symbol) => {
      try {
        // 获取 Quote Summary，包含 topHoldings 和 price/summaryDetail
        // modules: topHoldings, summaryDetail, price
        const result = await yahooFinance.quoteSummary(symbol, { modules: ['topHoldings', 'price', 'summaryDetail'] });
        
        // 提取基本信息
        const price = result.price || {};
        etf_info[symbol] = {
            shortname: price.shortName || symbol,
            longname: price.longName || symbol,
            currency: price.currency || ''
        };

        // 提取持仓
        // yahoo-finance2 返回的 holdings 结构:
        // { symbol: 'NVDA', holdingPercent: 0.07, holdingName: 'NVIDIA Corp' }
        const holdings = result.topHoldings?.holdings || [];
        
        data[symbol] = holdings.map(h => ({
            symbol: h.symbol,
            name: h.holdingName,
            percent: h.holdingPercent // 注意：可能是 0.07 或 7.0，yf2通常返回小数
        }));

      } catch (e) {
        console.error(`Error fetching ${symbol}:`, e.message);
        data[symbol] = [];
        etf_info[symbol] = { shortname: symbol, longname: symbol, currency: '' };
      }
    }));

    // 计算重叠度
    const etf_weights = {};
    for (const [etf, holdings] of Object.entries(data)) {
        const weights = {};
        holdings.forEach(h => {
            weights[h.symbol] = h.percent;
        });
        etf_weights[etf] = weights;
    }

    const overlap_matrix = [];
    
    for (let i = 0; i < tickers.length; i++) {
        const row = [];
        const etf1 = tickers[i];
        for (let j = 0; j < tickers.length; j++) {
            const etf2 = tickers[j];
            
            const w1 = etf_weights[etf1] || {};
            const w2 = etf_weights[etf2] || {};

            if (etf1 === etf2) {
                row.push({
                    weight: 1.0,
                    count: Object.keys(w1).length,
                    common: Object.keys(w1).map(s => ({
                        symbol: s,
                        name: data[etf1].find(h => h.symbol === s)?.name || s,
                        weight_a: w1[s],
                        weight_b: w1[s]
                    }))
                });
                continue;
            }

            // 找交集
            const symbols1 = Object.keys(w1);
            const symbols2 = new Set(Object.keys(w2));
            const commonSymbols = symbols1.filter(s => symbols2.has(s));

            let overlap_weight = 0.0;
            const common_details = [];

            for (const s of commonSymbols) {
                const weightA = w1[s];
                const weightB = w2[s];
                overlap_weight += Math.min(weightA, weightB);

                const name = data[etf1].find(h => h.symbol === s)?.name || '';
                common_details.push({
                    symbol: s,
                    name: name,
                    weight_a: weightA,
                    weight_b: weightB
                });
            }

            row.push({
                weight: overlap_weight,
                count: commonSymbols.length,
                common: common_details
            });
        }
        overlap_matrix.push(row);
    }

    res.json({
        holdings: data,
        etf_info,
        overlap_matrix,
        tickers
    });

  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vercel serverless function entry point
export default app;
