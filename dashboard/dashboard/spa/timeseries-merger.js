/* Copyright 2019 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', () => {
  // TODO compute this based on how multiple timeseries x coordinates line up
  const MAX_POINTS = 500;

  function getX(datum) {
    return datum.revision;
  }

  function mergeData(target, source) {
    if (target.revision === undefined) {
      Object.assign(target, source);
      if (target.diagnostics) {
        const shallowClone = new tr.v.d.DiagnosticMap();
        shallowClone.addDiagnostics(target.diagnostics);
        target.diagnostics = shallowClone;
      }
      return;
    }

    if (source.diagnostics) {
      if (!target.diagnostics) {
        target.diagnostics = new tr.v.d.DiagnosticMap();
      }
      target.diagnostics.addDiagnostics(source.diagnostics);
    }

    target.revision = Math.min(target.revision, source.revision);
    if (source.timestamp < target.timestamp) {
      target.timestamp = source.timestamp;
    }

    const deltaMean = target.avg - source.avg;
    target.avg = (
      (target.avg * target.count) + (source.avg * source.count)) /
      (target.count + source.count);
    const thisVar = target.std * target.std;
    const otherVar = source.std * source.std;
    const thisCount = target.count;
    target.count += source.count;
    target.std = Math.sqrt(thisVar + otherVar + (
      thisCount * source.count * deltaMean * deltaMean /
      target.count));
    if (target.sum === undefined) target.sum = 0;
    if (source.sum) target.sum += source.sum;
  }

  class TimeseriesIterator {
    constructor(lineDescriptor, timeseries, range) {
      this.minRevision_ = range.minRevision;
      this.maxRevision_ = range.maxRevision;
      this.lineDescriptor_ = lineDescriptor;
      this.timeseries_ = timeseries;
      this.index_ = this.findStartIndex_();
      // The index of the last datum that will be yielded:
      this.endIndex_ = Math.min(
          this.findEndIndex_(), this.timeseries_.length - 1);
      this.indexDelta_ = Math.max(
          1, (this.endIndex_ - this.index_) / MAX_POINTS);
    }

    findStartIndex_() {
      if (this.minRevision_) {
        return tr.b.findLowIndexInSortedArray(
            this.timeseries_, getX,
            this.minRevision_);
      }
      return 0;
    }

    findEndIndex_() {
      if (this.maxRevision_) {
        return tr.b.findLowIndexInSortedArray(
            this.timeseries_, getX,
            this.maxRevision_);
      }
      return this.timeseries_.length - 1;
    }

    get current() {
      return this.timeseries_[Math.min(this.roundIndex_, this.endIndex_)];
    }

    get roundIndex_() {
      return Math.round(this.index_);
    }

    get done() {
      return !this.current || (this.roundIndex_ > this.endIndex_);
    }

    next() {
      this.index_ += this.indexDelta_;
    }
  }

  class TimeseriesMerger {
    constructor(lineDescriptor, timeserieses, range) {
      this.iterators_ = timeserieses.map(timeseries => new TimeseriesIterator(
          lineDescriptor, timeseries, range));
    }

    get allDone_() {
      for (const iterator of this.iterators_) {
        if (!iterator.done) return false;
      }
      return true;
    }

    * [Symbol.iterator]() {
      while (!this.allDone_) {
        const merged = {};
        let minX = Infinity;
        for (const iterator of this.iterators_) {
          if (!iterator.current) continue;
          mergeData(merged, iterator.current);
          if (!iterator.done) {
            minX = Math.min(minX, getX(iterator.current));
          }
        }
        yield [minX, merged];

        // Increment all iterators whose X coordinate is minX.
        for (const iterator of this.iterators_) {
          if (!iterator.done && getX(iterator.current) === minX) {
            iterator.next();
          }
        }
      }
    }
  }

  return {TimeseriesMerger};
});
