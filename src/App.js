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
        itemId: 'chart',
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
        
        this._showChart();
        
    },
    _showChart : function() {
        
       this.down("#chart").add( { xtype : 'rallychart', 
         chartData: {
            categories: ['January', 'February', 'March', 'April'],
            series: [
                {
                    type: 'column',
                    data: [1, 2, 3, 6] //calculated elsewhere in app
                },
                {
                    type: 'line',
                    data: [3, 4, 2, 8] //calculated elsewhere in app
                }
            ]
         },
          chartConfig : {
                title: {
                text: 'Monthly Average Temperature',
                x: -20 //center
                },                        
                subtitle: {
                    text: 'Source: WorldClimate.com',
                    x: -20
                },
                xAxis: {
                    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                },
                yAxis: {
                    title: {
                        text: 'Temperature (°C)'
                    },
                    plotLines: [{
                        value: 0,
                        width: 1,
                        color: '#808080'
                    }]
                },
                tooltip: {
                    valueSuffix: '°C'
                },
                legend: {
                    layout: 'vertical',
                    align: 'right',
                    verticalAlign: 'middle',
                    borderWidth: 0
                }
            }
        });
        
        // var chart = this.down("#chart");
        
        // console.log("chart id",chart.getEl().id);
        
        // var extChart = Ext.create('Rally.ui.chart.Chart', {
        //  chartData: {
        //     categories: ['January', 'February', 'March', 'April'],
        //     series: [
        //         {
        //             type: 'column',
        //             data: [1, 2, 3, 6] //calculated elsewhere in app
        //         },
        //         {
        //             type: 'line',
        //             data: [3, 4, 2, 8] //calculated elsewhere in app
        //         }
        //     ]
        //  },
        //   chartConfig : {
        //         title: {
        //         text: 'Monthly Average Temperature',
        //         x: -20 //center
        //         },                        
        //         subtitle: {
        //             text: 'Source: WorldClimate.com',
        //             x: -20
        //         },
        //         xAxis: {
        //             categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        //                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        //         },
        //         yAxis: {
        //             title: {
        //                 text: 'Temperature (°C)'
        //             },
        //             plotLines: [{
        //                 value: 0,
        //                 width: 1,
        //                 color: '#808080'
        //             }]
        //         },
        //         tooltip: {
        //             valueSuffix: '°C'
        //         },
        //         legend: {
        //             layout: 'vertical',
        //             align: 'right',
        //             verticalAlign: 'middle',
        //             borderWidth: 0
        //         }
        //     }
        // });
        
        // chart.add(extChart);
    }        
        
    //     chart.add({ 
    //         xtype : "rallychart",
    //         chartConfig : {
    //             title: {
    //             text: 'Monthly Average Temperature',
    //             x: -20 //center
    //             },                        
    //             subtitle: {
    //                 text: 'Source: WorldClimate.com',
    //                 x: -20
    //             },
    //             xAxis: {
    //                 categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    //                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    //             },
    //             yAxis: {
    //                 title: {
    //                     text: 'Temperature (°C)'
    //                 },
    //                 plotLines: [{
    //                     value: 0,
    //                     width: 1,
    //                     color: '#808080'
    //                 }]
    //             },
    //             tooltip: {
    //                 valueSuffix: '°C'
    //             },
    //             legend: {
    //                 layout: 'vertical',
    //                 align: 'right',
    //                 verticalAlign: 'middle',
    //                 borderWidth: 0
    //             },
    //             renderTo : chart.getEl().id
    //         }
    //         ,
    //         chartData : {
    //         series: [{
    //             name: 'Tokyo',
    //             data: [7.0, 6.9, 9.5, 14.5, 18.2, 21.5, 25.2, 26.5, 23.3, 18.3, 13.9, 9.6]
    //         }, {
    //             name: 'New York',
    //             data: [-0.2, 0.8, 5.7, 11.3, 17.0, 22.0, 24.8, 24.1, 20.1, 14.1, 8.6, 2.5]
    //         }, {
    //             name: 'Berlin',
    //             data: [-0.9, 0.6, 3.5, 8.4, 13.5, 17.0, 18.6, 17.9, 14.3, 9.0, 3.9, 1.0]
    //         }, {
    //             name: 'London',
    //             data: [3.9, 4.2, 5.7, 8.5, 11.9, 15.2, 17.0, 16.6, 14.2, 10.3, 6.6, 4.8]
    //         }]
    //         }
    //     });
    // }   
});
