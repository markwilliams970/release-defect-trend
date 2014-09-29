var app = null;

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
    ],

    launch: function() {
        // add the release dropdown selector
        var that = this;
        app = this;
        this.endDate = new moment().toISOString();
        this.startDate = new moment().subtract(30,'days').toISOString();

        Rally.data.ModelFactory.getModel({
            type: 'Defect',
            success: function(model) {
                //Use the defect model here
                console.log("model",model.getField("State").getAllowedValueStore().load(function(data){
                    that.stateValues = _.map(data,function(d){
                        return d.get("StringValue");
                    });
                    console.log(that.stateValues);
                    that.loadSnapshots(that);
                }));
            }
        });
    },

    loadSnapshots : function(that) {

        var store = Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : false,
            limit : 'infinity',
            listeners: {
                load: this._onReleaseSnapShotData,
                scope : this
            },
            fetch: ['ObjectID','Name', 'Priority','State', '_ValidFrom','_ValidTo', '_PreviousValues', '_PreviousValues.State'],
            hydrate: ['State','_PreviousValues.State'],
            filters: [
                {
                    property: '_TypeHierarchy',
                    operator: 'in',
                    value: ['Defect']
                },
                {
                    property: '_ProjectHierarchy',
                    operator: 'in',
                    value: [this.getContext().getProject().ObjectID]
                },
                {
                    property: '_ValidTo',
                    operator: '>',
                    value : that.startDate
                }
            ]
        });

        store.load({
            params: {
                compress: true,
                removeUnauthorizedSnapshots: true
            }
        });   

    },

     // switch to app configuration from ui selection
    config: {
        defaultSettings : {
            closedStates : "Closed,Cancelled,Duplicate"
        }
    },

    getSettingsFields: function() {
        return [
            {
                name: 'closedStates',
                xtype: 'rallytextfield',
                label : "Set of Defect closed states (comma seperated)"
            }
        ];
    },


    // called with the snapshot data for all defects in the releases
    _onReleaseSnapShotData : function(store,data,success) {
        console.log("snapshots",data.length);
        // we are going to use lumenize and the TimeSeriesCalculator to aggregate the data into 
        // a time series.
        var that = this;

        var lumenize = window.parent.Rally.data.lookback.Lumenize;
        // var lumenize = Ext.create("Rally.data.lookback.Lumenize.TimeSeriesCalculator",{});
        var snapShotData = _.map(data,function(d){return d.data});      
        
        // console.log("snapshot data:",data);

        // these values determine if a defect is open, closed or verified.
        var closedValues = that.getSetting("closedStates").split(',');
        var openValues = _.difference( app.stateValues, closedValues);
        console.log("Closed",closedValues);
        console.log("Open",openValues);
        
        // can be used to 'knockout' holidays
        var holidays = [
            {year: 2014, month: 1, day: 1}  // Made up holiday to test knockout
        ];

        // metrics to chart
        var metrics = [
            {as: 'DefectActiveCount',     f: 'filteredCount', filterField: 'State', filterValues: openValues},
            {as: 'DefectClosedCount',   f: 'filteredCount', filterField: 'State', filterValues: closedValues}
        ];

        // not used yet
        var summaryMetricsConfig = [
        ];

        var isOpenSnapshot = function(snapshot) {
            // console.log(snapshot.get("_PreviousValues"));
            return _.contains(openValues, (snapshot.get("State"))) && 
                snapshot.get("State") !== snapshot.get("_PreviousValues")["State"];
        };

        var isClosedSnapshot = function(snapshot) {
            return _.contains(closedValues, (snapshot.get("State")));
        };

        var snapshotsForDay = function(snapshots,day) {
            return _.filter(snapshots,function(s) {
                var snapDate = s.get("_ValidFrom").substring(0,10);
                return ( moment(day).isSame( moment(snapDate), 'day'))
            });
        };

        var countStateSnapshots = function( snapshots, stateFunction ) {
            return _.reduce( snapshots, function( memo, s) {
                return memo + ( stateFunction(s) ? 1 : 0 );
            },0 );
        };

        var derivedFieldsAfterSummary = [
            {   as: 'Opened', 
                f : function (row,index,summaryMetrics, seriesData) {
                    if (index===0)
                        console.log("seriesData",seriesData);
                    if (index>0) {
                        var val = seriesData[index-1].Opened + (seriesData[index].DefectActiveCount - seriesData[index-1].DefectActiveCount);
                        return val > seriesData[index-1].Opened ? val : seriesData[index-1].Opened ;
                    }
                    else
                        return 0;
                }
            } ,            
            {   as: 'Closed', 
                f : function (row,index,summaryMetrics, seriesData) {
                    if (index===0)
                        console.log("seriesData",seriesData);
                    if (index>0) {
                        var val = seriesData[index-1].Closed + (seriesData[index].DefectClosedCount - seriesData[index-1].DefectClosedCount);
                        return val > seriesData[index-1].Closed ? val : seriesData[index-1].Closed ;
                    }
                    else
                        return 0;
                }
            } ,            
        ];

        // not used yet
        var deriveFieldsOnInput = [
            // {as: 'HighPriority', f: function(row) { return row["Priority"] == "High"; } }
        ]
        
        // small change
        
        // calculator config
        var config = {
          deriveFieldsOnInput: deriveFieldsOnInput,
          metrics: metrics,
          summaryMetricsConfig: summaryMetricsConfig,
          deriveFieldsAfterSummary: derivedFieldsAfterSummary,
          granularity: lumenize.Time.DAY,
          tz: 'America/New_York',
          holidays: holidays,
          workDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
        };
        
        var startOnISOString = new lumenize.Time(that.startDate.substring(0,that.startDate.length-1)).getISOStringInTZ(config.tz)
        var upToDateISOString = new lumenize.Time(this.endDate.substring(0,that.endDate.length-1)).getISOStringInTZ(config.tz)
        
        calculator = new lumenize.TimeSeriesCalculator(config);
        calculator.addSnapshots(snapShotData, startOnISOString, upToDateISOString);

        // create a high charts series config object, used to get the hc series data
        var hcConfig = [ { name: "label" }, 
                         { name : "DefectActiveCount" }, 
                         { name : "DefectClosedCount"},
                         { name : "Opened"},
                         { name : "Closed"}
                    ];
        var hc = lumenize.arrayOfMaps_To_HighChartsSeries(calculator.getResults().seriesData, hcConfig);

        // display the chart
        console.log("hc",hc);
        
        this._showChart(hc);
        
    },
    _showChart : function(series) {
        // console.log("series",series);        
        var chart = this.down("#chart1");
        chart.removeAll();
        
        series[1].data = _.map(series[1].data, function(d) { return _.isNull(d) ? 0 : d; });
        
        var extChart = Ext.create('Rally.ui.chart.Chart', {
            width: 800,
            height: 500,
            chartColors : ["Black","Green","Red"],
         chartData: {
            categories : series[0].data,
            series : [
                series[1],
                series[3],
                series[4],
            ]
         },
          chartConfig : {
                chart: {
                },
                title: {
                    text: 'Release Defect Trend',
                    x: -20 //center
                },                        
                subtitle : { text: "Closed States : ["+  app.getSetting("closedStates") + "]"},
                xAxis: {
                    tickInterval : 2,
                    labels : {
                        formatter : function() {
                            // console.log(this.value);
                            return this.value.substring(5,7) + "/" + this.value.substring(8,10)
                        }
                    }
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
