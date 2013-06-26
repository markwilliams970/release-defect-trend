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
            fetch: ["ObjectID","Name","ReleaseStartDate","ReleaseDate"],
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
        
        console.log("lumenize",lumenize);
        
        console.log("snapshot data",_.map(data,function(d){return d.data}));        
        
        var closedValues = ['Closed']
        
        var holidays = [
            {year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];
        
        var metrics = [
            {as: 'DefectOpenCount', f: 'count', filterField: 'State', filterValues: closedValues}
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

        // get the saved release
        console.log("Saved Release",this.gRelease);

        console.log(this.gRelease.ReleaseStartDate, this.gRelease.ReleaseDate);
        startOnISOString = new lumenize.Time(this.gRelease.ReleaseStartDate).getISOStringInTZ(config.tz)
        upToDateISOString = new lumenize.Time(this.gRelease.ReleaseDate).getISOStringInTZ(config.tz)
        console.log(startOnISOString, upToDateISOString);
        
        calculator = new Rally.data.lookback.Lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(data, startOnISOString, upToDateISOString);
        
    
        var keys = ['label', 'DefectOpenCount'];
        var csv = lumenize.arrayOfMaps_To_CSVStyleArray(calculator.getResults().seriesData, keys);
        
        console.log(csv.slice(1))
        
    }
});
