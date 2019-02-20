/* Copyright 2019 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', function() {
  /**
   * @param {!Alert} a
   * @param {!Alert} b
   * @return {boolean}
   */
  function shouldMerge(a, b, groupBugs) {
    if (groupBugs && a.bugId && b.bugId && (a.bugId === b.bugId)) {
      return true;
    }
    if (!rangeIntersects(a.startRevision, a.endRevision,
        b.startRevision, b.endRevision)) {
      return false;
    }
    if (groupBugs && (a.bugId !== b.bugId)) return false;
    if (!a.relatedNames && !b.relatedNames) {
      return a.suite === b.suite;
    }
    return isRelated(a, b);
  }

  /**
   * Two Alerts are related if either
   * A) their measurements are equal, or
   * B) either's relatedNames contains the other's measurement.
   *
   * @param {!Alert} a
   * @param {!Alert} b
   * @return {boolean}
   */
  function isRelated(a, b) {
    if (a.measurement === b.measurement) return true;
    if (a.relatedNames &&
        a.relatedNames.has(b.measurement)) {
      return true;
    }
    if (b.relatedNames &&
        b.relatedNames.has(a.measurement)) {
      return true;
    }
    return false;
  }

  function rangeIntersects(aMin, aMax, bMin, bMax) {
    return aMin <= bMax && bMin <= aMax;
  }

  /**
   * Groups Alerts such that all alerts in each group have overlapping revision
   * ranges and the same test suite.
   *
   * @param {!Array.<!Alert>} alerts
   * @return {!Array.<!Array.<!Alert>>}
   */
  function groupAlerts(alerts, groupBugs) {
    const groups = [];
    for (const alert of alerts) {
      if (d.MEMORY_PROCESS_RELATED_NAMES.has(alert.measurement)) {
        alert.relatedNames = d.MEMORY_PROCESS_RELATED_NAMES.get(
            alert.measurement);
      }
      if (d.MEMORY_COMPONENT_RELATED_NAMES.has(alert.measurement)) {
        alert.relatedNames = new Set(alert.relatedNames);
        for (const name of d.MEMORY_COMPONENT_RELATED_NAMES.get(
            alert.measurement)) {
          alert.relatedNames.add(name);
        }
      }

      let merged = false;
      for (const group of groups) {
        let doMerge = true;
        for (const other of group) {
          const should = shouldMerge(alert, other, groupBugs);
          if (!should) {
            doMerge = false;
            break;
          }
        }
        if (doMerge) {
          group.push(alert);
          merged = true;
          break;
        }
      }

      if (!merged) {
        groups.push([alert]);
      }
    }
    return groups;
  }

  return {
    groupAlerts,
  };
});
