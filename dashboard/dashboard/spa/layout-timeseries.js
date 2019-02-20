/* Copyright 2018 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', () => {
  // TODO Take these dimensions from caller.
  const HEIGHT_PX = 200;
  const ESTIMATED_WIDTH_PX = 1000;
  const ICON_WIDTH_PX = 24;
  const TEXT_HEIGHT_PX = 15;

  function layoutTimeseries(state) {
    let rawXs;
    if (state.fixedXAxis) {
      rawXs = fixLinesXInPlace(state.lines);
    }

    // Extend xRange in both directions for chartLayout, not minimapLayout in
    // order to make room for icons.
    const xExtension = state.yAxis.generateTicks ? (
      ICON_WIDTH_PX / 2 / ESTIMATED_WIDTH_PX) : 0;

    // Extend yRange in both directions to prevent clipping yAxis.ticks.
    const yExtension = state.yAxis.generateTicks ? (
      TEXT_HEIGHT_PX / 2 / HEIGHT_PX) : 0;

    const {xRange, yRangeForUnitName} = normalizeLinesInPlace(
        state.lines, {
          mode: state.mode,
          zeroYAxis: state.zeroYAxis,
          xExtension,
          yExtension,
        });

    state = {
      ...state,
      xAxis: {
        ...state.xAxis,
        range: getRevisionRange(state.lines, xExtension),
      },
      yAxis: {
        ...state.yAxis,
        rangeForUnitName: yRangeForUnitName,
      }
    };

    if (state.xAxis.generateTicks) {
      state = generateXTicksReducer(state, xRange, rawXs);
    }

    if (state.yAxis.generateTicks) {
      state = generateYTicksReducer(state, yRangeForUnitName, yExtension);
    }

    return state;
  }

  function fixLinesXInPlace(lines) {
    let rawXs = new Set();
    for (const line of lines) {
      for (const datum of line.data) {
        rawXs.add(datum.x);
      }
    }
    rawXs = Array.from(rawXs);
    rawXs.sort((x, y) => x - y);
    for (const line of lines) {
      for (const datum of line.data) {
        datum.xFixed = rawXs.indexOf(datum.x);
      }
    }
    return rawXs;
  }

  function getX(datum) {
    return (datum.xFixed !== undefined) ? datum.xFixed : datum.x;
  }

  function generateXTicksReducer(state, xRange, rawXs) {
    // TODO calendrical
    // TODO left-align tick for first point, right-align tick for last point,
    // enough round numbers in between that they won't overlap even if the
    // window shrinks by 50%.

    const ticks = computeTicks(state.xAxis.range).map(text => {
      let x = text;
      if (rawXs) {
        x = tr.b.findLowIndexInSortedArray(rawXs, x => x, text);
      }
      return {
        text,
        xPct: tr.b.math.truncate(xRange.normalize(x) * 100, 1) + '%',
      };
    });
    return {...state, xAxis: {...state.xAxis, ticks}};
  }

  function getRevisionRange(lines, extension) {
    const range = new tr.b.math.Range();
    for (const line of lines) {
      if (line.data.length === 0) continue;
      range.addValue(line.data[0].x);
      range.addValue(line.data[line.data.length - 1].x);
    }
    range.min -= range.range * extension;
    range.max += range.range * extension;
    return range;
  }

  function normalizeLinesInPlace(lines, opt_options) {
    const options = opt_options || {};
    const mode = options.mode || 'normalizeUnit';
    const zeroYAxis = options.zeroYAxis || false;
    const yExtension = options.yExtension || 0;
    const xExtension = options.xExtension || 0;

    const xRange = new tr.b.math.Range();
    const yRangeForUnitName = new Map();
    let maxLineLength = 0;
    const maxLineRangeForUnitName = new Map();
    for (const line of lines) {
      maxLineLength = Math.max(maxLineLength, line.data.length);
      line.yRange = new tr.b.math.Range();
      if (zeroYAxis) line.yRange.addValue(0);

      for (const datum of line.data) {
        xRange.addValue(getX(datum));
        line.yRange.addValue(datum.y);
      }

      // normalize count_biggerIsBetter together with count_smallerIsBetter for
      // pinpoint.success, for example.
      const unitName = line.unit.baseUnit.unitName;

      if (!yRangeForUnitName.has(unitName)) {
        yRangeForUnitName.set(unitName, new tr.b.math.Range());
      }

      line.yRange.min -= line.yRange.range * yExtension;
      line.yRange.max += line.yRange.range * yExtension;

      yRangeForUnitName.get(unitName).addRange(line.yRange);

      if (line.yRange.range > (maxLineRangeForUnitName.get(
          unitName) || 0)) {
        maxLineRangeForUnitName.set(unitName, line.yRange.range);
      }
    }

    if (mode === 'center') {
      for (const line of lines) {
        const halfMaxLineRange = maxLineRangeForUnitName.get(
            line.unit.baseUnit.unitName) / 2;
        // Extend line.yRange to be as large as the largest range.
        line.yRange = tr.b.math.Range.fromExplicitRange(
            line.yRange.center - halfMaxLineRange,
            line.yRange.center + halfMaxLineRange);
      }
    }

    xRange.min -= xRange.range * xExtension;
    xRange.max += xRange.range * xExtension;

    // Round to tenth of a percent.
    const round = x => tr.b.math.truncate(x * 100, 1);

    const isNormalizeLine = (
      mode === 'normalizeLine' || mode === 'center');
    for (const line of lines) {
      line.path = '';
      line.shadePoints = '';
      const yRange = isNormalizeLine ? line.yRange :
        yRangeForUnitName.get(line.unit.baseUnit.unitName);
      for (const datum of line.data) {
        datum.xPct = round(xRange.normalize(getX(datum)));
        // Y coordinates increase downwards.
        datum.yPct = round(1 - yRange.normalize(datum.y));
        if (isNaN(datum.xPct)) datum.xPct = 50;
        if (isNaN(datum.yPct)) datum.yPct = 50;
        const command = line.path ? ' L' : 'M';
        line.path += command + datum.xPct + ',' + datum.yPct;
        if (datum.shadeRange) {
          const shadeMax = round(1 - yRange.normalize(datum.shadeRange.max));
          line.shadePoints += ' ' + datum.xPct + ',' + shadeMax;
        }
      }
      for (let i = line.data.length - 1; i >= 0; --i) {
        const datum = line.data[i];
        if (datum.shadeRange) {
          const shadeMin = round(1 - yRange.normalize(datum.shadeRange.min));
          line.shadePoints += ' ' + datum.xPct + ',' + shadeMin;
        }
      }
    }
    return {xRange, yRangeForUnitName};
  }

  function generateYTicksReducer(state, yRangeForUnitName, yExtension) {
    let yAxis = state.yAxis;
    let ticks = [];
    if (state.mode === 'normalizeLine' || state.mode === 'center') {
      for (const line of state.lines) {
        line.ticks = generateYTicks(line.yRange, line.unit, yExtension);
      }
      if (state.lines.length === 1) {
        ticks = state.lines[0].ticks;
      }
    } else {
      const ticksForUnitName = new Map();
      for (const [unitName, range] of yRangeForUnitName) {
        const unit = tr.b.Unit.byName[unitName];
        const ticks = generateYTicks(range, unit, yExtension);
        ticksForUnitName.set(unitName, ticks);
      }
      yAxis = {...yAxis, ticksForUnitName};
      if (ticksForUnitName.size === 1) {
        ticks = [...ticksForUnitName.values()][0];
      }
    }
    yAxis = {...yAxis, ticks};
    return {...state, yAxis};
  }

  function generateYTicks(displayRange, unit, yExtension) {
    // Use the extended range to compute yPct, but the unextended range
    // to compute the ticks. TODO store both in normalizeLinesInPlace
    const dataRange = tr.b.math.Range.fromExplicitRange(
        displayRange.min + (displayRange.range * yExtension),
        displayRange.max - (displayRange.range * yExtension));
    return computeTicks(dataRange).map(y => {
      return {
        text: unit.format(y),
        yPct: tr.b.math.truncate(
            100 * (1 - displayRange.normalize(y)), 1) + '%',
      };
    });
  }

  function computeTicks(range, numTicks = 5) {
    const ticks = [];

    // TODO(benjhayden) Use sexagesimal instead of decimal for msBestFitFormat.
    let tickPower = tr.b.math.lesserPower(range.range);
    if ((range.range / tickPower) < numTicks) tickPower /= 10;

    // Bump min up (and max down) to the next multiple of tickPower.
    const rounded = tr.b.math.Range.fromExplicitRange(
        range.min + tickPower - (range.min % tickPower),
        range.max - (range.max % tickPower));

    const delta = rounded.range / (numTicks - 1);
    if (range.min < 0 && range.max > 0) {
      for (let tick = 0; tick <= range.max; tick += delta) {
        ticks.push(tick);
      }
      for (let tick = -delta; tick >= range.min; tick -= delta) {
        ticks.unshift(tick);
      }
    } else {
      for (let tick = rounded.min; tick <= range.max; tick += delta) {
        ticks.push(tick);
      }
    }

    return ticks;
  }

  return {
    computeTicks,
    layoutTimeseries,
  };
});
