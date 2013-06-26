Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
    {
        xtype: 'container',
        itemId: 'releaseDropDown',
        columnWidth: 1
    }
    ,
    {
        xtype: 'container',
        itemId: 'grid',
        columnWidth: 1
    }

    ],

    launch: function() {
        this.down("#releaseDropDown").add( {
            xtype: 'rallyreleasecombobox',
            itemId : 'releaseSelector',
            listeners: {
                    select: this._onReleaseSelect,
    	            scope: this
            }
        });
        this.gRelease = null;
    },
    _onReleaseSelect : function() {
        
        var value =  this.down('#releaseSelector').getRecord();
        this.gRelease = value.data;
        console.log("selected release record data",value.raw);
        
        // get all releases in scope
        Ext.create('Rally.data.WsapiDataStore', {
            model: "Release",
            autoLoad : true,
            fetch: ["ObjectID","Name","ReleaseStartDate","ReleaseDate","Project"],
            filters: [
                {
                    property: 'Name',
                    value: value.data.Name
                }
            ],
            listeners: {
                // load: function(store, data, success) {
                //     console.log("data",data);
                // }
                scope : this,
                load : this._onReleases
            }
        });
    },
    // called with all releases in scope
    _onReleases : function(store, data, success) {
        var that = this;
        console.log("data",data);
        
        var releaseIds = _.map(data, function(d) { return d.data.ObjectID; });
        console.log("Release IDs",releaseIds);
        // now we are going to retrieve snapshots for all releases ...
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            listeners: {
                load: this._onReleaseSnapShotData,
                scope : this
            },
            fetch: ['ObjectID','Name', 'State', '_ValidFrom','_ValidTo'],
            hydrate: ['State'],
            filters: [
                {
                    property: '_TypeHierarchy',
                    operator: 'in',
                    value: ['Defect']
                },
                {
                    property: 'Release',
                    operator: 'in',
                    value: releaseIds
                }
            ]
        });        
    },
    
    _onReleaseSnapShotData : function(store,data,success) {
        
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(data,function(d){return d.data});        
        console.log("snapShotData",snapShotData);

        var openValues = ['Submitted','Open'];
        var closedValues = ['Closed','Rejected','Duplicated'];
        var verifiedValues = ['Verified'];
        
        var holidays = [
            {year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];
        
        var metrics = [
            {as: 'DefectOpenCount',     f: 'filteredCount', filterField: 'State', filterValues: openValues},
            {as: 'DefectClosedCount',   f: 'filteredCount', filterField: 'State', filterValues: closedValues},
            {as: 'DefectVerifiedCount', f: 'filteredCount', filterField: 'State', filterValues: verifiedValues},
        ];
        
        var summaryMetricsConfig = [
            // {field: 'TaskUnitScope', f: 'max'},
            // {field: 'TaskUnitBurnDown', f: 'max'},
            // {as: 'TaskUnitBurnDown_max_index', f: (seriesData, summaryMetrics) ->
            // for row, index in seriesData
            // if row.TaskUnitBurnDown is summaryMetrics.TaskUnitBurnDown_max
            // return index
            // }
        ];
        
        var deriveFieldsOnInput = [
            //{as: 'PercentRemaining', f: (row) -> 100 * row.TaskRemainingTotal / row.TaskEstimateTotal }
        ];
        
        var config = {
          deriveFieldsOnInput: deriveFieldsOnInput,
          metrics: metrics,
          summaryMetricsConfig: summaryMetricsConfig,
          deriveFieldsAfterSummary: [],
          granularity: lumenize.Time.DAY,
          tz: 'America/Chicago',
          holidays: holidays,
          workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
        };
        
        // release start and end dates
        var startOnISOString = new lumenize.Time(this.gRelease.ReleaseStartDate).getISOStringInTZ(config.tz)
        var upToDateISOString = new lumenize.Time(this.gRelease.ReleaseDate).getISOStringInTZ(config.tz)
        
        calculator = new Rally.data.lookback.Lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);
    
        var keys = ['label', 'DefectOpenCount','DefectClosedCount','DefectVerifiedCount'];
        var csv = lumenize.arrayOfMaps_To_CSVStyleArray(calculator.getResults().seriesData, keys);
        console.log("csv",csv);
        
        console.log(calculator.getResults().seriesData);
        var hcConfig = [{ name: "label" }, { name : "DefectOpenCount" }, { name : "DefectClosedCount"},{name:"DefectVerifiedCount"}];
        
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);
        console.log("hc",hc);
        
    }
});
