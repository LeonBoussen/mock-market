import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';

const UP = '#34d399';
const DOWN = '#f87171';

function localTime(sec, offsetSec) {
  return new Date(sec * 1000 + (offsetSec || 0) * 1000);
}

export default function ChartCandles({ bars, meta: metaProp = {}, height = 430, markers = [], showVolume = true }) {
  const ref = useRef(null);
  const stateRef = useRef(null);
  const fitKeyRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [ready, setReady] = useState(false);
  const meta = metaProp || {};

  const gmtoffset = meta.gmtoffset ?? 0;
  const isDaily = useMemo(() => {
    if (bars.length < 2) return false;
    return bars[1].t - bars[0].t >= 20 * 60 * 60 * 1000;
  }, [bars]);

  const fmtTime = useCallback((sec) => {
    const d = localTime(sec, gmtoffset);
    return d.toLocaleString(
      'en-US',
      isDaily
        ? { month: 'short', day: 'numeric', year: 'numeric' }
        : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    );
  }, [gmtoffset, isDaily]);
  // The chart is created once, so its axis formatter must read the *current*
  // formatter rather than the one captured on the first render (which had no bars).
  const fmtTimeRef = useRef(fmtTime);
  fmtTimeRef.current = fmtTime;

  // Chart lifecycle: created once
  useEffect(() => {
    if (!ref.current || stateRef.current) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#79859e',
        fontSize: 11,
        fontFamily: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
      },
      grid: {
        vertLines: { color: 'rgba(150,165,195,0.06)' },
        horzLines: { color: 'rgba(150,165,195,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(150,165,195,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1b2132' },
        horzLine: { color: 'rgba(150,165,195,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1b2132' },
      },
      rightPriceScale: { borderColor: 'rgba(150,165,195,0.12)' },
      timeScale: { borderColor: 'rgba(150,165,195,0.12)', rightOffset: 4, barSpacing: isDaily ? 7 : 5 },
      localization: {
        locale: 'en-US',
        timeFormatter: (time) => (time == null ? '' : fmtTimeRef.current(typeof time === 'number' ? time : time.timestamp)),
      },
    });

    const candle = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    let vol = null;
    if (showVolume) {
      vol = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
    stateRef.current = { chart, candle, vol };
    fitKeyRef.current = null;
    setReady(true);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !param.seriesData.has(candle)) {
        setHover(null);
        return;
      }
      const d = param.seriesData.get(candle);
      if (d) setHover({ time: param.time, o: d.open, h: d.high, l: d.low, c: d.close });
    });

    const ro = new ResizeObserver(() => {
      const w = ref.current?.clientWidth;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
      stateRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Data updates flow into the live chart
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.candle.setData(bars.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c })));
    if (st.vol) {
      st.vol.setData(
        bars.map((b) => ({
          time: Math.floor(b.t / 1000),
          value: b.v,
          color: b.c >= b.o ? 'rgba(52,211,153,0.32)' : 'rgba(248,113,113,0.32)',
        }))
      );
    }
    st.candle.setMarkers(
      (markers || []).map((m) => ({
        time: Math.floor(m.time / 1000),
        position: m.position || 'belowBar',
        color: m.color,
        shape: m.shape || 'circle',
        text: m.text || '',
        size: 1,
      }))
    );
    // Fit only when the dataset changes (new symbol/range/simulation), never on the
    // regular poll that appends the latest bar — otherwise the user's zoom is reset.
    const fitKey = bars.length ? bars[0].t : null;
    if (fitKey != null && fitKeyRef.current !== fitKey) {
      st.chart.timeScale().fitContent();
      fitKeyRef.current = fitKey;
    }
  }, [bars, markers]);

  const last = bars.length ? bars[bars.length - 1] : null;
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  const readout = hover || (last ? { time: last.t / 1000, o: last.o, h: last.h, l: last.l, c: last.c } : null);

  const dirColor = readout && prev
    ? readout.c >= prev.c ? 'var(--up)' : 'var(--down)'
    : 'var(--text-1)';

  return (
    <div className="chart-wrap" style={{ height }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      <div className="chart-legend">
        <div className="price-live num" style={{ color: dirColor }}>{readout ? fmt(readout.c) : '—'}</div>
        <div className="meta num">
          {readout
            ? `O ${fmt(readout.o)}   H ${fmt(readout.h)}   L ${fmt(readout.l)}   ·   ${fmtTime(readout.time)}`
            : meta.name || ''}
        </div>
      </div>
      {!ready && (
        <div className="chart-loading"><div className="spin" /></div>
      )}
    </div>
  );

  function fmt(v) {
    const a = Math.abs(v);
    const d = a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
}
