document.addEventListener('DOMContentLoaded', () => {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  let smp = null,
      sp = null,
      gainNode = null;

  const chartdiv = document.getElementById('chartdiv');
  let chart = am4core.create(chartdiv, am4charts.XYChart);    

  let globalObj = [],
      second = 0;

  const playBtn = document.getElementById('start'),
        volume = document.getElementById('volume'),
        range = document.getElementById('range');

  let canvas = document.querySelector('canvas'),
      canvasBB = document.createElement('canvas'),
      canvasW = 32 * 8,
      canvasH = 64;
      canvasHh = Math.floor(canvasH / 2);
      
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.ctx = canvas.getContext("2d");
  canvas.ctx.clearRect(0, 0, canvasW, canvasH);

  canvasBB.width = canvasW;
  canvasBB.height = canvasH;
  canvasBB.ctx = canvasBB.getContext("2d");
  canvasBB.ctx.clearRect(0, 0, canvasW, canvasH);
  
  const requestRedraw = (render) => {
    if(window.requestAnimationFrame) return window.requestAnimationFrame(render);
    else if(window.webkitRequestAnimationFrame) return window.webkitRequestAnimationFrame(render);
    else if ( window.mozRequestAnimationFrame ) return window.mozRequestAnimationFrame(renderer);
		else if ( window.oRequestAnimationFrame ) return window.oRequestAnimationFrame(renderer);
		else if ( window.msRequestAnimationFrame ) return window.msRequestAnimationFrame(renderer);
    else return window.setTimeout(() => render(), 1000 / 60);
  };

  const canvasDraw = () => {
    canvas.ctx.clearRect(0, 0, canvasW, canvasH);
    canvas.ctx.drawImage(canvasBB, 0, 0);
  };

  let FFT = (function () {	
		let m = 32;
		let out = new Array( m );

		return function ( data, len ) {
			let pid = ( 2.0 * Math.PI ) / len;

			let r, i, w, t;

			let mv = 0;
			for ( t = 0; t < len; t++ ) mv += data[t];
			mv = mv / len;

			for ( w = 0; w < m; w++ ) {
				let a = w * pid;
				r = 0;
				i = 0;
				for ( t = 0; t < len; t++ ) {
					let v = data[t] - mv;
					let ta = a * t;
					r += v * Math.cos( ta );
					i += v * Math.sin( ta );
				}

				out[w] = Math.sqrt( r * r + i * i ) / len;
			}

			return out;
		};
	} )();


  const bar = (x, w, v) => {
    canvasBB.ctx.fillStyle = "#3d5afe";
		let y = canvasH - 1 - v;
		h = canvasH - y;
		canvasBB.ctx.fillRect( x, y, w, h );
  };

  const peak = (x, w, v) => {
    canvasBB.ctx.fillStyle = "#18ffff";
		let y = canvasH - 1 - v;
		canvasBB.ctx.fillRect( x, y, w, 2 );
		canvasBB.ctx.clearRect( x, y + 2, w, 1 );
  };

  let pv = new Array( 32 );
	for (let i = 1; i < 32; i++ ) pv[i] = 1;

  let outForGraph = null;

  
  let interval = setInterval(() => {
    if(smp) {
      second++;

      let trend = 0;
      for(let i = 1; i < 10; i++) {
        trend += (outForGraph[i] + outForGraph[i-1] + outForGraph[i+1]) / 30;
      }

      globalObj.push({
        "second": second, 
        "32Hz": outForGraph[1], 
        "64Hz": outForGraph[2],
        "125Hz": outForGraph[3],
        "250Hz": outForGraph[4],
        "500Hz": outForGraph[5],
        "1kHz": outForGraph[5],
        "2kHz": outForGraph[6],
        "4kHz": outForGraph[7],
        "8kHz": outForGraph[8],
        "16kHz": outForGraph[9],
        "Trend" : second === 1 ? 0 : trend
      });
        chart.data = globalObj;
    }
  }, 1000);

  const visualize = (sample, sampleLen) => {
    let out = null, x, s;
		canvasBB.ctx.clearRect( 0, 0, canvasW, canvasH );

		if ( sample ) {
      out = FFT( sample, sampleLen );
      outForGraph = out;
    }

		for ( x = 0, s = 0; x < canvasW; x += 8, s++ ) {
			if ( out ) {
				let v = Math.floor( out[s] * 2400 );	
				if ( v >= canvasH ) v = canvasH - 1;
				
				bar( x, 6, v );

				if ( v >= pv[s] ) pv[s] = v;
			}
		}

		for ( let i = 0; i < canvasH; i += 3 ) {
			canvasBB.ctx.clearRect( 0, i, canvasW, 1 );
		}
		
		for ( x = 0, s = 0; x < canvasW; x += 8, s++ ) {	
			peak( x, 6, pv[s] );
			if ( pv[s] > 0 ) pv[s] -= 1;
		}
		
		requestRedraw( canvasDraw );
  };
  visualize();


  const setButton = (state) => {
    playBtn.textContent = state ? 'Stop' : 'Play';
    if(!state) {
      range.value = 1;
      volume.textContent = 1;
      clearInterval(interval);
      globalObj = [];
      second = 0;
    }
  };

  const createSMP = (request, audioCtx) => {
    let audioData = request.response;

    audioCtx.decodeAudioData(
      audioData,
      (buffer) => {
        smp = audioCtx.createBufferSource();

        smp.onended = () => {
          sp = null;
          smp = null;
          setButton(false);
        };

        smp.buffer = buffer;

        sp = audioCtx.createScriptProcessor ? 
          audioCtx.createScriptProcessor( 512, 2, 2 ) : 
          audioCtx.createJavaScriptNode( 512, 2, 2 );

        sp.onaudioprocess = function ( ape ) {
          let inputBuffer = ape.inputBuffer,
              outputBuffer = ape.outputBuffer;
    
          let channel,
              channelsLen = outputBuffer.numberOfChannels,
              sample,
              sampleLen = inputBuffer.length;
    
          let mono = new Array( sampleLen );
          for ( sample = 0; sample < sampleLen; sample++ ) {
            mono[sample] = 0;
          }
    
          for ( channel = 0; channel < channelsLen; channel++ ) {						
            let inputData = inputBuffer.getChannelData( channel );
            let outputData = outputBuffer.getChannelData( channel );
            outputData.set( inputData );
    
            for ( sample = 0; sample < sampleLen; sample++ ) {
              mono[sample] = ( mono[sample] + inputData[sample] ) / 2;
            }
          }
    
          visualize( mono, sampleLen );
        };  

        gainNode = audioCtx.createGain ? audioCtx.createGain() : audioCtx.createGainNode();

        smp.connect(gainNode);
        gainNode.connect(sp);
        sp.connect(audioCtx.destination);
        smp.start(0);
        setButton(true);
      },
      (e) => {
        alert("Error with decoding audio: " + e.err);
      }
    );
  };

  const play = (path) => {

    if(smp) {
      smp.stop();
      smp.onended();
      return;
    }

    let audioCtx = new AudioContext(),
        request = new XMLHttpRequest();

    request.open("GET", path, true);
    request.responseType = "arraybuffer";
    request.onload = () => createSMP(request, audioCtx);
    request.send();
  };

  playBtn.addEventListener('click', () => {

    playBtn.disabled = true;
    play('./audio/Riders_on_nightcall-DirectX10.mp3');
    setTimeout(() => {
      playBtn.disabled = false;
    }, 3000);
  });

  range.addEventListener('input', () => {
    if(smp && gainNode) {
      gainNode.gain.value = range.value;
      volume.textContent = range.value;
    } else range.value = 1;
  });

  let categoryAxis = chart.xAxes.push(new am4charts.CategoryAxis());
  categoryAxis.dataFields.category = "second";
  categoryAxis.title.text = "Seconds";
  categoryAxis.renderer.grid.template.location = 0;
  categoryAxis.renderer.minGridDistance = 20;


  let valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
  valueAxis.title.text = "Hz";

  let series = chart.series.push(new am4charts.LineSeries());
  series.dataFields.valueY = "32Hz";
  series.dataFields.categoryX = "second";
  series.name = "32Hz";
  series.stroke = am4core.color("#18ffff");
  series.tooltipText = "{name}: [bold]{valueY}[/]";
  series.stacked = false;

  let series2 = chart.series.push(new am4charts.LineSeries());
  series2.dataFields.valueY = "62Hz";
  series2.dataFields.categoryX = "second";
  series2.name = "62Hz";
  series2.stroke = am4core.color("#18ffff");
  series2.tooltipText = "{name}: [bold]{valueY}[/]";
  series2.stacked = false;

  let series3 = chart.series.push(new am4charts.LineSeries());
  series3.dataFields.valueY = "125Hz";
  series3.dataFields.categoryX = "second";
  series3.name = "125Hz";
  series3.stroke = am4core.color("#18ffff");
  series3.tooltipText = "{name}: [bold]{valueY}[/]";
  series3.stacked = false;

  let series4 = chart.series.push(new am4charts.LineSeries());
  series4.dataFields.valueY = "250Hz";
  series4.dataFields.categoryX = "second";
  series4.name = "250Hz";
  series4.stroke = am4core.color("#18ffff");
  series4.tooltipText = "{name}: [bold]{valueY}[/]";
  series4.stacked = false;

  let series5 = chart.series.push(new am4charts.LineSeries());
  series5.dataFields.valueY = "500Hz";
  series5.dataFields.categoryX = "second";
  series5.name = "500Hz";
  series5.stroke = am4core.color("#18ffff");
  series5.tooltipText = "{name}: [bold]{valueY}[/]";
  series5.stacked = false;

  let series6 = chart.series.push(new am4charts.LineSeries());
  series6.dataFields.valueY = "1kHz";
  series6.dataFields.categoryX = "second";
  series6.name = "1kHz";
  series6.stroke = am4core.color("#18ffff");
  series6.tooltipText = "{name}: [bold]{valueY}[/]";
  series6.stacked = false;

  let series7 = chart.series.push(new am4charts.LineSeries());
  series7.dataFields.valueY = "2kHz";
  series7.dataFields.categoryX = "second";
  series7.name = "2kHz";
  series7.stroke = am4core.color("#18ffff");
  series7.tooltipText = "{name}: [bold]{valueY}[/]";
  series7.stacked = false;

  let series8 = chart.series.push(new am4charts.LineSeries());
  series8.dataFields.valueY = "4kHz";
  series8.dataFields.categoryX = "second";
  series8.name = "4kHz";
  series8.stroke = am4core.color("#18ffff");
  series8.tooltipText = "{name}: [bold]{valueY}[/]";
  series8.stacked = false;

  let series9 = chart.series.push(new am4charts.LineSeries());
  series9.dataFields.valueY = "8kHz";
  series9.dataFields.categoryX = "second";
  series9.name = "8kHz";
  series9.stroke = am4core.color("#18ffff");
  series9.tooltipText = "{name}: [bold]{valueY}[/]";
  series9.stacked = false;

  let series10 = chart.series.push(new am4charts.LineSeries());
  series10.dataFields.valueY = "16kHz";
  series10.dataFields.categoryX = "second";
  series10.name = "16kHz";
  series10.stroke = am4core.color("#18ffff");
  series10.tooltipText = "{name}: [bold]{valueY}[/]";
  series10.stacked = false;

  let series11 = chart.series.push(new am4charts.LineSeries());
  series11.dataFields.valueY = "Trend";
  series11.dataFields.categoryX = "second";
  series11.name = "Trend";
  series11.stroke = am4core.color("#ff1744");
  series11.tooltipText = "{name}: [bold]{valueY}[/]";
  series11.stacked = false;

  chart.cursor = new am4charts.XYCursor();

});