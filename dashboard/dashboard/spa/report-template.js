/* Copyright 2018 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', () => {
  class ReportTemplate extends cp.ElementBase {
    isValid_(table) {
      return ReportTemplate.isValid(table);
    }

    isLastRow_(rows) {
      return rows.length === 1;
    }

    async onTemplateNameKeyUp_(event) {
      await this.dispatch('templateName', this.statePath,
          event.model.tableIndex, event.target.value);
    }

    async onTemplateOwnersKeyUp_(event) {
      await this.dispatch('templateOwners', this.statePath,
          event.model.tableIndex, event.target.value);
    }

    async onTemplateUrlKeyUp_(event) {
      await this.dispatch('templateUrl', this.statePath, event.model.tableIndex,
          event.target.value);
    }

    async onTemplateRowLabelKeyUp_(event) {
      await this.dispatch('templateRowLabel', this.statePath,
          event.model.tableIndex, event.model.rowIndex, event.target.value);
    }

    async onTestSuiteSelect_(event) {
      await this.dispatch('templateTestSuite', this.statePath,
          event.model.tableIndex, event.model.rowIndex);
    }

    async onTemplateRemoveRow_(event) {
      await this.dispatch('templateRemoveRow', this.statePath,
          event.model.tableIndex, event.model.rowIndex);
    }

    async onTemplateAddRow_(event) {
      await this.dispatch('templateAddRow', this.statePath,
          event.model.tableIndex, event.model.rowIndex);
    }

    async onTemplateSave_(event) {
      await this.dispatch('templateSave', this.statePath,
          event.model.tableIndex);
    }
  }

  ReportTemplate.canEdit = (table, userEmail) =>
    window.IS_DEBUG ||
    (table && table.owners && userEmail && table.owners.includes(userEmail));

  ReportTemplate.State = {
  };

  ReportTemplate.buildState = options => cp.buildState(
      ReportTemplate.State, options);

  ReportTemplate.properties = {
    ...cp.buildProperties('state', ReportTemplate.State),
  };
  ReportTemplate.observers = [
  ];

  ReportTemplate.actions = {
    templateName: (statePath, tableIndex, name) =>
      async(dispatch, getState) => {
        const path = `${statePath}.tables.${tableIndex}`;
        dispatch(Redux.UPDATE(path, {name}));
      },

    templateOwners: (statePath, tableIndex, owners) =>
      async(dispatch, getState) => {
        const path = `${statePath}.tables.${tableIndex}`;
        dispatch(Redux.UPDATE(path, {owners}));
      },

    templateUrl: (statePath, tableIndex, url) =>
      async(dispatch, getState) => {
        dispatch(Redux.UPDATE(`${statePath}.tables.${tableIndex}`, {url}));
      },

    templateRowLabel: (statePath, tableIndex, rowIndex, label) =>
      async(dispatch, getState) => {
        const path = `${statePath}.tables.${tableIndex}.rows.${rowIndex}`;
        dispatch(Redux.UPDATE(path, {label}));
      },

    templateTestSuite: (statePath, tableIndex, rowIndex) =>
      async(dispatch, getState) => {
        const path = `${statePath}.tables.${tableIndex}.rows.${rowIndex}`;
        cp.ChartSection.actions.describeTestSuites(path)(dispatch, getState);
      },

    templateRemoveRow: (statePath, tableIndex, rowIndex) =>
      async(dispatch, getState) => {
        dispatch({
          type: ReportTemplate.reducers.templateRemoveRow.name,
          statePath,
          tableIndex,
          rowIndex,
        });
      },

    templateAddRow: (statePath, tableIndex, rowIndex) =>
      async(dispatch, getState) => {
        dispatch({
          type: ReportTemplate.reducers.templateAddRow.name,
          statePath: `${statePath}.tables.${tableIndex}`,
          rowIndex,
          suites: await new cp.TestSuitesRequest({}).response,
        });
        const path = `${statePath}.tables.${tableIndex}.rows.${rowIndex + 1}`;
        cp.ChartSection.actions.describeTestSuites(path)(dispatch, getState);
      },

    templateSave: (statePath, tableIndex) => async(dispatch, getState) => {
      let rootState = getState();
      let state = Polymer.Path.get(rootState, statePath);
      const table = state.tables[tableIndex];
      const request = new cp.ReportTemplateRequest({
        id: table.id,
        name: table.name,
        owners: table.owners.split(',').map(o => o.replace(/ /g, '')),
        url: table.url,
        statistics: table.statistic.selectedOptions,
        rows: table.rows.map(row => {
          return {
            label: row.label,
            suites: row.suite.selectedOptions,
            measurement: row.measurement.selectedOptions[0],
            bots: row.bot.selectedOptions,
            cases: row.case.selectedOptions,
          };
        }),
      });
      dispatch(Redux.UPDATE(statePath, {isLoading: true}));
      const reportTemplateInfos = await request.response;
      dispatch(Redux.UPDATE('', {reportTemplateInfos}));
      const teamFilter = cp.TeamFilter.get(rootState.teamName);
      const reportNames = await teamFilter.reportNames(
          reportTemplateInfos.map(t => t.name));
      dispatch({
        type: ReportTemplate.reducers.receiveSourceOptions.name,
        statePath,
        reportNames,
      });
      rootState = getState();
      state = Polymer.Path.get(rootState, statePath);
      dispatch(Redux.UPDATE(statePath, {
        isLoading: false,
        source: {
          ...state.source,
          selectedOptions: [table.name],
        },
      }));
      ReportTemplate.actions.loadReports(statePath)(dispatch, getState);
    },
  };

  ReportTemplate.reducers = {
    templateRemoveRow: (state, action, rootState) => {
      const tables = [...state.tables];
      const table = tables[action.tableIndex];
      const rows = [...table.rows];
      rows.splice(action.rowIndex, 1);
      tables[action.tableIndex] = {
        ...table,
        rows,
      };
      return {...state, tables};
    },

    templateAddRow: (table, action, rootState) => {
      const contextRow = table.rows[action.rowIndex];
      const newRow = ReportTemplate.newTemplateRow({
        suite: {
          options: cp.OptionGroup.groupValues(action.suites),
          label: `Test suites (${action.suites.length})`,
          selectedOptions: [...contextRow.suite.selectedOptions],
        },
        bot: {
          selectedOptions: [...contextRow.bot.selectedOptions],
        },
        case: {
          selectedOptions: [...contextRow.case.selectedOptions],
        },
      });
      const rows = [...table.rows];
      rows.splice(action.rowIndex + 1, 0, newRow);
      return {...table, rows};
    },
  };

  ReportTemplate.newTemplateRow = ({suite, bot, cas}) => {
    return {
      label: '',
      suite: {
        ...suite,
        errorMessage: 'Required',
        query: '',
        required: true,
        selectedOptions: suite.selectedOptions || [],
      },
      measurement: {
        errorMessage: 'Require exactly one',
        label: 'Measurement',
        options: [],
        query: '',
        requireSingle: true,
        required: true,
        selectedOptions: [],
      },
      bot: {
        errorMessage: 'Required',
        label: 'Bots',
        options: [],
        query: '',
        required: true,
        selectedOptions: bot ? bot.selectedOptions : [],
      },
      case: {
        label: 'Test cases',
        options: [],
        query: '',
        selectedOptions: cas ? cas.selectedOptions : [],
      },
    };
  };

  ReportTemplate.isValid = table => {
    if (!table) return false;
    if (!table.name) return false;
    if (!table.owners) return false;
    if (table.statistic.selectedOptions.length === 0) return false;
    for (const row of table.rows) {
      if (!row.label) return false;
      if (row.suite.selectedOptions.length === 0) return false;
      if (row.measurement.selectedOptions.length !== 1) return false;
      if (row.bot.selectedOptions.length === 0) return false;
    }
    return true;
  };

  cp.ElementBase.register(ReportTemplate);

  return {ReportTemplate};
});
