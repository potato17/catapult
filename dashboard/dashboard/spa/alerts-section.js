/* Copyright 2018 The Chromium Authors. All rights reserved.
   Use of this source code is governed by a BSD-style license that can be
   found in the LICENSE file.
*/
'use strict';
tr.exportTo('cp', () => {
  const NOTIFICATION_MS = 5000;

  class AlertsSection extends cp.ElementBase {
    ready() {
      super.ready();
      this.scrollIntoView(true);
    }

    async connectedCallback() {
      super.connectedCallback();
      this.dispatch('connected', this.statePath);
    }

    isLoading_(isLoading, isPreviewLoading) {
      return isLoading || isPreviewLoading;
    }

    allTriaged_(alertGroups, showingTriaged) {
      if (showingTriaged) return alertGroups.length === 0;
      return alertGroups.filter(group =>
        group.alerts.length > group.triaged.count).length === 0;
    }

    canTriage_(alertGroups) {
      const selectedAlerts = cp.AlertsTable.getSelectedAlerts(alertGroups);
      if (selectedAlerts.length === 0) return false;
      for (const alert of selectedAlerts) {
        if (alert.bugId) return false;
      }
      return true;
    }

    canUnassignAlerts_(alertGroups) {
      const selectedAlerts = cp.AlertsTable.getSelectedAlerts(alertGroups);
      for (const alert of selectedAlerts) {
        if (alert.bugId) return true;
      }
      return false;
    }

    async onSources_(event) {
      await this.dispatch('loadAlerts', this.statePath, event.detail.sources);
    }

    async onUnassign_(event) {
      await this.dispatch('changeBugId', this.statePath, 0);
    }

    onTriageNew_(event) {
      // If the user is already signed in, then require-sign-in will do nothing,
      // and openNewBugDialog will do so. If the user is not already signed in,
      // then openNewBugDialog won't, and require-sign-in will start the signin
      // flow. Users can retry triaging after completing the signin flow.
      this.dispatchEvent(new CustomEvent('require-sign-in', {
        bubbles: true,
        composed: true,
      }));
      this.dispatch('openNewBugDialog', this.statePath);
    }

    onTriageExisting_(event) {
      // If the user is already signed in, then require-sign-in will do nothing,
      // and openExistingBugDialog will do so. If the user is not already signed
      // in, then openExistingBugDialog won't, and require-sign-in will start
      // the signin flow.
      this.dispatchEvent(new CustomEvent('require-sign-in', {
        bubbles: true,
        composed: true,
      }));
      this.dispatch('openExistingBugDialog', this.statePath);
    }

    onTriageNewSubmit_(event) {
      this.dispatch('submitNewBug', this.statePath);
    }

    onTriageExistingSubmit_(event) {
      this.dispatch('submitExistingBug', this.statePath);
    }

    onIgnore_(event) {
      this.dispatch('ignore', this.statePath);
    }

    onSelected_(event) {
      this.dispatch('maybeLayoutPreview', this.statePath);
    }

    onAlertClick_(event) {
      this.dispatch('selectAlert', this.statePath,
          event.detail.alertGroupIndex, event.detail.alertIndex);
    }

    onPreviewLineCountChange_() {
      this.dispatch('updateAlertColors', this.statePath);
    }

    onSort_(event) {
      this.dispatch('prefetchPreviewAlertGroup_',
          this.statePath, this.alertGroups[0]);
    }

    observeRecentPerformanceBugs_() {
      this.dispatch('observeRecentPerformanceBugs', this.statePath);
    }
  }

  AlertsSection.State = {
    ...cp.AlertsTable.State,
    ...cp.AlertsControls.State,
    existingBug: options => cp.TriageExisting.buildState({}),
    isLoading: options => false,
    newBug: options => cp.TriageNew.buildState({}),
    preview: options => cp.ChartPair.buildState(options),
    sectionId: options => options.sectionId || tr.b.GUID.allocateSimple(),
    selectedAlertPath: options => undefined,
  };

  AlertsSection.observers = [
    'observeRecentPerformanceBugs_(recentPerformanceBugs)',
  ];

  AlertsSection.buildState = options =>
    cp.buildState(AlertsSection.State, options);

  AlertsSection.properties = {
    ...cp.buildProperties('state', AlertsSection.State),
    ...cp.buildProperties('linkedState', {
      // AlertsSection only needs the linkedStatePath property to forward to
      // ChartPair.
    }),
    recentPerformanceBugs: {statePath: 'recentPerformanceBugs'},
  };

  AlertsSection.actions = {
    selectAlert: (statePath, alertGroupIndex, alertIndex) =>
      async(dispatch, getState) => {
        dispatch({
          type: AlertsSection.reducers.selectAlert.name,
          statePath,
          alertGroupIndex,
          alertIndex,
        });
      },

    cancelTriagedExisting: statePath => async(dispatch, getState) => {
      dispatch(Redux.UPDATE(statePath, {
        hasTriagedExisting: false,
        triagedBugId: 0,
      }));
    },

    storeRecentlyModifiedBugs: statePath => async(dispatch, getState) => {
      const state = Polymer.Path.get(getState(), statePath);
      localStorage.setItem('recentlyModifiedBugs', JSON.stringify(
          state.recentlyModifiedBugs));
    },

    updateAlertColors: statePath => async(dispatch, getState) => {
      dispatch({
        type: AlertsSection.reducers.updateAlertColors.name,
        statePath,
      });
    },

    connected: statePath => async(dispatch, getState) => {
      const recentlyModifiedBugs = localStorage.getItem('recentlyModifiedBugs');
      if (recentlyModifiedBugs) {
        dispatch({
          type: AlertsSection.reducers.receiveRecentlyModifiedBugs.name,
          statePath,
          recentlyModifiedBugs,
        });
      }
    },

    submitExistingBug: statePath => async(dispatch, getState) => {
      let state = Polymer.Path.get(getState(), statePath);
      const triagedBugId = state.existingBug.bugId;
      dispatch(Redux.UPDATE(`${statePath}.existingBug`, {isOpen: false}));
      await dispatch(AlertsSection.actions.changeBugId(
          statePath, triagedBugId));
      dispatch({
        type: AlertsSection.reducers.showTriagedExisting.name,
        statePath,
        triagedBugId,
      });
      await AlertsSection.actions.storeRecentlyModifiedBugs(statePath)(
          dispatch, getState);

      // showTriagedExisting sets hasTriagedNew and triagedBugId, causing
      // alerts-controls to display a notification. Wait a few seconds for the
      // user to notice the notification, then automatically hide it. The user
      // will still be able to access the bug by clicking Recent Bugs in
      // alerts-controls.
      await cp.timeout(NOTIFICATION_MS);
      state = Polymer.Path.get(getState(), statePath);
      if (state.triagedBugId !== triagedBugId) return;
      dispatch(AlertsSection.actions.cancelTriagedExisting(statePath));
    },

    changeBugId: (statePath, bugId) => async(dispatch, getState) => {
      dispatch(Redux.UPDATE(statePath, {isLoading: true}));
      const rootState = getState();
      let state = Polymer.Path.get(rootState, statePath);
      const selectedAlerts = cp.AlertsTable.getSelectedAlerts(
          state.alertGroups);
      const alertKeys = new Set(selectedAlerts.map(a => a.key));
      try {
        const request = new cp.ExistingBugRequest({alertKeys, bugId});
        await request.response;
        dispatch({
          type: AlertsSection.reducers.removeOrUpdateAlerts.name,
          statePath,
          alertKeys,
          bugId,
        });

        state = Polymer.Path.get(getState(), statePath);
        dispatch(AlertsSection.actions.prefetchPreviewAlertGroup_(
            statePath, state.alertGroups[0]));
        if (bugId !== 0) {
          dispatch(Redux.UPDATE(`${statePath}.preview`, {lineDescriptors: []}));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
      dispatch(Redux.UPDATE(statePath, {isLoading: false}));
    },

    ignore: statePath => async(dispatch, getState) => {
      let state = Polymer.Path.get(getState(), statePath);
      const alerts = cp.AlertsTable.getSelectedAlerts(state.alertGroups);
      const ignoredCount = alerts.length;
      await dispatch(AlertsSection.actions.changeBugId(statePath, -2));

      dispatch(Redux.UPDATE(statePath, {
        hasTriagedExisting: false,
        hasTriagedNew: false,
        hasIgnored: true,
        ignoredCount,
      }));

      // Setting hasIgnored and ignoredCount causes alerts-controls to display a
      // notification. Wait a few seconds for the user to notice the
      // notification, then automatically hide it. The user can still access
      // ignored alerts by toggling New Only to New and Triaged in
      // alerts-controls.
      await cp.timeout(NOTIFICATION_MS);
      state = Polymer.Path.get(getState(), statePath);
      if (state.ignoredCount !== ignoredCount) return;
      dispatch(Redux.UPDATE(statePath, {
        hasIgnored: false,
        ignoredCount: 0,
      }));
    },

    openNewBugDialog: statePath => async(dispatch, getState) => {
      let userEmail = getState().userEmail;
      if (window.IS_DEBUG) {
        userEmail = 'you@chromium.org';
      }
      if (!userEmail) return;
      dispatch({
        type: AlertsSection.reducers.openNewBugDialog.name,
        statePath,
        userEmail,
      });
    },

    openExistingBugDialog: statePath => async(dispatch, getState) => {
      let userEmail = getState().userEmail;
      if (window.IS_DEBUG) {
        userEmail = 'you@chromium.org';
      }
      if (!userEmail) return;
      dispatch({
        type: AlertsSection.reducers.openExistingBugDialog.name,
        statePath,
      });
    },

    submitNewBug: statePath => async(dispatch, getState) => {
      dispatch(Redux.UPDATE(statePath, {isLoading: true}));
      const rootState = getState();
      let state = Polymer.Path.get(rootState, statePath);
      const selectedAlerts = cp.AlertsTable.getSelectedAlerts(
          state.alertGroups);
      const alertKeys = new Set(selectedAlerts.map(a => a.key));
      let bugId;
      try {
        const request = new cp.NewBugRequest({
          alertKeys,
          ...state.newBug,
          labels: state.newBug.labels.filter(
              x => x.isEnabled).map(x => x.name),
          components: state.newBug.components.filter(
              x => x.isEnabled).map(x => x.name),
        });
        const summary = state.newBug.summary;
        bugId = await request.response;
        dispatch({
          type: AlertsSection.reducers.showTriagedNew.name,
          statePath,
          bugId,
          summary,
        });
        await AlertsSection.actions.storeRecentlyModifiedBugs(statePath)(
            dispatch, getState);

        dispatch({
          type: AlertsSection.reducers.removeOrUpdateAlerts.name,
          statePath,
          alertKeys,
          bugId,
        });
        state = Polymer.Path.get(getState(), statePath);
        dispatch(AlertsSection.actions.prefetchPreviewAlertGroup_(
            statePath, state.alertGroups[0]));
        dispatch(Redux.UPDATE(`${statePath}.preview`, {lineDescriptors: []}));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
      dispatch(Redux.UPDATE(statePath, {isLoading: false}));

      if (bugId === undefined) return;

      // showTriagedNew sets hasTriagedNew and triagedBugId, causing
      // alerts-controls to display a notification. Wait a few seconds for the
      // user to notice the notification, then automatically hide it. The user
      // will still be able to access the new bug by clicking Recent Bugs in
      // alerts-controls.
      await cp.timeout(NOTIFICATION_MS);
      state = Polymer.Path.get(getState(), statePath);
      if (state.triagedBugId !== bugId) return;
      dispatch(Redux.UPDATE(statePath, {
        hasTriagedNew: false,
        triagedBugId: 0,
      }));
    },

    loadAlerts: (statePath, sources) => async(dispatch, getState) => {
      const started = performance.now();
      dispatch({
        type: AlertsSection.reducers.startLoadingAlerts.name,
        statePath,
        started,
      });
      let state = Polymer.Path.get(getState(), statePath);

      if (sources.length > 0) {
        dispatch(cp.MenuInput.actions.blurAll());
      }

      async function wrapRequest(body) {
        const request = new cp.AlertsRequest({body});
        const response = await request.response;
        return {body, response};
      }

      const batches = new cp.BatchIterator(sources.map(wrapRequest));

      for await (const {results, errors} of batches) {
        state = Polymer.Path.get(getState(), statePath);
        if (!state) return;
        if (state.started !== started) {
          // loadAlerts() was called again before this one finished. Abandon.
          return;
        }

        const alerts = [];
        const nextRequests = [];
        for (const {body, response} of results) {
          alerts.push.apply(alerts, response.anomalies);

          const cursor = response.next_cursor;
          if (cursor) nextRequests.push({...body, cursor});
        }

        dispatch({
          type: AlertsSection.reducers.receiveAlerts.name,
          statePath,
          alerts,
          errors,
        });

        state = Polymer.Path.get(getState(), statePath);
        if (!state) return;
        if (state.alertGroups.length < 100 &&
            ((performance.now() - started) < 60e3)) {
          // Limit the number of alertGroups displayed to prevent OOM.
          for (const next of nextRequests) {
            batches.add(wrapRequest(next));
          }
        }
        // TODO Otherwise, store nextRequests and chase them when the user
        // clicks a More button.

        await cp.animationFrame();
      }

      dispatch({
        type: AlertsSection.reducers.finalizeAlerts.name,
        statePath,
      });
      state = Polymer.Path.get(getState(), statePath);
      if (!state.alertGroups === cp.AlertsTable.PLACEHOLDER_ALERT_GROUPS) {
        dispatch(AlertsSection.actions.prefetchPreviewAlertGroup_(
            statePath, state.alertGroups[0]));
      }
    },

    prefetchPreviewAlertGroup_: (statePath, alertGroup) =>
      async(dispatch, getState) => {
        if (!alertGroup) return;
        const suites = new Set();
        const lineDescriptors = [];
        for (const alert of alertGroup.alerts) {
          suites.add(alert.suite);
          lineDescriptors.push(AlertsSection.computeLineDescriptor(alert));
        }
        dispatch(cp.ChartTimeseries.actions.prefetch(
            `${statePath}.preview`, lineDescriptors));
        await Promise.all([...suites].map(suite =>
          new cp.DescribeRequest({suite}).response));
      },

    layoutPreview: statePath => async(dispatch, getState) => {
      const state = Polymer.Path.get(getState(), statePath);
      const alerts = cp.AlertsTable.getSelectedAlerts(state.alertGroups);
      const lineDescriptors = alerts.map(AlertsSection.computeLineDescriptor);
      if (lineDescriptors.length === 1) {
        lineDescriptors.push({
          ...lineDescriptors[0],
          buildType: 'ref',
        });
      }
      dispatch(Redux.UPDATE(`${statePath}.preview`, {lineDescriptors}));

      const suites = new Set();
      for (const descriptor of lineDescriptors) {
        suites.add(descriptor.suites[0]);
      }
      await Promise.all([...suites].map(suite =>
        new cp.DescribeRequest({suite}).response));
    },

    maybeLayoutPreview: statePath => async(dispatch, getState) => {
      const state = Polymer.Path.get(getState(), statePath);
      if (!state.selectedAlertsCount) {
        dispatch(Redux.UPDATE(`${statePath}.preview`, {lineDescriptors: []}));
        return;
      }

      dispatch(AlertsSection.actions.layoutPreview(statePath));
    },

    observeRecentPerformanceBugs: statePath => async(dispatch, getState) => {
      dispatch({
        type: AlertsSection.reducers.receiveRecentPerformanceBugs.name,
        statePath,
      });
    },
  };

  AlertsSection.computeLineDescriptor = alert => {
    return {
      baseUnit: alert.baseUnit,
      suites: [alert.suite],
      measurement: alert.measurement,
      bots: [alert.master + ':' + alert.bot],
      cases: [alert.case],
      statistic: 'avg', // TODO
      buildType: 'test',
    };
  };

  AlertsSection.reducers = {
    receiveSheriffs: (state, {sheriffs}, rootState) => {
      const sheriff = cp.MenuInput.buildState({
        label: `Sheriff (${sheriffs.length})`,
        options: sheriffs,
        selectedOptions: state.sheriff ? state.sheriff.selectedOptions : [],
      });
      return {...state, sheriff};
    },

    selectAlert: (state, action, rootState) => {
      if (state.alertGroups === cp.AlertsTable.PLACEHOLDER_ALERT_GROUPS) {
        return state;
      }
      const alertPath =
        `alertGroups.${action.alertGroupIndex}.alerts.${action.alertIndex}`;
      const alert = Polymer.Path.get(state, alertPath);
      if (!alert.isSelected) {
        state = cp.setImmutable(
            state, `${alertPath}.isSelected`, true);
      }
      if (state.selectedAlertPath === alertPath) {
        return {
          ...state,
          selectedAlertPath: undefined,
          preview: {
            ...state.preview,
            lineDescriptors: cp.AlertsTable.getSelectedAlerts(
                state.alertGroups).map(AlertsSection.computeLineDescriptor),
          },
        };
      }
      return {
        ...state,
        selectedAlertPath: alertPath,
        preview: {
          ...state.preview,
          lineDescriptors: [AlertsSection.computeLineDescriptor(alert)],
        },
      };
    },

    showTriagedNew: (state, action, rootState) => {
      return {
        ...state,
        hasTriagedExisting: false,
        hasTriagedNew: true,
        hasIgnored: false,
        triagedBugId: action.bugId,
        recentlyModifiedBugs: [
          {
            id: action.bugId,
            summary: action.summary,
          },
          ...state.recentlyModifiedBugs,
        ],
      };
    },

    showTriagedExisting: (state, action, rootState) => {
      const recentlyModifiedBugs = state.recentlyModifiedBugs.filter(bug =>
        bug.id !== action.triagedBugId);
      let triagedBugSummary = '(TODO fetch bug summary)';
      for (const bug of rootState.recentPerformanceBugs) {
        if (bug.id === action.triagedBugId) {
          triagedBugSummary = bug.summary;
          break;
        }
      }
      recentlyModifiedBugs.unshift({
        id: action.triagedBugId,
        summary: triagedBugSummary,
      });
      return {
        ...state,
        hasTriagedExisting: true,
        hasTriagedNew: false,
        hasIgnored: false,
        triagedBugId: action.triagedBugId,
        recentlyModifiedBugs,
      };
    },

    updateAlertColors: (state, action, rootState) => {
      const colorByDescriptor = new Map();
      for (const line of state.preview.chartLayout.lines) {
        colorByDescriptor.set(cp.ChartTimeseries.stringifyDescriptor(
            line.descriptor), line.color);
      }
      return {
        ...state,
        alertGroups: state.alertGroups.map(alertGroup => {
          return {
            ...alertGroup,
            alerts: alertGroup.alerts.map(alert => {
              const descriptor = cp.ChartTimeseries.stringifyDescriptor(
                  AlertsSection.computeLineDescriptor(alert));
              return {
                ...alert,
                color: colorByDescriptor.get(descriptor),
              };
            }),
          };
        }),
      };
    },

    updateSelectedAlertsCount: state => {
      const selectedAlertsCount = cp.AlertsTable.getSelectedAlerts(
          state.alertGroups).length;
      return {...state, selectedAlertsCount};
    },

    removeAlerts: (state, {alertKeys}, rootState) => {
      const alertGroups = [];
      for (const group of state.alertGroups) {
        const alerts = group.alerts.filter(a => !alertKeys.has(a.key));
        if (alerts.filter(a => !a.bugId).length) {
          alertGroups.push({...group, alerts});
        }
      }
      state = {...state, alertGroups};
      return AlertsSection.reducers.updateSelectedAlertsCount(state);
    },

    updateBugId: (state, {alertKeys, bugId}, rootState) => {
      if (bugId === 0) bugId = '';
      const alertGroups = state.alertGroups.map(alertGroup => {
        const alerts = alertGroup.alerts.map(a =>
          (alertKeys.has(a.key) ? {...a, bugId} : a));
        return {...alertGroup, alerts};
      });
      state = {...state, alertGroups};
      return AlertsSection.reducers.updateSelectedAlertsCount(state);
    },

    removeOrUpdateAlerts: (state, action, rootState) => {
      if (state.showingTriaged || action.bugId === 0) {
        return AlertsSection.reducers.updateBugId(state, action, rootState);
      }
      return AlertsSection.reducers.removeAlerts(state, action, rootState);
    },

    openNewBugDialog: (state, action, rootState) => {
      const alerts = cp.AlertsTable.getSelectedAlerts(state.alertGroups);
      if (alerts.length === 0) return state;
      const newBug = cp.TriageNew.buildState({
        isOpen: true, alerts, cc: action.userEmail,
      });
      return {...state, newBug};
    },

    openExistingBugDialog: (state, action, rootState) => {
      const alerts = cp.AlertsTable.getSelectedAlerts(state.alertGroups);
      if (alerts.length === 0) return state;
      return {
        ...state,
        existingBug: {
          ...state.existingBug,
          ...cp.TriageExisting.buildState({alerts, isOpen: true}),
        },
      };
    },

    receiveAlerts: (state, {alerts, errors}, rootState) => {
      // |alerts| are all new.
      // Group them together with previously-received alerts from
      // state.alertGroups[].alerts.

      // TODO display errors

      // The user may have already selected and/or triaged some alerts, so keep
      // that information, just re-group the alerts.
      alerts = alerts.map(AlertsSection.transformAlert);
      if (state.alertGroups !== cp.AlertsTable.PLACEHOLDER_ALERT_GROUPS) {
        for (const alertGroup of state.alertGroups) {
          alerts.push(...alertGroup.alerts);
        }
      }

      if (!alerts.length) {
        return state;
        // Wait till finalizeAlerts to display the happy cat.
      }

      const expandedGroupAlertKeys = new Set();
      const expandedTriagedAlertKeys = new Set();
      for (const group of state.alertGroups) {
        if (group.isExpanded) {
          expandedGroupAlertKeys.add(group.alerts[0].key);
        }
        if (group.triaged.isExpanded) {
          expandedTriagedAlertKeys.add(group.alerts[0].key);
        }
      }

      let alertGroups = cp.groupAlerts(alerts, state.showingTriaged);
      alertGroups = alertGroups.map((alerts, groupIndex) => {
        let isExpanded = false;
        let isTriagedExpanded = false;
        for (const a of alerts) {
          if (expandedGroupAlertKeys.has(a.key)) isExpanded = true;
          if (expandedTriagedAlertKeys.has(a.key)) isTriagedExpanded = true;
        }

        return {
          alerts,
          isExpanded,
          triaged: {
            isExpanded: isTriagedExpanded,
            count: alerts.filter(a => a.bugId).length,
          }
        };
      });

      if (!state.showingTriaged && state.sheriff.selectedOptions.length) {
        // Remove completely-triaged groups to save memory.
        // TODO fix showingTriaged=true by reloading these alerts?
        alertGroups = alertGroups.filter(group =>
          group.alerts.length > group.triaged.count);
        if (!alertGroups.length) {
          return state;
          // Wait till finalizeAlerts to display the happy cat.
        }
      }

      alertGroups = cp.AlertsTable.sortGroups(
          alertGroups, state.sortColumn, state.sortDescending,
          state.showingTriaged);

      // Don't automatically select the first group. Users often want to sort
      // the table by some column before previewing any alerts.

      return AlertsSection.reducers.updateColumns({...state, alertGroups});
    },

    finalizeAlerts: (state, action, rootState) => {
      state = {...state, isLoading: false};
      if (state.alertGroups === cp.AlertsTable.PLACEHOLDER_ALERT_GROUPS &&
          (state.sheriff.selectedOptions.length ||
           state.bug.selectedOptions.length ||
           state.report.selectedOptions.length)) {
        state = {...state, alertGroups: []};
      }
      return state;
    },

    updateColumns: (state, action, rootState) => {
      // Hide the Triaged, Bug, Master, and Test Case columns if they're boring.
      let showBugColumn = false;
      let showTriagedColumn = false;
      const masters = new Set();
      const cases = new Set();
      for (const group of state.alertGroups) {
        if (group.triaged.count < group.alerts.length) {
          showTriagedColumn = true;
        }
        for (const alert of group.alerts) {
          if (alert.bugId) {
            showBugColumn = true;
          }
          masters.add(alert.master);
          cases.add(alert.case);
        }
      }
      if (state.showingTriaged) showTriagedColumn = false;

      return {
        ...state,
        showBugColumn,
        showMasterColumn: masters.size > 1,
        showTestCaseColumn: cases.size > 1,
        showTriagedColumn,
      };
    },

    startLoadingAlerts: (state, {started}, rootState) => {
      return {...state, isLoading: true, started};
    },

    receiveRecentPerformanceBugs: (state, action, rootState) => {
      return {
        ...state,
        bug: {
          ...state.bug,
          options: rootState.recentPerformanceBugs.map(
              AlertsSection.transformRecentPerformanceBugOption),
        }
      };
    },

    receiveRecentlyModifiedBugs: (state, action, rootState) => {
      const recentlyModifiedBugs = JSON.parse(action.recentlyModifiedBugs);
      return {...state, recentlyModifiedBugs};
    },
  };

  AlertsSection.transformRecentPerformanceBugOption = bug => {
    return {
      label: bug.id + ' ' + bug.summary,
      value: bug.id,
    };
  };

  AlertsSection.newStateOptionsFromQueryParams = queryParams => {
    return {
      sheriffs: queryParams.getAll('sheriff').map(
          sheriffName => sheriffName.replace(/_/g, ' ')),
      bugs: queryParams.getAll('bug'),
      reports: queryParams.getAll('ar'),
      minRevision: queryParams.get('minRev'),
      maxRevision: queryParams.get('maxRev'),
      sortColumn: queryParams.get('sort') || 'startRevision',
      showingImprovements: queryParams.get('improvements') !== null,
      showingTriaged: queryParams.get('triaged') !== null,
      sortDescending: queryParams.get('descending') !== null,
    };
  };

  AlertsSection.compareAlerts = (alertA, alertB, sortColumn) => {
    switch (sortColumn) {
      case 'bug': return alertA.bugId - alertB.bugId;
      case 'startRevision': return alertA.startRevision - alertB.startRevision;
      case 'suite':
        return alertA.suite.localeCompare(alertB.suite);
      case 'master': return alertA.master.localeCompare(alertB.master);
      case 'bot': return alertA.bot.localeCompare(alertB.bot);
      case 'measurement':
        return alertA.measurement.localeCompare(alertB.measurement);
      case 'case':
        return alertA.case.localeCompare(alertB.case);
      case 'delta': return alertA.deltaValue - alertB.deltaValue;
      case 'deltaPct':
        return Math.abs(alertA.percentDeltaValue) -
          Math.abs(alertB.percentDeltaValue);
    }
  };

  AlertsSection.transformAlert = alert => {
    let deltaValue = alert.median_after_anomaly -
      alert.median_before_anomaly;
    const percentDeltaValue = deltaValue / alert.median_before_anomaly;

    let improvementDirection = tr.b.ImprovementDirection.BIGGER_IS_BETTER;
    if (alert.improvement === (deltaValue < 0)) {
      improvementDirection = tr.b.ImprovementDirection.SMALLER_IS_BETTER;
    }
    const unitSuffix = tr.b.Unit.nameSuffixForImprovementDirection(
        improvementDirection);

    let baseUnit = tr.b.Unit.byName[alert.units];
    if (!baseUnit ||
        baseUnit.improvementDirection !== improvementDirection) {
      let unitName = 'unitlessNumber';
      if (tr.b.Unit.byName[alert.units + unitSuffix]) {
        unitName = alert.units;
      } else {
        const info = tr.v.LEGACY_UNIT_INFO.get(alert.units);
        if (info) {
          unitName = info.name;
          deltaValue *= info.conversionFactor || 1;
        }
      }
      baseUnit = tr.b.Unit.byName[unitName + unitSuffix];
    }
    const [master, bot] = alert.descriptor.bot.split(':');

    return {
      baseUnit,
      bot,
      bugComponents: alert.bug_components,
      bugId: alert.bug_id === undefined ? '' : alert.bug_id,
      bugLabels: alert.bug_labels,
      deltaUnit: baseUnit.correspondingDeltaUnit,
      deltaValue,
      key: alert.key,
      improvement: alert.improvement,
      isSelected: false,
      master,
      measurement: alert.descriptor.measurement,
      statistic: alert.descriptor.statistic,
      percentDeltaUnit: tr.b.Unit.byName[
          'normalizedPercentageDelta' + unitSuffix],
      percentDeltaValue,
      startRevision: alert.start_revision,
      endRevision: alert.end_revision,
      case: alert.descriptor.testCase,
      suite: alert.descriptor.testSuite,
      v1ReportLink: alert.dashboard_link,
    };
  };

  AlertsSection.transformBug = bug => {
    // Save memory by stripping out all the unnecessary data.
    // TODO save bandwidth by stripping out the unnecessary data in the
    // backend request handler.
    let revisionRange = bug.summary.match(/.* (\d+):(\d+)$/);
    if (revisionRange === null) {
      revisionRange = new tr.b.math.Range();
    } else {
      revisionRange = tr.b.math.Range.fromExplicitRange(
          parseInt(revisionRange[1]), parseInt(revisionRange[2]));
    }
    return {
      id: '' + bug.id,
      status: bug.status,
      owner: bug.owner ? bug.owner.name : '',
      summary: cp.breakWords(bug.summary),
      revisionRange,
    };
  };

  AlertsSection.getSessionState = state => {
    return {
      sheriffs: state.sheriff.selectedOptions,
      bugs: state.bug.selectedOptions,
      showingImprovements: state.showingImprovements,
      showingTriaged: state.showingTriaged,
      sortColumn: state.sortColumn,
      sortDescending: state.sortDescending,
    };
  };

  AlertsSection.getRouteParams = state => {
    const queryParams = new URLSearchParams();
    for (const sheriff of state.sheriff.selectedOptions) {
      queryParams.append('sheriff', sheriff.replace(/ /g, '_'));
    }
    for (const bug of state.bug.selectedOptions) {
      queryParams.append('bug', bug);
    }
    for (const name of state.report.selectedOptions) {
      queryParams.append('ar', name);
    }
    if (state.minRevision && state.minRevision.match(/^\d+$/)) {
      queryParams.set('minRev', state.minRevision);
    }
    if (state.maxRevision && state.maxRevision.match(/^\d+$/)) {
      queryParams.set('maxRev', state.maxRevision);
    }
    if (state.showingImprovements) queryParams.set('improvements', '');
    if (state.showingTriaged) queryParams.set('triaged', '');
    if (state.sortColumn !== 'startRevision') {
      queryParams.set('sort', state.sortColumn);
    }
    if (state.sortDescending) queryParams.set('descending', '');
    return queryParams;
  };

  AlertsSection.isEmpty = state => (
    state &&
    (!state.sheriff || !state.sheriff.selectedOptions ||
     (state.sheriff.selectedOptions.length === 0)) &&
    (!state.bug || !state.bug.selectedOptions ||
     (state.bug.selectedOptions.length === 0)) &&
    (!state.report || !state.report.selectedOptions ||
     (state.report.selectedOptions.length === 0)));

  AlertsSection.matchesOptions = (state, options) => {
    if (!tr.b.setsEqual(new Set(options.reports),
        new Set(state.report.selectedOptions))) {
      return false;
    }
    if (!tr.b.setsEqual(new Set(options.sheriffs),
        new Set(state.sheriff.selectedOptions))) {
      return false;
    }
    if (!tr.b.setsEqual(new Set(options.bugs),
        new Set(state.bug.selectedOptions))) {
      return false;
    }
    return true;
  };

  AlertsSection.getTitle = state => {
    if (state.sheriff.selectedOptions.length === 1) {
      return state.sheriff.selectedOptions[0];
    }
    if (state.bug.selectedOptions.length === 1) {
      return state.bug.selectedOptions[0];
    }
  };

  cp.ElementBase.register(AlertsSection);
  return {AlertsSection};
});
