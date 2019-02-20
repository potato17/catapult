/* Copyright 2018 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', () => {
  class TagFilter extends cp.ElementBase {
    onTagSelect_(event) {
      this.dispatch('filter', this.statePath);
    }
  }

  TagFilter.State = {
    tags: options => {
      const tags = cp.OptionGroup.buildState(options);
      tags.map = options.map || new Map();
      return tags;
    },
  };

  TagFilter.properties = cp.buildProperties('state', TagFilter.State);
  TagFilter.buildState = options => cp.buildState(
      TagFilter.State, options);

  TagFilter.actions = {
    filter: statePath => async(dispatch, getState) => {
      dispatch({
        type: TagFilter.reducers.filter.name,
        statePath,
      });
    },
  };

  TagFilter.reducers = {
    filter: state => {
      let cases = new Set();
      let selectedOptions = [];
      if (state.tags && state.tags.selectedOptions &&
          state.tags.selectedOptions.length) {
        for (const tag of state.tags.selectedOptions) {
          const tagCases = state.tags.map.get(tag);
          if (!tagCases) continue;
          for (const cas of tagCases) {
            cases.add(cas);
          }
        }
        cases = [...cases].sort();
        selectedOptions = [...cases];
      } else {
        cases = [...state.optionValues].sort();
        selectedOptions = [];
      }
      const options = [];
      if (cases.length) {
        options.push({
          label: `All test cases`,
          isExpanded: true,
          options: cp.OptionGroup.groupValues(cases),
        });
      }
      return {...state, options, selectedOptions};
    },
  };

  cp.ElementBase.register(TagFilter);

  return {TagFilter};
});
