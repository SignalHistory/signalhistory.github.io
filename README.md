# ◆ Quant Lines — live strategy test

Public real-time test of systematic trading strategies. Four books, $10,000
each, traded every US trading day: **6f** and **momAB** on the NASDAQ-100
top-60, **7fh** on the S&P 500 top-60, and the **MAG7** reference basket.

**Site:** https://signalhistory.github.io ·
**Telegram:** https://t.me/quant_signals_live

## Why this repository makes the track verifiable

This entire site — including the machine-readable signals — is committed
here every trading day by an automated pipeline. **The commit history is the
timestamp**: GitHub records when each signal was published, and history
cannot be rewritten quietly. A signal cannot be inserted or altered after
the market has moved.

## Machine-readable data

| file | contents |
|---|---|
| [`data/signals_latest.json`](data/signals_latest.json) | positions and trades of the latest trading day, per strategy |
| [`data/signals_journal.json`](data/signals_journal.json) | the full trade journal since 2020-01-02, per strategy and year |
| [`data/history.json`](data/history.json) | daily equity curves and metrics of every book and benchmark |

Schema of a trade row: `{date, side, ticker, shares, price, cost}` — prices
are dividend/split-adjusted daily closes; `cost` is the 15 bps commission +
slippage allowance.

## How to verify (3 steps)

1. Open the [commit history](../../commits/main) — every daily update is
   timestamped by GitHub, not by us.
2. Take `data/signals_latest.json` from any past commit: the positions and
   trades published that day.
3. Compare the published trade prices with market data for the days that
   followed.

## Disclaimer

For information and research purposes only. Nothing here is investment
advice, or an offer or solicitation to buy or sell any security. Results
before each book's live date are simulated under frozen rules; results after
it come from a live test with virtual capital. Performance figures include
15 bps trading costs per side but no taxes or broker fees. Past performance
does not guarantee future results. Prices come from public data sources and
may contain errors.
