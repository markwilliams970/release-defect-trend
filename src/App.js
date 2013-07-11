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
        itemId: 'chart1',
        columnWidth: 1
    }    
    ]
    ,
    launch: function() {
        // add the release dropdown selector
        this.down("#releaseDropDown").add( {
            xtype: 'rallyreleasecombobox',
            itemId : 'releaseSelector',
            listeners: {
                    select: this._onReleaseSelect,
    	            scope: this
            }
        });
        // used to save the selected release
        this.gRelease = null;
    },
    
    // called when a release is selected.
    _onReleaseSelect : function() {
        // get and save the selected release        
        var value =  this.down('#releaseSelector').getRecord();
        console.log("record",value);
        this.gRelease = value.data;
        console.log("selected release record data",value.raw);
        
        // construct a query to get all releases in scope
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
        that.gReleaseIds = releaseIds;
        console.log("Release IDs",releaseIds);
        // now we are going to retrieve snapshots for all releases ...
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            listeners: {
                load: this._onReleaseSnapShotData,
                //load: this._filterOutMovedDefects,
                scope : this
            },
            fetch: ['ObjectID','Name', 'Priority','State', '_ValidFrom','_ValidTo'],
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
    }
   , 
    // called with the snapshot data for all defects in the releases
    _onReleaseSnapShotData : function(store,data,success) {
        // we are going to use lumenize and the TimeSeriesCalculator to aggregate the data into 
        // a time series.
        var that = this;
        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        var snapShotData = _.map(data,function(d){return d.data});      
        
        // console.log("snapshot data:",data);

        // these values determine if a defect is open, closed or verified.
        var openValues = ['Submitted','Open'];
        var closedValues = ['Closed','Rejected','Duplicated'];
        var verifiedValues = ['Verified'];
        
        // can be used to 'knockout' holidays
        var holidays = [
            {year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];

        // metrics to chart
        var metrics = [
            {as: 'DefectOpenCount',     f: 'filteredCount', filterField: 'State', filterValues: openValues},
            {as: 'DefectClosedCount',   f: 'filteredCount', filterField: 'State', filterValues: closedValues},
            {as: 'DefectVerifiedCount', f: 'filteredCount', filterField: 'State', filterValues: verifiedValues},
        ];

        // not used yet
        var summaryMetricsConfig = [
        ];
        
        var derivedFieldsAfterSummary = [
            {   as: 'Cumulative', 
                f : function (row,index,summaryMetrics, seriesData) {
                    // console.log("row",           row);
                    // console.log("index",         index);
                    // console.log("summaryMetrics",summaryMetrics);
                    // console.log("seriesData",    seriesData);
                    return 0;
                }
            }
        ];
  // {as: 'Ideal', f: (row, index, summaryMetrics, seriesData) ->
  //   max = summaryMetrics.TaskUnitScope_max
  //   increments = seriesData.length - 1
  //   incrementAmount = max / increments
  //   return Math.floor(100 * (max - index * incrementAmount)) / 100
  // },
        
        // not used yet
        var deriveFieldsOnInput = [
            {as: 'HighPriority', f: function(row) { return row["Priority"] == "High"; } }
        ]
        
        // small change
        
        // calculator config
        var config = {
          deriveFieldsOnInput: deriveFieldsOnInput,
          metrics: metrics,
          summaryMetricsConfig: summaryMetricsConfig,
          deriveFieldsAfterSummary: derivedFieldsAfterSummary,
          granularity: lumenize.Time.DAY,
          tz: 'America/Chicago',
          holidays: holidays,
          workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
        };
        
        // release start and end dates
        var startOnISOString = new lumenize.Time(this.gRelease.ReleaseStartDate).getISOStringInTZ(config.tz)
        var upToDateISOString = new lumenize.Time(this.gRelease.ReleaseDate).getISOStringInTZ(config.tz)
        
        // create the calculator and add snapshots to it.
        //calculator = new Rally.data.lookback.Lumenize.TimeSeriesCalculator(config);
        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);

        // create a high charts series config object, used to get the hc series data
        var hcConfig = [{ name: "label" }, { name : "DefectOpenCount" }, { name : "DefectClosedCount"},{name:"DefectVerifiedCount"}];
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);

        // display the chart
        
        this._showChart(hc);
        
    },
    _showChart : function(series) {
        console.log("series",series);        
        var chart = this.down("#chart1");
        chart.removeAll();
        
        series[1].data = _.map(series[1].data, function(d) { return _.isNull(d) ? 0 : d; });
        
        var extChart = Ext.create('Rally.ui.chart.Chart', {
            width: 800,
            height: 500,
         chartData: {
            categories : series[0].data,
            series : [
                series[1],
                series[2],
                series[3]
            ]
         },
          chartConfig : {
                chart: {
                },
                title: {
                text: 'Release Defect Trend',
                x: -20 //center
                },                        
                xAxis: {
                    tickInterval : 3
                },
                yAxis: {
                    title: {
                        text: 'Count'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                },
                tooltip: {
                    valueSuffix: ' Defects'
                },
                legend: {
                            align: 'center',
                            verticalAlign: 'bottom'
                }
            }
        });
        chart.add(extChart);
        var p = Ext.get(chart.id);
        var elems = p.query("div.x-mask");
        _.each(elems, function(e) { e.remove(); });
        var elems = p.query("div.x-mask-msg");
        _.each(elems, function(e) { e.remove(); });
    }            
});
