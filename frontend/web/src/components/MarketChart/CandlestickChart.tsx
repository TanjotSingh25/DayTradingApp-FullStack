/**
 * Candlestick Chart Component using TradingView Lightweight Charts
 * Price-only (no volume); spacing and visuals are controlled via chartConfig.
 */

import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../api/marketData';
import { DEFAULT_BAR_SPACING } from './chartConfig';

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
}

export default function CandlestickChart({ candles, height = 520 }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastTimestampRef = useRef<UTCTimestamp | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: DEFAULT_BAR_SPACING,
      },
    });

    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height]);

  // Update chart data
  useEffect(() => {
    if (!candlestickSeriesRef.current || candles.length === 0) {
      return;
    }

    // Convert candles to chart format
    const candlestickData = candles.map((candle) => {
      const time = Math.floor(new Date(candle.ts).getTime() / 1000) as UTCTimestamp;
      return {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      };
    });

    const firstCandleTime = candlestickData[0]?.time;
    const lastCandleTime = candlestickData[candlestickData.length - 1]?.time;

    if (lastTimestampRef.current === null || firstCandleTime !== lastTimestampRef.current) {
      // First load or full reset
      candlestickSeriesRef.current.setData(candlestickData);
    } else if (lastCandleTime && lastCandleTime === lastTimestampRef.current) {
      // Update last candle
      const lastCandle = candlestickData[candlestickData.length - 1];
      if (lastCandle) {
        candlestickSeriesRef.current.update(lastCandle);
      }
    } else {
      // Append new candle
      const newCandle = candlestickData[candlestickData.length - 1];
      if (newCandle) {
        candlestickSeriesRef.current.update(newCandle);
      }
    }

    lastTimestampRef.current = lastCandleTime || null;
  }, [candles]);

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: '100%',
        height: `${height}px`,
        position: 'relative',
      }}
    />
  );
}

