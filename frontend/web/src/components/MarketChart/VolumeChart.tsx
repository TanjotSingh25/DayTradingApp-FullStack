/**
 * Volume Chart Component (stacked under price chart)
 * Uses histogram series to display volume separately.
 */

import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../api/marketData';
import { DEFAULT_BAR_SPACING, DEFAULT_VOLUME_CHART_HEIGHT } from './chartConfig';

interface VolumeChartProps {
  candles: Candle[];
  height?: number;
}

export default function VolumeChart({ candles, height = DEFAULT_VOLUME_CHART_HEIGHT }: VolumeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#e2e8f0' },
      },
      timeScale: {
        visible: false,
        barSpacing: DEFAULT_BAR_SPACING,
      },
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    chartRef.current = chart;

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
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

  useEffect(() => {
    if (!volumeSeriesRef.current || candles.length === 0) return;

    const volumeData = candles.map((candle) => {
      const time = Math.floor(new Date(candle.ts).getTime() / 1000) as UTCTimestamp;
      const color = candle.close >= candle.open ? '#26a69a' : '#ef5350';
      return {
        time,
        value: candle.volume,
        color,
      };
    });

    volumeSeriesRef.current.setData(volumeData);
  }, [candles]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: `${height}px`,
      }}
    />
  );
}


